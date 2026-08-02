// ========================================
// Violation Report Export
// ========================================

const VIOLATION_REPORT_SHEET_NAME = "تقرير المخالفات";


function getViolationReportVisitDate(visit) {

    if (typeof getNormalizedVisitDate === "function") {

        return getNormalizedVisitDate(
            visit && (
                visit.date ||
                visit.visitDate ||
                visit.completedAt ||
                visit.createdAt
            )
        );

    }

    return String(visit && (visit.date || visit.visitDate) || "").slice(0, 10);

}


function getViolationReportCommitteeName(visit) {

    if (visit && visit.committeeName) return String(visit.committeeName);

    const username = String(visit && visit.committeeUsername || "");
    const committee = typeof users !== "undefined" && users
        ? users[username]
        : null;

    return String(
        committee && (
            committee.committeeName ||
            committee.displayName ||
            committee.username
        ) ||
        username
    );

}


function getViolationReportVisitType(visit) {

    if (visit && visit.visitType === "reactive") return "تفاعلية";
    if (visit && visit.visitType === "campaign") return "حملة";

    return "دورية";

}


function getViolationReportActionDetails(visit) {

    const actions = typeof getViolationActions === "function"
        ? getViolationActions(visit)
        : [];
    const latestAction = actions[0] || {};
    const referralAction = actions.find(action => action.type === "referred") || {};
    const stateDisplay = typeof getViolationActionStateDisplay === "function"
        ? getViolationActionStateDisplay(visit)
        : { label: "قيد المتابعة" };

    return {
        status: stateDisplay.label || "قيد المتابعة",
        transactionNumber: String(
            referralAction.transactionNumber ||
            visit.transactionNumber ||
            ""
        ),
        destination: String(referralAction.destination || ""),
        latestActionDate: String(latestAction.effectiveDate || ""),
        latestActionNotes: String(latestAction.notes || "")
    };

}


function collectViolationReportRows(
    facilities = typeof filteredFacilities !== "undefined"
        ? filteredFacilities
        : [],
    filters = typeof activeFilters !== "undefined" ? activeFilters : {}
) {

    const dateFrom = typeof getNormalizedVisitDate === "function"
        ? getNormalizedVisitDate(filters.visitDateFrom)
        : String(filters.visitDateFrom || "");
    const dateTo = typeof getNormalizedVisitDate === "function"
        ? getNormalizedVisitDate(filters.visitDateTo)
        : String(filters.visitDateTo || "");
    const actionFilter = String(filters.violationAction || "all");
    const rows = [];

    (Array.isArray(facilities) ? facilities : []).forEach(facility => {

        const visits = typeof getFacilityVisits === "function"
            ? getFacilityVisits(facility.license)
            : [];

        visits.forEach(visit => {

            const isViolation = typeof visitIndicatesViolation === "function"
                ? visitIndicatesViolation(visit)
                : Boolean(visit && (
                    visit.violation === true ||
                    visit.result === "violation" ||
                    visit.visitStatus === "violation"
                ));

            if (!isViolation) return;

            const visitDate = getViolationReportVisitDate(visit);

            if (dateFrom && (!visitDate || visitDate < dateFrom)) return;
            if (dateTo && (!visitDate || visitDate > dateTo)) return;

            if (
                actionFilter !== "all" &&
                typeof violationVisitMatchesActionFilter === "function" &&
                !violationVisitMatchesActionFilter(visit, actionFilter)
            ) return;

            const action = getViolationReportActionDetails(visit);

            rows.push({
                "م": 0,
                "اسم المنشأة": String(facility.name || ""),
                "رقم الترخيص": String(
                    facility.displayLicense ||
                    facility.updatedLicense ||
                    facility.license ||
                    ""
                ),
                "نوع المنشأة": String(facility.type || ""),
                "الحي": String(facility.district || ""),
                "تاريخ الزيارة": visitDate,
                "نوع الزيارة": getViolationReportVisitType(visit),
                "سبب الزيارة": String(visit.visitReason || "الخطة الدورية"),
                "اللجنة": getViolationReportCommitteeName(visit),
                "تفاصيل المخالفة": String(
                    visit.violationDetails ||
                    visit.notes ||
                    ""
                ),
                "حالة الإجراء": action.status,
                "رقم المعاملة": action.transactionNumber,
                "الجهة المحال إليها": action.destination,
                "تاريخ آخر إجراء": action.latestActionDate,
                "ملاحظات الإجراء": action.latestActionNotes
            });

        });

    });

    return rows
        .sort((first, second) => {

            const dateCompare = String(second["تاريخ الزيارة"])
                .localeCompare(String(first["تاريخ الزيارة"]));

            if (dateCompare !== 0) return dateCompare;

            return String(first["اسم المنشأة"])
                .localeCompare(String(second["اسم المنشأة"]), "ar");

        })
        .map((row, index) => ({ ...row, "م": index + 1 }));

}


function buildViolationReportWorkbook(rows) {

    if (!window.XLSX) {

        throw new Error("XLSX library is unavailable.");

    }

    const workbook = window.XLSX.utils.book_new();
    const worksheet = window.XLSX.utils.json_to_sheet(rows);

    worksheet["!cols"] = [
        { wch: 6 },
        { wch: 32 },
        { wch: 20 },
        { wch: 24 },
        { wch: 18 },
        { wch: 15 },
        { wch: 14 },
        { wch: 22 },
        { wch: 26 },
        { wch: 45 },
        { wch: 24 },
        { wch: 22 },
        { wch: 24 },
        { wch: 18 },
        { wch: 45 }
    ];
    worksheet["!autofilter"] = {
        ref: worksheet["!ref"] || "A1:O1"
    };
    workbook.Workbook = {
        Views: [{ RTL: true }]
    };

    window.XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        VIOLATION_REPORT_SHEET_NAME
    );

    return workbook;

}


function setViolationReportExportMessage(text, type = "muted") {

    const message = document.getElementById("violationReportExportMessage");

    if (!message) return;

    message.textContent = text;
    message.className = `text-${type}`;

}


function getViolationReportFileName(filters = {}) {

    const dateFrom = String(filters.visitDateFrom || "");
    const dateTo = String(filters.visitDateTo || "");
    const today = typeof getCurrentLocalDateValue === "function"
        ? getCurrentLocalDateValue()
        : new Date().toISOString().slice(0, 10);
    const rangeLabel = dateFrom || dateTo
        ? ` - ${dateFrom || "البداية"} إلى ${dateTo || "اليوم"}`
        : ` - ${today}`;

    return `تقرير المخالفات${rangeLabel}.xlsx`;

}


function exportViolationReport() {

    const canExport =
        (typeof isAdminUser === "function" && isAdminUser()) ||
        (typeof isViewerUser === "function" && isViewerUser());

    if (!canExport) return;

    if (!window.XLSX) {

        setViolationReportExportMessage(
            "مكتبة تصدير Excel غير متاحة.",
            "danger"
        );
        return;

    }

    const rows = collectViolationReportRows(filteredFacilities, activeFilters);

    if (rows.length === 0) {

        setViolationReportExportMessage(
            "لا توجد مخالفات مطابقة للفلاتر الحالية.",
            "warning"
        );
        return;

    }

    const workbook = buildViolationReportWorkbook(rows);

    window.XLSX.writeFile(
        workbook,
        getViolationReportFileName(activeFilters)
    );
    setViolationReportExportMessage(
        `تم تصدير ${rows.length} مخالفة وفق الفلاتر الحالية.`,
        "success"
    );

}


function initializeViolationReportExport() {

    const button = document.getElementById("exportViolationReport");
    const canExport =
        (typeof isAdminUser === "function" && isAdminUser()) ||
        (typeof isViewerUser === "function" && isViewerUser());

    if (
        !button ||
        !canExport ||
        button.dataset.exportInitialized === "true"
    ) return;

    button.dataset.exportInitialized = "true";
    button.addEventListener("click", exportViolationReport);

}
