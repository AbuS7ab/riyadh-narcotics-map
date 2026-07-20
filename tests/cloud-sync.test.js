const test = require("node:test");
const assert = require("node:assert/strict");

const {
    createCloudRuntime,
    createInitialRows
} = require("./helpers/runtime");


test("successful writes use the loaded revision and advance it", async () => {

    const { debug, supabase } = await createCloudRuntime();
    const previousVersion = debug.versions.facilityStatus;

    await debug.writeObject("facilityStatus", {
        "100": { visitStatus: "visited" }
    });

    assert.notEqual(debug.versions.facilityStatus, previousVersion);
    assert.equal(
        supabase.rows.get("facilityStatus").value["100"].visitStatus,
        "visited"
    );
    assert.equal(debug.pendingWrites, 0);

});


test("a stale client is rejected instead of overwriting a newer row", async () => {

    const { debug, supabase } = await createCloudRuntime();

    supabase.replaceRow("facilityStatus", {
        key: "facilityStatus",
        value: { otherCommittee: { visitStatus: "visited" } },
        updated_at: "2026-07-20T01:00:00.000Z"
    });

    await assert.rejects(
        debug.writeObject("facilityStatus", {
            myCommittee: { visitStatus: "visited" }
        }),
        error => error && error.code === "CLOUD_CONFLICT"
    );
    assert.deepEqual(
        supabase.rows.get("facilityStatus").value,
        { otherCommittee: { visitStatus: "visited" } }
    );
    assert.equal(debug.pendingWrites, 0);

});


test("writes to the same key are serialized and the queue is released", async () => {

    const { debug, supabase } = await createCloudRuntime();

    const first = debug.writeObject("employees", {
        first: { id: "first" }
    });
    const second = debug.writeObject("employees", {
        first: { id: "first" },
        second: { id: "second" }
    });

    await Promise.all([first, second]);

    assert.deepEqual(
        Object.keys(supabase.rows.get("employees").value),
        ["first", "second"]
    );
    assert.equal(debug.pendingWrites, 0);
    assert.equal(supabase.writeCount("employees"), 2);

});


test("loaded values cannot mutate the cloud cache by reference", async () => {

    const rows = createInitialRows({
        users: { value: { admin: { role: "admin" } } }
    });
    const { debug } = await createCloudRuntime(rows);
    const loaded = debug.loadUsers();

    loaded.admin.role = "viewer";

    assert.equal(debug.loadUsers().admin.role, "admin");

});


test("semantic mutations retry and preserve a remote committee update", async () => {

    const { debug, supabase } = await createCloudRuntime();
    const result = await debug.mutateObject(
        "facilityStatus",
        (current, attempt) => {

            if (attempt === 1) {

                supabase.replaceRow("facilityStatus", {
                    key: "facilityStatus",
                    value: {
                        committeeA: { visitStatus: "visited" }
                    },
                    updated_at: "2026-07-20T02:00:00.000Z"
                });

            }

            current.committeeB = { visitStatus: "visited" };

            return current;

        }
    );

    assert.equal(result.committeeA.visitStatus, "visited");
    assert.equal(result.committeeB.visitStatus, "visited");
    assert.deepEqual(
        Object.keys(supabase.rows.get("facilityStatus").value).sort(),
        ["committeeA", "committeeB"]
    );

});


test("concurrent semantic mutations preserve both local operations", async () => {

    const { debug, supabase } = await createCloudRuntime();
    const first = debug.mutateObject("facilityAssignments", current => {

        current.first = { status: "completed" };

        return current;

    });
    const second = debug.mutateObject("facilityAssignments", current => {

        current.second = { status: "completed" };

        return current;

    });

    await Promise.all([first, second]);

    assert.deepEqual(
        Object.keys(supabase.rows.get("facilityAssignments").value).sort(),
        ["first", "second"]
    );

});


test("collection mutation changes one record and preserves unrelated remote records", async () => {

    const rows = createInitialRows({
        employees: {
            value: { employee1: { id: "employee1", fullName: "قبل" } }
        }
    });
    const { debug, supabase } = await createCloudRuntime(rows);
    const previous = debug.loadEmployees();

    supabase.replaceRow("employees", {
        key: "employees",
        value: {
            ...previous,
            employee2: { id: "employee2", fullName: "موظف آخر" }
        },
        updated_at: "2026-07-20T02:15:00.000Z"
    });

    const saved = await debug.mutateCollection("employees", previous, {
        employee1: { id: "employee1", fullName: "بعد" }
    });

    assert.equal(saved.employee1.fullName, "بعد");
    assert.equal(saved.employee2.fullName, "موظف آخر");
    assert.deepEqual(
        Object.keys(supabase.rows.get("employees").value).sort(),
        ["employee1", "employee2"]
    );

});


test("collection mutation rejects a concurrent edit to the same record", async () => {

    const rows = createInitialRows({
        users: {
            value: { committee4: { username: "committee4", displayName: "قبل" } }
        }
    });
    const { debug, supabase } = await createCloudRuntime(rows);
    const previous = debug.loadUsers();

    supabase.replaceRow("users", {
        key: "users",
        value: {
            committee4: { username: "committee4", displayName: "تعديل متزامن" }
        },
        updated_at: "2026-07-20T02:20:00.000Z"
    });

    await assert.rejects(
        debug.mutateCollection("users", previous, {
            committee4: { username: "committee4", displayName: "تعديل المدير" }
        }),
        error => error &&
            error.code === "CLOUD_RECORD_CONFLICT" &&
            error.recordKey === "committee4"
    );
    assert.equal(
        supabase.rows.get("users").value.committee4.displayName,
        "تعديل متزامن"
    );

});


test("multi-collection failure rolls back only touched records", async () => {

    const rows = createInitialRows({
        users: {
            value: { admin: { username: "admin", displayName: "قبل" } }
        },
        employees: {
            value: { employee1: { id: "employee1", fullName: "موظف" } }
        }
    });
    const { debug, supabase } = await createCloudRuntime(rows);
    const previousUsers = debug.loadUsers();
    const previousEmployees = debug.loadEmployees();

    supabase.replaceRow("users", {
        key: "users",
        value: {
            ...previousUsers,
            committee9: { username: "committee9", displayName: "لجنة متزامنة" }
        },
        updated_at: "2026-07-20T02:25:00.000Z"
    });
    supabase.failNextWrite("employees");

    await assert.rejects(
        debug.mutateCollectionsWithRollback([
            {
                key: "users",
                previousValue: previousUsers,
                nextValue: {
                    admin: { username: "admin", displayName: "بعد" }
                }
            },
            {
                key: "employees",
                previousValue: previousEmployees,
                nextValue: {
                    employee1: { id: "employee1", fullName: "تعديل" }
                }
            }
        ]),
        /simulated cloud failure/
    );

    const savedUsers = supabase.rows.get("users").value;

    assert.equal(savedUsers.admin.displayName, "قبل");
    assert.equal(savedUsers.committee9.displayName, "لجنة متزامنة");
    assert.equal(
        supabase.rows.get("employees").value.employee1.fullName,
        "موظف"
    );
    assert.equal(supabase.writeCount("users"), 2);

});


test("an insert race retries against the row created by another client", async () => {

    const rows = createInitialRows();

    delete rows.facilityStatus;

    const { debug, supabase } = await createCloudRuntime(rows);

    supabase.conflictNext("facilityStatus", {
        key: "facilityStatus",
        value: { remote: { visitStatus: "visited" } },
        updated_at: "2026-07-20T02:30:00.000Z"
    });

    const result = await debug.mutateObject("facilityStatus", current => {

        current.local = { visitStatus: "visited" };

        return current;

    });

    assert.deepEqual(Object.keys(result).sort(), ["local", "remote"]);
    assert.deepEqual(
        Object.keys(supabase.rows.get("facilityStatus").value).sort(),
        ["local", "remote"]
    );

});


test("refresh detects a remote revision and updates the local cache", async () => {

    const { debug, supabase } = await createCloudRuntime();

    supabase.replaceRow("externalVisits", {
        key: "externalVisits",
        value: { mission1: { missionStatus: "مكتملة" } },
        updated_at: "2026-07-20T03:00:00.000Z"
    });

    const changedKeys = await debug.refresh();

    assert.equal(Array.from(changedKeys).join(","), "externalVisits");
    assert.equal(
        debug.loadExternalVisits().mission1.missionStatus,
        "مكتملة"
    );

});


test("a failed refresh restores the previous cache atomically", async () => {

    const { debug, supabase } = await createCloudRuntime();
    const previousExternalVersion = debug.versions.externalVisits;

    supabase.replaceRow("externalVisits", {
        key: "externalVisits",
        value: { mission1: { missionStatus: "مكتملة" } },
        updated_at: "2026-07-20T04:00:00.000Z"
    });
    supabase.failNext("employees");

    await assert.rejects(debug.refresh(), /simulated cloud failure/);

    assert.equal(Object.keys(debug.loadExternalVisits()).length, 0);
    assert.equal(debug.versions.externalVisits, previousExternalVersion);

});


test("a required cloud failure leaves cache and local backup unchanged", async () => {

    const rows = createInitialRows({
        employees: { value: { existing: { id: "existing" } } }
    });
    const { debug, storage, supabase } = await createCloudRuntime(rows);
    const localBefore = storage.getItem("employees");

    supabase.failNext("employees");

    await assert.rejects(
        debug.writeObject("employees", { replacement: { id: "replacement" } }),
        /simulated cloud failure/
    );

    assert.deepEqual(Object.keys(debug.loadEmployees()), ["existing"]);
    assert.equal(storage.getItem("employees"), localBefore);
    assert.deepEqual(
        Object.keys(supabase.rows.get("employees").value),
        ["existing"]
    );

});
