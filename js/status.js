// ========================================
// Facility Status Engine
// ========================================

// جميع حالات المنشآت تحفظ هنا
const facilityStatus = {};


// إنشاء حالة افتراضية لكل منشأة
function createFacilityStatus(license) {

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

}


// تحديث المخالفة
function setViolation(license, value) {

    const facility = getFacilityStatus(license);

    if (!facility) return;

    facility.violation = value;

}


// إسناد لجنة
function assignCommittee(license, committeeName) {

    const facility = getFacilityStatus(license);

    if (!facility) return;

    facility.assigned = true;

    facility.committee = committeeName;

}


// إضافة ملاحظات
function setNotes(license, notes) {

    const facility = getFacilityStatus(license);

    if (!facility) return;

    facility.notes = notes;

}