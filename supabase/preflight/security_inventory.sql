-- Read-only inventory. Run in the Supabase SQL Editor before any migration.
-- Share the result, not screenshots containing tokens or credentials.

begin;
set transaction read only;

select
    schemaname,
    tablename,
    rowsecurity as rls_enabled
from pg_tables
where schemaname in ('public', 'storage')
order by schemaname, tablename;

select
    schemaname,
    tablename,
    policyname,
    roles,
    cmd,
    qual,
    with_check
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname;

select
    table_schema,
    table_name,
    grantee,
    privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;

select
    key,
    jsonb_typeof(value::jsonb) as value_type,
    updated_at
from public.app_data
order by key;

select count(*) as auth_user_count
from auth.users;

commit;
