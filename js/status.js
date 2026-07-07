// ========================================
// Facility Status Engine
// ========================================

// جميع حالات المنشآت تحفظ هنا
const facilityStatusStorageKey = "facilityStatus";

const facilityStatus = loadFacilityStatus();


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


// إنشاء حالة افتراضية لكل منشأة
function createFacilityStatus(license) {

    if (facilityStatus[String(license)]) return;

    facilityStatus[String(license)] = {

        // حالة الزيارة
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
        notes: ""

    };

    saveFacilityStatus();

}


// إرجاع حالة منشأة
function getFacilityStatus(license) {

    return facilityStatus[String(license)];

}


// تحديث حالة الزيارة
function setVisitStatus(license, status) {

    const facility = getFacilityStatus(license);

    if (!facility) return;

    facility.visitStatus = status;

    saveFacilityStatus();

}


// تحديث المخالفة
function setViolation(license, value) {

    const facility = getFacilityStatus(license);

    if (!facility) return;

    facility.violation = value;

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

    facility.notes = notes;

    saveFacilityStatus();

}
