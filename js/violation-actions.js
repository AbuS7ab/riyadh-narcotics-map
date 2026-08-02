// ========================================
// Violation Follow-up Actions
// ========================================

const violationActionTypes = ["follow_up", "referred", "corrected"];
let activeViolationActionContext = null;
let violationActionLedger = {};


function getViolationActionLedgerKey(facilityLicense, visitId) {

    return `${String(facilityLicense)}::${String(visitId)}`;

}


function normalizeViolationActionLedgerRecord(record, facilityLicense, visitId) {

    return {
        facilityLicense: String(
            record && record.facilityLicense || facilityLicense || ""
        ),
        visitId: String(record && record.visitId || visitId || ""),
        actions: Array.isArray(record && record.actions)
            ? record.actions.map(normalizeViolationActionRecord)
            : []
    };

}


function mergeViolationActionLedgerIntoFacilityStatus() {

    Object.entries(violationActionLedger || {}).forEach(([key, record]) => {

        const separatorIndex = key.indexOf("::");
        const fallbackLicense = separatorIndex >= 0
            ? key.slice(0, separatorIndex)
            : "";
        const fallbackVisitId = separatorIndex >= 0
            ? key.slice(separatorIndex + 2)
            : "";
        const normalized = normalizeViolationActionLedgerRecord(
            record,
            fallbackLicense,
            fallbackVisitId
        );
        const status = facilityStatus[normalized.facilityLicense];
        const visit = status && Array.isArray(status.visits)
            ? status.visits.find(candidate => {

                return String(candidate.id) === normalized.visitId;

            })
            : null;

        if (!visit) return;

        const actionsById = new Map(
            (Array.isArray(visit.violationActions)
                ? visit.violationActions
                : []
            ).map(action => [String(action.id), action])
        );

        normalized.actions.forEach(action => {

            actionsById.set(String(action.id), action);

        });

        visit.violationActions = [...actionsById.values()]
            .map(normalizeViolationActionRecord);

    });

}


async function migrateEmbeddedViolationActionsToLedger() {

    if (typeof isAdminUser !== "function" || !isAdminUser()) return;

    const embeddedRecords = [];

    Object.entries(facilityStatus || {}).forEach(([facilityLicense, status]) => {

        const visits = status && Array.isArray(status.visits)
            ? status.visits
            : [];

        visits.forEach(visit => {

            if (!Array.isArray(visit.violationActions) ||
                visit.violationActions.length === 0) return;

            embeddedRecords.push({ facilityLicense, visit });

        });

    });

    if (embeddedRecords.length === 0) return;

    const hasUnprotectedActions = embeddedRecords.some(({
        facilityLicense,
        visit
    }) => {

        const key = getViolationActionLedgerKey(facilityLicense, visit.id);
        const protectedIds = new Set(
            normalizeViolationActionLedgerRecord(
                violationActionLedger[key],
                facilityLicense,
                visit.id
            ).actions.map(action => String(action.id))
        );

        return visit.violationActions.some(action => {

            return !protectedIds.has(String(action.id));

        });

    });

    if (!hasUnprotectedActions) return;

    violationActionLedger = await mutateCloudObject(
        "violationActionLedger",
        nextLedger => {

            embeddedRecords.forEach(({ facilityLicense, visit }) => {

                const key = getViolationActionLedgerKey(
                    facilityLicense,
                    visit.id
                );
                const record = normalizeViolationActionLedgerRecord(
                    nextLedger[key],
                    facilityLicense,
                    visit.id
                );
                const actionsById = new Map(
                    record.actions.map(action => [String(action.id), action])
                );

                visit.violationActions.forEach(action => {

                    const normalized = normalizeViolationActionRecord(action);

                    actionsById.set(String(normalized.id), normalized);

                });

                record.actions = [...actionsById.values()];
                nextLedger[key] = record;

            });

            return nextLedger;

        }
    );

}


async function initializeViolationActionState() {

    violationActionLedger = loadViolationActionLedger();
    mergeViolationActionLedgerIntoFacilityStatus();
    await migrateEmbeddedViolationActionsToLedger();
    mergeViolationActionLedgerIntoFacilityStatus();

}


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


function violationVisitMatchesDateRange(visit, dateFrom = "", dateTo = "") {

    if (!dateFrom && !dateTo) return true;

    return typeof visitMatchesDateRange === "function" &&
        visitMatchesDateRange(visit, dateFrom, dateTo);

}


function getViolationRecords(facilities = null, dateFrom = "", dateTo = "") {

    const visibleLicenses = Array.isArray(facilities)
        ? new Set(facilities.map(facility => String(facility.license)))
        : null;

    return Object.entries(facilityStatus || {}).flatMap(
        ([facilityLicense, status]) => {

            if (
                visibleLicenses &&
                !visibleLicenses.has(String(facilityLicense))
            ) {

                return [];

            }

            const visits = status && Array.isArray(status.visits)
                ? status.visits
                : [];

            return visits.filter(visit => {

                return visitIndicatesViolation(visit) &&
                    violationVisitMatchesDateRange(visit, dateFrom, dateTo);

            }).map(visit => ({ facilityLicense, visit }));

        }
    );

}


function facilityHasViolationRecord(
    facilityLicense,
    dateFrom = "",
    dateTo = ""
) {

    const normalizedLicense = String(facilityLicense || "");
    const status = facilityStatus && facilityStatus[normalizedLicense];
    const visits = status && Array.isArray(status.visits)
        ? status.visits
        : [];

    return visits.some(visit => {

        return visitIndicatesViolation(visit) &&
            violationVisitMatchesDateRange(visit, dateFrom, dateTo);

    });

}


function getViolationActionStats(facilities = null, dateFrom = "", dateTo = "") {

    const records = getViolationRecords(facilities, dateFrom, dateTo);
    const referred = records.filter(({ visit }) => {

        return getViolationActions(visit).some(action => action.type === "referred");

    });
    const corrected = records.filter(({ visit }) => {

        return getViolationActions(visit).some(action => action.type === "corrected");

    });
    const underFollowUp = records.filter(({ visit }) => {

        return getViolationActionState(visit) === "follow_up";

    });
    return {
        total: records.length,
        underFollowUp: underFollowUp.length,
        referred: referred.length,
        corrected: corrected.length,
        resolutionRate: records.length > 0
            ? Math.round((corrected.length / records.length) * 100)
            : 0
    };

}


function violationVisitMatchesActionFilter(visit, filter) {

    if (!visitIndicatesViolation(visit)) return false;

    if (filter === "follow_up") {

        return getViolationActionState(visit) === "follow_up";

    }

    if (filter === "referred" || filter === "corrected") {

        return getViolationActions(visit).some(action => {

            return action.type === filter;

        });

    }

    return true;

}


function facilityMatchesViolationActionFilter(
    license,
    filter,
    dateFrom = "",
    dateTo = ""
) {

    const status = typeof getFacilityStatus === "function"
        ? getFacilityStatus(license)
        : null;
    const visits = status && Array.isArray(status.visits)
        ? status.visits
        : [];

    return visits.some(visit => {

        return violationVisitMatchesActionFilter(visit, filter) &&
            violationVisitMatchesDateRange(visit, dateFrom, dateTo);

    });

}


function getViolationActionNotesLabel(type) {

    if (type === "corrected") return "سبب التلافي";
    if (type === "referred") return "ملاحظات الإحالة";

    return "ملخص المتابعة";

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

    if (["follow_up", "corrected"].includes(type) && !notes) {

        throw new Error(
            type === "corrected"
                ? "Correction reason is required."
                : "Follow-up notes are required."
        );

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
    const normalizedFacilityLicense = String(facilityLicense);
    const normalizedVisitId = String(visitId);
    const currentStatus = getFacilityStatus(normalizedFacilityLicense);
    const currentVisit = currentStatus && Array.isArray(currentStatus.visits)
        ? currentStatus.visits.find(candidate => {

            return String(candidate.id) === normalizedVisitId;

        })
        : null;

    if (!currentVisit || !visitIndicatesViolation(currentVisit)) {

        throw new Error("The violating visit could not be found.");

    }

    const ledgerKey = getViolationActionLedgerKey(
        normalizedFacilityLicense,
        normalizedVisitId
    );

    violationActionLedger = await mutateCloudObject(
        "violationActionLedger",
        nextLedger => {

            const record = normalizeViolationActionLedgerRecord(
                nextLedger[ledgerKey],
                normalizedFacilityLicense,
                normalizedVisitId
            );

            if (!record.actions.some(existing => {

                return String(existing.id) === String(action.id);

            })) {

                record.actions.push(action);

            }

            nextLedger[ledgerKey] = record;

            return nextLedger;

        }
    );

    mergeViolationActionLedgerIntoFacilityStatus();

    try {

        await mutateFacilityRecord(normalizedFacilityLicense, facility => {

            const visit = facility.visits.find(candidate => {

                return String(candidate.id) === normalizedVisitId;

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

    } catch (error) {

        console.warn(
            "[ViolationAction] action is safe in the durable ledger; " +
            "the legacy visit mirror could not be updated.",
            error
        );

    }

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


function renderViolationActionTimeline(visit, facilityLicense = "") {

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
                            ${action.notes || action.type === "corrected" ? `
                                <small class="violation-action-notes">
                                    <strong>${getViolationActionNotesLabel(action.type)}:</strong>
                                    ${escapeHtml(action.notes || "لم يُسجل")}
                                </small>
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
                        data-facility-license="${escapeHtml(
                            visit.facilityLicense || facilityLicense
                        )}"
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
    const notesLabelText = document.getElementById(
        "violationActionNotesLabelText"
    );

    if (!type || !referralFields || !notes) return;

    const isReferral = type.value === "referred";
    const notesRequired = ["follow_up", "corrected"].includes(type.value);

    referralFields.classList.toggle("d-none", !isReferral);
    notes.required = notesRequired;
    notes.placeholder = type.value === "corrected"
        ? "اكتب سبب التلافي وما تم تصحيحه"
        : type.value === "referred"
            ? "أضف ملاحظة على الإحالة عند الحاجة"
            : "اكتب إجراء المتابعة باختصار";

    if (notesRequiredHint) {

        notesRequiredHint.classList.toggle("d-none", !notesRequired);

    }

    if (notesLabelText) {

        notesLabelText.textContent =
            getViolationActionNotesLabel(type.value);

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
                : type === "corrected" && !input.notes.trim()
                    ? "سبب التلافي إلزامي عند تسجيل معالجة المخالفة."
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
