-- Return a stable authorization denial when a committee cannot access an active assignment.
begin;

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
        raise exception using
            errcode = '42501',
            message = 'Assignment is not authorized or no longer active';
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
