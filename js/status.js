// ========================================
// Facility Status Engine
// ========================================

let facilityStatus = {};


function getCurrentLocalDateValue(date = new Date()) {

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;

}


function isFutureVisitDate(value, today = getCurrentLocalDateValue()) {

    const normalizedValue = String(value || "").slice(0, 10);

    return /^\d{4}-\d{2}-\d{2}$/.test(normalizedValue) &&
        normalizedValue > today;

}


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


async function initializeFacilityStatusState() {

    facilityStatus = loadFacilityStatus();

    await seedCloudKey("facilityStatus", facilityStatus);

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
        facilityLicense: visit.facilityLicense === null ||
            typeof visit.facilityLicense === "undefined"
            ? null
            : String(visit.facilityLicense),
        date: visit.date || getCurrentLocalDateValue(),
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
function createFacilityStatus(license) {

    const existingStatus = facilityStatus[String(license)];

    if (existingStatus) {

        normalizeFacilityStatus(existingStatus);

        return;

    }

    facilityStatus[String(license)] = getDefaultFacilityStatus();

}


// إرجاع حالة منشأة
function getFacilityStatus(license) {

    return facilityStatus[String(license)];

}


async function addVisit(license, visit) {

    if (typeof isCommitteeUser === "function" && !isCommitteeUser()) return;

    const requestedVisitDate = visit && visit.date
        ? String(visit.date).slice(0, 10)
        : getCurrentLocalDateValue();

    if (isFutureVisitDate(requestedVisitDate)) {

        throw new RangeError("Future visit dates are not allowed.");

    }

    const normalizedLicense = String(license);
    const visitRecord = createVisitRecord({
        ...visit,
        date: requestedVisitDate
    });
    const currentFacility = getFacilityStatus(normalizedLicense);
    const statusBefore = currentFacility ? currentFacility.visitStatus : "pending";

    console.info("[VisitSync] saving facility status", {
        facilityId: normalizedLicense,
        assignmentId: visitRecord.assignmentId,
        committeeId: visitRecord.committeeUsername,
        visitId: visitRecord.id,
        statusBefore,
        statusAfter: visitRecord.visitStatus
    });

    if (typeof invalidateEmployeePerformanceCache === "function") {

        invalidateEmployeePerformanceCache();

    }

    try {

        facilityStatus = await mutateCloudObject("facilityStatus", nextStatus => {

            const facility = nextStatus[normalizedLicense] || getDefaultFacilityStatus();

            normalizeFacilityStatus(facility);

            if (!facility.visits.some(existingVisit => {

                return String(existingVisit.id) === String(visitRecord.id);

            })) {

                facility.visits.push(visitRecord);

            }

            syncLatestVisitState(facility);
            nextStatus[normalizedLicense] = facility;

            return nextStatus;

        });

    } catch (error) {

        if (typeof invalidateEmployeePerformanceCache === "function") {

            invalidateEmployeePerformanceCache();

        }

        console.error("[VisitSync] facility status upsert failed", {
            facilityId: normalizedLicense,
            assignmentId: visitRecord.assignmentId,
            committeeId: visitRecord.committeeUsername,
            visitId: visitRecord.id,
            statusBefore,
            statusAfter: statusBefore,
            error
        });

        throw error;

    }

    console.info("[VisitSync] facility status saved", {
        facilityId: normalizedLicense,
        assignmentId: visitRecord.assignmentId,
        committeeId: visitRecord.committeeUsername,
        visitId: visitRecord.id,
        statusBefore,
        statusAfter: getFacilityStatus(normalizedLicense).visitStatus
    });

    if (typeof isAdminUser === "function" &&
        isAdminUser() &&
        typeof refreshEmployeePerformanceDashboard === "function") {

        refreshEmployeePerformanceDashboard();

    }

    return visitRecord;

}


async function rollbackVisitAfterAssignmentFailure(license, visitId) {

    const normalizedLicense = String(license);
    let removed = false;

    facilityStatus = await mutateCloudObject("facilityStatus", nextStatus => {

        const facility = nextStatus[normalizedLicense];

        if (!facility || !Array.isArray(facility.visits)) return nextStatus;

        const visits = facility.visits.filter(visit => {

            return String(visit.id) !== String(visitId);

        });

        removed = visits.length !== facility.visits.length;
        facility.visits = visits;
        syncLatestVisitState(facility);

        return nextStatus;

    });

    if (typeof invalidateEmployeePerformanceCache === "function") {

        invalidateEmployeePerformanceCache();

    }

    console.warn("[VisitSync] rolled back visit after assignment failure", {
        facilityId: normalizedLicense,
        visitId,
        removed,
        statusAfter: getFacilityStatus(normalizedLicense).visitStatus
    });

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


async function mutateFacilityRecord(license, mutation) {

    const normalizedLicense = String(license);

    facilityStatus = await mutateCloudObject("facilityStatus", nextStatus => {

        const facility = nextStatus[normalizedLicense];

        if (!facility) return nextStatus;

        normalizeFacilityStatus(facility);
        mutation(facility);

        return nextStatus;

    });

    if (typeof invalidateEmployeePerformanceCache === "function") {

        invalidateEmployeePerformanceCache();

    }

    return facilityStatus[normalizedLicense] || null;

}


async function clearFacilityVisits(license) {

    if (typeof isAdminUser === "function" && !isAdminUser()) return;

    return mutateFacilityRecord(license, facility => {

        facility.visits = [];
        syncLatestVisitState(facility);

    });

}


async function resetAllVisits() {

    if (typeof isAdminUser === "function" && !isAdminUser()) return;

    facilityStatus = await mutateCloudObject("facilityStatus", nextStatus => {

        Object.values(nextStatus).forEach(status => {

            normalizeFacilityStatus(status);
            status.visits = [];
            syncLatestVisitState(status);

        });

        return nextStatus;

    });

    if (typeof invalidateEmployeePerformanceCache === "function") {

        invalidateEmployeePerformanceCache();

    }

    return facilityStatus;

}


// تحديث حالة الزيارة
async function setVisitStatus(license, status) {

    if (typeof isViewerUser === "function" && isViewerUser()) return;

    if (!["pending", "visited", "partial"].includes(status)) return;

    return mutateFacilityRecord(license, facility => {

        const latestVisit = getLatestVisit(facility);

        if (latestVisit) {

            latestVisit.visitStatus = status;
            syncLatestVisitState(facility);

        } else {

            facility.visitStatus = status;

        }

    });

}


// تحديث المخالفة
async function setViolation(license, value) {

    if (typeof isViewerUser === "function" && isViewerUser()) return;

    return mutateFacilityRecord(license, facility => {

        const latestVisit = getLatestVisit(facility);

        if (latestVisit) {

            latestVisit.violation = value;
            syncLatestVisitState(facility);

        } else {

            facility.violation = value;

        }

    });

}


// إسناد لجنة
async function assignCommittee(license, committeeName) {

    if (typeof isViewerUser === "function" && isViewerUser()) return;

    return mutateFacilityRecord(license, facility => {

        facility.assigned = true;
        facility.committee = committeeName;

    });

}


// إضافة ملاحظات
async function setNotes(license, notes) {

    if (typeof isViewerUser === "function" && isViewerUser()) return;

    return mutateFacilityRecord(license, facility => {

        const latestVisit = getLatestVisit(facility);

        if (latestVisit) {

            latestVisit.notes = notes;
            syncLatestVisitState(facility);

        } else {

            facility.notes = notes;

        }

    });

}
