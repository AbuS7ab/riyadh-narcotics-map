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


function createCommittee(username = "committee4") {

    return {
        username,
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
        assignedAt: "2026-07-20T00:00:00.000Z",
        status: "assigned",
        visitType: "periodic",
        visitReason: "الخطة الدورية",
        ...overrides
    };

}


async function createUsersRuntime({
    currentUser = "committee4",
    assignments = {}
} = {}) {

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
        localStorage: { currentUser }
    });

    runtime.loadScript("users");
    await runtime.context.initializeUserState();

    return runtime;

}


test("visit completion updates only its assignment on a fresh remote copy", async () => {

    const runtime = await createUsersRuntime({
        assignments: { "100": createAssignment("100") }
    });
    const { context, supabase } = runtime;

    supabase.replaceRow("facilityAssignments", {
        key: "facilityAssignments",
        value: {
            ...supabase.rows.get("facilityAssignments").value,
            "200": createAssignment("200", {
                committeeUsername: "anotherCommittee"
            })
        },
        updated_at: "2026-07-20T05:00:00.000Z"
    });

    await context.updateAssignmentFromVisit(
        "100",
        "no_violation",
        "visit-100",
        "assignment-100"
    );

    const savedAssignments = supabase.rows.get("facilityAssignments").value;

    assert.equal(savedAssignments["100"].status, "completed");
    assert.equal(savedAssignments["200"].status, "assigned");

});


test("a replacement assignment cannot be closed by an older visit", async () => {

    const { context, supabase } = await createUsersRuntime({
        assignments: { "100": createAssignment("100") }
    });

    supabase.replaceRow("facilityAssignments", {
        key: "facilityAssignments",
        value: {
            "100": createAssignment("100", {
                id: "replacement-assignment-100"
            })
        },
        updated_at: "2026-07-20T06:00:00.000Z"
    });

    await assert.rejects(
        context.updateAssignmentFromVisit(
            "100",
            "no_violation",
            "visit-100",
            "assignment-100"
        ),
        /active assignment changed/
    );
    assert.equal(
        supabase.rows.get("facilityAssignments").value["100"].status,
        "assigned"
    );

});


test("an incomplete visit moves its assignment to in_progress", async () => {

    const { context, supabase } = await createUsersRuntime({
        assignments: { "100": createAssignment("100") }
    });

    await context.updateAssignmentFromVisit(
        "100",
        "incomplete",
        "visit-100",
        "assignment-100"
    );

    assert.equal(
        supabase.rows.get("facilityAssignments").value["100"].status,
        "in_progress"
    );

});


test("a cancelled assignment is never reopened by a visit", async () => {

    const { context, supabase } = await createUsersRuntime({
        assignments: {
            "100": createAssignment("100", { status: "cancelled" })
        }
    });
    const writesBefore = supabase.writeCount("facilityAssignments");

    const result = await context.updateAssignmentFromVisit(
        "100",
        "no_violation",
        "visit-100",
        "assignment-100"
    );

    assert.equal(result, undefined);
    assert.equal(
        supabase.rows.get("facilityAssignments").value["100"].status,
        "cancelled"
    );
    assert.equal(supabase.writeCount("facilityAssignments"), writesBefore);

});


test("bulk assignment retries once without inflating its result count", async () => {

    const { context, supabase } = await createUsersRuntime({
        currentUser: "admin",
        assignments: { "900": createAssignment("900") }
    });

    supabase.conflictNext("facilityAssignments", {
        key: "facilityAssignments",
        value: {
            "900": createAssignment("900"),
            "999": createAssignment("999", {
                committeeUsername: "anotherCommittee"
            })
        },
        updated_at: "2026-07-20T07:00:00.000Z"
    });

    const assignedCount = await context.assignFacilitiesToCommittee(
        ["100", "101"],
        "committee4"
    );
    const savedAssignments = supabase.rows.get("facilityAssignments").value;

    assert.equal(assignedCount, 2);
    assert.deepEqual(
        Object.keys(savedAssignments).sort(),
        ["100", "101", "900", "999"]
    );
    assert.equal(savedAssignments["999"].committeeUsername, "anotherCommittee");

});


test("bulk cancellation retries without double-counting and preserves remote rows", async () => {

    const assignments = {
        "100": createAssignment("100"),
        "101": createAssignment("101")
    };
    const { context, supabase } = await createUsersRuntime({
        currentUser: "admin",
        assignments
    });

    supabase.conflictNext("facilityAssignments", {
        key: "facilityAssignments",
        value: {
            ...assignments,
            "999": createAssignment("999", {
                committeeUsername: "anotherCommittee"
            })
        },
        updated_at: "2026-07-20T08:00:00.000Z"
    });

    const cancelledCount = await context.cancelAssignmentsForCommittee(
        "committee4",
        ["100", "101"]
    );
    const savedAssignments = supabase.rows.get("facilityAssignments").value;

    assert.equal(cancelledCount, 2);
    assert.equal(savedAssignments["100"].status, "cancelled");
    assert.equal(savedAssignments["101"].status, "cancelled");
    assert.equal(savedAssignments["999"].status, "assigned");

});
