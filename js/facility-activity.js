const facilityActivityStatuses = ["active", "cancelled"];


function normalizeFacilityActivityStatus(status) {

    return status === "cancelled" ? "cancelled" : "active";

}


function isFacilityActive(facility) {

    return Boolean(facility) &&
        normalizeFacilityActivityStatus(facility.activityStatus) === "active";

}


function buildFacilityActivityUpdate(
    facility,
    status,
    reason = "",
    actor = "",
    changedAt = new Date().toISOString()
) {

    const previousStatus = normalizeFacilityActivityStatus(
        facility && facility.activityStatus
    );
    const nextStatus = normalizeFacilityActivityStatus(status);
    const normalizedReason = String(reason || "").trim();
    const statusChanged = previousStatus !== nextStatus;
    const history = Array.isArray(facility && facility.activityHistory)
        ? [...facility.activityHistory]
        : [];

    if (nextStatus === "cancelled" && !normalizedReason) {

        throw new Error("سبب إلغاء النشاط مطلوب.");

    }

    if (statusChanged) {

        history.push({
            status: nextStatus,
            reason: nextStatus === "cancelled" ? normalizedReason : "",
            changedAt,
            changedBy: String(actor || "")
        });

    }

    if (nextStatus === "active") {

        return {
            activityStatus: "active",
            cancellationReason: "",
            cancelledAt: "",
            cancelledBy: "",
            activityHistory: history
        };

    }

    return {
        activityStatus: "cancelled",
        cancellationReason: normalizedReason,
        cancelledAt: statusChanged
            ? changedAt
            : String(facility && facility.cancelledAt || changedAt),
        cancelledBy: statusChanged
            ? String(actor || "")
            : String(facility && facility.cancelledBy || actor || ""),
        activityHistory: history
    };

}
