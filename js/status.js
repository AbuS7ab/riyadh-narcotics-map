// ========================================
// Facility Status Engine
// ========================================

let facilityStatus = {};


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


function initializeFacilityStatusState() {

    facilityStatus = loadFacilityStatus();

    seedCloudKey("facilityStatus", facilityStatus);

}


function createVisitRecord(visit) {

    const normalizedResult = ["no_violation", "violation", "incomplete"].includes(visit.result)
        ? visit.result
        : "";
    const result = normalizedResult ||
        (visit.visitStatus === "partial"
            ? "incomplete"
            : visit.violation
                ? "violation"
                : visit.visitStatus === "visited"
                    ? "no_violation"
                    : "no_violation");
    const visitStatus = result === "incomplete"
        ? "partial"
        : ["pending", "visited", "partial"].includes(visit.visitStatus)
            ? visit.visitStatus
            : "visited";
    const teamSnapshot = visit.teamSnapshot && typeof visit.teamSnapshot === "object"
        ? visit.teamSnapshot
        : {};
    const employeeSnapshot = visit.employeeSnapshot && typeof visit.employeeSnapshot === "object"
        ? visit.employeeSnapshot
        : null;
    const snapshotLeaderId = String(employeeSnapshot && employeeSnapshot.leaderId || "");
    const snapshotMemberIds = employeeSnapshot && Array.isArray(employeeSnapshot.memberIds)
        ? employeeSnapshot.memberIds.map(String).filter(Boolean)
        : [];
    const snapshotEmployeeIds = employeeSnapshot && Array.isArray(employeeSnapshot.employeeIds)
        ? employeeSnapshot.employeeIds.map(String).filter(Boolean)
        : [];
    const normalizedEmployeeIds = [...new Set([
        snapshotLeaderId,
        ...snapshotMemberIds,
        ...snapshotEmployeeIds
    ].filter(Boolean))];

    return {

        id: visit.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        assignmentId: visit.assignmentId || null,
        facilityLicense: visit.facilityLicense || null,
        date: visit.date || new Date().toISOString().slice(0, 10),
        committeeUsername: visit.committeeUsername || "",
        committeeName: visit.committeeName || "",
        teamSnapshot: {
            leader: teamSnapshot.leader || "",
            members: Array.isArray(teamSnapshot.members)
                ? teamSnapshot.members.filter(Boolean)
                : [],
            leaderId: teamSnapshot.leaderId || "",
            memberIds: Array.isArray(teamSnapshot.memberIds)
                ? teamSnapshot.memberIds.filter(Boolean)
                : []
        },
        employeeSnapshot: employeeSnapshot ? {
            leaderId: snapshotLeaderId,
            memberIds: [...new Set(snapshotMemberIds.filter(id => id !== snapshotLeaderId))],
            employeeIds: normalizedEmployeeIds
        } : null,
        visitType: visit.visitType || "periodic",
        visitReason: visit.visitReason || "الخطة الدورية",
        result,
        incompleteReason: visit.incompleteReason || "",
        visitStatus,
        violation: result === "violation" || Boolean(visit.violation),
        notes: visit.notes || "",
        createdBy: visit.createdBy || "",
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
function createFacilityStatus(license, options = {}) {

    const existingStatus = facilityStatus[String(license)];

    if (existingStatus) {

        if (normalizeFacilityStatus(existingStatus) && options.persist !== false) {
            saveFacilityStatus(facilityStatus);
        }

        return;

    }

    facilityStatus[String(license)] = getDefaultFacilityStatus();

    if (options.persist !== false) {

        saveFacilityStatus(facilityStatus);

    }

}


// إرجاع حالة منشأة
function getFacilityStatus(license) {

    return facilityStatus[String(license)];

}


function addVisit(license, visit) {

    if (typeof isCommitteeUser === "function" && !isCommitteeUser()) return;

    const facility = getFacilityStatus(license);

    if (!facility) return;

    if (!Array.isArray(facility.visits)) {

        facility.visits = [];

    }

    facility.visits.push(createVisitRecord(visit));

    syncLatestVisitState(facility);

    if (typeof invalidateEmployeePerformanceCache === "function") {

        invalidateEmployeePerformanceCache();

    }

    const saveOperation = saveFacilityStatus(facilityStatus);

    if (typeof isAdminUser === "function" &&
        isAdminUser() &&
        typeof refreshEmployeePerformanceDashboard === "function") {

        refreshEmployeePerformanceDashboard();

    }

    return saveOperation;

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

    if (typeof isAdminUser === "function" && !isAdminUser()) return;

    const facility = getFacilityStatus(license);

    if (!facility) return;

    facility.visits = [];

    syncLatestVisitState(facility);

    saveFacilityStatus(facilityStatus);

}


function resetAllVisits() {

    if (typeof isAdminUser === "function" && !isAdminUser()) return;

    Object.values(facilityStatus).forEach(status => {

        status.visits = [];

        syncLatestVisitState(status);

    });

    saveFacilityStatus(facilityStatus);

}


// تحديث حالة الزيارة
function setVisitStatus(license, status) {

    if (typeof isViewerUser === "function" && isViewerUser()) return;

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

    saveFacilityStatus(facilityStatus);

}


// تحديث المخالفة
function setViolation(license, value) {

    if (typeof isViewerUser === "function" && isViewerUser()) return;

    const facility = getFacilityStatus(license);

    if (!facility) return;

    const latestVisit = getLatestVisit(facility);

    if (latestVisit) {

        latestVisit.violation = value;
        syncLatestVisitState(facility);

    } else {

        facility.violation = value;

    }

    saveFacilityStatus(facilityStatus);

}


// إسناد لجنة
function assignCommittee(license, committeeName) {

    if (typeof isViewerUser === "function" && isViewerUser()) return;

    const facility = getFacilityStatus(license);

    if (!facility) return;

    facility.assigned = true;

    facility.committee = committeeName;

    saveFacilityStatus(facilityStatus);

}


// إضافة ملاحظات
function setNotes(license, notes) {

    if (typeof isViewerUser === "function" && isViewerUser()) return;

    const facility = getFacilityStatus(license);

    if (!facility) return;

    const latestVisit = getLatestVisit(facility);

    if (latestVisit) {

        latestVisit.notes = notes;
        syncLatestVisitState(facility);

    } else {

        facility.notes = notes;

    }

    saveFacilityStatus(facilityStatus);

}
