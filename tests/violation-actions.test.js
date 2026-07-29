const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
    createCloudRuntime,
    createInitialRows
} = require("./helpers/runtime");

const root = path.resolve(__dirname, "..");
const migration = fs.readFileSync(
    path.join(
        root,
        "supabase",
        "migrations",
        "202607290001_violation_actions.sql"
    ),
    "utf8"
);
const rollback = fs.readFileSync(
    path.join(
        root,
        "supabase",
        "rollback",
        "202607290001_violation_actions.down.sql"
    ),
    "utf8"
);
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sidebar = fs.readFileSync(
    path.join(root, "js", "sidebar.js"),
    "utf8"
);


function createUser(role) {

    return {
        username: role,
        password: "test",
        displayName: role,
        committeeName: role,
        role,
        active: true,
        team: { leader: "", members: [] }
    };

}


async function createViolationRuntime(role = "admin") {

    const rows = createInitialRows({
        users: {
            value: {
                admin: createUser("admin"),
                committee: createUser("committee"),
                viewer: createUser("viewer")
            }
        },
        facilityStatus: {
            value: {
                "100": {
                    visitStatus: "visited",
                    violation: true,
                    visits: [{
                        id: "violation-1",
                        facilityLicense: "100",
                        date: "2026-07-20",
                        result: "violation",
                        visitStatus: "visited",
                        violation: true
                    }]
                }
            }
        }
    });
    const runtime = await createCloudRuntime(rows, {
        localStorage: { currentUser: role }
    });

    runtime.loadScript("users");
    await runtime.context.initializeUserState();
    runtime.loadScript("status");
    await runtime.context.initializeFacilityStatusState();
    runtime.loadScript("violation-actions");

    return runtime;

}


test("Admin can refer a violation and transaction number is mandatory", async () => {

    const { context, supabase } = await createViolationRuntime();

    await assert.rejects(
        context.addViolationAction("100", "violation-1", {
            type: "referred",
            effectiveDate: "2026-07-21"
        }),
        /transaction number/i
    );

    await context.addViolationAction("100", "violation-1", {
        type: "referred",
        effectiveDate: "2026-07-21",
        transactionNumber: "TX-123",
        destination: "لجنة المخالفات"
    });

    const visit = supabase.rows.get("facilityStatus").value["100"].visits[0];

    assert.equal(visit.violationActions.length, 1);
    assert.equal(visit.violationActions[0].transactionNumber, "TX-123");
    assert.equal(context.getViolationActionStats().referred, 1);

});


test("referral and correction remain in the same immutable timeline", async () => {

    const { context } = await createViolationRuntime();

    await context.addViolationAction("100", "violation-1", {
        type: "referred",
        effectiveDate: "2026-07-21",
        transactionNumber: "TX-123"
    });
    await context.addViolationAction("100", "violation-1", {
        type: "corrected",
        effectiveDate: "2026-07-23",
        notes: "تم التحقق من التصحيح"
    });

    const actions = context.getViolationActions(
        context.getFacilityVisits("100")[0]
    );
    const stats = context.getViolationActionStats();

    assert.equal(actions.length, 2);
    assert.equal(stats.total, 1);
    assert.equal(stats.referred, 1);
    assert.equal(stats.corrected, 1);
    assert.equal(stats.resolutionRate, 100);
    assert.equal(stats.averageResolutionDays, 3);

});


test("Committee and Viewer cannot write violation actions", async () => {

    for (const role of ["committee", "viewer"]) {

        const { context } = await createViolationRuntime(role);

        await assert.rejects(
            context.addViolationAction("100", "violation-1", {
                type: "corrected",
                effectiveDate: "2026-07-21"
            }),
            /Admin authorization/i
        );

    }

});


test("database policy restricts action writes to Admin and management reads", () => {

    assert.match(
        migration,
        /alter table public\.violation_actions enable row level security/i
    );
    assert.match(
        migration,
        /create policy violation_actions_admin_insert[\s\S]*?narco_private\.is_admin\(\)/i
    );
    assert.match(
        migration,
        /create policy violation_actions_select_management[\s\S]*?narco_private\.is_management\(\)/i
    );
    assert.match(
        migration,
        /action_type <> 'referred' or btrim\(transaction_number\) <> ''/i
    );
    assert.doesNotMatch(
        migration,
        /grant\s+(?:update|delete)[\s\S]*?violation_actions/i
    );
    assert.match(rollback, /drop table if exists public\.violation_actions/i);

});


test("management statistics and Admin action controls are wired into the UI", () => {

    assert.match(html, /id="violationActionStatistics"[^>]*management-read-only/i);
    assert.match(html, /id="violationActionsReferred"/i);
    assert.match(html, /id="violationActionsCorrected"/i);
    assert.match(html, /id="violationActionDialog"/i);
    assert.match(
        sidebar,
        /renderViolationActionTimeline\(visit,\s*facilityLicense\)/
    );

});


test("legacy violating visits use the parent facility license for action updates", async () => {

    const { context } = await createViolationRuntime();
    const legacyVisit = {
        id: "legacy-violation",
        date: "2026-07-20",
        result: "violation",
        visitStatus: "visited",
        violation: true
    };

    const markup = context.renderViolationActionTimeline(legacyVisit, "100");

    assert.match(markup, /data-facility-license="100"/);
    assert.match(markup, /data-visit-id="legacy-violation"/);

});
