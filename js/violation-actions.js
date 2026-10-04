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


function getViolationRecords(
    facilities = null,
    dateFrom = "",
    dateTo = "",
    visitPredicate = null
) {

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
                    violationVisitMatchesDateRange(visit, dateFrom, dateTo) &&
                    (
                        typeof visitPredicate !== "function" ||
                        visitPredicate(visit)
                    );

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


function getViolationActionStats(
    facilities = null,
    dateFrom = "",
    dateTo = "",
    visitPredicate = null
) {

    const records = getViolationRecords(
        facilities,
        dateFrom,
        dateTo,
        visitPredicate
    );
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
    dateTo = "",
    visitPredicate = null
) {

    const status = typeof getFacilityStatus === "function"
        ? getFacilityStatus(license)
        : null;
    const visits = status && Array.isArray(status.visits)
        ? status.visits
        : [];

    return visits.some(visit => {

        return violationVisitMatchesActionFilter(visit, filter) &&
            violationVisitMatchesDateRange(visit, dateFrom, dateTo) &&
            (
                typeof visitPredicate !== "function" ||
                visitPredicate(visit)
            );

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

            // Recheck the fresh ledger so concurrent bulk requests cannot duplicate a correction.
            if (input.skipIfCorrected && record.actions.some(existing =>
                existing.type === "corrected" && String(existing.id) !== String(action.id)
            )) return nextLedger;

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
    if (input.skipIfCorrected && !normalizeViolationActionLedgerRecord(
        violationActionLedger[ledgerKey], normalizedFacilityLicense, normalizedVisitId
    ).actions.some(existing => String(existing.id) === String(action.id))) return null;

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

    initializeBulkCorrectionControls();

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

let bulkCorrectionRows = [];
let bulkCorrectionSelected = new Set();
let bulkCorrectionBusy = false;

function getBulkCorrectionCandidates(facilities, filters = {}, scope = null) {
    return getViolationRecords(facilities, filters.visitDateFrom || "", filters.visitDateTo || "",
        visit => (!scope || dashboardVisitMatchesCycleScope(visit, scope)) &&
            violationVisitMatchesActionFilter(visit, filters.violationAction || "all")
    ).filter(({ visit }) => getViolationActionState(visit) !== "corrected");
}

async function addBulkViolationCorrections(targets, input) {
    if (!isAdminUser()) throw new Error("Admin authorization is required.");
    if (!String(input.notes || "").trim()) throw new Error("Correction reason is required.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.effectiveDate || "")) ||
        isFutureVisitDate(input.effectiveDate)) throw new RangeError("Invalid or future dates are not allowed.");
    const result = { saved: [], skipped: [], failed: [] };
    const seen = new Set();
    for (const target of targets) {
        const key = getViolationActionLedgerKey(target.facilityLicense, target.visitId);
        if (seen.has(key)) continue;
        seen.add(key);
        try {
            const status = getFacilityStatus(String(target.facilityLicense));
            const visit = (status && status.visits || []).find(row => String(row.id) === String(target.visitId));
            if (!visit || !visitIndicatesViolation(visit)) throw new Error("Missing violating visit.");
            if (getViolationActionState(visit) === "corrected") {
                result.skipped.push(target);
                continue;
            }
            const action = await addViolationAction(target.facilityLicense, target.visitId, {
                type: "corrected", effectiveDate: input.effectiveDate, notes: input.notes,
                skipIfCorrected: true
            });
            (action ? result.saved : result.skipped).push(target);
        } catch (error) {
            result.failed.push(target);
        }
    }
    return result;
}

function renderBulkCorrectionRows() {
    const query = document.getElementById("bulkCorrectionSearch").value.trim();
    const normalize = value => typeof normalizeDistrictFilterValue === "function"
        ? normalizeDistrictFilterValue(value) : String(value || "").toLowerCase();
    const rows = bulkCorrectionRows.filter(row => normalize(row.search).includes(normalize(query)));
    document.getElementById("bulkCorrectionList").innerHTML = rows.map(row => `
        <label class="d-block border-bottom p-2">
            <input type="checkbox" data-bulk-correction-index="${row.index}"
                ${bulkCorrectionSelected.has(row.index) ? "checked" : ""}>
            ${escapeHtml(row.name)} — ${escapeHtml(row.facilityLicense)}
            <small class="d-block">${escapeHtml(row.district)} | زيارة ${escapeHtml(row.date)} | ${escapeHtml(row.state)}</small>
            <small class="d-block">${escapeHtml(row.details)}</small>
        </label>`).join("") || "لا توجد مخالفات مطابقة غير متلافاة.";
    document.getElementById("bulkCorrectionCount").textContent =
        `الزيارات المحددة: ${bulkCorrectionSelected.size} — النتائج الظاهرة: ${rows.length}`;
}

function openBulkCorrectionDialog() {
    if (!isAdminUser() || bulkCorrectionBusy) return;
    const facilities = typeof filteredFacilities !== "undefined" ? filteredFacilities : allFacilities;
    const filters = typeof activeFilters !== "undefined" ? activeFilters : {};
    const scope = typeof getSelectedDashboardCycleScope === "function" ? getSelectedDashboardCycleScope() : null;
    bulkCorrectionRows = getBulkCorrectionCandidates(facilities, filters, scope).map((record, index) => {
        const facility = facilities.find(row => String(row.license) === String(record.facilityLicense)) || {};
        const name = String(facility.name || record.facilityLicense);
        const district = String(facility.district || "");
        return {
            index, facilityLicense: record.facilityLicense, visitId: record.visit.id,
            name, district, search: `${name} ${record.facilityLicense} ${district}`,
            date: String(record.visit.date || record.visit.visitDate || "").slice(0, 10),
            state: getViolationActionStateDisplay(record.visit).label,
            details: String(record.visit.violationDetails || record.visit.notes || "")
        };
    });
    bulkCorrectionSelected.clear();
    document.getElementById("bulkCorrectionForm").reset();
    const date = document.getElementById("bulkCorrectionDate");
    date.value = date.max = getCurrentLocalDateValue();
    document.getElementById("bulkCorrectionMessage").textContent = "";
    renderBulkCorrectionRows();
    document.getElementById("bulkCorrectionDialog").showModal();
}

function initializeBulkCorrectionControls() {
    const dialog = document.getElementById("bulkCorrectionDialog");
    if (!dialog || dialog.dataset.initialized) return;
    dialog.dataset.initialized = "true";
    document.getElementById("openBulkCorrection").addEventListener("click", openBulkCorrectionDialog);
    document.getElementById("closeBulkCorrection").addEventListener("click", () => {
        if (!bulkCorrectionBusy) dialog.close();
    });
    dialog.addEventListener("cancel", event => { if (bulkCorrectionBusy) event.preventDefault(); });
    document.getElementById("bulkCorrectionSearch").addEventListener("input", renderBulkCorrectionRows);
    document.getElementById("bulkCorrectionList").addEventListener("change", event => {
        const index = Number(event.target.dataset.bulkCorrectionIndex);
        if (!Number.isInteger(index) || bulkCorrectionBusy) return;
        if (event.target.checked) bulkCorrectionSelected.add(index);
        else bulkCorrectionSelected.delete(index);
        renderBulkCorrectionRows();
    });
    document.getElementById("selectBulkCorrectionVisible").addEventListener("click", () => {
        dialog.querySelectorAll("[data-bulk-correction-index]").forEach(box => {
            bulkCorrectionSelected.add(Number(box.dataset.bulkCorrectionIndex));
        });
        renderBulkCorrectionRows();
    });
    document.getElementById("clearBulkCorrectionSelection").addEventListener("click", () => {
        bulkCorrectionSelected.clear(); renderBulkCorrectionRows();
    });
    document.getElementById("bulkCorrectionForm").addEventListener("submit", async event => {
        event.preventDefault();
        if (!isAdminUser() || bulkCorrectionBusy) return;
        const message = document.getElementById("bulkCorrectionMessage");
        const targets = bulkCorrectionRows.filter(row => bulkCorrectionSelected.has(row.index));
        if (!targets.length) { message.textContent = "حدد زيارة مخالفة واحدة على الأقل."; return; }
        const input = {
            notes: document.getElementById("bulkCorrectionReason").value.trim(),
            effectiveDate: document.getElementById("bulkCorrectionDate").value
        };
        if (!input.notes) { message.textContent = "سبب التلافي إلزامي."; return; }
        bulkCorrectionBusy = true;
        const controls = [...dialog.querySelectorAll("input, textarea, button")];
        controls.forEach(control => { control.disabled = true; });
        message.textContent = `جاري حفظ التلافي لـ ${targets.length} زيارة...`;
        try {
            const result = await addBulkViolationCorrections(targets, input);
            for (const target of [...result.saved, ...result.skipped]) bulkCorrectionSelected.delete(target.index);
            const done = new Set([...result.saved, ...result.skipped].map(row => row.index));
            bulkCorrectionRows = bulkCorrectionRows.filter(row => !done.has(row.index));
            renderBulkCorrectionRows();
            message.textContent = `تم حفظ ${result.saved.length} زيارة، ومتلافاة مسبقًا ${result.skipped.length}، وتعذر حفظ ${result.failed.length}.` +
                (result.failed.length ? " بقيت الزيارات المتعذرة محددة لإعادة المحاولة." : "");
            if (typeof updateDashboard === "function") updateDashboard(allFacilities);
            if (typeof applyFilters === "function") applyFilters();
        } catch (error) {
            message.textContent = "تعذر الحفظ. تحقق من تاريخ التلافي والاتصال ثم أعد المحاولة.";
        } finally {
            bulkCorrectionBusy = false;
            controls.forEach(control => { control.disabled = false; });
        }
    });
}
