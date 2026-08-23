alter table public.duplicate_candidates
  drop constraint if exists duplicate_candidates_review_status_check;

alter table public.duplicate_candidates
  add constraint duplicate_candidates_review_status_check
  check (review_status = any (array[
    'Pending'::text,
    'Confirmed Duplicate'::text,
    'Same Project'::text,
    'Not Duplicate'::text,
    'Needs Review'::text
  ]));

alter table public.duplicate_candidates
  add column if not exists reviewed_by text,
  add column if not exists review_note text;

alter table public.duplicate_candidates
  drop constraint if exists duplicate_candidates_review_note_length_check;

alter table public.duplicate_candidates
  add constraint duplicate_candidates_review_note_length_check
  check (review_note is null or char_length(review_note) <= 1000);

create or replace function public.set_duplicate_review(
  p_candidate_id uuid,
  p_review_status text,
  p_review_note text default null,
  p_reviewer text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_result jsonb;
  v_note text;
  v_reviewer text;
begin
  if p_review_status not in (
    'Pending', 'Confirmed Duplicate', 'Same Project', 'Not Duplicate', 'Needs Review'
  ) then
    raise exception 'Unsupported duplicate review status';
  end if;

  v_note := nullif(left(trim(coalesce(p_review_note, '')), 1000), '');
  v_reviewer := nullif(left(trim(coalesce(p_reviewer, '')), 320), '');

  update public.duplicate_candidates
  set review_status = p_review_status,
      review_note = v_note,
      reviewed_by = v_reviewer,
      reviewed_at = now()
  where id = p_candidate_id
  returning jsonb_build_object(
    'id', id,
    'review_status', review_status,
    'review_note', review_note,
    'reviewed_by', reviewed_by,
    'reviewed_at', reviewed_at
  ) into v_result;

  if v_result is null then
    raise exception 'Duplicate candidate not found';
  end if;

  return v_result;
end;
$$;

revoke all on function public.set_duplicate_review(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.set_duplicate_review(uuid, text, text, text)
  to service_role;

comment on function public.set_duplicate_review(uuid, text, text, text)
  is 'Private owner workflow for reviewing duplicate candidates through the server-side API.';
