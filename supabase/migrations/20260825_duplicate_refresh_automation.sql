-- Strict, idempotent cross-source duplicate refresh for post-scan processing.
-- Existing human review decisions are preserved and no listing rows are merged.

alter table public.duplicate_candidates
  drop constraint if exists duplicate_candidates_review_check;

-- Canonical pair order prevents the same relationship being inserted in reverse.
update public.duplicate_candidates
set listing_id_a = listing_id_b,
    listing_id_b = listing_id_a
where listing_id_a > listing_id_b;

alter table public.duplicate_candidates
  drop constraint if exists duplicate_candidates_canonical_pair_check;

alter table public.duplicate_candidates
  add constraint duplicate_candidates_canonical_pair_check
  check (listing_id_a < listing_id_b);

create table if not exists public.duplicate_refresh_runs (
  id bigint generated always as identity primary key,
  trigger_source text not null default 'scheduled'
    check (trigger_source = any (array['scheduled'::text, 'manual'::text, 'initial'::text])),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  latest_observation_at timestamptz,
  candidates_considered integer not null default 0 check (candidates_considered >= 0),
  candidates_inserted integer not null default 0 check (candidates_inserted >= 0),
  candidates_updated integer not null default 0 check (candidates_updated >= 0),
  error_summary text
);

alter table public.duplicate_refresh_runs enable row level security;
revoke all on table public.duplicate_refresh_runs from public, anon, authenticated;
revoke all on sequence public.duplicate_refresh_runs_id_seq from public, anon, authenticated;
grant select, insert, update on table public.duplicate_refresh_runs to service_role;
grant usage, select on sequence public.duplicate_refresh_runs_id_seq to service_role;

create index if not exists duplicate_refresh_runs_finished_idx
  on public.duplicate_refresh_runs (finished_at desc)
  where error_summary is null;

create or replace function public.refresh_duplicate_candidates(
  p_force boolean default false,
  p_trigger_source text default 'manual'
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_run_id bigint;
  v_latest_observation_at timestamptz;
  v_last_processed_at timestamptz;
  v_considered integer := 0;
  v_inserted integer := 0;
  v_updated integer := 0;
begin
  if p_trigger_source not in ('scheduled', 'manual', 'initial') then
    raise exception 'Unsupported duplicate refresh trigger';
  end if;

  perform pg_advisory_xact_lock(hashtext('property_hunter_duplicate_refresh'));

  select max(o.created_at)
  into v_latest_observation_at
  from public.listing_observations o;

  select max(r.latest_observation_at)
  into v_last_processed_at
  from public.duplicate_refresh_runs r
  where r.finished_at is not null
    and r.error_summary is null;

  if not p_force
     and v_latest_observation_at is not null
     and v_last_processed_at is not null
     and v_latest_observation_at <= v_last_processed_at then
    return jsonb_build_object(
      'status', 'skipped',
      'reason', 'No new listing observations',
      'latest_observation_at', v_latest_observation_at,
      'last_processed_at', v_last_processed_at
    );
  end if;

  insert into public.duplicate_refresh_runs (trigger_source, latest_observation_at)
  values (p_trigger_source, v_latest_observation_at)
  returning id into v_run_id;

  begin
    with latest as (
      select distinct on (o.listing_id)
        o.listing_id,
        o.normalized_location,
        o.price_value,
        o.area_used_for_ppsqm_m2,
        o.bedrooms,
        nullif(lower(trim(o.floor)), '') as floor_key,
        case
          when o.public_contact ~ '[0-9][0-9 ()/+.-]{6,}'
          then right(regexp_replace(o.public_contact, '[^0-9]', '', 'g'), 8)
          else null
        end as phone_key
      from public.listing_observations o
      order by o.listing_id, o.observed_at desc, o.created_at desc
    ),
    evidence as (
      select
        a.id as listing_id_a,
        b.id as listing_id_b,
        (oa.normalized_location = ob.normalized_location) as same_location,
        (abs(oa.area_used_for_ppsqm_m2 - ob.area_used_for_ppsqm_m2)
          <= greatest(1::numeric, least(oa.area_used_for_ppsqm_m2, ob.area_used_for_ppsqm_m2) * 0.015)) as same_area,
        (abs(oa.price_value - ob.price_value)
          <= greatest(1500::numeric, least(oa.price_value, ob.price_value) * 0.015)) as similar_price,
        (oa.bedrooms is not null and ob.bedrooms is not null and oa.bedrooms = ob.bedrooms) as same_bedrooms,
        (oa.floor_key is not null and ob.floor_key is not null and oa.floor_key = ob.floor_key) as same_floor,
        (oa.phone_key is not null and ob.phone_key is not null and length(oa.phone_key) >= 7 and oa.phone_key = ob.phone_key) as same_phone
      from public.listings a
      join latest oa on oa.listing_id = a.id
      join public.listings b on a.id < b.id and a.source <> b.source
      join latest ob on ob.listing_id = b.id
      where a.current_status <> 'Removed'
        and b.current_status <> 'Removed'
        and oa.normalized_location is not null
        and ob.normalized_location is not null
        and oa.price_value is not null and oa.price_value > 0
        and ob.price_value is not null and ob.price_value > 0
        and oa.area_used_for_ppsqm_m2 is not null and oa.area_used_for_ppsqm_m2 > 0
        and ob.area_used_for_ppsqm_m2 is not null and ob.area_used_for_ppsqm_m2 > 0
    ),
    candidates as (
      select
        e.*,
        round((
          case when e.same_location then 0.30 else 0 end
          + case when e.same_area then 0.25 else 0 end
          + case when e.similar_price then 0.20 else 0 end
          + case when e.same_bedrooms then 0.12 else 0 end
          + case when e.same_floor then 0.08 else 0 end
          + case when e.same_phone then 0.05 else 0 end
        )::numeric, 4) as confidence_score
      from evidence e
      where e.same_location
        and e.same_area
        and e.similar_price
        and (e.same_bedrooms or e.same_floor)
    ),
    qualified as (
      select * from candidates where confidence_score >= 0.83
    ),
    upserted as (
      insert into public.duplicate_candidates (
        listing_id_a, listing_id_b, confidence_score,
        same_phone, same_area, same_location, same_bedrooms, same_floor, similar_price,
        description_similarity, photo_similarity, reason, review_status
      )
      select
        q.listing_id_a,
        q.listing_id_b,
        q.confidence_score,
        q.same_phone,
        q.same_area,
        q.same_location,
        q.same_bedrooms,
        q.same_floor,
        q.similar_price,
        null,
        null,
        'Automatic strict cross-source match: same location, near-identical area and price, plus matching bedroom count or floor. Manual confirmation required.',
        'Needs Review'
      from qualified q
      on conflict (listing_id_a, listing_id_b) do update
      set confidence_score = excluded.confidence_score,
          same_phone = excluded.same_phone,
          same_area = excluded.same_area,
          same_location = excluded.same_location,
          same_bedrooms = excluded.same_bedrooms,
          same_floor = excluded.same_floor,
          similar_price = excluded.similar_price,
          reason = excluded.reason
      where duplicate_candidates.review_status in ('Pending', 'Needs Review')
      returning (xmax = 0) as was_inserted
    )
    select
      (select count(*)::integer from qualified),
      count(*) filter (where was_inserted)::integer,
      count(*) filter (where not was_inserted)::integer
    into v_considered, v_inserted, v_updated
    from upserted;

    update public.listings l
    set possible_duplicate = exists (
      select 1
      from public.duplicate_candidates d
      where d.review_status <> 'Not Duplicate'
        and (d.listing_id_a = l.id or d.listing_id_b = l.id)
    ),
    updated_at = now()
    where l.possible_duplicate is distinct from exists (
      select 1
      from public.duplicate_candidates d
      where d.review_status <> 'Not Duplicate'
        and (d.listing_id_a = l.id or d.listing_id_b = l.id)
    );

    update public.duplicate_refresh_runs
    set finished_at = now(),
        candidates_considered = coalesce(v_considered, 0),
        candidates_inserted = coalesce(v_inserted, 0),
        candidates_updated = coalesce(v_updated, 0)
    where id = v_run_id;

    return jsonb_build_object(
      'status', 'completed',
      'run_id', v_run_id,
      'latest_observation_at', v_latest_observation_at,
      'candidates_considered', coalesce(v_considered, 0),
      'candidates_inserted', coalesce(v_inserted, 0),
      'candidates_updated', coalesce(v_updated, 0)
    );
  exception when others then
    update public.duplicate_refresh_runs
    set finished_at = now(), error_summary = left(sqlerrm, 2000)
    where id = v_run_id;
    return jsonb_build_object('status', 'failed', 'run_id', v_run_id, 'error', left(sqlerrm, 2000));
  end;
end;
$$;

revoke all on function public.refresh_duplicate_candidates(boolean, text)
  from public, anon, authenticated;
grant execute on function public.refresh_duplicate_candidates(boolean, text)
  to service_role;

comment on function public.refresh_duplicate_candidates(boolean, text)
  is 'Strict idempotent post-scan duplicate candidate refresh. Preserves human review decisions and never merges listings.';

create or replace function public.get_duplicate_refresh_status()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select coalesce((
    select jsonb_build_object(
      'id', r.id,
      'trigger_source', r.trigger_source,
      'started_at', r.started_at,
      'finished_at', r.finished_at,
      'latest_observation_at', r.latest_observation_at,
      'candidates_considered', r.candidates_considered,
      'candidates_inserted', r.candidates_inserted,
      'candidates_updated', r.candidates_updated,
      'error_summary', r.error_summary
    )
    from public.duplicate_refresh_runs r
    order by r.started_at desc
    limit 1
  ), '{}'::jsonb);
$$;

revoke all on function public.get_duplicate_refresh_status()
  from public, anon, authenticated;
grant execute on function public.get_duplicate_refresh_status()
  to service_role;

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'property-hunter-duplicate-refresh',
  '*/15 * * * *',
  $$select public.refresh_duplicate_candidates(false, 'scheduled');$$
);

select public.refresh_duplicate_candidates(true, 'initial');
