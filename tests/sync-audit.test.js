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


function createAssignment(overrides = {}) {

    return {
        id: "assignment-100",
        facilityLicense: "100",
        committeeUsername: "committee4",
        status: "assigned",
        assignedAt: "2026-07-20T08:00:00.000Z",
        visitType: "periodic",
        visitReason: "الخطة الدورية",
        ...overrides
    };

}


function createVisit(overrides = {}) {

    return {
        id: "visit-100",
        assignmentId: "assignment-100",
        facilityLicense: "100",
        committeeUsername: "committee4",
        visitStatus: "visited",
        result: "no_violation",
        employeeSnapshot: {
            leaderId: "employee-1",
            memberIds: [],
            employeeIds: ["employee-1"]
        },
        ...overrides
    };

}


function createAuditData(overrides = {}) {

    return {
        facilityStatus: {
            100: {
                visitStatus: "visited",
                visits: [createVisit()]
            }
        },
        facilityAssignments: { 100: createAssignment() },
        employees: {
            "employee-1": { id: "employee-1", fullName: "موظف" }
        },
        users: {
            admin: createAdmin(),
            committee4: createCommittee()
        },
        ...overrides
    };

}


async function createAuditRuntime() {

    const data = createAuditData();
    const rows = createInitialRows({
        users: { value: data.users },
        facilityAssignments: { value: data.facilityAssignments },
        facilityStatus: { value: data.facilityStatus },
        employees: { value: data.employees }
    });
    const runtime = await createCloudRuntime(rows, {
        localStorage: { currentUser: "admin" }
    });

    runtime.loadScript("users");
    await runtime.context.initializeUserState();
    runtime.loadScript("employees");
    await runtime.context.initializeEmployeesState();
    runtime.loadScript("status");
    await runtime.context.initializeFacilityStatusState();
    runtime.loadScript("sync-audit");

    return runtime;

}


test("integrity audit is read-only and identifies a safely repairable open assignment", async () => {

    const runtime = await createCloudRuntime();

    runtime.loadScript("sync-audit");

    const data = createAuditData();
    const before = structuredClone(data);
    const report = runtime.context.auditSyncIntegrity(data);
    const issue = report.issues.find(item => {

        return item.type === "completed_visit_open_assignment";

    });

    assert.deepEqual(data, before);
    assert.ok(issue);
    assert.equal(issue.severity, "error");
    assert.equal(issue.repair.type, "complete_assignment");
    assert.equal(report.summary.repairable, 1);

});


test("audit reports mismatches, duplicates, missing ids, and unknown participants without repairs", async () => {

    const runtime = await createCloudRuntime();

    runtime.loadScript("sync-audit");

    const data = createAuditData({
        facilityStatus: {
            100: {
                visits: [
                    createVisit({
                        id: "duplicate-visit",
                        facilityLicense: "999",
                        committeeUsername: "otherCommittee",
                        employeeSnapshot: {
                            leaderId: "deleted-employee",
                            memberIds: [],
                            employeeIds: ["deleted-employee"]
                        }
                    }),
                    createVisit({ id: "duplicate-visit" }),
                    createVisit({ id: "", assignmentId: "" })
                ]
            }
        }
    });
    const report = runtime.context.auditSyncIntegrity(data);
    const types = new Set(report.issues.map(issue => issue.type));

    assert.equal(types.has("duplicate_visit_id"), true);
    assert.equal(types.has("visit_missing_id"), true);
    assert.equal(types.has("visit_facility_mismatch"), true);
    assert.equal(types.has("visit_assignment_mismatch"), true);
    assert.equal(types.has("visit_unknown_participants"), true);
    assert.equal(
        report.issues.filter(issue => issue.type !== "completed_visit_open_assignment")
            .every(issue => issue.repair === null),
        true
    );

});


test("audit distinguishes a completed assignment without a visit from historical participant gaps", async () => {

    const runtime = await createCloudRuntime();

    runtime.loadScript("sync-audit");

    const data = createAuditData({
        facilityStatus: {
            100: {
                visitStatus: "partial",
                visits: [createVisit({
                    id: "partial-visit",
                    assignmentId: "",
                    visitStatus: "partial",
                    result: "incomplete",
                    employeeSnapshot: null,
                    teamSnapshot: {}
                })]
            }
        },
        facilityAssignments: {
            100: createAssignment({ status: "completed" })
        }
    });
    const report = runtime.context.auditSyncIntegrity(data);
    const types = new Set(report.issues.map(issue => issue.type));

    assert.equal(types.has("completed_assignment_without_visit"), true);
    assert.equal(types.has("visit_missing_participants"), true);
    assert.equal(report.summary.repairable, 0);

});


test("a verified recovery completes only the matching assignment and leaves visits unchanged", async () => {

    const { context, supabase } = await createAuditRuntime();
    const report = context.auditSyncIntegrity(createAuditData());
    const issue = report.issues.find(item => {

        return item.type === "completed_visit_open_assignment";

    });
    const statusBefore = structuredClone(supabase.rows.get("facilityStatus").value);

    const repaired = await context.repairSyncAuditIssue(issue.id);

    assert.equal(repaired.status, "completed");
    assert.equal(supabase.rows.get("facilityAssignments").value[100].status, "completed");
    assert.deepEqual(supabase.rows.get("facilityStatus").value, statusBefore);
    assert.equal(supabase.writeCount("facilityAssignments"), 1);
    assert.equal(supabase.writeCount("facilityStatus"), 0);

});


test("recovery stops when the assignment changed after the audit", async () => {

    const { context, supabase } = await createAuditRuntime();
    const report = context.auditSyncIntegrity(createAuditData());
    const issue = report.issues.find(item => {

        return item.type === "completed_visit_open_assignment";

    });

    supabase.replaceRow("facilityAssignments", {
        key: "facilityAssignments",
        value: {
            100: createAssignment({ id: "replacement-assignment", status: "assigned" })
        },
        updated_at: "2026-07-20T12:00:00.000Z"
    });

    await assert.rejects(
        context.repairSyncAuditIssue(issue.id),
        /no longer safely repairable/
    );
    assert.equal(
        supabase.rows.get("facilityAssignments").value[100].id,
        "replacement-assignment"
    );
    assert.equal(supabase.writeCount("facilityAssignments"), 0);

});
