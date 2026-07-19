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
const cloudCache = {};
const cloudMissingKeys = {};
const cloudPendingWrites = [];


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

    console.warn("Cloud Mode: localStorage fallback");

}


async function saveCloudObject(dataSet, value, migrated = false) {

    const { error } = await cloudSupabaseClient
        .from(cloudTableName)
        .upsert(
            {
                key: dataSet.cloudKey,
                value,
                updated_at: new Date().toISOString()
            },
            { onConflict: "key" }
        );

    if (error) throw error;

    cloudMissingKeys[dataSet.cloudKey] = false;

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
            .select("value")
            .eq("key", dataSet.cloudKey)
            .maybeSingle();

        if (error) throw error;

        if (data && isPortableDataObject(data.value)) {

            cloudMissingKeys[dataSet.cloudKey] = false;

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
        console.log(`Loaded ${dataSet.label}`);

        return fallback;

    } catch (error) {

        logSupabaseError(error);
        console.warn(`Supabase load failed for ${dataSet.cloudKey}; using localStorage.`, error);

        useLocalStorageFallback();

        return readLocalObject(dataSet.localKey, fallback);

    }

}


async function writeCloudObject(key, value, options = {}) {

    const dataSet = getDataSetByCloudKey(key);

    cloudCache[dataSet.cloudKey] = value;

    if (!cloudUseSupabase || !cloudSupabaseClient) {

        if (options.requireCloud) {

            throw new Error(`Supabase is unavailable for ${dataSet.cloudKey}`);

        }

        writeLocalObject(dataSet.localKey, value);

        return;

    }

    const pendingWrite = (async () => {

        try {

            await saveCloudObject(dataSet, value);
            console.info("[CloudSync] upsert succeeded", {
                key: dataSet.cloudKey
            });

        } catch (error) {

            logSupabaseError(error);
            console.warn(`Supabase save failed for ${dataSet.cloudKey}; using localStorage fallback.`, error);
            if (options.throwOnError) {

                throw error;

            }

            useLocalStorageFallback();
            writeLocalObject(dataSet.localKey, value);

        }

    })();

    cloudPendingWrites.push(pendingWrite);

    await pendingWrite;

}


async function initializeCloudData() {

    if (cloudInitialized) return;

    const { url, anonKey } = getSupabaseConfig();
    const supabaseClientFactory = getSupabaseClientFactory();

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

    }

    for (const dataSet of Object.values(cloudDataSets)) {

        cloudCache[dataSet.cloudKey] = await readCloudObject(dataSet.cloudKey, {});

    }

    cloudInitialized = true;

}


function shouldSeedCloudKey(key) {

    return cloudUseSupabase && cloudMissingKeys[key] === true;

}


function seedCloudKey(key, value) {

    if (!shouldSeedCloudKey(key)) return;

    return writeCloudObject(key, value);

}


async function flushCloudWrites() {

    await Promise.all(cloudPendingWrites);

}


function loadUsers() {

    return isPortableDataObject(cloudCache[cloudStorageKeys.users])
        ? cloudCache[cloudStorageKeys.users]
        : null;

}


function saveUsers(users, options) {

    return writeCloudObject(cloudStorageKeys.users, users, options);

}


function loadAssignments() {

    return isPortableDataObject(cloudCache[cloudStorageKeys.assignments])
        ? cloudCache[cloudStorageKeys.assignments]
        : {};

}


function saveAssignments(assignments, options) {

    return writeCloudObject(cloudStorageKeys.assignments, assignments, options);

}


function loadFacilityStatus() {

    return isPortableDataObject(cloudCache[cloudStorageKeys.facilityStatus])
        ? cloudCache[cloudStorageKeys.facilityStatus]
        : {};

}


function saveFacilityStatus(facilityStatus, options) {

    return writeCloudObject(cloudStorageKeys.facilityStatus, facilityStatus, options);

}


function loadAppSettings() {

    return isPortableDataObject(cloudCache[cloudStorageKeys.appSettings])
        ? cloudCache[cloudStorageKeys.appSettings]
        : {};

}


function saveAppSettings(appSettings) {

    return writeCloudObject(cloudStorageKeys.appSettings, appSettings);

}


function loadCustomFacilities() {

    return isPortableDataObject(cloudCache[cloudStorageKeys.customFacilities])
        ? cloudCache[cloudStorageKeys.customFacilities]
        : {};

}


function saveCustomFacilities(customFacilities) {

    return writeCloudObject(cloudStorageKeys.customFacilities, customFacilities);

}


function loadFacilityOverrides() {

    return isPortableDataObject(cloudCache[cloudStorageKeys.facilityOverrides])
        ? cloudCache[cloudStorageKeys.facilityOverrides]
        : {};

}


function saveFacilityOverrides(facilityOverrides) {

    return writeCloudObject(cloudStorageKeys.facilityOverrides, facilityOverrides);

}


function loadExternalVisits() {

    return isPortableDataObject(cloudCache[cloudStorageKeys.externalVisits])
        ? cloudCache[cloudStorageKeys.externalVisits]
        : {};

}


function saveExternalVisits(externalVisits) {

    return writeCloudObject(cloudStorageKeys.externalVisits, externalVisits);

}


function loadEmployees() {

    return isPortableDataObject(cloudCache[cloudStorageKeys.employees])
        ? cloudCache[cloudStorageKeys.employees]
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
