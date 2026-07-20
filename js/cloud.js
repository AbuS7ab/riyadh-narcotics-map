// ========================================
// Cloud Data Sync
// ========================================

const SUPABASE_URL = "";
const SUPABASE_ANON_KEY = "";

const cloudStorageKeys = {
    users: "users",
    assignments: "facilityAssignments",
    facilityStatus: "facilityStatus",
    appSettings: "appSettings",
    customFacilities: "customFacilities",
    facilityOverrides: "facilityOverrides",
    externalVisits: "externalVisits",
    employees: "employees"
};

const cloudDataSets = {
    users: {
        cloudKey: cloudStorageKeys.users,
        localKey: "narcoUsers",
        label: "users"
    },
    assignments: {
        cloudKey: cloudStorageKeys.assignments,
        localKey: "facilityAssignments",
        label: "assignments"
    },
    facilityStatus: {
        cloudKey: cloudStorageKeys.facilityStatus,
        localKey: "facilityStatus",
        label: "facilityStatus"
    },
    appSettings: {
        cloudKey: cloudStorageKeys.appSettings,
        localKey: "appSettings",
        label: "appSettings"
    },
    customFacilities: {
        cloudKey: cloudStorageKeys.customFacilities,
        localKey: "customFacilities",
        label: "customFacilities"
    },
    facilityOverrides: {
        cloudKey: cloudStorageKeys.facilityOverrides,
        localKey: "facilityOverrides",
        label: "facilityOverrides"
    },
    externalVisits: {
        cloudKey: cloudStorageKeys.externalVisits,
        localKey: "externalVisits",
        label: "externalVisits"
    },
    employees: {
        cloudKey: cloudStorageKeys.employees,
        localKey: "employees",
        label: "employees"
    }
};

const cloudTableName = "app_data";
let cloudSupabaseClient = null;
let cloudUseSupabase = false;
let cloudInitialized = false;
let cloudRemoteConfigured = false;
const cloudCache = {};
const cloudMissingKeys = {};
const cloudUpdatedAt = {};
const cloudPendingWrites = new Set();
const cloudWriteQueues = new Map();
let cloudLastTimestamp = 0;
let cloudRefreshTimer = null;
let cloudRefreshPromise = null;


class CloudConflictError extends Error {

    constructor(key) {

        super(`Cloud data changed before ${key} could be saved.`);
        this.name = "CloudConflictError";
        this.code = "CLOUD_CONFLICT";
        this.cloudKey = key;

    }

}


class CloudRecordConflictError extends Error {

    constructor(key, recordKey) {

        super(`Cloud record ${recordKey} changed before ${key} could be saved.`);
        this.name = "CloudRecordConflictError";
        this.code = "CLOUD_RECORD_CONFLICT";
        this.cloudKey = key;
        this.recordKey = recordKey;

    }

}


class CloudRollbackError extends Error {

    constructor(originalError, rollbackErrors) {

        super("Cloud write failed and one or more compensating writes also failed.");
        this.name = "CloudRollbackError";
        this.code = "CLOUD_ROLLBACK_FAILED";
        this.originalError = originalError;
        this.rollbackErrors = rollbackErrors;

    }

}


function cloneCloudValue(value) {

    if (typeof structuredClone === "function") {

        return structuredClone(value);

    }

    return JSON.parse(JSON.stringify(value));

}


function cloudValuesEqual(first, second) {

    return JSON.stringify(first) === JSON.stringify(second);

}


function hasCloudRecord(collection, recordKey) {

    return Object.prototype.hasOwnProperty.call(collection, recordKey);

}


function createCloudCollectionPatch(previousValue, nextValue) {

    if (!isPortableDataObject(previousValue) || !isPortableDataObject(nextValue)) {

        throw new Error("Cloud collection changes require two objects.");

    }

    const removals = Object.keys(previousValue).filter(recordKey => {

        return !hasCloudRecord(nextValue, recordKey);

    });
    const upserts = Object.keys(nextValue).filter(recordKey => {

        return !hasCloudRecord(previousValue, recordKey) ||
            !cloudValuesEqual(previousValue[recordKey], nextValue[recordKey]);

    }).map(recordKey => ({
        recordKey,
        value: cloneCloudValue(nextValue[recordKey])
    }));

    return { removals, upserts };

}


function createCloudTimestamp() {

    const timestamp = Math.max(Date.now(), cloudLastTimestamp + 1);

    cloudLastTimestamp = timestamp;

    return new Date(timestamp).toISOString();

}


function getCloudWriteOptions(options = {}) {

    if (!cloudRemoteConfigured) return options;

    return {
        ...options,
        requireCloud: true,
        throwOnError: true
    };

}


function enqueueCloudWrite(key, operation) {

    const previousWrite = cloudWriteQueues.get(key) || Promise.resolve();
    const write = previousWrite
        .catch(() => undefined)
        .then(operation);
    let trackedWrite;

    trackedWrite = write.finally(() => {

        cloudPendingWrites.delete(trackedWrite);

        if (cloudWriteQueues.get(key) === write) {

            cloudWriteQueues.delete(key);

        }

    });

    cloudWriteQueues.set(key, write);
    cloudPendingWrites.add(trackedWrite);

    return trackedWrite;

}


function getSupabaseConfig() {

    const configuredSupabase = window.CONFIG && window.CONFIG.supabase
        ? window.CONFIG.supabase
        : {};

    return {
        url: configuredSupabase.url || SUPABASE_URL,
        anonKey: configuredSupabase.anonKey || SUPABASE_ANON_KEY
    };

}


function getSupabaseClientFactory() {

    return window.supabase;

}


function logSupabaseError(error) {

    const message = error && error.message
        ? error.message
        : JSON.stringify(error);

    console.error(`Supabase error: ${message}`);

}


function updateCloudSyncStatus(state, message) {

    if (typeof document === "undefined") return;

    const indicator = document.getElementById("cloudSyncStatus");

    if (!indicator) return;

    indicator.dataset.state = state;
    indicator.textContent = message;
    indicator.setAttribute("title", message);

}


function isPortableDataObject(value) {

    return value &&
        typeof value === "object" &&
        !Array.isArray(value);

}


function readLocalObject(key, fallback = {}) {

    try {

        const storedValue = JSON.parse(localStorage.getItem(key));

        return isPortableDataObject(storedValue) ? storedValue : fallback;

    } catch (error) {

        return fallback;

    }

}


function hasLocalObject(key) {

    try {

        return isPortableDataObject(JSON.parse(localStorage.getItem(key)));

    } catch (error) {

        return false;

    }

}


function getDataSetByCloudKey(key) {

    return Object.values(cloudDataSets).find(dataSet => {

        return dataSet.cloudKey === key || dataSet.localKey === key;

    }) || {
        cloudKey: key,
        localKey: key,
        label: key
    };

}


function writeLocalObject(key, value) {

    try {

        localStorage.setItem(key, JSON.stringify(value));

    } catch (error) {

        // Continue without local backup when localStorage is unavailable.

    }

}


function useLocalStorageFallback() {

    cloudUseSupabase = false;
    updateCloudSyncStatus("offline", "غير متصل — القراءة المحلية فقط");

    console.warn("Cloud Mode: localStorage fallback");

}


async function saveCloudObject(dataSet, value, migrated = false, options = {}) {

    const key = dataSet.cloudKey;
    const hasExpectedUpdatedAt = Object.prototype.hasOwnProperty.call(
        options,
        "expectedUpdatedAt"
    );
    const expectedUpdatedAt = hasExpectedUpdatedAt
        ? options.expectedUpdatedAt
        : cloudUpdatedAt[key] || null;
    const expectedMissing = Object.prototype.hasOwnProperty.call(
        options,
        "expectedMissing"
    )
        ? options.expectedMissing
        : cloudMissingKeys[key] === true;
    const nextUpdatedAt = createCloudTimestamp();
    const record = {
        key,
        value: cloneCloudValue(value),
        updated_at: nextUpdatedAt
    };
    let response;

    if (expectedMissing === true) {

        response = await cloudSupabaseClient
            .from(cloudTableName)
            .insert(record)
            .select("updated_at")
            .maybeSingle();

    } else if (expectedUpdatedAt) {

        response = await cloudSupabaseClient
            .from(cloudTableName)
            .update({
                value: record.value,
                updated_at: nextUpdatedAt
            })
            .eq("key", key)
            .eq("updated_at", expectedUpdatedAt)
            .select("updated_at")
            .maybeSingle();

    } else {

        throw new CloudConflictError(key);

    }

    if (response.error) {

        if (expectedMissing && response.error.code === "23505") {

            throw new CloudConflictError(key);

        }

        throw response.error;

    }
    if (!response.data) throw new CloudConflictError(key);

    cloudMissingKeys[key] = false;
    cloudUpdatedAt[key] = response.data.updated_at || nextUpdatedAt;

    console.log(migrated
        ? `Migrated key to Supabase: ${dataSet.cloudKey}`
        : `Saved ${dataSet.label}`);

}


async function readCloudObject(key, fallback = {}) {

    const dataSet = getDataSetByCloudKey(key);

    if (!cloudUseSupabase || !cloudSupabaseClient) {

        return readLocalObject(dataSet.localKey, fallback);

    }

    try {

        const { data, error } = await cloudSupabaseClient
            .from(cloudTableName)
            .select("value, updated_at")
            .eq("key", dataSet.cloudKey)
            .maybeSingle();

        if (error) throw error;

        if (data && isPortableDataObject(data.value)) {

            cloudMissingKeys[dataSet.cloudKey] = false;
            cloudUpdatedAt[dataSet.cloudKey] = data.updated_at || null;

            console.log(`Loaded ${dataSet.label}`);

            return data.value;

        }

        if (hasLocalObject(dataSet.localKey)) {

            const localValue = readLocalObject(dataSet.localKey, fallback);

            await saveCloudObject(dataSet, localValue, true);
            console.log(`Loaded ${dataSet.label}`);

            return localValue;

        }

        cloudMissingKeys[dataSet.cloudKey] = true;
        cloudUpdatedAt[dataSet.cloudKey] = null;
        console.log(`Loaded ${dataSet.label}`);

        return fallback;

    } catch (error) {

        logSupabaseError(error);
        console.warn(`Supabase load failed for ${dataSet.cloudKey}; using localStorage.`, error);

        useLocalStorageFallback();

        return readLocalObject(dataSet.localKey, fallback);

    }

}


async function readCloudObjectStrict(key) {

    const dataSet = getDataSetByCloudKey(key);

    if (!cloudUseSupabase || !cloudSupabaseClient) {

        throw new Error(`Supabase is unavailable for ${dataSet.cloudKey}`);

    }

    const { data, error } = await cloudSupabaseClient
        .from(cloudTableName)
        .select("value, updated_at")
        .eq("key", dataSet.cloudKey)
        .maybeSingle();

    if (error) throw error;

    if (!data) {

        cloudMissingKeys[dataSet.cloudKey] = true;
        cloudUpdatedAt[dataSet.cloudKey] = null;

        return {};

    }

    if (!isPortableDataObject(data.value)) {

        throw new Error(`Invalid cloud data for ${dataSet.cloudKey}`);

    }

    cloudMissingKeys[dataSet.cloudKey] = false;
    cloudUpdatedAt[dataSet.cloudKey] = data.updated_at || null;
    cloudCache[dataSet.cloudKey] = cloneCloudValue(data.value);

    return cloneCloudValue(data.value);

}


async function peekCloudObjectStrict(key) {

    const dataSet = getDataSetByCloudKey(key);

    if (!cloudUseSupabase || !cloudSupabaseClient) {

        throw new Error(`Supabase is unavailable for ${dataSet.cloudKey}`);

    }

    const { data, error } = await cloudSupabaseClient
        .from(cloudTableName)
        .select("value, updated_at")
        .eq("key", dataSet.cloudKey)
        .maybeSingle();

    if (error) throw error;
    if (!data) return {};

    if (!isPortableDataObject(data.value)) {

        throw new Error(`Invalid cloud data for ${dataSet.cloudKey}`);

    }

    return cloneCloudValue(data.value);

}


async function mutateCloudObject(key, mutation, options = {}) {

    const maxAttempts = Math.max(1, Number(options.maxAttempts) || 3);
    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {

        const currentValue = await readCloudObjectStrict(key);
        const expectedUpdatedAt = cloudUpdatedAt[key] || null;
        const expectedMissing = cloudMissingKeys[key] === true;
        const nextValue = await mutation(cloneCloudValue(currentValue), attempt);

        if (!isPortableDataObject(nextValue)) {

            throw new Error(`Mutation for ${key} must return an object.`);

        }

        try {

            await writeCloudObject(key, nextValue, {
                requireCloud: true,
                throwOnError: true,
                expectedUpdatedAt,
                expectedMissing
            });

            return cloneCloudValue(nextValue);

        } catch (error) {

            lastError = error;

            if (!(error instanceof CloudConflictError) || attempt === maxAttempts) {

                throw error;

            }

            console.warn("[CloudSync] retrying after concurrent update", {
                key,
                attempt,
                maxAttempts
            });

        }

    }

    throw lastError;

}


async function mutateCloudCollection(key, previousValue, nextValue, options = {}) {

    const previous = cloneCloudValue(previousValue);
    const patch = createCloudCollectionPatch(previous, nextValue);

    if (patch.removals.length === 0 && patch.upserts.length === 0) {

        return previous;

    }

    return mutateCloudObject(key, currentValue => {

        patch.removals.forEach(recordKey => {

            if (hasCloudRecord(currentValue, recordKey) &&
                !cloudValuesEqual(currentValue[recordKey], previous[recordKey])) {

                throw new CloudRecordConflictError(key, recordKey);

            }

            delete currentValue[recordKey];

        });

        patch.upserts.forEach(({ recordKey, value }) => {

            const existedPreviously = hasCloudRecord(previous, recordKey);
            const existsRemotely = hasCloudRecord(currentValue, recordKey);
            const remoteMatchesPrevious = existedPreviously &&
                existsRemotely &&
                cloudValuesEqual(currentValue[recordKey], previous[recordKey]);
            const remoteMatchesNext = existsRemotely &&
                cloudValuesEqual(currentValue[recordKey], value);

            if ((existedPreviously && !remoteMatchesPrevious && !remoteMatchesNext) ||
                (!existedPreviously && existsRemotely && !remoteMatchesNext)) {

                throw new CloudRecordConflictError(key, recordKey);

            }

            currentValue[recordKey] = cloneCloudValue(value);

        });

        return currentValue;

    }, options);

}


function createCollectionRollbackValue(savedValue, previousValue, patch) {

    const rollbackValue = cloneCloudValue(savedValue);
    const touchedKeys = new Set([
        ...patch.removals,
        ...patch.upserts.map(upsert => upsert.recordKey)
    ]);

    touchedKeys.forEach(recordKey => {

        if (hasCloudRecord(previousValue, recordKey)) {

            rollbackValue[recordKey] = cloneCloudValue(previousValue[recordKey]);

        } else {

            delete rollbackValue[recordKey];

        }

    });

    return rollbackValue;

}


async function mutateCloudCollectionsWithRollback(changes) {

    if (!Array.isArray(changes) || changes.length === 0) return {};

    const duplicateKeys = changes.map(change => change.key).filter((key, index, keys) => {

        return keys.indexOf(key) !== index;

    });

    if (duplicateKeys.length > 0) {

        throw new Error(`Duplicate cloud collection change: ${duplicateKeys[0]}`);

    }

    const completedChanges = [];
    const results = {};

    try {

        for (const change of changes) {

            const previousValue = cloneCloudValue(change.previousValue);
            const nextValue = cloneCloudValue(change.nextValue);
            const patch = createCloudCollectionPatch(previousValue, nextValue);
            const savedValue = await mutateCloudCollection(
                change.key,
                previousValue,
                nextValue
            );

            results[change.key] = savedValue;

            if (patch.removals.length > 0 || patch.upserts.length > 0) {

                completedChanges.push({
                    key: change.key,
                    savedValue,
                    rollbackValue: createCollectionRollbackValue(
                        savedValue,
                        previousValue,
                        patch
                    )
                });

            }

        }

        return results;

    } catch (originalError) {

        const rollbackErrors = [];

        for (const completedChange of [...completedChanges].reverse()) {

            try {

                await mutateCloudCollection(
                    completedChange.key,
                    completedChange.savedValue,
                    completedChange.rollbackValue
                );

            } catch (rollbackError) {

                rollbackErrors.push({
                    key: completedChange.key,
                    error: rollbackError
                });

            }

        }

        if (rollbackErrors.length > 0) {

            throw new CloudRollbackError(originalError, rollbackErrors);

        }

        throw originalError;

    }

}


function dispatchCloudRefresh(changedKeys) {

    if (typeof document === "undefined" ||
        typeof CustomEvent === "undefined" ||
        changedKeys.length === 0) return;

    document.dispatchEvent(new CustomEvent("cloud:data-refreshed", {
        detail: { changedKeys }
    }));

}


async function refreshCloudData() {

    if (!cloudUseSupabase || !cloudSupabaseClient || cloudPendingWrites.size > 0) {

        return [];

    }

    if (cloudRefreshPromise) return cloudRefreshPromise;

    cloudRefreshPromise = (async () => {

        const changedKeys = [];
        const previousCache = cloneCloudValue(cloudCache);
        const previousVersions = { ...cloudUpdatedAt };
        const previousMissingKeys = { ...cloudMissingKeys };

        try {

            for (const dataSet of Object.values(cloudDataSets)) {

                const previousVersion = cloudUpdatedAt[dataSet.cloudKey] || null;

                await readCloudObjectStrict(dataSet.cloudKey);

                if (cloudUpdatedAt[dataSet.cloudKey] !== previousVersion) {

                    changedKeys.push(dataSet.cloudKey);

                }

            }

        } catch (error) {

            Object.keys(cloudCache).forEach(key => delete cloudCache[key]);
            Object.assign(cloudCache, previousCache);
            Object.keys(cloudUpdatedAt).forEach(key => delete cloudUpdatedAt[key]);
            Object.assign(cloudUpdatedAt, previousVersions);
            Object.keys(cloudMissingKeys).forEach(key => delete cloudMissingKeys[key]);
            Object.assign(cloudMissingKeys, previousMissingKeys);

            throw error;

        }

        dispatchCloudRefresh(changedKeys);
        updateCloudSyncStatus("synced", "متصل ومتزامن");

        return changedKeys;

    })().catch(error => {

        logSupabaseError(error);
        updateCloudSyncStatus("error", "تعذر تحديث البيانات");

        throw error;

    }).finally(() => {

        cloudRefreshPromise = null;

    });

    return cloudRefreshPromise;

}


function startCloudRefresh(intervalMs = 30000) {

    if (cloudRefreshTimer || typeof window === "undefined") return;

    cloudRefreshTimer = window.setInterval(() => {

        refreshCloudData().catch(() => undefined);

    }, intervalMs);

    if (typeof document !== "undefined") {

        document.addEventListener("visibilitychange", () => {

            if (document.visibilityState === "visible") {

                refreshCloudData().catch(() => undefined);

            }

        });

        window.addEventListener("online", () => {

            refreshCloudData().catch(() => undefined);

        });

    }

}


async function writeCloudObject(key, value, options = {}) {

    const dataSet = getDataSetByCloudKey(key);
    const effectiveOptions = getCloudWriteOptions(options);
    const nextValue = cloneCloudValue(value);

    if (!cloudUseSupabase || !cloudSupabaseClient) {

        if (effectiveOptions.requireCloud) {

            throw new Error(`Supabase is unavailable for ${dataSet.cloudKey}`);

        }

        cloudCache[dataSet.cloudKey] = nextValue;
        writeLocalObject(dataSet.localKey, nextValue);

        return;

    }

    updateCloudSyncStatus("saving", "جاري المزامنة...");

    return enqueueCloudWrite(dataSet.cloudKey, async () => {

        try {

            await saveCloudObject(dataSet, nextValue, false, effectiveOptions);
            cloudCache[dataSet.cloudKey] = cloneCloudValue(nextValue);
            writeLocalObject(dataSet.localKey, nextValue);
            console.info("[CloudSync] upsert succeeded", {
                key: dataSet.cloudKey
            });
            updateCloudSyncStatus("synced", "تمت المزامنة");

        } catch (error) {

            logSupabaseError(error);
            console.warn(`Supabase save failed for ${dataSet.cloudKey}.`, error);
            updateCloudSyncStatus(
                error instanceof CloudConflictError ? "conflict" : "error",
                error instanceof CloudConflictError
                    ? "تعارض مزامنة — جاري حماية البيانات"
                    : "فشلت المزامنة"
            );
            if (effectiveOptions.throwOnError || effectiveOptions.requireCloud) {

                throw error;

            }

            useLocalStorageFallback();
            writeLocalObject(dataSet.localKey, value);

        }

    });

}


async function initializeCloudData() {

    if (cloudInitialized) return;

    updateCloudSyncStatus("saving", "جاري الاتصال...");

    const { url, anonKey } = getSupabaseConfig();
    const supabaseClientFactory = getSupabaseClientFactory();

    cloudRemoteConfigured = Boolean(url && anonKey);
    cloudUseSupabase = Boolean(
        url &&
        anonKey &&
        supabaseClientFactory &&
        typeof supabaseClientFactory.createClient === "function"
    );

    if (cloudUseSupabase) {

        cloudSupabaseClient = supabaseClientFactory.createClient(url, anonKey);
        console.log("Cloud Mode: Supabase");

    } else {

        console.warn("Cloud Mode: localStorage fallback");
        updateCloudSyncStatus("offline", "وضع محلي — المزامنة غير متاحة");

    }

    for (const dataSet of Object.values(cloudDataSets)) {

        cloudCache[dataSet.cloudKey] = await readCloudObject(dataSet.cloudKey, {});

    }

    cloudInitialized = true;

    if (cloudUseSupabase) {

        updateCloudSyncStatus("synced", "متصل ومتزامن");

    }

}


function shouldSeedCloudKey(key) {

    return cloudUseSupabase && cloudMissingKeys[key] === true;

}


function seedCloudKey(key, value) {

    if (!shouldSeedCloudKey(key)) return;

    return writeCloudObject(key, value);

}


async function flushCloudWrites() {

    await Promise.all([...cloudPendingWrites]);

}


function loadUsers() {

    return isPortableDataObject(cloudCache[cloudStorageKeys.users])
        ? cloneCloudValue(cloudCache[cloudStorageKeys.users])
        : null;

}


function saveUsers(users, options) {

    return writeCloudObject(cloudStorageKeys.users, users, options);

}


function loadAssignments() {

    return isPortableDataObject(cloudCache[cloudStorageKeys.assignments])
        ? cloneCloudValue(cloudCache[cloudStorageKeys.assignments])
        : {};

}


function saveAssignments(assignments, options) {

    return writeCloudObject(cloudStorageKeys.assignments, assignments, options);

}


function loadFacilityStatus() {

    return isPortableDataObject(cloudCache[cloudStorageKeys.facilityStatus])
        ? cloneCloudValue(cloudCache[cloudStorageKeys.facilityStatus])
        : {};

}


function saveFacilityStatus(facilityStatus, options) {

    return writeCloudObject(cloudStorageKeys.facilityStatus, facilityStatus, options);

}


function loadAppSettings() {

    return isPortableDataObject(cloudCache[cloudStorageKeys.appSettings])
        ? cloneCloudValue(cloudCache[cloudStorageKeys.appSettings])
        : {};

}


function saveAppSettings(appSettings) {

    return writeCloudObject(cloudStorageKeys.appSettings, appSettings);

}


function loadCustomFacilities() {

    return isPortableDataObject(cloudCache[cloudStorageKeys.customFacilities])
        ? cloneCloudValue(cloudCache[cloudStorageKeys.customFacilities])
        : {};

}


function saveCustomFacilities(customFacilities) {

    return writeCloudObject(cloudStorageKeys.customFacilities, customFacilities);

}


function loadFacilityOverrides() {

    return isPortableDataObject(cloudCache[cloudStorageKeys.facilityOverrides])
        ? cloneCloudValue(cloudCache[cloudStorageKeys.facilityOverrides])
        : {};

}


function saveFacilityOverrides(facilityOverrides) {

    return writeCloudObject(cloudStorageKeys.facilityOverrides, facilityOverrides);

}


function loadExternalVisits() {

    return isPortableDataObject(cloudCache[cloudStorageKeys.externalVisits])
        ? cloneCloudValue(cloudCache[cloudStorageKeys.externalVisits])
        : {};

}


function saveExternalVisits(externalVisits) {

    return writeCloudObject(cloudStorageKeys.externalVisits, externalVisits);

}


function loadEmployees() {

    return isPortableDataObject(cloudCache[cloudStorageKeys.employees])
        ? cloneCloudValue(cloudCache[cloudStorageKeys.employees])
        : {};

}


function saveEmployees(employees) {

    return writeCloudObject(cloudStorageKeys.employees, employees);

}


async function testCloudWrite() {

    if (!cloudInitialized) {

        await initializeCloudData();

    }

    if (!cloudUseSupabase || !cloudSupabaseClient) {

        throw new Error("Supabase is not active.");

    }

    const value = {
        ok: true,
        timestamp: new Date().toISOString()
    };

    await saveCloudObject(getDataSetByCloudKey("syncTest"), value);

    return value;

}


window.cloudDebug = {
    get mode() {

        return cloudUseSupabase ? "supabase" : "localStorage";

    },
    get isSupabaseEnabled() {

        return cloudUseSupabase;

    },
    get pendingWrites() {

        return cloudPendingWrites.size;

    },
    get versions() {

        return { ...cloudUpdatedAt };

    },
    initialize: initializeCloudData,
    flush: flushCloudWrites,
    readObject: readCloudObject,
    readObjectStrict: readCloudObjectStrict,
    peekObjectStrict: peekCloudObjectStrict,
    writeObject: writeCloudObject,
    mutateObject: mutateCloudObject,
    mutateCollection: mutateCloudCollection,
    mutateCollectionsWithRollback: mutateCloudCollectionsWithRollback,
    refresh: refreshCloudData,
    startRefresh: startCloudRefresh,
    testWrite: testCloudWrite,
    loadUsers,
    saveUsers,
    loadAssignments,
    saveAssignments,
    loadFacilityStatus,
    saveFacilityStatus,
    loadCustomFacilities,
    saveCustomFacilities,
    loadFacilityOverrides,
    saveFacilityOverrides,
    loadExternalVisits,
    saveExternalVisits,
    loadEmployees,
    saveEmployees
};
