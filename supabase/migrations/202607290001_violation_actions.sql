-- Admin-managed follow-up history for visits that recorded a violation.
-- This normalized table is used after the Supabase Auth cutover. The current
-- legacy frontend keeps the same history inside facilityStatus JSON records.

begin;

create type public.violation_action_type as enum (
    'follow_up',
    'referred',
    'corrected'
);

create table public.violation_actions (
    id text primary key,
    visit_id text not null references public.facility_visits(id) on delete cascade,
    action_type public.violation_action_type not null,
    effective_date date not null,
    transaction_number text not null default '',
    destination text not null default '',
    notes text not null default '',
    created_by uuid not null references auth.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    constraint violation_actions_id_not_blank check (btrim(id) <> ''),
    constraint violation_actions_referral_transaction_check check (
        action_type <> 'referred' or btrim(transaction_number) <> ''
    ),
    constraint violation_actions_follow_up_notes_check check (
        action_type <> 'follow_up' or btrim(notes) <> ''
    ),
    constraint violation_actions_not_future_check check (
        effective_date <= (clock_timestamp() at time zone 'Asia/Riyadh')::date
    )
);

create index violation_actions_visit_date_idx
    on public.violation_actions (visit_id, effective_date desc, created_at desc);

alter table public.violation_actions enable row level security;

revoke all on table public.violation_actions from public, anon;
grant select, insert on table public.violation_actions to authenticated;

create policy violation_actions_select_management
on public.violation_actions
for select
to authenticated
using ((select narco_private.is_management()));

create policy violation_actions_admin_insert
on public.violation_actions
for insert
to authenticated
with check (
    (select narco_private.is_admin()) and
    created_by = (select auth.uid()) and
    exists (
        select 1
        from public.facility_visits as visit
        where visit.id = violation_actions.visit_id
          and visit.violation = true
    )
);

commit;
