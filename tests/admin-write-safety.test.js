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


async function createAdminRuntime(overrides = {}) {

    const rows = createInitialRows({
        users: { value: { admin: createAdmin() } },
        ...overrides
    });
    const runtime = await createCloudRuntime(rows, {
        localStorage: { currentUser: "admin" }
    });

    runtime.loadScript("users");
    await runtime.context.initializeUserState();
    runtime.context.allFacilities = [];

    return runtime;

}


test("employee persistence commits after success and preserves a remote employee", async () => {

    const runtime = await createAdminRuntime({
        employees: {
            value: { employee1: { id: "employee1", fullName: "قبل" } }
        }
    });
    const { context, supabase } = runtime;

    runtime.loadScript("employees");
    await context.initializeEmployeesState();

    supabase.replaceRow("employees", {
        key: "employees",
        value: {
            employee1: { id: "employee1", fullName: "قبل" },
            employee2: { id: "employee2", fullName: "موظف متزامن" }
        },
        updated_at: "2026-07-20T09:00:00.000Z"
    });

    await context.persistEmployees({
        employee1: { id: "employee1", fullName: "بعد" }
    });

    assert.equal(context.getEmployeeById("employee1").fullName, "بعد");
    assert.equal(context.getEmployeeById("employee2").fullName, "موظف متزامن");

});


test("failed employee persistence leaves the in-memory employee unchanged", async () => {

    const runtime = await createAdminRuntime({
        employees: {
            value: { employee1: { id: "employee1", fullName: "قبل" } }
        }
    });
    const { context, supabase } = runtime;

    runtime.loadScript("employees");
    await context.initializeEmployeesState();
    supabase.failNextWrite("employees");

    await assert.rejects(
        context.persistEmployees({
            employee1: { id: "employee1", fullName: "بعد" }
        }),
        /simulated cloud failure/
    );

    assert.equal(context.getEmployeeById("employee1").fullName, "قبل");

});


test("user persistence rejects a concurrent edit and keeps the displayed user unchanged", async () => {

    const committee = {
        username: "committee4",
        password: "test",
        displayName: "قبل",
        committeeName: "لجنة 4",
        role: "committee",
        active: true,
        team: { leader: "", members: [] }
    };
    const { context, supabase } = await createAdminRuntime({
        users: { value: { admin: createAdmin(), committee4: committee } }
    });

    supabase.replaceRow("users", {
        key: "users",
        value: {
            admin: createAdmin(),
            committee4: { ...committee, displayName: "تعديل متزامن" }
        },
        updated_at: "2026-07-20T09:10:00.000Z"
    });

    await assert.rejects(
        context.persistUsers({
            admin: createAdmin(),
            committee4: { ...committee, displayName: "تعديل المدير" }
        }),
        error => error && error.code === "CLOUD_RECORD_CONFLICT"
    );

    assert.equal(
        context.getUsers().find(user => user.username === "committee4").displayName,
        "قبل"
    );

});


test("external visit persistence rejects a same-record conflict without changing local state", async () => {

    const mission = {
        externalVisitId: "mission-1",
        missionNumber: "MT-2026-000001",
        missionType: "بلاغ",
        missionStatus: "جديدة",
        visitDate: "2026-07-20"
    };
    const runtime = await createAdminRuntime({
        externalVisits: { value: { "mission-1": mission } }
    });
    const { context, supabase } = runtime;

    runtime.loadScript("external-visits");
    await context.initializeExternalVisitsState();

    supabase.replaceRow("externalVisits", {
        key: "externalVisits",
        value: {
            "mission-1": { ...mission, missionStatus: "قيد التنفيذ" }
        },
        updated_at: "2026-07-20T09:20:00.000Z"
    });

    await assert.rejects(
        context.persistExternalVisits({
            "mission-1": { ...mission, missionStatus: "مكتملة" }
        }),
        error => error && error.code === "CLOUD_RECORD_CONFLICT"
    );

    assert.equal(context.getExternalVisitList()[0].missionStatus, "جديدة");

});


test("data import compensates an earlier write when a later collection fails", async () => {

    const assignment = {
        id: "assignment-1",
        facilityLicense: "100",
        committeeUsername: "committee4",
        committeeName: "لجنة 4",
        status: "assigned",
        assignedAt: "2026-07-20T08:00:00.000Z",
        assignmentSource: "manual",
        assignedBy: "admin"
    };
    const runtime = await createAdminRuntime({
        facilityAssignments: { value: { 100: assignment } },
        facilityStatus: {
            value: {
                100: {
                    visitStatus: "pending",
                    violation: false,
                    visits: []
                }
            }
        }
    });
    const { context, supabase } = runtime;

    runtime.loadScript("status");
    await context.initializeFacilityStatusState();
    supabase.failNextWrite("facilityAssignments");

    await context.importAppData({
        text: async () => JSON.stringify({
            users: {
                admin: { ...createAdmin(), displayName: "مدير مستورد" }
            },
            facilityAssignments: {
                100: { ...assignment, status: "completed" }
            },
            facilityStatus: {
                100: {
                    visitStatus: "visited",
                    violation: false,
                    visits: [{ id: "visit-imported", visitStatus: "visited" }]
                }
            }
        })
    });

    assert.equal(supabase.rows.get("users").value.admin.displayName, "مدير النظام");
    assert.equal(supabase.rows.get("facilityAssignments").value[100].status, "assigned");
    assert.equal(supabase.rows.get("facilityStatus").value[100].visitStatus, "pending");
    assert.equal(supabase.writeCount("users"), 2);
    assert.equal(supabase.writeCount("facilityAssignments"), 1);

});
