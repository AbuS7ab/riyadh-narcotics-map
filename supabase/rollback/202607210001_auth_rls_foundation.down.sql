-- Roll back only the additive Sprint 5 foundation.
-- This script does not touch public.app_data or auth.users.

begin;

drop trigger if exists narco_profile_on_auth_user_created on auth.users;
drop function if exists narco_private.handle_new_auth_user();

drop function if exists public.record_committee_visit(
    text,
    text,
    text,
    date,
    public.visit_result,
    text,
    text
);

drop function if exists narco_private.can_read_employee(text);
drop function if exists narco_private.is_management();
drop function if exists narco_private.is_admin();
drop function if exists narco_private.current_app_role();

drop trigger if exists committee_members_validate_profile on public.committee_members;
drop trigger if exists facility_assignments_set_committee_snapshot on public.facility_assignments;
drop trigger if exists facility_visits_set_committee_snapshot on public.facility_visits;
drop trigger if exists profiles_protect_admin on public.profiles;

drop function if exists narco_private.set_visit_committee_snapshot();
drop function if exists narco_private.set_assignment_committee_snapshot();
drop function if exists narco_private.validate_committee_member();
drop function if exists narco_private.protect_admin_profile();

drop table if exists public.security_events;
drop table if exists public.external_visits;
drop table if exists public.app_settings;
drop table if exists public.facility_overrides;
drop table if exists public.custom_facilities;
drop table if exists public.facility_visits;
drop table if exists public.facility_assignments;
drop table if exists public.committee_members;
drop table if exists public.profiles;
drop table if exists public.inspection_employees;

drop function if exists narco_private.set_updated_at();

drop type if exists public.visit_status;
drop type if exists public.visit_result;
drop type if exists public.assignment_status;
drop type if exists public.app_role;

drop schema if exists narco_private;

commit;
