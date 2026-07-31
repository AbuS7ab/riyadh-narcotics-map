const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    createCloudRuntime,
    createInitialRows
} = require("./helpers/runtime");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sidebar = fs.readFileSync(path.join(root, "js/sidebar.js"), "utf8");


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


function createVisit(license, date, overrides = {}) {

    return {
        id: `visit-${license}-${date}`,
        assignmentId: `old-assignment-${license}`,
        facilityLicense: String(license),
        date,
        committeeUsername: "committee4",
        visitStatus: "visited",
        result: "no_violation",
        createdAt: `${date}T10:00:00.000Z`,
        ...overrides
    };

}


function createFacilityStatus(license, date, overrides = {}) {

    const visit = createVisit(license, date, overrides);

    return {
        visitStatus: "visited",
        violation: false,
        visitDate: date,
        visits: [visit]
    };

}


function createCompletedAssignment(license) {

    return {
        id: `old-assignment-${license}`,
        facilityLicense: String(license),
        committeeUsername: "committee4",
        assignedAt: "2026-04-20T08:00:00.000Z",
        status: "completed",
        visitType: "periodic",
        visitReason: "الخطة الدورية"
    };

}


function createActiveCycle(licenses = ["100", "101"]) {

    return {
        currentCycleId: "cycle-1",
        cycles: [{
            id: "cycle-1",
            sequence: 1,
            status: "active",
            startedAt: "2026-07-28T08:00:00.000Z",
            startedBy: "admin",
            minimumIntervalDays: 75,
            facilityLicenses: licenses.map(String)
        }]
    };

}


async function createCycleRuntime(overrides = {}) {

    const rows = createInitialRows({
        users: {
            value: {
                admin: createAdmin(),
                committee4: createCommittee(),
                ...(overrides.users || {})
            }
        },
        facilityAssignments: {
            value: overrides.assignments || {}
        },
        facilityAssignmentHistory: {
            value: overrides.assignmentHistory || {}
        },
        facilityStatus: {
            value: overrides.statuses || {}
        },
        appSettings: {
            value: overrides.appSettings || {}
        }
    });
    const runtime = await createCloudRuntime(rows, {
        localStorage: { currentUser: overrides.currentUser || "admin" }
    });

    runtime.loadScript("status");
    await runtime.context.initializeFacilityStatusState();
    runtime.loadScript("users");
    await runtime.context.initializeUserState();

    return runtime;

}


test("a periodic cycle cannot start before every active facility has a completed visit", async () => {

    const { context, supabase } = await createCycleRuntime({
        statuses: {
            100: createFacilityStatus("100", "2026-05-01"),
            101: {
                visitStatus: "pending",
                violation: false,
                visitDate: null,
                visits: []
            }
        }
    });
    const settingsBefore = structuredClone(
        supabase.rows.get("appSettings").value
    );

    await assert.rejects(
        context.startPeriodicVisitCycle([
            { license: "100" },
            { license: "101" }
        ], 75),
        error => {

            assert.equal(error.code, "BASELINE_COVERAGE_INCOMPLETE");
            assert.equal(error.uncoveredCount, 1);

            return true;

        }
    );
    assert.deepEqual(
        supabase.rows.get("appSettings").value,
        settingsBefore
    );

});


test("opening a cycle snapshots facilities without changing visits or assignments", async () => {

    const statuses = {
        100: createFacilityStatus("100", "2026-05-01"),
        101: createFacilityStatus("101", "2026-07-01")
    };
    const assignments = {
        100: createCompletedAssignment("100"),
        101: createCompletedAssignment("101")
    };
    const { context, supabase } = await createCycleRuntime({
        statuses,
        assignments
    });
    const statusesBefore = structuredClone(
        supabase.rows.get("facilityStatus").value
    );
    const assignmentsBefore = structuredClone(
        supabase.rows.get("facilityAssignments").value
    );

    const cycle = await context.startPeriodicVisitCycle([
        { license: "100" },
        { license: "101" }
    ], 75);

    assert.equal(cycle.sequence, 1);
    assert.equal(cycle.minimumIntervalDays, 75);
    assert.deepEqual(
        Array.from(cycle.facilityLicenses),
        ["100", "101"]
    );
    assert.deepEqual(
        supabase.rows.get("facilityStatus").value,
        statusesBefore
    );
    assert.deepEqual(
        supabase.rows.get("facilityAssignments").value,
        assignmentsBefore
    );

});


test("periodic eligibility enforces 75 days while reactive work bypasses the interval", async () => {

    const { context } = await createCycleRuntime({
        appSettings: {
            periodicVisitPlan: createActiveCycle()
        },
        statuses: {
            100: createFacilityStatus("100", "2026-05-14"),
            101: createFacilityStatus("101", "2026-07-08")
        },
        assignments: {
            100: createCompletedAssignment("100"),
            101: createCompletedAssignment("101")
        }
    });
    const due = context.getPeriodicAssignmentEligibility(
        { license: "100" },
        { today: "2026-07-28" }
    );
    const recent = context.getPeriodicAssignmentEligibility(
        { license: "101" },
        { today: "2026-07-28" }
    );

    assert.equal(due.eligible, true);
    assert.equal(due.dueDate, "2026-07-28");
    assert.equal(recent.eligible, false);
    assert.equal(recent.reason, "waiting");
    assert.equal(recent.daysUntilDue, 55);
    assert.equal(
        context.isFacilityAssignableForVisit({ license: "101" }, "reactive"),
        true
    );

});


test("reassignment archives the completed assignment and leaves prior visits unchanged", async () => {

    const oldAssignment = createCompletedAssignment("100");
    const oldStatus = createFacilityStatus("100", "2026-05-01");
    const { context, supabase } = await createCycleRuntime({
        appSettings: {
            periodicVisitPlan: createActiveCycle(["100"])
        },
        statuses: { 100: oldStatus },
        assignments: { 100: oldAssignment }
    });
    const visitsBefore = structuredClone(
        supabase.rows.get("facilityStatus").value["100"].visits
    );

    const assignedCount = await context.assignFacilitiesToCommittee(
        ["100"],
        "committee4",
        { visitType: "periodic" }
    );
    const currentAssignment =
        supabase.rows.get("facilityAssignments").value["100"];
    const history =
        supabase.rows.get("facilityAssignmentHistory").value;

    assert.equal(assignedCount, 1);
    assert.notEqual(currentAssignment.id, oldAssignment.id);
    assert.equal(currentAssignment.status, "assigned");
    assert.equal(currentAssignment.visitCycleId, "cycle-1");
    assert.equal(currentAssignment.visitCycleNumber, 1);
    assert.equal(history[oldAssignment.id].id, oldAssignment.id);
    assert.equal(history[oldAssignment.id].status, "completed");
    assert.equal(
        history[oldAssignment.id].archiveReason,
        "periodic_cycle_1"
    );
    assert.deepEqual(
        supabase.rows.get("facilityStatus").value["100"].visits,
        visitsBefore
    );

});


test("a complaint transfers an open assignment while preserving its visits and audit history", async () => {

    const openAssignment = {
        ...createCompletedAssignment("100"),
        status: "in_progress"
    };
    const oldStatus = createFacilityStatus("100", "2026-07-25", {
        result: "incomplete",
        visitStatus: "partial"
    });
    const { context, supabase } = await createCycleRuntime({
        statuses: { 100: oldStatus },
        assignments: { 100: openAssignment },
        users: {
            committee5: {
                ...createCommittee(),
                username: "committee5",
                displayName: "لجنة 5",
                committeeName: "لجنة 5"
            }
        }
    });
    const visitsBefore = structuredClone(
        supabase.rows.get("facilityStatus").value["100"].visits
    );

    assert.equal(
        context.isFacilityAssignableForVisit(
            { license: "100" },
            "reactive",
            {
                committeeUsername: "committee5",
                visitReason: "شكوى"
            }
        ),
        true
    );
    assert.equal(
        context.isFacilityAssignableForVisit(
            { license: "100" },
            "periodic",
            { committeeUsername: "committee5" }
        ),
        false
    );
    assert.equal(
        context.isFacilityAssignableForVisit(
            { license: "100" },
            "reactive",
            {
                committeeUsername: "committee5",
                visitReason: "بلاغ"
            }
        ),
        false
    );

    const assignedCount = await context.assignFacilitiesToCommittee(
        ["100"],
        "committee5",
        {
            visitType: "reactive",
            visitReason: "شكوى"
        }
    );
    const currentAssignment =
        supabase.rows.get("facilityAssignments").value["100"];
    const archivedAssignment =
        supabase.rows.get("facilityAssignmentHistory").value[
            openAssignment.id
        ];

    assert.equal(assignedCount, 1);
    assert.equal(currentAssignment.committeeUsername, "committee5");
    assert.equal(currentAssignment.status, "assigned");
    assert.equal(currentAssignment.visitType, "reactive");
    assert.equal(currentAssignment.visitReason, "شكوى");
    assert.equal(archivedAssignment.committeeUsername, "committee4");
    assert.equal(archivedAssignment.statusBeforeArchive, "in_progress");
    assert.equal(archivedAssignment.status, "cancelled");
    assert.equal(
        archivedAssignment.transferredToCommitteeUsername,
        "committee5"
    );
    assert.equal(
        archivedAssignment.archiveReason,
        "reactive_complaint_transfer"
    );
    assert.deepEqual(
        supabase.rows.get("facilityStatus").value["100"].visits,
        visitsBefore
    );

});


test("a committee can open only a reactive complaint assignment after a completed visit", async () => {

    const completedAssignment = createCompletedAssignment("100");
    const completedStatus = createFacilityStatus("100", "2026-07-11");
    const { context, supabase } = await createCycleRuntime({
        currentUser: "committee4",
        statuses: { 100: completedStatus },
        assignments: { 100: completedAssignment }
    });
    const visitsBefore = structuredClone(
        supabase.rows.get("facilityStatus").value["100"].visits
    );

    const complaintAssignment =
        await context.createCommitteeComplaintAssignment("100");
    const currentAssignment =
        supabase.rows.get("facilityAssignments").value["100"];
    const archivedAssignment =
        supabase.rows.get("facilityAssignmentHistory").value[
            completedAssignment.id
        ];

    assert.equal(complaintAssignment.committeeUsername, "committee4");
    assert.equal(currentAssignment.status, "assigned");
    assert.equal(currentAssignment.visitType, "reactive");
    assert.equal(currentAssignment.visitReason, "شكوى");
    assert.equal(currentAssignment.visitCycleId, null);
    assert.equal(currentAssignment.visitCycleNumber, null);
    assert.equal(
        currentAssignment.assignmentSource,
        "committee_complaint"
    );
    assert.equal(archivedAssignment.status, "completed");
    assert.equal(
        archivedAssignment.archiveReason,
        "committee_reactive_complaint"
    );
    assert.deepEqual(
        supabase.rows.get("facilityStatus").value["100"].visits,
        visitsBefore
    );

});


test("a committee cannot replace another committee's active assignment", async () => {

    const otherCommitteeAssignment = {
        ...createCompletedAssignment("100"),
        committeeUsername: "committee5",
        status: "in_progress"
    };
    const { context, supabase } = await createCycleRuntime({
        currentUser: "committee4",
        assignments: { 100: otherCommitteeAssignment },
        users: {
            committee5: {
                ...createCommittee(),
                username: "committee5",
                displayName: "لجنة 5",
                committeeName: "لجنة 5"
            }
        }
    });

    assert.equal(
        await context.createCommitteeComplaintAssignment("100"),
        false
    );
    assert.deepEqual(
        supabase.rows.get("facilityAssignments").value["100"],
        otherCommitteeAssignment
    );
    assert.deepEqual(
        supabase.rows.get("facilityAssignmentHistory").value,
        {}
    );

});


test("failed reassignment rolls back the archive and preserves the current assignment", async () => {

    const oldAssignment = createCompletedAssignment("100");
    const oldStatus = createFacilityStatus("100", "2026-05-01");
    const { context, supabase } = await createCycleRuntime({
        appSettings: {
            periodicVisitPlan: createActiveCycle(["100"])
        },
        statuses: { 100: oldStatus },
        assignments: { 100: oldAssignment }
    });
    const visitsBefore = structuredClone(
        supabase.rows.get("facilityStatus").value["100"].visits
    );

    supabase.failNextWrite(
        "facilityAssignments",
        new Error("simulated assignment write failure")
    );

    await assert.rejects(
        context.assignFacilitiesToCommittee(
            ["100"],
            "committee4",
            { visitType: "periodic" }
        ),
        /simulated assignment write failure/
    );
    assert.deepEqual(
        supabase.rows.get("facilityAssignments").value["100"],
        oldAssignment
    );
    assert.deepEqual(
        supabase.rows.get("facilityAssignmentHistory").value,
        {}
    );
    assert.deepEqual(
        supabase.rows.get("facilityStatus").value["100"].visits,
        visitsBefore
    );

});


test("an old completed visit does not complete the new assignment or inflate its rate", async () => {

    const oldAssignment = {
        ...createCompletedAssignment("100"),
        archivedAt: "2026-07-28T08:00:00.000Z"
    };
    const currentAssignment = {
        id: "new-assignment-100",
        facilityLicense: "100",
        committeeUsername: "committee4",
        assignedAt: "2026-07-28T09:00:00.000Z",
        status: "assigned",
        visitType: "periodic",
        visitReason: "الخطة الدورية",
        visitCycleId: "cycle-1",
        visitCycleNumber: 1
    };
    const { context } = await createCycleRuntime({
        appSettings: {
            periodicVisitPlan: createActiveCycle(["100"])
        },
        statuses: {
            100: createFacilityStatus("100", "2026-05-01")
        },
        assignments: {
            100: currentAssignment
        },
        assignmentHistory: {
            [oldAssignment.id]: oldAssignment
        }
    });
    const cycleAssignments = context.getCurrentAssignmentCycleForCommittee(
        "committee4"
    );
    const kpis = context.getCommitteeKpis("committee4");

    assert.deepEqual(
        Array.from(cycleAssignments, assignment => assignment.id),
        ["new-assignment-100"]
    );
    assert.equal(kpis.assignedCount, 1);
    assert.equal(kpis.remainingCount, 1);
    assert.equal(kpis.completionRate, 0);
    assert.equal(kpis.completedCount, 0);

});


test("committee KPIs count completions only from the current assignment workload", async () => {

    const assignments = {};
    const statuses = {};
    const assignmentHistory = {};

    for (let index = 1; index <= 7; index += 1) {

        const license = `old-${index}`;
        const assignment = {
            ...createCompletedAssignment(license),
            assignedAt: `2026-06-01T08:${String(index).padStart(2, "0")}:00.000Z`
        };

        assignmentHistory[assignment.id] = assignment;
        statuses[license] = createFacilityStatus(license, "2026-06-02");

    }

    for (let index = 1; index <= 20; index += 1) {

        const license = `current-${index}`;
        const isFirstBatch = index <= 10;
        const assignmentId = `current-assignment-${index}`;

        assignments[license] = {
            id: assignmentId,
            facilityLicense: license,
            committeeUsername: "committee4",
            assignedAt: isFirstBatch
                ? `2026-07-01T08:${String(index).padStart(2, "0")}:00.000Z`
                : `2026-07-03T08:${String(index - 10).padStart(2, "0")}:00.000Z`,
            status: index <= 8 ? "completed" : "assigned",
            visitType: "periodic",
            visitReason: "الخطة الدورية"
        };

        if (index <= 8) {

            statuses[license] = createFacilityStatus(
                license,
                "2026-07-02",
                { assignmentId }
            );

        }

    }

    const { context } = await createCycleRuntime({
        assignments,
        assignmentHistory,
        statuses
    });
    const kpis = context.getCommitteeKpis("committee4");

    assert.equal(kpis.assignedCount, 20);
    assert.equal(kpis.completedCount, 8);
    assert.equal(kpis.remainingCount, 12);
    assert.equal(kpis.completionRate, 40);

});


test("cycle identifiers persist on new visit records and drive assignment-specific status", async () => {

    const { context } = await createCycleRuntime();
    const visit = context.createVisitRecord({
        facilityLicense: "100",
        visitCycleId: "cycle-2",
        visitCycleNumber: 2,
        result: "no_violation"
    });

    assert.equal(visit.visitCycleId, "cycle-2");
    assert.equal(visit.visitCycleNumber, 2);
    assert.match(
        sidebar,
        /getCommitteeAssignedDisplayStatus[\s\S]*assignment\.status === "completed"[\s\S]*assignment\.status === "in_progress"/
    );
    assert.doesNotMatch(
        sidebar,
        /function getCommitteeAssignedDisplayStatus[\s\S]{0,300}state\.visitStatus/
    );

});


test("the Admin cycle controls explain that historical records are preserved", () => {

    assert.match(html, /id="periodicVisitCyclePanel"/);
    assert.match(html, /id="periodicVisitIntervalDays"[\s\S]*value="75"/);
    assert.match(html, /id="startPeriodicVisitCycle"/);
    assert.match(html, /دون تعديل الزيارات السابقة/);

});


test("the committee complaint visit form exposes no periodic choice", () => {

    assert.match(
        sidebar,
        /canStartComplaintVisit[\s\S]*تسجيل زيارة تفاعلية بسبب شكوى/
    );
    assert.match(
        sidebar,
        /id="committeeComplaintReason"[\s\S]*<option value="شكوى" selected>شكوى<\/option>/
    );
    assert.match(
        sidebar,
        /createCommitteeComplaintAssignment\(facility\.license\)/
    );
    assert.doesNotMatch(
        sidebar,
        /id="committeeComplaintReason"[\s\S]{0,300}value="periodic"/
    );

});
