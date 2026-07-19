const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const cloudSource = fs.readFileSync(
    require("node:path").join(__dirname, "..", "js", "cloud.js"),
    "utf8"
);
const statusSource = fs.readFileSync(
    require("node:path").join(__dirname, "..", "js", "status.js"),
    "utf8"
);
const usersSource = fs.readFileSync(
    require("node:path").join(__dirname, "..", "js", "users.js"),
    "utf8"
);


function createLocalStorage() {

    const values = new Map();

    return {
        getItem: key => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key)
    };

}


function createSupabaseMock(initialRows = {}) {

    const rows = new Map(Object.entries(initialRows).map(([key, row]) => [
        key,
        JSON.parse(JSON.stringify(row))
    ]));
    const failures = new Map();

    class Query {

        constructor() {

            this.action = "select";
            this.payload = null;
            this.filters = [];

        }

        select() {

            return this;

        }

        insert(payload) {

            this.action = "insert";
            this.payload = payload;

            return this;

        }

        update(payload) {

            this.action = "update";
            this.payload = payload;

            return this;

        }

        eq(column, value) {

            this.filters.push([column, value]);

            return this;

        }

        async maybeSingle() {

            const keyFilter = this.filters.find(([column]) => column === "key");
            const key = keyFilter ? keyFilter[1] : this.payload && this.payload.key;
            const current = rows.get(String(key));
            const failure = failures.get(String(key));

            if (failure) {

                failures.delete(String(key));

                return { data: null, error: failure };

            }

            if (this.action === "insert") {

                if (current) {

                    return { data: null, error: new Error("duplicate key") };

                }

                rows.set(String(key), JSON.parse(JSON.stringify(this.payload)));

                return {
                    data: { updated_at: this.payload.updated_at },
                    error: null
                };

            }

            if (this.action === "update") {

                const matches = current && this.filters.every(([column, value]) => {

                    return current[column] === value;

                });

                if (!matches) return { data: null, error: null };

                const next = { ...current, ...JSON.parse(JSON.stringify(this.payload)) };

                rows.set(String(key), next);

                return { data: { updated_at: next.updated_at }, error: null };

            }

            if (!current) return { data: null, error: null };

            return { data: JSON.parse(JSON.stringify(current)), error: null };

        }

    }

    return {
        client: {
            from: () => new Query()
        },
        rows,
        replaceRow(key, row) {

            rows.set(key, JSON.parse(JSON.stringify(row)));

        },
        failNext(key, error = new Error("simulated cloud failure")) {

            failures.set(String(key), error);

        }
    };

}


async function createCloudRuntime(initialRows = {}) {

    const supabase = createSupabaseMock(initialRows);
    const storage = createLocalStorage();
    const window = {
        CONFIG: {
            supabase: {
                url: "https://example.supabase.co",
                anonKey: "test-key"
            }
        },
        supabase: {
            createClient: () => supabase.client
        }
    };
    const context = vm.createContext({
        window,
        localStorage: storage,
        console: {
            log() {},
            info() {},
            warn() {},
            error() {}
        },
        structuredClone,
        setTimeout,
        clearTimeout
    });

    vm.runInContext(cloudSource, context, { filename: "cloud.js" });
    await window.cloudDebug.initialize();

    return { context, debug: window.cloudDebug, storage, supabase };

}


function createInitialRows() {

    const keys = [
        "users",
        "facilityAssignments",
        "facilityStatus",
        "appSettings",
        "customFacilities",
        "facilityOverrides",
        "externalVisits",
        "employees"
    ];

    return Object.fromEntries(keys.map((key, index) => [key, {
        key,
        value: {},
        updated_at: `2026-07-20T00:00:0${index}.000Z`
    }]));

}


test("successful writes use the loaded revision and advance it", async () => {

    const { debug, supabase } = await createCloudRuntime(createInitialRows());
    const previousVersion = debug.versions.facilityStatus;

    await debug.writeObject("facilityStatus", { "100": { visitStatus: "visited" } });

    assert.notEqual(debug.versions.facilityStatus, previousVersion);
    assert.equal(
        supabase.rows.get("facilityStatus").value["100"].visitStatus,
        "visited"
    );
    assert.equal(debug.pendingWrites, 0);

});


test("a stale client is rejected instead of overwriting a newer row", async () => {

    const initialRows = createInitialRows();
    const { debug, supabase } = await createCloudRuntime(initialRows);

    supabase.replaceRow("facilityStatus", {
        key: "facilityStatus",
        value: { otherCommittee: { visitStatus: "visited" } },
        updated_at: "2026-07-20T01:00:00.000Z"
    });

    await assert.rejects(
        debug.writeObject("facilityStatus", { myCommittee: { visitStatus: "visited" } }),
        error => error && error.code === "CLOUD_CONFLICT"
    );
    assert.deepEqual(
        supabase.rows.get("facilityStatus").value,
        { otherCommittee: { visitStatus: "visited" } }
    );
    assert.equal(debug.pendingWrites, 0);

});


test("writes to the same key are serialized", async () => {

    const { debug, supabase } = await createCloudRuntime(createInitialRows());

    const first = debug.writeObject("employees", { first: { id: "first" } });
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

});


test("loaded values are cloned and cannot mutate the cloud cache by reference", async () => {

    const rows = createInitialRows();

    rows.users.value = { admin: { role: "admin" } };

    const { debug } = await createCloudRuntime(rows);
    const loaded = debug.loadUsers();

    loaded.admin.role = "viewer";

    assert.equal(debug.loadUsers().admin.role, "admin");

});


test("semantic mutations retry and preserve another committee update", async () => {

    const rows = createInitialRows();
    const { debug, supabase } = await createCloudRuntime(rows);

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
    assert.equal(
        supabase.rows.get("facilityStatus").value.committeeA.visitStatus,
        "visited"
    );
    assert.equal(
        supabase.rows.get("facilityStatus").value.committeeB.visitStatus,
        "visited"
    );

});


test("concurrent semantic mutations preserve both local operations", async () => {

    const { debug, supabase } = await createCloudRuntime(createInitialRows());

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


test("refresh detects a remote revision and updates the local cache", async () => {

    const { debug, supabase } = await createCloudRuntime(createInitialRows());

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

    const { debug, supabase } = await createCloudRuntime(createInitialRows());
    const previousExternalVersion = debug.versions.externalVisits;

    supabase.replaceRow("externalVisits", {
        key: "externalVisits",
        value: { mission1: { missionStatus: "مكتملة" } },
        updated_at: "2026-07-20T04:00:00.000Z"
    });
    supabase.failNext("employees");

    await assert.rejects(debug.refresh(), /simulated cloud failure/);

    assert.deepEqual(debug.loadExternalVisits(), {});
    assert.equal(debug.versions.externalVisits, previousExternalVersion);

});


test("concurrent completed visits for one facility are both retained", async () => {

    const { context, supabase } = await createCloudRuntime(createInitialRows());

    vm.runInContext(statusSource, context, { filename: "status.js" });
    await context.initializeFacilityStatusState();

    await Promise.all([
        context.addVisit("100", {
            id: "visit-a",
            facilityLicense: "100",
            visitStatus: "visited",
            result: "no_violation",
            committeeUsername: "committeeA"
        }),
        context.addVisit("100", {
            id: "visit-b",
            facilityLicense: "100",
            visitStatus: "visited",
            result: "violation",
            violation: true,
            committeeUsername: "committeeB"
        })
    ]);

    const visits = supabase.rows.get("facilityStatus").value["100"].visits;

    assert.deepEqual(
        visits.map(visit => visit.id).sort(),
        ["visit-a", "visit-b"]
    );

});


test("visit completion updates only its assignment on a fresh remote copy", async () => {

    const rows = createInitialRows();

    rows.users.value = {
        committee4: {
            username: "committee4",
            password: "test",
            displayName: "لجنة 4",
            committeeName: "لجنة 4",
            role: "committee",
            active: true,
            team: { leader: "", members: [] }
        }
    };
    rows.facilityAssignments.value = {
        "100": {
            id: "assignment-100",
            facilityLicense: "100",
            committeeUsername: "committee4",
            assignedAt: "2026-07-20T00:00:00.000Z",
            status: "assigned",
            visitType: "periodic",
            visitReason: "الخطة الدورية"
        }
    };

    const { context, storage, supabase } = await createCloudRuntime(rows);

    storage.setItem("currentUser", "committee4");
    vm.runInContext(usersSource, context, { filename: "users.js" });
    await context.initializeUserState();

    supabase.replaceRow("facilityAssignments", {
        key: "facilityAssignments",
        value: {
            ...supabase.rows.get("facilityAssignments").value,
            "200": {
                id: "assignment-200",
                facilityLicense: "200",
                committeeUsername: "anotherCommittee",
                assignedAt: "2026-07-20T00:01:00.000Z",
                status: "assigned"
            }
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

    supabase.replaceRow("facilityAssignments", {
        key: "facilityAssignments",
        value: {
            ...savedAssignments,
            "100": {
                ...savedAssignments["100"],
                id: "replacement-assignment-100",
                status: "assigned"
            }
        },
        updated_at: "2026-07-20T06:00:00.000Z"
    });

    await assert.rejects(
        context.updateAssignmentFromVisit(
            "100",
            "incomplete",
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
