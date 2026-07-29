// ========================================
// Violation Follow-up Actions
// ========================================

const violationActionTypes = ["follow_up", "referred", "corrected"];
let activeViolationActionContext = null;


function visitIndicatesViolation(visit) {

    return Boolean(
        visit &&
        (visit.violation === true ||
            visit.result === "violation" ||
            visit.visitStatus === "violation")
    );

}


function getViolationActions(visit) {

    if (!visit || !Array.isArray(visit.violationActions)) return [];

    return [...visit.violationActions]
        .map(normalizeViolationActionRecord)
        .sort((first, second) => {

            const effectiveDateCompare = new Date(
                second.effectiveDate || 0
            ) - new Date(first.effectiveDate || 0);

            if (effectiveDateCompare !== 0) return effectiveDateCompare;

            return new Date(second.createdAt || 0) -
                new Date(first.createdAt || 0);

        });

}


function getViolationActionState(visit) {

    const actions = getViolationActions(visit);
    const corrected = actions.some(action => action.type === "corrected");
    const referred = actions.some(action => action.type === "referred");

    if (corrected) return "corrected";
    if (referred) return "referred";

    return "follow_up";

}


function getViolationActionStateDisplay(visit) {

    const state = getViolationActionState(visit);

    if (state === "corrected") {

        return {
            label: "تم تلافي الملاحظة",
            badge: "success",
            icon: "fa-circle-check"
        };

    }

    if (state === "referred") {

        return {
            label: "أُحيلت للجنة المخالفات",
            badge: "primary",
            icon: "fa-share-from-square"
        };

    }

    return {
        label: "قيد المتابعة",
        badge: "warning",
        icon: "fa-clock"
    };

}


function getViolationActionTypeLabel(type) {

    if (type === "referred") return "إحالة للجنة المخالفات";
    if (type === "corrected") return "تم تلافي الملاحظة";

    return "متابعة";

}


function canViewViolationActions() {

    return Boolean(
        (typeof isAdminUser === "function" && isAdminUser()) ||
        (typeof isViewerUser === "function" && isViewerUser())
    );

}


function getViolationRecords() {

    return Object.entries(facilityStatus || {}).flatMap(
        ([facilityLicense, status]) => {

            const visits = status && Array.isArray(status.visits)
                ? status.visits
                : [];

            return visits.filter(visitIndicatesViolation).map(visit => ({
                facilityLicense,
                visit
            }));

        }
    );

}


function getViolationActionStats() {

    const records = getViolationRecords();
    const referred = records.filter(({ visit }) => {

        return getViolationActions(visit).some(action => action.type === "referred");

    });
    const corrected = records.filter(({ visit }) => {

        return getViolationActions(visit).some(action => action.type === "corrected");

    });
    const underFollowUp = records.filter(({ visit }) => {

        return getViolationActionState(visit) === "follow_up";

    });
    const resolutionDays = corrected.map(({ visit }) => {

        const correction = getViolationActions(visit)
            .filter(action => action.type === "corrected")
            .sort((first, second) => {

                return new Date(first.effectiveDate || first.createdAt || 0) -
                    new Date(second.effectiveDate || second.createdAt || 0);

            })[0];
        const visitDate = new Date(visit.date || visit.createdAt || 0);
        const correctionDate = new Date(
            correction.effectiveDate || correction.createdAt || 0
        );
        const elapsed = Math.ceil(
            (correctionDate - visitDate) / (1000 * 60 * 60 * 24)
        );

        return Number.isFinite(elapsed) ? Math.max(0, elapsed) : null;

    }).filter(days => days !== null);

    return {
        total: records.length,
        underFollowUp: underFollowUp.length,
        referred: referred.length,
        corrected: corrected.length,
        resolutionRate: records.length > 0
            ? Math.round((corrected.length / records.length) * 100)
            : 0,
        averageResolutionDays: resolutionDays.length > 0
            ? Math.round(
                resolutionDays.reduce((sum, days) => sum + days, 0) /
                resolutionDays.length
            )
            : 0
    };

}


async function addViolationAction(facilityLicense, visitId, input) {

    if (typeof isAdminUser !== "function" || !isAdminUser()) {

        throw new Error("Admin authorization is required.");

    }

    const type = String(input && input.type || "");
    const effectiveDate = String(
        input && input.effectiveDate || getCurrentLocalDateValue()
    ).slice(0, 10);
    const transactionNumber = String(
        input && input.transactionNumber || ""
    ).trim();
    const destination = String(input && input.destination || "").trim();
    const notes = String(input && input.notes || "").trim();

    if (!violationActionTypes.includes(type)) {

        throw new Error("Invalid violation action type.");

    }

    if (isFutureVisitDate(effectiveDate)) {

        throw new RangeError("Future violation action dates are not allowed.");

    }

    if (type === "referred" && !transactionNumber) {

        throw new Error("A transaction number is required for referral.");

    }

    if (type === "follow_up" && !notes) {

        throw new Error("Follow-up notes are required.");

    }

    const action = normalizeViolationActionRecord({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type,
        effectiveDate,
        transactionNumber: type === "referred" ? transactionNumber : "",
        destination: type === "referred"
            ? destination || "لجنة المخالفات"
            : "",
        notes,
        createdBy: currentUser.username,
        createdAt: new Date().toISOString()
    });
    await mutateFacilityRecord(facilityLicense, facility => {

        const visit = facility.visits.find(candidate => {

            return String(candidate.id) === String(visitId);

        });

        if (!visit || !visitIndicatesViolation(visit)) {

            throw new Error("The violating visit could not be found.");

        }

        visit.violationActions = Array.isArray(visit.violationActions)
            ? visit.violationActions
            : [];

        if (!visit.violationActions.some(existing => {

            return String(existing.id) === String(action.id);

        })) {

            visit.violationActions.push(action);

        }

    });

    return action;

}


function getViolationActionActorLabel(action) {

    const user = typeof users !== "undefined" && users
        ? users[action.createdBy]
        : null;

    return user && (user.displayName || user.username) ||
        action.createdBy ||
        "مدير النظام";

}


function renderViolationActionTimeline(visit) {

    if (!canViewViolationActions() || !visitIndicatesViolation(visit)) return "";

    const display = getViolationActionStateDisplay(visit);
    const actions = getViolationActions(visit);

    return `
        <section class="violation-follow-up mt-2"
                 aria-label="متابعة إجراء المخالفة">
            <div class="violation-follow-up-heading">
                <strong>إجراء المخالفة</strong>
                <span class="badge bg-${display.badge}">
                    <i class="fa-solid ${display.icon}"></i>
                    ${display.label}
                </span>
            </div>
            ${actions.length > 0 ? `
                <ol class="violation-action-timeline">
                    ${actions.map(action => `
                        <li>
                            <div>
                                <strong>${getViolationActionTypeLabel(action.type)}</strong>
                                <span>${escapeHtml(action.effectiveDate || "")}</span>
                            </div>
                            ${action.type === "referred" ? `
                                <small>
                                    المعاملة: ${escapeHtml(action.transactionNumber)}
                                    — ${escapeHtml(action.destination || "لجنة المخالفات")}
                                </small>
                            ` : ""}
                            ${action.notes ? `
                                <small>${escapeHtml(action.notes)}</small>
                            ` : ""}
                            <small class="text-muted">
                                بواسطة ${escapeHtml(getViolationActionActorLabel(action))}
                            </small>
                        </li>
                    `).join("")}
                </ol>
            ` : `
                <p class="text-muted small mb-2">
                    لم يُسجل إجراء إداري على المخالفة حتى الآن.
                </p>
            `}
            ${typeof isAdminUser === "function" && isAdminUser() ? `
                <button type="button"
                        class="btn btn-outline-primary btn-sm violation-action-button"
                        data-facility-license="${escapeHtml(visit.facilityLicense || "")}"
                        data-visit-id="${escapeHtml(visit.id)}">
                    تحديث إجراء المخالفة
                </button>
            ` : ""}
        </section>
    `;

}


function updateViolationActionFormVisibility() {

    const type = document.getElementById("violationActionType");
    const referralFields = document.getElementById(
        "violationReferralFields"
    );
    const notes = document.getElementById("violationActionNotes");
    const notesRequiredHint = document.getElementById(
        "violationNotesRequiredHint"
    );

    if (!type || !referralFields || !notes) return;

    const isReferral = type.value === "referred";
    const isFollowUp = type.value === "follow_up";

    referralFields.classList.toggle("d-none", !isReferral);
    notes.required = isFollowUp;

    if (notesRequiredHint) {

        notesRequiredHint.classList.toggle("d-none", !isFollowUp);

    }

}


function openViolationActionDialog(facilityLicense, visitId) {

    if (!isAdminUser()) return;

    const dialog = document.getElementById("violationActionDialog");
    const form = document.getElementById("violationActionForm");
    const dateInput = document.getElementById("violationActionDate");
    const destination = document.getElementById("violationDestination");
    const message = document.getElementById("violationActionMessage");

    if (!dialog || !form) return;

    activeViolationActionContext = {
        facilityLicense: String(facilityLicense),
        visitId: String(visitId)
    };
    form.reset();
    dateInput.value = getCurrentLocalDateValue();
    dateInput.max = getCurrentLocalDateValue();
    destination.value = "لجنة المخالفات";
    message.textContent = "";
    message.className = "small d-none";
    updateViolationActionFormVisibility();
    dialog.showModal();

}


async function saveViolationActionFromDialog(event) {

    event.preventDefault();

    if (!activeViolationActionContext || !isAdminUser()) return;

    const dialog = document.getElementById("violationActionDialog");
    const saveButton = document.getElementById("saveViolationAction");
    const message = document.getElementById("violationActionMessage");
    const type = document.getElementById("violationActionType").value;
    const input = {
        type,
        effectiveDate: document.getElementById("violationActionDate").value,
        transactionNumber: document.getElementById(
            "violationTransactionNumber"
        ).value,
        destination: document.getElementById("violationDestination").value,
        notes: document.getElementById("violationActionNotes").value
    };

    saveButton.disabled = true;
    message.textContent = "جاري حفظ الإجراء ومزامنته...";
    message.className = "small text-muted";

    try {

        await addViolationAction(
            activeViolationActionContext.facilityLicense,
            activeViolationActionContext.visitId,
            input
        );

        const facility = typeof findFacilityByOriginalLicense === "function"
            ? findFacilityByOriginalLicense(
                activeViolationActionContext.facilityLicense
            )
            : null;

        dialog.close();
        activeViolationActionContext = null;

        if (typeof updateDashboard === "function") {

            updateDashboard(allFacilities);

        }

        if (facility && typeof showFacilityDetails === "function") {

            showFacilityDetails(facility);

        }

    } catch (error) {

        message.textContent = error instanceof RangeError
            ? "لا يمكن تسجيل إجراء بتاريخ مستقبلي."
            : type === "referred" && !input.transactionNumber.trim()
                ? "رقم المعاملة إلزامي عند إحالة المخالفة."
                : type === "follow_up" && !input.notes.trim()
                    ? "اكتب ملخص إجراء المتابعة."
                    : "تعذر حفظ الإجراء بسبب مشكلة مزامنة. لم يُعرض كعملية ناجحة.";
        message.className = "small text-danger";

    } finally {

        saveButton.disabled = false;

    }

}


function initializeViolationActionControls() {

    const dialog = document.getElementById("violationActionDialog");
    const form = document.getElementById("violationActionForm");
    const type = document.getElementById("violationActionType");
    const closeButton = document.getElementById("closeViolationActionDialog");

    if (!dialog || !form || !type || dialog.dataset.initialized === "true") {

        return;

    }

    dialog.dataset.initialized = "true";

    document.addEventListener("click", event => {

        const button = event.target.closest(".violation-action-button");

        if (!button) return;

        openViolationActionDialog(
            button.dataset.facilityLicense,
            button.dataset.visitId
        );

    });
    type.addEventListener("change", updateViolationActionFormVisibility);
    form.addEventListener("submit", saveViolationActionFromDialog);
    closeButton.addEventListener("click", () => {

        activeViolationActionContext = null;
        dialog.close();

    });
    dialog.addEventListener("cancel", () => {

        activeViolationActionContext = null;

    });

}
