create table if not exists public.listing_workflows (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  purchase_price numeric(14,2),
  transfer_tax_cost numeric(14,2),
  legal_notary_cost numeric(14,2),
  agency_fee_cost numeric(14,2),
  renovation_budget numeric(14,2),
  furnishing_budget numeric(14,2),
  other_costs numeric(14,2),
  expected_monthly_rent numeric(14,2),
  annual_operating_costs numeric(14,2),
  contacted_at timestamptz,
  contact_method text,
  contact_person text,
  response_summary text,
  viewing_at timestamptz,
  follow_up_at timestamptz,
  questions_to_ask text,
  offered_price numeric(14,2),
  negotiation_notes text,
  next_action text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listing_workflows_nonnegative_money check (
    (purchase_price is null or purchase_price >= 0) and
    (transfer_tax_cost is null or transfer_tax_cost >= 0) and
    (legal_notary_cost is null or legal_notary_cost >= 0) and
    (agency_fee_cost is null or agency_fee_cost >= 0) and
    (renovation_budget is null or renovation_budget >= 0) and
    (furnishing_budget is null or furnishing_budget >= 0) and
    (other_costs is null or other_costs >= 0) and
    (expected_monthly_rent is null or expected_monthly_rent >= 0) and
    (annual_operating_costs is null or annual_operating_costs >= 0) and
    (offered_price is null or offered_price >= 0)
  ),
  constraint listing_workflows_contact_method_check check (
    contact_method is null or contact_method in ('Phone', 'WhatsApp', 'Email', 'In person', 'Other')
  ),
  constraint listing_workflows_text_lengths_check check (
    (contact_person is null or char_length(contact_person) <= 320) and
    (response_summary is null or char_length(response_summary) <= 5000) and
    (questions_to_ask is null or char_length(questions_to_ask) <= 5000) and
    (negotiation_notes is null or char_length(negotiation_notes) <= 5000) and
    (next_action is null or char_length(next_action) <= 1000) and
    (updated_by is null or char_length(updated_by) <= 320)
  )
);

alter table public.listing_workflows enable row level security;
revoke all on table public.listing_workflows from public, anon, authenticated;
grant select, insert, update on table public.listing_workflows to service_role;

create table if not exists public.listing_workflow_history (
  id bigint generated always as identity primary key,
  listing_id uuid not null references public.listings(id) on delete cascade,
  changed_at timestamptz not null default now(),
  changed_by text,
  snapshot jsonb not null
);

create index if not exists listing_workflow_history_listing_changed_idx
  on public.listing_workflow_history (listing_id, changed_at desc);

alter table public.listing_workflow_history enable row level security;
revoke all on table public.listing_workflow_history from public, anon, authenticated;
grant select, insert on table public.listing_workflow_history to service_role;
grant usage, select on sequence public.listing_workflow_history_id_seq to service_role;

create or replace function public.record_listing_workflow_history()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  insert into public.listing_workflow_history (listing_id, changed_by, snapshot)
  values (new.listing_id, new.updated_by, to_jsonb(new));
  return new;
end;
$$;

drop trigger if exists listing_workflow_history_trigger on public.listing_workflows;
create trigger listing_workflow_history_trigger
after insert or update on public.listing_workflows
for each row execute function public.record_listing_workflow_history();

create or replace function public.set_listing_workflow(
  p_listing_id uuid,
  p_purchase_price numeric default null,
  p_transfer_tax_cost numeric default null,
  p_legal_notary_cost numeric default null,
  p_agency_fee_cost numeric default null,
  p_renovation_budget numeric default null,
  p_furnishing_budget numeric default null,
  p_other_costs numeric default null,
  p_expected_monthly_rent numeric default null,
  p_annual_operating_costs numeric default null,
  p_contacted_at timestamptz default null,
  p_contact_method text default null,
  p_contact_person text default null,
  p_response_summary text default null,
  p_viewing_at timestamptz default null,
  p_follow_up_at timestamptz default null,
  p_questions_to_ask text default null,
  p_offered_price numeric default null,
  p_negotiation_notes text default null,
  p_next_action text default null,
  p_updated_by text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_result jsonb;
begin
  insert into public.listing_workflows (
    listing_id, purchase_price, transfer_tax_cost, legal_notary_cost,
    agency_fee_cost, renovation_budget, furnishing_budget, other_costs,
    expected_monthly_rent, annual_operating_costs, contacted_at, contact_method,
    contact_person, response_summary, viewing_at, follow_up_at, questions_to_ask,
    offered_price, negotiation_notes, next_action, updated_by, updated_at
  ) values (
    p_listing_id, p_purchase_price, p_transfer_tax_cost, p_legal_notary_cost,
    p_agency_fee_cost, p_renovation_budget, p_furnishing_budget, p_other_costs,
    p_expected_monthly_rent, p_annual_operating_costs, p_contacted_at,
    nullif(trim(coalesce(p_contact_method, '')), ''),
    nullif(left(trim(coalesce(p_contact_person, '')), 320), ''),
    nullif(left(trim(coalesce(p_response_summary, '')), 5000), ''),
    p_viewing_at, p_follow_up_at,
    nullif(left(trim(coalesce(p_questions_to_ask, '')), 5000), ''),
    p_offered_price,
    nullif(left(trim(coalesce(p_negotiation_notes, '')), 5000), ''),
    nullif(left(trim(coalesce(p_next_action, '')), 1000), ''),
    nullif(left(trim(coalesce(p_updated_by, '')), 320), ''), now()
  )
  on conflict (listing_id) do update set
    purchase_price = excluded.purchase_price,
    transfer_tax_cost = excluded.transfer_tax_cost,
    legal_notary_cost = excluded.legal_notary_cost,
    agency_fee_cost = excluded.agency_fee_cost,
    renovation_budget = excluded.renovation_budget,
    furnishing_budget = excluded.furnishing_budget,
    other_costs = excluded.other_costs,
    expected_monthly_rent = excluded.expected_monthly_rent,
    annual_operating_costs = excluded.annual_operating_costs,
    contacted_at = excluded.contacted_at,
    contact_method = excluded.contact_method,
    contact_person = excluded.contact_person,
    response_summary = excluded.response_summary,
    viewing_at = excluded.viewing_at,
    follow_up_at = excluded.follow_up_at,
    questions_to_ask = excluded.questions_to_ask,
    offered_price = excluded.offered_price,
    negotiation_notes = excluded.negotiation_notes,
    next_action = excluded.next_action,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning to_jsonb(listing_workflows) into v_result;

  return v_result;
end;
$$;

revoke all on function public.record_listing_workflow_history() from public, anon, authenticated;
revoke all on function public.set_listing_workflow(
  uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, timestamptz, text, text, text, timestamptz, timestamptz, text,
  numeric, text, text, text
) from public, anon, authenticated;
grant execute on function public.set_listing_workflow(
  uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, timestamptz, text, text, text, timestamptz, timestamptz, text,
  numeric, text, text, text
) to service_role;

comment on table public.listing_workflows is
  'Private owner-entered investment assumptions and acquisition workflow; scanner roles do not write this table.';
comment on table public.listing_workflow_history is
  'Append-only audit snapshots for owner-entered deal plans.';
