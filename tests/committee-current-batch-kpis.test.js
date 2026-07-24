const test = require("node:test");
const assert = require("node:assert/strict");

const {
    createCloudRuntime,
    createInitialRows
} = require("./helpers/runtime");


function createAdmin() {

    return {
        username: "admin",
        password: "admin",
        displayName: "مدير النظام",
        committeeName: "إدارة الامتثال",
        role: "admin",
        active: true,
        team: { leader: "", members: [] }
    };

}


function createCommittee() {

    return {
        username: "committee4",
        password: "test",
        displayName: "لجنة 4",
        committeeName: "لجنة 4",
        role: "committee",
        active: true,
        team: { leader: "", members: [] }
    };

}


function createAssignment(license, overrides = {}) {

    return {
        id: `assignment-${license}`,
        facilityLicense: String(license),
        committeeUsername: "committee4",
        assignedAt: "2026-07-20T08:00:00.000Z",
        status: "assigned",
        visitType: "periodic",
        visitReason: "الخطة الدورية",
        ...overrides
    };

}


async function createKpiRuntime(assignments, facilityStatuses = {}) {

    const rows = createInitialRows({
        users: {
            value: {
                admin: createAdmin(),
                committee4: createCommittee()
            }
        },
        facilityAssignments: { value: assignments }
    });
    const runtime = await createCloudRuntime(rows, {
        localStorage: { currentUser: "admin" }
    });

    runtime.context.getFacilityStatus = license => (
        facilityStatuses[String(license)] || {
            visitStatus: "pending",
            visits: []
        }
    );
    runtime.loadScript("users");
    await runtime.context.initializeUserState();

    return runtime;

}


test("current workload uses the latest batch while performance stays cumulative", async () => {

    const { context } = await createKpiRuntime({
        "100": createAssignment("100", {
            assignmentBatchId: "old-batch",
            assignedAt: "2026-07-19T08:00:00.000Z",
            status: "completed"
        }),
        "101": createAssignment("101", {
            assignmentBatchId: "old-batch",
            assignedAt: "2026-07-19T08:00:00.000Z",
            status: "completed"
        }),
        "200": createAssignment("200", {
            assignmentBatchId: "current-batch"
        }),
        "201": createAssignment("201", {
            assignmentBatchId: "current-batch",
            status: "completed"
        }),
        "202": createAssignment("202", {
            assignmentBatchId: "current-batch"
        })
    });

    const kpis = context.getCommitteeKpis("committee4");

    assert.equal(kpis.assignedCount, 3);
    assert.equal(kpis.completedCount, 3);
    assert.equal(kpis.remainingCount, 2);
    assert.equal(kpis.completionRate, 60);

});


test("assigned count resets to zero after the latest batch is complete", async () => {

    const { context } = await createKpiRuntime({
        "200": createAssignment("200", {
            assignmentBatchId: "current-batch",
            status: "completed"
        }),
        "201": createAssignment("201", {
            assignmentBatchId: "current-batch",
            status: "completed"
        })
    });

    const kpis = context.getCommitteeKpis("committee4");

    assert.equal(kpis.assignedCount, 0);
    assert.equal(kpis.completedCount, 2);
    assert.equal(kpis.remainingCount, 0);
    assert.equal(kpis.completionRate, 100);

});


test("legacy assignments with the same timestamp remain one batch", async () => {

    const { context } = await createKpiRuntime({
        "100": createAssignment("100", {
            assignedAt: "2026-07-19T08:00:00.000Z",
            status: "completed"
        }),
        "200": createAssignment("200"),
        "201": createAssignment("201", { status: "completed" })
    });

    const kpis = context.getCommitteeKpis("committee4");

    assert.equal(kpis.assignedCount, 2);
    assert.equal(kpis.completedCount, 2);
    assert.equal(kpis.remainingCount, 1);
    assert.equal(kpis.completionRate, 67);

});


test("violations remain cumulative across old and current batches", async () => {

    const { context } = await createKpiRuntime({
        "100": createAssignment("100", {
            assignmentBatchId: "old-batch",
            assignedAt: "2026-07-19T08:00:00.000Z",
            status: "completed"
        }),
        "200": createAssignment("200", {
            assignmentBatchId: "current-batch"
        })
    }, {
        "100": {
            visitStatus: "violation",
            violations: [{ type: "test" }],
            visits: []
        }
    });

    const kpis = context.getCommitteeKpis("committee4");

    assert.equal(kpis.assignedCount, 1);
    assert.equal(kpis.remainingCount, 1);
    assert.equal(kpis.completedCount, 1);
    assert.equal(kpis.violatingFacilityCount, 1);
    assert.equal(kpis.completionRate, 50);

});


test("new bulk assignments share a persisted batch id", async () => {

    const { context, supabase } = await createKpiRuntime({});

    await context.assignFacilitiesToCommittee(
        ["300", "301"],
        "committee4"
    );

    const savedAssignments = supabase.rows.get("facilityAssignments").value;

    assert.ok(savedAssignments["300"].assignmentBatchId);
    assert.equal(
        savedAssignments["300"].assignmentBatchId,
        savedAssignments["301"].assignmentBatchId
    );

});
