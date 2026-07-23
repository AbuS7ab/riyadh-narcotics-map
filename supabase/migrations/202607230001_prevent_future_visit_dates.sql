-- Reject future visit dates at the database boundary.
begin;

create or replace function narco_private.reject_future_visit_date()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.visit_date >
       (clock_timestamp() at time zone 'Asia/Riyadh')::date then
        raise exception 'Future visit dates are not allowed'
            using errcode = '22007';
    end if;

    return new;
end;
$$;

drop trigger if exists facility_visits_reject_future_date
on public.facility_visits;

create trigger facility_visits_reject_future_date
before insert or update of visit_date
on public.facility_visits
for each row
execute function narco_private.reject_future_visit_date();

revoke all on function narco_private.reject_future_visit_date() from public;

commit;
