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


test("current workload rate uses completed current assignments while totals stay cumulative", async () => {

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
    assert.equal(kpis.completionRate, 33);

});


test("assignments added while work remains open stay in the same current cycle", async () => {

    const assignments = {};

    for (let index = 0; index < 18; index += 1) {

        assignments[`completed-${index}`] = createAssignment(
            `completed-${index}`,
            {
                assignmentBatchId: "completed-history",
                assignedAt: "2026-07-19T08:00:00.000Z",
                status: "completed"
            }
        );

    }

    for (let index = 0; index < 8; index += 1) {

        assignments[`legacy-pending-${index}`] = createAssignment(
            `legacy-pending-${index}`,
            {
                assignmentBatchId: "older-unfinished-batch",
                assignedAt: "2026-07-20T08:00:00.000Z"
            }
        );

    }

    assignments.current = createAssignment("current", {
        assignmentBatchId: "current-batch",
        assignedAt: "2026-07-21T08:00:00.000Z"
    });

    const { context } = await createKpiRuntime(assignments);
    const kpis = context.getCommitteeKpis("committee4");

    assert.equal(kpis.assignedCount, 9);
    assert.equal(kpis.completedCount, 18);
    assert.equal(kpis.remainingCount, 9);
    assert.equal(kpis.completionRate, 0);

});


test("current cycle matches the nine facilities shown to the committee", async () => {

    const assignments = {};
    const facilityStatuses = {};

    for (let index = 0; index < 11; index += 1) {

        const license = `history-${index}`;
        const assignment = createAssignment(license, {
            assignedAt: "2026-07-01T08:00:00.000Z",
            status: "completed"
        });

        assignments[license] = assignment;
        facilityStatuses[license] = {
            visitStatus: "visited",
            visits: [{
                assignmentId: assignment.id,
                committeeUsername: "committee4",
                result: "no_violation",
                visitStatus: "visited",
                createdAt: "2026-07-02T08:00:00.000Z"
            }]
        };

    }

    for (let index = 0; index < 8; index += 1) {

        const license = `current-completed-${index}`;
        const assignment = createAssignment(license, {
            assignedAt: "2026-07-20T08:00:00.000Z",
            status: "completed"
        });

        assignments[license] = assignment;
        facilityStatuses[license] = {
            visitStatus: "visited",
            visits: [{
                assignmentId: assignment.id,
                committeeUsername: "committee4",
                result: "no_violation",
                visitStatus: "visited",
                createdAt: "2026-07-20T09:00:00.000Z"
            }]
        };

    }

    assignments["current-pending"] = createAssignment("current-pending", {
        assignedAt: "2026-07-20T08:30:00.000Z"
    });

    const { context } = await createKpiRuntime(assignments, facilityStatuses);
    const kpis = context.getCommitteeKpis("committee4");
    const currentFacilities = context.getFacilitiesForCurrentAssignmentCycle(
        "committee4",
        Object.keys(assignments).map(license => ({ license }))
    );

    assert.equal(kpis.assignedCount, 9);
    assert.equal(kpis.completedCount, 19);
    assert.equal(kpis.remainingCount, 1);
    assert.equal(kpis.completionRate, 89);
    assert.equal(currentFacilities.length, 9);
    assert.ok(currentFacilities.some(facility => facility.license === "current-pending"));
    assert.ok(!currentFacilities.some(facility => facility.license === "history-0"));

});


test("committee details summary reuses the current-assignment completion rate", async () => {

    const { context } = await createKpiRuntime({
        "100": createAssignment("100", {
            assignmentBatchId: "old-batch",
            assignedAt: "2026-07-19T08:00:00.000Z",
            status: "completed"
        }),
        "200": createAssignment("200", {
            assignmentBatchId: "current-batch",
            assignedAt: "2026-07-20T08:00:00.000Z"
        })
    });

    context.getFacilityDisplayLicense = facility => facility.license;
    context.getVisitStatusDisplay = () => ({
        badge: "secondary",
        text: "قيد الانتظار"
    });

    const sidebarSource = require("node:fs").readFileSync(
        require("node:path").join(__dirname, "..", "js", "sidebar.js"),
        "utf8"
    );

    require("node:vm").runInContext(sidebarSource, context);

    const summary = context.getCommitteeFacilityListSummary(
        "committee4",
        [{ license: "200" }]
    );

    assert.equal(summary.assignedCount, 1);
    assert.equal(summary.remainingCount, 1);
    assert.equal(summary.completedCount, 1);
    assert.equal(summary.completionRate, 0);
    assert.equal(summary.currentBatchCounts.pending, 1);
    assert.equal(summary.currentBatchCounts.completed, 0);

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
    assert.equal(kpis.completionRate, 50);

});


test("legacy assignments keep one batch after unique ids were backfilled", async () => {

    const { context } = await createKpiRuntime({
        "200": createAssignment("200", {
            assignmentBatchId: "batch-committee4-backfilled-200",
            assignedAt: "2026-07-20T08:00:00.000Z"
        }),
        "201": createAssignment("201", {
            assignmentBatchId: "batch-committee4-backfilled-201",
            assignedAt: "2026-07-20T08:00:03.000Z",
            status: "completed"
        }),
        "202": createAssignment("202", {
            assignmentBatchId: "batch-committee4-backfilled-202",
            assignedAt: "2026-07-20T08:00:06.000Z"
        })
    });

    const kpis = context.getCommitteeKpis("committee4");
    const displayedFacilities = context.getFacilitiesForCurrentAssignmentCycle(
        "committee4",
        [
            { license: "200" },
            { license: "201" },
            { license: "202" }
        ]
    );

    assert.equal(kpis.assignedCount, 3);
    assert.equal(kpis.completedCount, 1);
    assert.equal(kpis.remainingCount, 2);
    assert.deepEqual(
        Array.from(displayedFacilities, facility => facility.license),
        ["200", "201", "202"]
    );

});


test("updating a legacy assignment does not create a one-item batch", async () => {

    const { context, supabase } = await createKpiRuntime({
        "200": createAssignment("200"),
        "201": createAssignment("201")
    });

    await context.assignFacilityToCommittee(
        "201",
        "committee4",
        "in_progress"
    );

    const savedAssignments = supabase.rows.get("facilityAssignments").value;
    const kpis = context.getCommitteeKpis("committee4");

    assert.equal(savedAssignments["201"].assignmentBatchId, null);
    assert.equal(kpis.assignedCount, 2);
    assert.equal(kpis.remainingCount, 2);

});


test("time gaps do not split a workload that was never completed", async () => {

    const { context } = await createKpiRuntime({
        "100": createAssignment("100", {
            assignedAt: "2026-07-20T07:50:00.000Z"
        }),
        "101": createAssignment("101", {
            assignedAt: "2026-07-20T07:50:03.000Z"
        }),
        "200": createAssignment("200", {
            assignedAt: "2026-07-20T08:00:00.000Z"
        })
    });

    const kpis = context.getCommitteeKpis("committee4");

    assert.equal(kpis.assignedCount, 3);
    assert.equal(kpis.remainingCount, 3);

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
    assert.equal(kpis.completionRate, 0);

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
