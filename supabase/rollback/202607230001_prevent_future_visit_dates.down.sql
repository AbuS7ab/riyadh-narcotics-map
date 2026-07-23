begin;

drop trigger if exists facility_visits_reject_future_date
on public.facility_visits;

drop function if exists narco_private.reject_future_visit_date();

commit;
