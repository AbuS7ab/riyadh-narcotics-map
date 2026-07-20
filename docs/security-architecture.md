# Supabase security architecture

Sprint 5 adds an isolated security foundation. It does not switch the live
application from its current `app_data` JSON rows and does not change any
production policy.

## Why `app_data` cannot be secured per committee

`facilityAssignments` and `facilityStatus` are each stored as one JSON object
inside one `app_data` row. PostgreSQL RLS authorizes rows, not individual keys
inside a JSON value. A policy that allows a committee to update that row would
also allow a direct API caller to replace records belonging to other
committees. Frontend checks cannot close that gap.

The foundation therefore creates normalized rows for profiles, employees,
committee membership, assignments, visits, external visits, custom facilities,
overrides, settings, and security events. The existing `app_data` table remains
untouched until the application has been migrated and verified.

Assignments retain their historical rows. A partial unique index prevents two
`assigned`/`in_progress` assignments for the same facility while still allowing
new assignments after an earlier one is completed or cancelled.

## Identity and roles

Supabase Auth owns credentials and sessions. `public.profiles` links each Auth
UUID to one application role:

- `admin`: full operational and account administration.
- `committee`: reads only its assignments, visits, and employee team.
- `viewer`: management read-only access with no insert, update, or delete
  policy.

New Auth users receive an inactive `viewer` profile. An existing active Admin
must explicitly set the intended username, display name, role, and active
state. Role assignment is never accepted from browser metadata.

Roles are read from `profiles` by small `security definer` helpers in the
non-exposed `narco_private` schema. This avoids trusting editable user metadata and
applies role changes immediately without waiting for an old JWT claim to
expire.

The database also prevents changing a profile's Auth UUID and prevents deleting,
deactivating, or demoting the last active Admin.

## Authorization matrix

| Resource | Admin | Committee | Viewer |
| --- | --- | --- | --- |
| Profiles | Read/write | Own profile only | Read all |
| Employees | Read/write | Own committee team | Read all |
| Committee membership | Read/write | Own membership | Read all |
| Assignments | Read/write | Read own only | Read all |
| Visits | Read/write | Read own; create through RPC | Read all |
| Custom facilities/overrides | Read/write | Read | Read |
| External visits | Read/write | No access | Read |
| App settings | Read/write | Read | Read |
| Security events | Read | No access | No access |

The `authenticated` PostgreSQL role receives table privileges, while RLS
policies decide which rows and commands are allowed. `anon` receives no access
to any new table.

## Atomic committee visit command

`public.record_committee_visit(...)` is the only committee write command in
this foundation. In one database transaction it:

1. Requires an active committee profile.
2. Locks and verifies the exact assignment, facility, and committee.
3. Rejects cancelled, completed, replaced, or foreign assignments.
4. Derives the committee and active employee snapshots from database records.
5. Requires at least one active committee employee for a completed visit.
6. Inserts an idempotent visit.
7. Moves the same assignment to `in_progress` or `completed`.
8. Appends a security event.

Viewer and Admin sessions cannot impersonate a committee through this RPC.
Admin writes remain protected by Admin-only RLS policies.

## Files

- `supabase/migrations/202607210001_auth_rls_foundation.sql`: additive schema,
  RLS policies, triggers, and visit RPC.
- `supabase/rollback/202607210001_auth_rls_foundation.down.sql`: rollback for
  the new foundation only.
- `supabase/preflight/security_inventory.sql`: read-only inventory for the
  current project.
- `docs/security-cutover-runbook.md`: staged deployment and rollback gates.

## Deferred intentionally

- No Auth account is created by the migration.
- No legacy password is copied to Supabase Auth.
- No `app_data` value is copied or deleted.
- No RLS policy is changed on `app_data`.
- No frontend login or persistence path is switched.
- No social login provider is enabled.

These actions require a verified user-to-Auth UUID mapping, staging tests, and
an approved production cutover.

## Official references

- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Custom claims and RBAC](https://supabase.com/docs/guides/api/custom-claims-and-role-based-access-control-rbac)
- [Supabase security hardening](https://supabase.com/docs/guides/security/product-security)
