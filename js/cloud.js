// ========================================
// Cloud Data Sync
// ========================================

const SUPABASE_URL = "";
const SUPABASE_ANON_KEY = "";

const cloudStorageKeys = {
    users: "narcoUsers",
    assignments: "facilityAssignments",
    facilityStatus: "facilityStatus",
    appSettings: "appSettings"
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


function writeLocalObject(key, value) {

    try {

        localStorage.setItem(key, JSON.stringify(value));

    } catch (error) {

        // Continue without local backup when localStorage is unavailable.

    }

}


function useLocalStorageFallback() {

    cloudUseSupabase = false;

    console.log("Cloud mode: localStorage fallback");

}


async function saveCloudObject(key, value, migrated = false) {

    const { error } = await cloudSupabaseClient
        .from(cloudTableName)
        .upsert(
            {
                key,
                value,
                updated_at: new Date().toISOString()
            },
            { onConflict: "key" }
        );

    if (error) throw error;

    cloudMissingKeys[key] = false;

    console.log(
        migrated
            ? `Migrated key to Supabase: ${key}`
            : `Saved key to Supabase: ${key}`
    );

}


async function readCloudObject(key, fallback = {}) {

    if (!cloudUseSupabase || !cloudSupabaseClient) {

        return readLocalObject(key, fallback);

    }

    try {

        const { data, error } = await cloudSupabaseClient
            .from(cloudTableName)
            .select("value")
            .eq("key", key)
            .maybeSingle();

        if (error) throw error;

        if (data && isPortableDataObject(data.value)) {

            cloudMissingKeys[key] = false;

            return data.value;

        }

        if (hasLocalObject(key)) {

            const localValue = readLocalObject(key, fallback);

            await saveCloudObject(key, localValue, true);

            return localValue;

        }

        cloudMissingKeys[key] = true;

        return fallback;

    } catch (error) {

        console.warn(`Supabase load failed for ${key}; using localStorage.`, error);

        useLocalStorageFallback();

        return readLocalObject(key, fallback);

    }

}


async function writeCloudObject(key, value) {

    writeLocalObject(key, value);
    cloudCache[key] = value;

    if (!cloudUseSupabase || !cloudSupabaseClient) return;

    const pendingWrite = (async () => {

        try {

            await saveCloudObject(key, value);

        } catch (error) {

            console.warn(`Supabase save failed for ${key}; localStorage backup kept.`, error);
            useLocalStorageFallback();

        }

    })();

    cloudPendingWrites.push(pendingWrite);

    await pendingWrite;

}


async function initializeCloudData() {

    if (cloudInitialized) return;

    const { url, anonKey } = getSupabaseConfig();

    cloudUseSupabase = Boolean(
        url &&
        anonKey &&
        window.supabase &&
        typeof window.supabase.createClient === "function"
    );

    if (cloudUseSupabase) {

        cloudSupabaseClient = window.supabase.createClient(url, anonKey);
        console.log("Cloud mode: Supabase");

    } else {

        console.log("Cloud mode: localStorage fallback");

    }

    await Promise.all(Object.values(cloudStorageKeys).map(async key => {

        cloudCache[key] = await readCloudObject(key, {});

    }));

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


function saveUsers(users) {

    return writeCloudObject(cloudStorageKeys.users, users);

}


function loadAssignments() {

    return isPortableDataObject(cloudCache[cloudStorageKeys.assignments])
        ? cloudCache[cloudStorageKeys.assignments]
        : {};

}


function saveAssignments(assignments) {

    return writeCloudObject(cloudStorageKeys.assignments, assignments);

}


function loadFacilityStatus() {

    return isPortableDataObject(cloudCache[cloudStorageKeys.facilityStatus])
        ? cloudCache[cloudStorageKeys.facilityStatus]
        : {};

}


function saveFacilityStatus(facilityStatus) {

    return writeCloudObject(cloudStorageKeys.facilityStatus, facilityStatus);

}


function loadAppSettings() {

    return isPortableDataObject(cloudCache[cloudStorageKeys.appSettings])
        ? cloudCache[cloudStorageKeys.appSettings]
        : {};

}


function saveAppSettings(appSettings) {

    return writeCloudObject(cloudStorageKeys.appSettings, appSettings);

}
