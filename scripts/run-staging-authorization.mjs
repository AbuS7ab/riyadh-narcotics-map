import assert from "node:assert/strict";
import fs from "node:fs";

const REQUIRED_ENV = [
    "SUPABASE_STAGING_URL",
    "SUPABASE_STAGING_ANON_KEY",
    "STAGING_ADMIN_EMAIL",
    "STAGING_ADMIN_PASSWORD",
    "STAGING_COMMITTEE_A_EMAIL",
    "STAGING_COMMITTEE_A_PASSWORD",
    "STAGING_COMMITTEE_B_EMAIL",
    "STAGING_COMMITTEE_B_PASSWORD",
    "STAGING_VIEWER_EMAIL",
    "STAGING_VIEWER_PASSWORD"
];

const FIXTURES = Object.freeze({
    committeeA: "committee_a_staging",
    committeeB: "committee_b_staging",
    viewer: "viewer_staging",
    assignmentA: "staging-assignment-a-001",
    assignmentB: "staging-assignment-b-001",
    facilityA: "STAGING-FACILITY-A-001",
    facilityB: "STAGING-FACILITY-B-001",
    visitA: "staging-authz-visit-a-001",
    viewerInsert: "staging-viewer-forbidden-assignment",
    committeeDirectVisit: "staging-committee-forbidden-direct-visit",
    adminFacility: "STAGING-ADMIN-AUTHZ-TEST"
});

function requireEnvironment(env = process.env) {
    const missing = REQUIRED_ENV.filter((name) => !String(env[name] || "").trim());
    assert.equal(missing.length, 0, `Missing environment variables: ${missing.join(", ")}`);
    assert.equal(
        env.STAGING_CONFIRMATION,
        "narco-compliance-staging",
        "Refusing to run without STAGING_CONFIRMATION=narco-compliance-staging"
    );

    const url = new URL(env.SUPABASE_STAGING_URL);
    assert.equal(url.protocol, "https:", "Staging URL must use HTTPS");
    assert.match(url.hostname, /^[a-z0-9]+\.supabase\.co$/i, "Unexpected Supabase URL");

    const configSource = fs.readFileSync(new URL("../js/config.js", import.meta.url), "utf8");
    const productionUrl = configSource.match(/url:\s*["'](https:\/\/[^"']+\.supabase\.co)["']/i)?.[1];
    assert.notEqual(
        url.origin,
        productionUrl,
        "Refusing to run authorization tests against the production Supabase project"
    );

    return {
        url: url.origin,
        anonKey: env.SUPABASE_STAGING_ANON_KEY,
        accounts: {
            admin: [env.STAGING_ADMIN_EMAIL, env.STAGING_ADMIN_PASSWORD],
            committeeA: [env.STAGING_COMMITTEE_A_EMAIL, env.STAGING_COMMITTEE_A_PASSWORD],
            committeeB: [env.STAGING_COMMITTEE_B_EMAIL, env.STAGING_COMMITTEE_B_PASSWORD],
            viewer: [env.STAGING_VIEWER_EMAIL, env.STAGING_VIEWER_PASSWORD]
        }
    };
}

function parseBody(text) {
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

async function request(config, path, { token, method = "GET", body, prefer } = {}) {
    const headers = {
        apikey: config.anonKey,
        Authorization: `Bearer ${token || config.anonKey}`
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (prefer) headers.Prefer = prefer;

    const response = await fetch(`${config.url}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = parseBody(await response.text());
    return { ok: response.ok, status: response.status, data };
}

async function signIn(config, email, password) {
    const result = await request(config, "/auth/v1/token?grant_type=password", {
        method: "POST",
        body: { email, password }
    });
    assert.equal(result.ok, true, `Authentication failed (${result.status})`);
    assert.ok(result.data?.access_token, "Authentication returned no access token");
    assert.ok(result.data?.user?.id, "Authentication returned no user id");
    return { token: result.data.access_token, userId: result.data.user.id };
}

function expectOk(result, label) {
    assert.equal(result.ok, true, `${label} failed (${result.status}): ${JSON.stringify(result.data)}`);
    return result.data;
}

function expectDenied(result, label, allowedStatuses = [401, 403]) {
    assert.equal(result.ok, false, `${label} unexpectedly succeeded`);
    assert.ok(
        allowedStatuses.includes(result.status),
        `${label} returned unexpected ${result.status}: ${JSON.stringify(result.data)}`
    );
}

function asRow(data) {
    return Array.isArray(data) ? data[0] : data;
}

async function run() {
    const config = requireEnvironment();
    process.stdout.write(`Authorization target: ${config.url}\n`);

    const sessions = {};
    for (const [name, credentials] of Object.entries(config.accounts)) {
        sessions[name] = await signIn(config, ...credentials);
        process.stdout.write(`PASS sign in: ${name}\n`);
    }

    const anonProfiles = await request(config, "/rest/v1/profiles?select=user_id&limit=1");
    expectDenied(anonProfiles, "Anonymous normalized-table read");
    process.stdout.write("PASS anon cannot read normalized tables\n");

    const viewerAssignments = expectOk(
        await request(config, "/rest/v1/facility_assignments?select=id,committee_username,status&order=id.asc", {
            token: sessions.viewer.token
        }),
        "Viewer assignment read"
    );
    assert.deepEqual(
        viewerAssignments.map((row) => row.id),
        [FIXTURES.assignmentA, FIXTURES.assignmentB],
        "Viewer should see both management assignments"
    );
    process.stdout.write("PASS viewer can read management assignments\n");

    const viewerProfiles = expectOk(
        await request(config, "/rest/v1/profiles?select=user_id,username", { token: sessions.viewer.token }),
        "Viewer profile read"
    );
    const committeeAProfile = viewerProfiles.find((row) => row.username === FIXTURES.committeeA);
    assert.ok(committeeAProfile?.user_id, "Committee A profile is missing");

    const viewerWrite = await request(config, "/rest/v1/facility_assignments", {
        token: sessions.viewer.token,
        method: "POST",
        prefer: "return=representation",
        body: {
            id: FIXTURES.viewerInsert,
            facility_license: "STAGING-VIEWER-FORBIDDEN",
            committee_user_id: committeeAProfile.user_id,
            committee_username: FIXTURES.committeeA,
            status: "assigned"
        }
    });
    if (viewerWrite.ok) {
        await request(
            config,
            `/rest/v1/facility_assignments?id=eq.${encodeURIComponent(FIXTURES.viewerInsert)}`,
            { token: sessions.admin.token, method: "DELETE" }
        );
    }
    expectDenied(viewerWrite, "Viewer direct write");
    process.stdout.write("PASS viewer cannot write assignments\n");

    const viewerRpc = await request(config, "/rest/v1/rpc/record_committee_visit", {
        token: sessions.viewer.token,
        method: "POST",
        body: {
            p_visit_id: "staging-viewer-forbidden-rpc",
            p_assignment_id: FIXTURES.assignmentA,
            p_facility_license: FIXTURES.facilityA,
            p_visit_date: "2026-07-20",
            p_result: "no_violation"
        }
    });
    expectDenied(viewerRpc, "Viewer committee RPC");
    process.stdout.write("PASS viewer cannot execute committee RPC\n");

    for (const [sessionName, expectedAssignment, forbiddenAssignment] of [
        ["committeeA", FIXTURES.assignmentA, FIXTURES.assignmentB],
        ["committeeB", FIXTURES.assignmentB, FIXTURES.assignmentA]
    ]) {
        const rows = expectOk(
            await request(config, "/rest/v1/facility_assignments?select=id", {
                token: sessions[sessionName].token
            }),
            `${sessionName} assignment read`
        );
        assert.deepEqual(rows.map((row) => row.id), [expectedAssignment]);
        assert.equal(rows.some((row) => row.id === forbiddenAssignment), false);
        process.stdout.write(`PASS ${sessionName} sees only its assignment\n`);
    }

    const committeeDirectWrite = await request(config, "/rest/v1/facility_visits", {
        token: sessions.committeeA.token,
        method: "POST",
        prefer: "return=representation",
        body: {
            id: FIXTURES.committeeDirectVisit,
            assignment_id: FIXTURES.assignmentA,
            facility_license: FIXTURES.facilityA,
            committee_user_id: sessions.committeeA.userId,
            committee_username: FIXTURES.committeeA,
            visit_date: "2026-07-20",
            result: "no_violation",
            status: "visited",
            violation: false,
            created_by: sessions.committeeA.userId
        }
    });
    if (committeeDirectWrite.ok) {
        await request(
            config,
            `/rest/v1/facility_visits?id=eq.${encodeURIComponent(FIXTURES.committeeDirectVisit)}`,
            { token: sessions.admin.token, method: "DELETE" }
        );
    }
    expectDenied(committeeDirectWrite, "Committee direct table write");
    process.stdout.write("PASS committee cannot write visit table directly\n");

    const crossCommitteeRpc = await request(config, "/rest/v1/rpc/record_committee_visit", {
        token: sessions.committeeA.token,
        method: "POST",
        body: {
            p_visit_id: "staging-cross-committee-forbidden",
            p_assignment_id: FIXTURES.assignmentB,
            p_facility_license: FIXTURES.facilityB,
            p_visit_date: "2026-07-20",
            p_result: "no_violation"
        }
    });
    expectDenied(crossCommitteeRpc, "Cross-committee RPC", [400, 403]);
    process.stdout.write("PASS committee cannot complete another committee assignment\n");

    const rpcPayload = {
        p_visit_id: FIXTURES.visitA,
        p_assignment_id: FIXTURES.assignmentA,
        p_facility_license: FIXTURES.facilityA,
        p_visit_date: "2026-07-20",
        p_result: "no_violation",
        p_notes: "Staging authorization test"
    };
    const firstVisit = asRow(expectOk(
        await request(config, "/rest/v1/rpc/record_committee_visit", {
            token: sessions.committeeA.token,
            method: "POST",
            body: rpcPayload
        }),
        "Committee own-assignment RPC"
    ));
    assert.equal(firstVisit.id, FIXTURES.visitA);

    const repeatedVisit = asRow(expectOk(
        await request(config, "/rest/v1/rpc/record_committee_visit", {
            token: sessions.committeeA.token,
            method: "POST",
            body: rpcPayload
        }),
        "Idempotent committee RPC retry"
    ));
    assert.equal(repeatedVisit.id, FIXTURES.visitA);
    process.stdout.write("PASS committee RPC is atomic and idempotent\n");

    const finalAssignments = expectOk(
        await request(config, "/rest/v1/facility_assignments?select=id,status&order=id.asc", {
            token: sessions.viewer.token
        }),
        "Viewer final assignment read"
    );
    assert.equal(finalAssignments.find((row) => row.id === FIXTURES.assignmentA)?.status, "completed");
    assert.equal(finalAssignments.find((row) => row.id === FIXTURES.assignmentB)?.status, "assigned");

    const visits = expectOk(
        await request(
            config,
            `/rest/v1/facility_visits?select=id&id=eq.${encodeURIComponent(FIXTURES.visitA)}`,
            { token: sessions.viewer.token }
        ),
        "Viewer completed-visit read"
    );
    assert.equal(visits.length, 1, "Exactly one visit should exist after an idempotent retry");
    process.stdout.write("PASS visit and assignment committed exactly once\n");

    expectOk(
        await request(
            config,
            `/rest/v1/custom_facilities?license=eq.${encodeURIComponent(FIXTURES.adminFacility)}`,
            { token: sessions.admin.token, method: "DELETE" }
        ),
        "Admin pre-test cleanup"
    );
    expectOk(
        await request(config, "/rest/v1/custom_facilities", {
            token: sessions.admin.token,
            method: "POST",
            prefer: "return=representation",
            body: {
                license: FIXTURES.adminFacility,
                facility_data: { name: "Staging Admin authorization test" },
                created_by: sessions.admin.userId
            }
        }),
        "Admin insert"
    );
    expectOk(
        await request(
            config,
            `/rest/v1/custom_facilities?license=eq.${encodeURIComponent(FIXTURES.adminFacility)}`,
            { token: sessions.admin.token, method: "DELETE" }
        ),
        "Admin cleanup"
    );
    expectOk(
        await request(config, "/rest/v1/security_events?select=id,event_type&limit=10", {
            token: sessions.admin.token
        }),
        "Admin security-event read"
    );
    process.stdout.write("PASS admin management permissions\n");
    process.stdout.write("PASS staging authorization matrix complete\n");
}

run().catch((error) => {
    process.stderr.write(`FAIL ${error.message}\n`);
    process.exitCode = 1;
});
