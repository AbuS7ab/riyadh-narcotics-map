// ========================================
// Facility Status Engine
// ========================================

// جميع حالات المنشآت تحفظ هنا
const facilityStatusStorageKey = "facilityStatus";

const facilityStatus = loadFacilityStatus();


function getDefaultFacilityStatus() {

    return {

        // حالة الزيارة الحالية
        visitStatus: "pending",

        // هل يوجد مخالفة؟
        violation: false,

        // هل المنشأة مسندة للجنة؟
        assigned: false,

        // اسم اللجنة
        committee: null,

        // اسم المفتش
        inspector: null,

        // تاريخ آخر زيارة
        visitDate: null,

        // ملاحظات الزيارة
        notes: "",

        // سجل الزيارات
        visits: []

    };

}


function loadFacilityStatus() {

    try {

        const storedStatus =
            JSON.parse(localStorage.getItem(facilityStatusStorageKey));

        return storedStatus &&
            typeof storedStatus === "object" &&
            !Array.isArray(storedStatus)
            ? storedStatus
            : {};

    } catch (error) {

        return {};

    }

}


function saveFacilityStatus() {

    try {

        localStorage.setItem(
            facilityStatusStorageKey,
            JSON.stringify(facilityStatus)
        );

    } catch (error) {

        // Continue without persistence when localStorage is unavailable.

    }

}


function createVisitRecord(visit) {

    return {

        id: visit.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        date: visit.date || new Date().toISOString().slice(0, 10),
        visitStatus: ["pending", "visited", "partial"].includes(visit.visitStatus)
            ? visit.visitStatus
            : "pending",
        violation: Boolean(visit.violation),
        notes: visit.notes || "",
        createdAt: visit.createdAt || new Date().toISOString()

    };

}


function getLatestVisit(status) {

    if (!status || !Array.isArray(status.visits) || status.visits.length === 0) {

        return null;

    }

    return [...status.visits].sort((a, b) => {

        const dateCompare = new Date(b.date || 0) - new Date(a.date || 0);

        if (dateCompare !== 0) return dateCompare;

        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);

    })[0];

}


function syncLatestVisitState(status) {

    const latestVisit = getLatestVisit(status);

    if (!latestVisit) {

        status.visitStatus = "pending";
        status.violation = false;
        status.visitDate = null;
        status.notes = "";

        return;

    }

    status.visitStatus = latestVisit.visitStatus;
    status.violation = latestVisit.visitStatus === "pending"
        ? false
        : Boolean(latestVisit.violation);
    status.visitDate = latestVisit.date;
    status.notes = latestVisit.notes || "";

}


function normalizeFacilityStatus(status) {

    const originalStatus = JSON.stringify({
        visitStatus: status.visitStatus,
        violation: status.violation,
        visitDate: status.visitDate,
        notes: status.notes,
        visits: status.visits
    });

    if (!Array.isArray(status.visits)) {

        const shouldMigrateCurrentVisit =
            (status.visitStatus && status.visitStatus !== "pending") ||
            status.violation === true ||
            Boolean(status.notes) ||
            Boolean(status.visitDate);

        status.visits = shouldMigrateCurrentVisit
            ? [createVisitRecord({
                date: status.visitDate,
                visitStatus: status.visitStatus === "violation"
                    ? "visited"
                    : status.visitStatus,
                violation: status.visitStatus === "violation"
                    ? true
                    : status.violation,
                notes: status.notes
            })]
            : [];

    }

    status.visits = status.visits.map(visit => createVisitRecord(visit));

    if (status.visitStatus === "violation") {

        status.visitStatus = "visited";
        status.violation = true;

    }

    syncLatestVisitState(status);

    return originalStatus !== JSON.stringify({
        visitStatus: status.visitStatus,
        violation: status.violation,
        visitDate: status.visitDate,
        notes: status.notes,
        visits: status.visits
    });

}


// إنشاء حالة افتراضية لكل منشأة
function createFacilityStatus(license) {

    const existingStatus = facilityStatus[String(license)];

    if (existingStatus) {

        if (normalizeFacilityStatus(existingStatus)) {
            saveFacilityStatus();
        }

        return;

    }

    facilityStatus[String(license)] = getDefaultFacilityStatus();

    saveFacilityStatus();

}


// إرجاع حالة منشأة
function getFacilityStatus(license) {

    return facilityStatus[String(license)];

}


function addVisit(license, visit) {

    const facility = getFacilityStatus(license);

    if (!facility) return;

    if (!Array.isArray(facility.visits)) {

        facility.visits = [];

    }

    facility.visits.push(createVisitRecord(visit));

    syncLatestVisitState(facility);

    saveFacilityStatus();

}


function getFacilityVisits(license) {

    const facility = getFacilityStatus(license);

    if (!facility || !Array.isArray(facility.visits)) return [];

    return [...facility.visits].sort((a, b) => {

        const dateCompare = new Date(b.date || 0) - new Date(a.date || 0);

        if (dateCompare !== 0) return dateCompare;

        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);

    });

}


function getAnnualVisitCount(license, year = new Date().getFullYear()) {

    return getFacilityVisits(license).filter(visit => {

        if (!visit.date) return false;

        return new Date(visit.date).getFullYear() === year;

    }).length;

}


function clearFacilityVisits(license) {

    const facility = getFacilityStatus(license);

    if (!facility) return;

    facility.visits = [];

    syncLatestVisitState(facility);

    saveFacilityStatus();

}


function resetAllVisits() {

    Object.values(facilityStatus).forEach(status => {

        status.visits = [];

        syncLatestVisitState(status);

    });

    saveFacilityStatus();

}


// تحديث حالة الزيارة
function setVisitStatus(license, status) {

    const facility = getFacilityStatus(license);

    if (!facility) return;

    if (!["pending", "visited", "partial"].includes(status)) return;

    const latestVisit = getLatestVisit(facility);

    if (latestVisit) {

        latestVisit.visitStatus = status;
        syncLatestVisitState(facility);

    } else {

        facility.visitStatus = status;

    }

    saveFacilityStatus();

}


// تحديث المخالفة
function setViolation(license, value) {

    const facility = getFacilityStatus(license);

    if (!facility) return;

    const latestVisit = getLatestVisit(facility);

    if (latestVisit) {

        latestVisit.violation = value;
        syncLatestVisitState(facility);

    } else {

        facility.violation = value;

    }

    saveFacilityStatus();

}


// إسناد لجنة
function assignCommittee(license, committeeName) {

    const facility = getFacilityStatus(license);

    if (!facility) return;

    facility.assigned = true;

    facility.committee = committeeName;

    saveFacilityStatus();

}


// إضافة ملاحظات
function setNotes(license, notes) {

    const facility = getFacilityStatus(license);

    if (!facility) return;

    const latestVisit = getLatestVisit(facility);

    if (latestVisit) {

        latestVisit.notes = notes;
        syncLatestVisitState(facility);

    } else {

        facility.notes = notes;

    }

    saveFacilityStatus();

}
