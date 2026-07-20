const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.join(__dirname, "..", "..");


function clone(value) {

    return JSON.parse(JSON.stringify(value));

}


function createLocalStorage(initialValues = {}) {

    const values = new Map(Object.entries(initialValues).map(([key, value]) => [
        key,
        String(value)
    ]));

    return {
        getItem: key => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key),
        snapshot: () => Object.fromEntries(values)
    };

}


function createDocumentMock() {

    const listeners = new Map();

    return {
        visibilityState: "visible",
        getElementById: () => null,
        addEventListener(type, listener) {

            const typeListeners = listeners.get(type) || [];

            typeListeners.push(listener);
            listeners.set(type, typeListeners);

        },
        dispatchEvent(event) {

            (listeners.get(event.type) || []).forEach(listener => listener(event));

            return true;

        }
    };

}


function createSupabaseMock(initialRows = {}) {

    const rows = new Map(Object.entries(initialRows).map(([key, row]) => [
        String(key),
        clone(row)
    ]));
    const failures = new Map();
    const conflicts = new Map();
    const operations = [];

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
            const key = String(keyFilter ? keyFilter[1] : this.payload && this.payload.key);
            const failure = failures.get(key);

            operations.push({
                action: this.action,
                key,
                payload: this.payload ? clone(this.payload) : null,
                filters: clone(this.filters)
            });

            if (failure &&
                (failure.action === "any" || failure.action === this.action)) {

                failures.delete(key);

                return { data: null, error: failure.error };

            }

            if (conflicts.has(key) && ["insert", "update"].includes(this.action)) {

                rows.set(key, clone(conflicts.get(key)));
                conflicts.delete(key);

            }

            const current = rows.get(key);

            if (this.action === "insert") {

                if (current) {

                    const error = new Error("duplicate key");

                    error.code = "23505";

                    return { data: null, error };

                }

                rows.set(key, clone(this.payload));

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

                const next = { ...current, ...clone(this.payload) };

                rows.set(key, next);

                return { data: { updated_at: next.updated_at }, error: null };

            }

            if (!current) return { data: null, error: null };

            return { data: clone(current), error: null };

        }

    }

    return {
        client: {
            from: () => new Query()
        },
        rows,
        operations,
        replaceRow(key, row) {

            rows.set(String(key), clone(row));

        },
        removeRow(key) {

            rows.delete(String(key));

        },
        failNext(key, error = new Error("simulated cloud failure")) {

            failures.set(String(key), { action: "any", error });

        },
        failNextWrite(key, error = new Error("simulated cloud failure")) {

            failures.set(String(key), { action: "update", error });

        },
        conflictNext(key, row) {

            conflicts.set(String(key), clone(row));

        },
        writeCount(key) {

            return operations.filter(operation => {

                return operation.key === String(key) &&
                    ["insert", "update"].includes(operation.action);

            }).length;

        }
    };

}


function createInitialRows(overrides = {}) {

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
    const rows = Object.fromEntries(keys.map((key, index) => [key, {
        key,
        value: {},
        updated_at: `2026-07-20T00:00:0${index}.000Z`
    }]));

    Object.entries(overrides).forEach(([key, value]) => {

        rows[key] = {
            ...rows[key],
            key,
            ...clone(value)
        };

    });

    return rows;

}


function loadAppScript(context, filename) {

    const source = fs.readFileSync(
        path.join(projectRoot, "js", `${filename}.js`),
        "utf8"
    );

    vm.runInContext(source, context, { filename: `${filename}.js` });

}


async function createCloudRuntime(initialRows = createInitialRows(), options = {}) {

    const supabase = createSupabaseMock(initialRows);
    const storage = createLocalStorage(options.localStorage);
    const document = createDocumentMock();
    const windowListeners = new Map();
    const window = {
        CONFIG: {
            supabase: {
                url: "https://example.supabase.co",
                anonKey: "test-key"
            }
        },
        supabase: {
            createClient: () => supabase.client
        },
        setInterval: () => 1,
        clearInterval() {},
        addEventListener(type, listener) {

            windowListeners.set(type, listener);

        }
    };
    const context = vm.createContext({
        window,
        document,
        CustomEvent: class CustomEvent {

            constructor(type, init = {}) {

                this.type = type;
                this.detail = init.detail;

            }

        },
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

    loadAppScript(context, "cloud");
    await window.cloudDebug.initialize();

    return {
        context,
        debug: window.cloudDebug,
        document,
        loadScript: filename => loadAppScript(context, filename),
        storage,
        supabase,
        windowListeners
    };

}


module.exports = {
    createCloudRuntime,
    createInitialRows
};
