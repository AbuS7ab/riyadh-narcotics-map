# Supabase Auth and RLS cutover runbook

This runbook is deliberately gated. Do not run the migration against production
until the preflight output, backup, and staging authorization tests have been
reviewed.

## Gate 1 — inventory and backup

1. Run `supabase/preflight/security_inventory.sql` in the Supabase SQL Editor.
   It uses a read-only transaction.
2. Export the full `app_data` table and record its row count and latest
   `updated_at` values.
3. Confirm that point-in-time recovery or a current database backup is
   available.
4. Do not share API secrets, JWTs, password hashes, or the contents of the
   legacy `users` object in screenshots or chat.

Stop if the current grants or policies differ from the expected inventory.

## Gate 2 — staging foundation

1. Create or use a separate staging Supabase project.
2. Apply `supabase/migrations/202607210001_auth_rls_foundation.sql` there.
3. Confirm all new public tables have RLS enabled and `anon` has no grants.
4. Create four disposable Auth users: one Admin, two Committees, and one
   Viewer.
5. Bootstrap the first Admin from the SQL Editor only:

   ```sql
   update public.profiles
   set username = 'admin',
       display_name = 'مدير النظام',
       role = 'admin',
       active = true
   where user_id = (
       select id from auth.users where email = 'ADMIN_EMAIL_HERE'
   );
   ```

6. Sign out and sign in again, then configure the remaining profiles through
   an Admin-only path or reviewed SQL. Never use client-supplied metadata to
   grant Admin.

Use real organizational email addresses or controlled aliases that can receive
password reset messages. Usernames remain in `profiles`; credentials belong
only to Supabase Auth.

## Gate 3 — authorization tests

Using actual staging sessions, verify:

- Viewer can read management indicators and cannot insert, update, delete, or
  execute the committee visit RPC.
- Committee A cannot read Committee B assignments, visits, or members.
- Committee A cannot write tables directly.
- Committee A can record a visit only for its own active assignment through
  the RPC.
- A successful RPC inserts one visit and updates one assignment atomically.
- Reusing a visit ID is idempotent only for the same operation.
- Admin can manage normalized records and read security events.
- `anon` cannot read any normalized table.

Any unexpected success is a release blocker.

## Gate 4 — data mapping and application migration

1. Produce a reviewed mapping from each legacy username to one Auth UUID.
2. Copy employees and committee membership first.
3. Copy current assignments, then visits, preserving existing IDs and snapshots.
4. Reconcile counts and run the synchronization audit against both models.
5. Add a frontend feature flag and test normalized reads in staging.
6. Switch visit completion to `record_committee_visit(...)` and remove the
   two-client-write path.
7. Keep the legacy model available for rollback until acceptance testing is
   complete.

The data-copy migration is intentionally not part of Sprint 5 because it
cannot be generated safely before the Auth UUID mapping is approved.

## Gate 5 — production cutover

1. Announce a short write freeze.
2. Take a fresh backup and capture final `app_data.updated_at` values.
3. Apply the reviewed foundation and data-copy migrations.
4. Run the authorization matrix with production test accounts.
5. Deploy the Auth-enabled frontend.
6. Verify Admin, Committee, and Viewer workflows.
7. Only then revoke `anon` access and lock the legacy `app_data` policies.

Do not enable restrictive RLS on `app_data` before the Auth-enabled frontend is
live; doing so would stop the current application.

## Rollback

Before production cutover, run the supplied down migration only in the same
environment where the foundation was applied. It removes new Sprint 5 objects
and does not touch `app_data` or `auth.users`.

After data has been copied or users have started writing normalized records,
do not run a destructive rollback. Restore the previous frontend mode, preserve
the normalized records, and reconcile them before any schema removal.
