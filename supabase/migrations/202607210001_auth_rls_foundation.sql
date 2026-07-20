-- Sprint 5: additive Supabase Auth + RLS foundation.
-- This migration intentionally does not alter public.app_data.
-- Apply to a staging project first. The legacy application remains unchanged
-- until the normalized data has been migrated and the Auth client is enabled.

begin;

create schema if not exists narco_private;

revoke all on schema narco_private from public, anon, authenticated;
grant usage on schema narco_private to authenticated;

create type public.app_role as enum ('admin', 'committee', 'viewer');
create type public.assignment_status as enum (
    'assigned',
    'in_progress',
    'completed',
    'cancelled'
);
create type public.visit_result as enum (
    'no_violation',
    'violation',
    'incomplete'
);
create type public.visit_status as enum ('visited', 'partial');

create table public.inspection_employees (
    id text primary key,
    employee_number text unique,
    full_name text not null,
    job_title text not null default '',
    is_active boolean not null default true,
    created_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint inspection_employees_id_not_blank check (btrim(id) <> ''),
    constraint inspection_employees_name_not_blank check (btrim(full_name) <> '')
);

create table public.profiles (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null,
    display_name text not null,
    role public.app_role not null default 'viewer',
    active boolean not null default false,
    committee_name text not null default '',
    employee_id text references public.inspection_employees(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint profiles_username_not_blank check (btrim(username) <> ''),
    constraint profiles_display_name_not_blank check (btrim(display_name) <> ''),
    constraint profiles_committee_name_required check (
        role <> 'committee' or btrim(committee_name) <> ''
    )
);

create unique index profiles_username_lower_unique
    on public.profiles (lower(username));
create index profiles_role_active_idx
    on public.profiles (role, active);

create table public.committee_members (
    committee_user_id uuid not null references public.profiles(user_id) on delete cascade,
    employee_id text not null references public.inspection_employees(id) on delete restrict,
    member_role text not null,
    created_at timestamptz not null default now(),
    primary key (committee_user_id, employee_id),
    constraint committee_members_role_check check (member_role in ('leader', 'member'))
);

create unique index committee_one_leader_idx
    on public.committee_members (committee_user_id)
    where member_role = 'leader';

create table public.facility_assignments (
    id text primary key,
    facility_license text not null,
    committee_user_id uuid not null references public.profiles(user_id) on delete restrict,
    committee_username text not null,
    status public.assignment_status not null default 'assigned',
    team_snapshot jsonb not null default '{}'::jsonb,
    visit_type text not null default 'periodic',
    visit_reason text not null default 'الخطة الدورية',
    assigned_at timestamptz not null default now(),
    created_by uuid references auth.users(id) on delete set null,
    updated_at timestamptz not null default now(),
    constraint facility_assignments_id_not_blank check (btrim(id) <> ''),
    constraint facility_assignments_license_not_blank check (btrim(facility_license) <> ''),
    constraint facility_assignments_committee_not_blank check (btrim(committee_username) <> ''),
    constraint facility_assignments_visit_type_check check (visit_type in ('periodic', 'reactive'))
);

create index facility_assignments_committee_status_idx
    on public.facility_assignments (committee_user_id, status);
create index facility_assignments_status_idx
    on public.facility_assignments (status);
create index facility_assignments_facility_idx
    on public.facility_assignments (facility_license, assigned_at desc);
create unique index facility_one_active_assignment_idx
    on public.facility_assignments (facility_license)
    where status in ('assigned', 'in_progress');

create table public.facility_visits (
    id text primary key,
    assignment_id text references public.facility_assignments(id) on delete set null,
    facility_license text not null,
    committee_user_id uuid not null references public.profiles(user_id) on delete restrict,
    committee_username text not null,
    committee_name text not null default '',
    visit_date date not null,
    result public.visit_result not null,
    status public.visit_status not null,
    violation boolean not null default false,
    incomplete_reason text not null default '',
    notes text not null default '',
    visit_type text not null default 'periodic',
    visit_reason text not null default 'الخطة الدورية',
    team_snapshot jsonb not null default '{}'::jsonb,
    employee_snapshot jsonb,
    created_by uuid not null references auth.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    constraint facility_visits_id_not_blank check (btrim(id) <> ''),
    constraint facility_visits_license_not_blank check (btrim(facility_license) <> ''),
    constraint facility_visits_committee_not_blank check (btrim(committee_username) <> ''),
    constraint facility_visits_result_status_check check (
        (result in ('no_violation', 'violation') and status = 'visited') or
        (result = 'incomplete' and status = 'partial')
    ),
    constraint facility_visits_violation_check check (
        violation = (result = 'violation')
    ),
    constraint facility_visits_incomplete_reason_check check (
        result <> 'incomplete' or btrim(incomplete_reason) <> ''
    )
);

create index facility_visits_facility_date_idx
    on public.facility_visits (facility_license, visit_date desc, created_at desc);
create index facility_visits_committee_date_idx
    on public.facility_visits (committee_user_id, visit_date desc);
create index facility_visits_assignment_idx
    on public.facility_visits (assignment_id);

create table public.custom_facilities (
    license text primary key,
    facility_data jsonb not null,
    created_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint custom_facilities_license_not_blank check (btrim(license) <> '')
);

create table public.facility_overrides (
    license text primary key,
    override_data jsonb not null,
    updated_by uuid references auth.users(id) on delete set null,
    updated_at timestamptz not null default now(),
    constraint facility_overrides_license_not_blank check (btrim(license) <> '')
);

create table public.external_visits (
    id text primary key,
    mission_number text not null unique,
    mission_data jsonb not null,
    created_by uuid not null references auth.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint external_visits_id_not_blank check (btrim(id) <> ''),
    constraint external_visits_mission_not_blank check (btrim(mission_number) <> '')
);

create table public.app_settings (
    key text primary key,
    value jsonb not null,
    updated_by uuid references auth.users(id) on delete set null,
    updated_at timestamptz not null default now(),
    constraint app_settings_key_not_blank check (btrim(key) <> '')
);

create table public.security_events (
    id bigint generated always as identity primary key,
    actor_user_id uuid references auth.users(id) on delete set null,
    event_type text not null,
    entity_type text not null,
    entity_id text not null,
    details jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index security_events_created_at_idx
    on public.security_events (created_at desc);
create index security_events_actor_idx
    on public.security_events (actor_user_id, created_at desc);

create or replace function narco_private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

create trigger inspection_employees_set_updated_at
before update on public.inspection_employees
for each row execute function narco_private.set_updated_at();

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function narco_private.set_updated_at();

create or replace function narco_private.protect_admin_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
    removes_active_admin boolean := false;
begin
    if tg_op = 'UPDATE' then
        if new.user_id <> old.user_id then
            raise exception 'Profile user_id cannot be changed' using errcode = '23514';
        end if;

        removes_active_admin := new.role <> 'admin' or new.active = false;
    elsif tg_op = 'DELETE' then
        removes_active_admin := true;
    end if;

    if old.role = 'admin' and old.active = true and removes_active_admin and not exists (
        select 1
        from public.profiles as profile
        where profile.user_id <> old.user_id
          and profile.role = 'admin'
          and profile.active = true
    ) then
        raise exception 'At least one active Admin profile is required'
            using errcode = '23514';
    end if;

    if tg_op = 'DELETE' then
        return old;
    end if;

    return new;
end;
$$;

create trigger profiles_protect_admin
before update or delete on public.profiles
for each row execute function narco_private.protect_admin_profile();

create or replace function narco_private.validate_committee_member()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if not exists (
        select 1
        from public.profiles as profile
        where profile.user_id = new.committee_user_id
          and profile.role = 'committee'
    ) then
        raise exception 'committee_user_id must reference a committee profile'
            using errcode = '23514';
    end if;

    return new;
end;
$$;

create trigger committee_members_validate_profile
before insert or update on public.committee_members
for each row execute function narco_private.validate_committee_member();

create or replace function narco_private.set_assignment_committee_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
    committee_username text;
begin
    select profile.username
    into committee_username
    from public.profiles as profile
    where profile.user_id = new.committee_user_id
      and profile.role = 'committee';

    if not found then
        raise exception 'committee_user_id must reference a committee profile'
            using errcode = '23514';
    end if;

    new.committee_username := committee_username;
    return new;
end;
$$;

create trigger facility_assignments_set_committee_snapshot
before insert or update of committee_user_id, committee_username
on public.facility_assignments
for each row execute function narco_private.set_assignment_committee_snapshot();

create trigger facility_assignments_set_updated_at
before update on public.facility_assignments
for each row execute function narco_private.set_updated_at();

create or replace function narco_private.set_visit_committee_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
    committee_profile public.profiles%rowtype;
begin
    select profile.*
    into committee_profile
    from public.profiles as profile
    where profile.user_id = new.committee_user_id
      and profile.role = 'committee';

    if not found then
        raise exception 'committee_user_id must reference a committee profile'
            using errcode = '23514';
    end if;

    new.committee_username := committee_profile.username;
    new.committee_name := committee_profile.committee_name;
    return new;
end;
$$;

create trigger facility_visits_set_committee_snapshot
before insert or update of committee_user_id, committee_username, committee_name
on public.facility_visits
for each row execute function narco_private.set_visit_committee_snapshot();

create trigger custom_facilities_set_updated_at
before update on public.custom_facilities
for each row execute function narco_private.set_updated_at();

create trigger facility_overrides_set_updated_at
before update on public.facility_overrides
for each row execute function narco_private.set_updated_at();

create trigger external_visits_set_updated_at
before update on public.external_visits
for each row execute function narco_private.set_updated_at();

create trigger app_settings_set_updated_at
before update on public.app_settings
for each row execute function narco_private.set_updated_at();

create or replace function narco_private.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
    select profile.role
    from public.profiles as profile
    where profile.user_id = (select auth.uid())
      and profile.active = true
$$;

create or replace function narco_private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce((select narco_private.current_app_role()) = 'admin', false)
$$;

create or replace function narco_private.is_management()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce(
        (select narco_private.current_app_role()) in ('admin', 'viewer'),
        false
    )
$$;

create or replace function narco_private.can_read_employee(requested_employee_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select
        (select narco_private.is_management()) or
        exists (
            select 1
            from public.committee_members as member
            where member.committee_user_id = (select auth.uid())
              and member.employee_id = requested_employee_id
        )
$$;

revoke execute on function narco_private.set_updated_at() from public, anon, authenticated;
revoke execute on function narco_private.protect_admin_profile() from public, anon, authenticated;
revoke execute on function narco_private.validate_committee_member() from public, anon, authenticated;
revoke execute on function narco_private.set_assignment_committee_snapshot() from public, anon, authenticated;
revoke execute on function narco_private.set_visit_committee_snapshot() from public, anon, authenticated;
revoke execute on function narco_private.current_app_role() from public, anon;
revoke execute on function narco_private.is_admin() from public, anon;
revoke execute on function narco_private.is_management() from public, anon;
revoke execute on function narco_private.can_read_employee(text) from public, anon;

grant execute on function narco_private.current_app_role() to authenticated;
grant execute on function narco_private.is_admin() to authenticated;
grant execute on function narco_private.is_management() to authenticated;
grant execute on function narco_private.can_read_employee(text) to authenticated;

create or replace function narco_private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.profiles (
        user_id,
        username,
        display_name,
        role,
        active
    ) values (
        new.id,
        new.id::text,
        coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), 'مستخدم جديد'),
        'viewer',
        false
    );

    return new;
end;
$$;

revoke execute on function narco_private.handle_new_auth_user() from public, anon, authenticated;

create trigger narco_profile_on_auth_user_created
after insert on auth.users
for each row execute function narco_private.handle_new_auth_user();

alter table public.inspection_employees enable row level security;
alter table public.profiles enable row level security;
alter table public.committee_members enable row level security;
alter table public.facility_assignments enable row level security;
alter table public.facility_visits enable row level security;
alter table public.custom_facilities enable row level security;
alter table public.facility_overrides enable row level security;
alter table public.external_visits enable row level security;
alter table public.app_settings enable row level security;
alter table public.security_events enable row level security;

revoke all on table public.inspection_employees from public, anon;
revoke all on table public.profiles from public, anon;
revoke all on table public.committee_members from public, anon;
revoke all on table public.facility_assignments from public, anon;
revoke all on table public.facility_visits from public, anon;
revoke all on table public.custom_facilities from public, anon;
revoke all on table public.facility_overrides from public, anon;
revoke all on table public.external_visits from public, anon;
revoke all on table public.app_settings from public, anon;
revoke all on table public.security_events from public, anon;

grant select, insert, update, delete on table public.inspection_employees to authenticated;
grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.committee_members to authenticated;
grant select, insert, update, delete on table public.facility_assignments to authenticated;
grant select, insert, update, delete on table public.facility_visits to authenticated;
grant select, insert, update, delete on table public.custom_facilities to authenticated;
grant select, insert, update, delete on table public.facility_overrides to authenticated;
grant select, insert, update, delete on table public.external_visits to authenticated;
grant select, insert, update, delete on table public.app_settings to authenticated;
grant select on table public.security_events to authenticated;

create policy profiles_select_authorized
on public.profiles
for select
to authenticated
using (
    user_id = (select auth.uid()) or
    (select narco_private.is_management())
);

create policy profiles_admin_insert
on public.profiles
for insert
to authenticated
with check ((select narco_private.is_admin()));

create policy profiles_admin_update
on public.profiles
for update
to authenticated
using ((select narco_private.is_admin()))
with check ((select narco_private.is_admin()));

create policy profiles_admin_delete
on public.profiles
for delete
to authenticated
using ((select narco_private.is_admin()));

create policy employees_select_authorized
on public.inspection_employees
for select
to authenticated
using ((select narco_private.can_read_employee(id)));

create policy employees_admin_insert
on public.inspection_employees
for insert
to authenticated
with check ((select narco_private.is_admin()));

create policy employees_admin_update
on public.inspection_employees
for update
to authenticated
using ((select narco_private.is_admin()))
with check ((select narco_private.is_admin()));

create policy employees_admin_delete
on public.inspection_employees
for delete
to authenticated
using ((select narco_private.is_admin()));

create policy committee_members_select_authorized
on public.committee_members
for select
to authenticated
using (
    committee_user_id = (select auth.uid()) or
    (select narco_private.is_management())
);

create policy committee_members_admin_insert
on public.committee_members
for insert
to authenticated
with check ((select narco_private.is_admin()));

create policy committee_members_admin_update
on public.committee_members
for update
to authenticated
using ((select narco_private.is_admin()))
with check ((select narco_private.is_admin()));

create policy committee_members_admin_delete
on public.committee_members
for delete
to authenticated
using ((select narco_private.is_admin()));

create policy assignments_select_authorized
on public.facility_assignments
for select
to authenticated
using (
    committee_user_id = (select auth.uid()) or
    (select narco_private.is_management())
);

create policy assignments_admin_insert
on public.facility_assignments
for insert
to authenticated
with check ((select narco_private.is_admin()));

create policy assignments_admin_update
on public.facility_assignments
for update
to authenticated
using ((select narco_private.is_admin()))
with check ((select narco_private.is_admin()));

create policy assignments_admin_delete
on public.facility_assignments
for delete
to authenticated
using ((select narco_private.is_admin()));

create policy visits_select_authorized
on public.facility_visits
for select
to authenticated
using (
    committee_user_id = (select auth.uid()) or
    (select narco_private.is_management())
);

create policy visits_admin_insert
on public.facility_visits
for insert
to authenticated
with check ((select narco_private.is_admin()));

create policy visits_admin_update
on public.facility_visits
for update
to authenticated
using ((select narco_private.is_admin()))
with check ((select narco_private.is_admin()));

create policy visits_admin_delete
on public.facility_visits
for delete
to authenticated
using ((select narco_private.is_admin()));

create policy custom_facilities_select_authenticated
on public.custom_facilities
for select
to authenticated
using (true);

create policy custom_facilities_admin_insert
on public.custom_facilities
for insert
to authenticated
with check ((select narco_private.is_admin()));

create policy custom_facilities_admin_update
on public.custom_facilities
for update
to authenticated
using ((select narco_private.is_admin()))
with check ((select narco_private.is_admin()));

create policy custom_facilities_admin_delete
on public.custom_facilities
for delete
to authenticated
using ((select narco_private.is_admin()));

create policy facility_overrides_select_authenticated
on public.facility_overrides
for select
to authenticated
using (true);

create policy facility_overrides_admin_insert
on public.facility_overrides
for insert
to authenticated
with check ((select narco_private.is_admin()));

create policy facility_overrides_admin_update
on public.facility_overrides
for update
to authenticated
using ((select narco_private.is_admin()))
with check ((select narco_private.is_admin()));

create policy facility_overrides_admin_delete
on public.facility_overrides
for delete
to authenticated
using ((select narco_private.is_admin()));

create policy external_visits_select_management
on public.external_visits
for select
to authenticated
using ((select narco_private.is_management()));

create policy external_visits_admin_insert
on public.external_visits
for insert
to authenticated
with check ((select narco_private.is_admin()));

create policy external_visits_admin_update
on public.external_visits
for update
to authenticated
using ((select narco_private.is_admin()))
with check ((select narco_private.is_admin()));

create policy external_visits_admin_delete
on public.external_visits
for delete
to authenticated
using ((select narco_private.is_admin()));

create policy app_settings_select_authenticated
on public.app_settings
for select
to authenticated
using (true);

create policy app_settings_admin_insert
on public.app_settings
for insert
to authenticated
with check ((select narco_private.is_admin()));

create policy app_settings_admin_update
on public.app_settings
for update
to authenticated
using ((select narco_private.is_admin()))
with check ((select narco_private.is_admin()));

create policy app_settings_admin_delete
on public.app_settings
for delete
to authenticated
using ((select narco_private.is_admin()));

create policy security_events_select_admin
on public.security_events
for select
to authenticated
using ((select narco_private.is_admin()));

create or replace function public.record_committee_visit(
    p_visit_id text,
    p_assignment_id text,
    p_facility_license text,
    p_visit_date date,
    p_result public.visit_result,
    p_incomplete_reason text default '',
    p_notes text default ''
)
returns public.facility_visits
language plpgsql
security definer
set search_path = ''
as $$
declare
    actor_id uuid := (select auth.uid());
    actor_profile public.profiles%rowtype;
    selected_assignment public.facility_assignments%rowtype;
    existing_visit public.facility_visits%rowtype;
    saved_visit public.facility_visits%rowtype;
    next_assignment_status public.assignment_status;
    next_visit_status public.visit_status;
    verified_team_snapshot jsonb;
    verified_employee_snapshot jsonb;
begin
    if actor_id is null then
        raise exception 'Authentication is required' using errcode = '42501';
    end if;

    select profile.*
    into actor_profile
    from public.profiles as profile
    where profile.user_id = actor_id
      and profile.active = true
      and profile.role = 'committee';

    if not found then
        raise exception 'An active committee account is required' using errcode = '42501';
    end if;

    if btrim(coalesce(p_visit_id, '')) = '' or
       btrim(coalesce(p_assignment_id, '')) = '' or
       btrim(coalesce(p_facility_license, '')) = '' then
        raise exception 'Visit, assignment, and facility identifiers are required'
            using errcode = '22023';
    end if;

    select visit.*
    into existing_visit
    from public.facility_visits as visit
    where visit.id = p_visit_id;

    if found then
        if existing_visit.assignment_id = p_assignment_id and
           existing_visit.facility_license = p_facility_license and
           existing_visit.committee_user_id = actor_id and
           existing_visit.result = p_result then
            return existing_visit;
        end if;

        raise exception 'Visit identifier already belongs to another operation'
            using errcode = '23505';
    end if;

    select assignment.*
    into selected_assignment
    from public.facility_assignments as assignment
    where assignment.id = p_assignment_id
      and assignment.facility_license = p_facility_license
      and assignment.committee_user_id = actor_id
      and assignment.status in ('assigned', 'in_progress')
    for update;

    if not found then
        raise exception 'The active assignment is missing or changed'
            using errcode = 'P0002';
    end if;

    if p_result = 'incomplete' and btrim(coalesce(p_incomplete_reason, '')) = '' then
        raise exception 'Incomplete reason is required' using errcode = '22023';
    end if;

    next_visit_status := case
        when p_result = 'incomplete' then 'partial'::public.visit_status
        else 'visited'::public.visit_status
    end;
    next_assignment_status := case
        when p_result = 'incomplete' then 'in_progress'::public.assignment_status
        else 'completed'::public.assignment_status
    end;

    select jsonb_build_object(
        'leader', coalesce((
            select employee.full_name
            from public.committee_members as member
            join public.inspection_employees as employee
              on employee.id = member.employee_id
            where member.committee_user_id = actor_id
              and member.member_role = 'leader'
              and employee.is_active = true
            limit 1
        ), ''),
        'members', coalesce((
            select jsonb_agg(employee.full_name order by employee.full_name)
            from public.committee_members as member
            join public.inspection_employees as employee
              on employee.id = member.employee_id
            where member.committee_user_id = actor_id
              and member.member_role = 'member'
              and employee.is_active = true
        ), '[]'::jsonb),
        'leaderId', coalesce((
            select member.employee_id
            from public.committee_members as member
            join public.inspection_employees as employee
              on employee.id = member.employee_id
            where member.committee_user_id = actor_id
              and member.member_role = 'leader'
              and employee.is_active = true
            limit 1
        ), ''),
        'memberIds', coalesce((
            select jsonb_agg(member.employee_id order by member.employee_id)
            from public.committee_members as member
            join public.inspection_employees as employee
              on employee.id = member.employee_id
            where member.committee_user_id = actor_id
              and member.member_role = 'member'
              and employee.is_active = true
        ), '[]'::jsonb)
    ) into verified_team_snapshot;

    select jsonb_build_object(
        'leaderId', verified_team_snapshot ->> 'leaderId',
        'memberIds', verified_team_snapshot -> 'memberIds',
        'employeeIds', coalesce((
            select jsonb_agg(member.employee_id order by member.employee_id)
            from public.committee_members as member
            join public.inspection_employees as employee
              on employee.id = member.employee_id
            where member.committee_user_id = actor_id
              and employee.is_active = true
        ), '[]'::jsonb)
    ) into verified_employee_snapshot;

    if p_result <> 'incomplete' and
       jsonb_array_length(verified_employee_snapshot -> 'employeeIds') = 0 then
        raise exception 'A completed visit requires at least one active committee employee'
            using errcode = '23514';
    end if;

    insert into public.facility_visits (
        id,
        assignment_id,
        facility_license,
        committee_user_id,
        committee_username,
        committee_name,
        visit_date,
        result,
        status,
        violation,
        incomplete_reason,
        notes,
        visit_type,
        visit_reason,
        team_snapshot,
        employee_snapshot,
        created_by
    ) values (
        p_visit_id,
        p_assignment_id,
        p_facility_license,
        actor_id,
        actor_profile.username,
        actor_profile.committee_name,
        p_visit_date,
        p_result,
        next_visit_status,
        p_result = 'violation',
        case when p_result = 'incomplete' then p_incomplete_reason else '' end,
        coalesce(p_notes, ''),
        selected_assignment.visit_type,
        selected_assignment.visit_reason,
        verified_team_snapshot,
        verified_employee_snapshot,
        actor_id
    )
    returning * into saved_visit;

    update public.facility_assignments
    set status = next_assignment_status
    where id = selected_assignment.id;

    insert into public.security_events (
        actor_user_id,
        event_type,
        entity_type,
        entity_id,
        details
    ) values (
        actor_id,
        'committee_visit_recorded',
        'facility_visit',
        saved_visit.id,
        jsonb_build_object(
            'facilityLicense', saved_visit.facility_license,
            'assignmentId', saved_visit.assignment_id,
            'result', saved_visit.result,
            'assignmentStatus', next_assignment_status
        )
    );

    return saved_visit;
end;
$$;

revoke execute on function public.record_committee_visit(
    text,
    text,
    text,
    date,
    public.visit_result,
    text,
    text
) from public, anon;

grant execute on function public.record_committee_visit(
    text,
    text,
    text,
    date,
    public.visit_result,
    text,
    text
) to authenticated;

commit;
