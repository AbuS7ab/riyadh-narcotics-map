const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.join(__dirname, "..");
const migrationPath = path.join(
    projectRoot,
    "supabase",
    "migrations",
    "202607210001_auth_rls_foundation.sql"
);
const rollbackPath = path.join(
    projectRoot,
    "supabase",
    "rollback",
    "202607210001_auth_rls_foundation.down.sql"
);
const preflightPath = path.join(
    projectRoot,
    "supabase",
    "preflight",
    "security_inventory.sql"
);
const migration = fs.readFileSync(migrationPath, "utf8");
const rollback = fs.readFileSync(rollbackPath, "utf8");
const preflight = fs.readFileSync(preflightPath, "utf8");

const normalizedTables = [
    "inspection_employees",
    "profiles",
    "committee_members",
    "facility_assignments",
    "facility_visits",
    "custom_facilities",
    "facility_overrides",
    "external_visits",
    "app_settings",
    "security_events"
];


function stripSqlComments(sql) {

    return sql
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/--.*$/gm, "");

}


function getPolicyBlocks(sql) {

    return stripSqlComments(sql)
        .split(/(?=create policy\s+)/i)
        .filter(block => /^create policy\s+/i.test(block.trim()))
        .map(block => block.slice(0, block.indexOf(";") + 1));

}


test("security migration is additive and leaves the legacy app_data table untouched", () => {

    const executableSql = stripSqlComments(migration);

    assert.match(executableSql, /^\s*begin;/i);
    assert.match(executableSql, /commit;\s*$/i);
    assert.doesNotMatch(
        executableSql,
        /\b(?:alter|drop|truncate)\s+table\s+public\.app_data\b/i
    );
    assert.doesNotMatch(
        executableSql,
        /\b(?:insert\s+into|update|delete\s+from)\s+public\.app_data\b/i
    );

});


test("every normalized public table enables RLS and removes anonymous grants", () => {

    normalizedTables.forEach(table => {

        assert.match(
            migration,
            new RegExp(`create table public\\.${table}\\s*\\(`, "i")
        );
        assert.match(
            migration,
            new RegExp(`alter table public\\.${table} enable row level security;`, "i")
        );
        assert.match(
            migration,
            new RegExp(`revoke all on table public\\.${table} from public, anon;`, "i")
        );

    });

});


test("all direct write policies are Admin-only and Viewer has no write policy", () => {

    const writePolicies = getPolicyBlocks(migration).filter(block => {

        return /for\s+(?:insert|update|delete)\b/i.test(block);

    });

    assert.ok(writePolicies.length > 0);

    writePolicies.forEach(policy => {

        assert.match(policy, /narco_private\.is_admin\(\)/i);
        assert.doesNotMatch(policy, /\bviewer\b/i);
        assert.doesNotMatch(policy, /\bcommittee\b/i);

    });

});


test("Committee reads are scoped to its Auth UUID while management can read all", () => {

    const assignmentSelect = getPolicyBlocks(migration).find(block => {

        return /^create policy assignments_select_authorized\b/i.test(block.trim());

    });
    const visitSelect = getPolicyBlocks(migration).find(block => {

        return /^create policy visits_select_authorized\b/i.test(block.trim());

    });

    [assignmentSelect, visitSelect].forEach(policy => {

        assert.ok(policy);
        assert.match(policy, /committee_user_id\s*=\s*\(select auth\.uid\(\)\)/i);
        assert.match(policy, /narco_private\.is_management\(\)/i);

    });

});


test("assignment history is retained while only one assignment may remain active", () => {

    const assignmentTableStart = migration.indexOf(
        "create table public.facility_assignments ("
    );
    const assignmentTableEnd = migration.indexOf(
        "create table public.facility_visits ("
    );
    const assignmentSchema = migration.slice(assignmentTableStart, assignmentTableEnd);

    assert.ok(assignmentTableStart >= 0 && assignmentTableEnd > assignmentTableStart);
    assert.doesNotMatch(assignmentSchema, /facility_license text not null unique/i);
    assert.match(
        assignmentSchema,
        /create unique index facility_one_active_assignment_idx/i
    );
    assert.match(
        assignmentSchema,
        /where status in \('assigned', 'in_progress'\)/i
    );

});


test("committee visit RPC validates ownership and performs the visit and assignment update atomically", () => {

    const rpcStart = migration.indexOf("create or replace function public.record_committee_visit(");
    const rpcEnd = migration.indexOf("revoke execute on function public.record_committee_visit(");
    const rpc = migration.slice(rpcStart, rpcEnd);

    assert.ok(rpcStart >= 0 && rpcEnd > rpcStart);
    assert.match(rpc, /security definer\s+set search_path = ''/i);
    assert.match(rpc, /profile\.role = 'committee'/i);
    assert.match(rpc, /assignment\.committee_user_id = actor_id/i);
    assert.match(rpc, /assignment\.facility_license = p_facility_license/i);
    assert.match(rpc, /for update;/i);
    assert.match(rpc, /insert into public\.facility_visits/i);
    assert.match(rpc, /update public\.facility_assignments/i);
    assert.match(rpc, /insert into public\.security_events/i);
    assert.match(rpc, /from public\.committee_members/i);
    assert.match(rpc, /completed visit requires at least one active committee employee/i);
    assert.doesNotMatch(rpc, /p_team_snapshot/i);
    assert.doesNotMatch(rpc, /p_employee_snapshot/i);
    assert.doesNotMatch(rpc, /p_committee_user_id/i);

});


test("all security-definer functions pin an empty search path", () => {

    const securityDefinerCount = (migration.match(/security definer/gi) || []).length;
    const pinnedSearchPathCount = (
        migration.match(/security definer\s+set search_path = ''/gi) || []
    ).length;

    assert.ok(securityDefinerCount > 0);
    assert.equal(pinnedSearchPathCount, securityDefinerCount);

});


test("new Auth users default to inactive Viewer profiles", () => {

    const triggerStart = migration.indexOf("create or replace function narco_private.handle_new_auth_user()");
    const triggerEnd = migration.indexOf("revoke execute on function narco_private.handle_new_auth_user()");
    const trigger = migration.slice(triggerStart, triggerEnd);

    assert.ok(triggerStart >= 0 && triggerEnd > triggerStart);
    assert.match(trigger, /'viewer'/i);
    assert.match(trigger, /false/i);
    assert.doesNotMatch(trigger, /raw_user_meta_data\s*->>\s*'role'/i);

});


test("database trigger protects immutable Auth identity and the last active Admin", () => {

    const triggerStart = migration.indexOf(
        "create or replace function narco_private.protect_admin_profile()"
    );
    const triggerEnd = migration.indexOf(
        "create or replace function narco_private.validate_committee_member()"
    );
    const trigger = migration.slice(triggerStart, triggerEnd);

    assert.ok(triggerStart >= 0 && triggerEnd > triggerStart);
    assert.match(trigger, /new\.user_id <> old\.user_id/i);
    assert.match(trigger, /old\.role = 'admin'/i);
    assert.match(trigger, /profile\.role = 'admin'/i);
    assert.match(trigger, /profile\.active = true/i);
    assert.match(trigger, /At least one active Admin profile is required/i);

});


test("rollback covers every new table and preserves legacy and Auth records", () => {

    normalizedTables.forEach(table => {

        assert.match(
            rollback,
            new RegExp(`drop table if exists public\\.${table};`, "i")
        );

    });

    const executableSql = stripSqlComments(rollback);

    assert.doesNotMatch(executableSql, /public\.app_data/i);
    assert.doesNotMatch(executableSql, /delete\s+from\s+auth\.users/i);
    assert.doesNotMatch(executableSql, /drop\s+table\s+(?:if exists\s+)?auth\.users/i);

});


test("preflight inventory is an explicitly read-only SQL transaction", () => {

    const executableSql = stripSqlComments(preflight);

    assert.match(executableSql, /begin;\s*set transaction read only;/i);
    assert.match(executableSql, /commit;\s*$/i);
    assert.doesNotMatch(
        executableSql,
        /\b(?:insert|update|delete|alter|drop|truncate|create|grant|revoke)\b/i
    );

});
