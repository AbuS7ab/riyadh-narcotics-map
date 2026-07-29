const MODEL_B_TEMPLATE_PATH = "assets/model-b-template.xlsx";
const MODEL_B_SHEET_NAME = "نموذج ب";
const MODEL_B_WORKSHEET_PATH = "xl/worksheets/sheet1.xml";
const MODEL_B_FIRST_DATA_ROW = 3;
const MODEL_B_COLUMN_COUNT = 14;
const MODEL_B_MAX_DATA_ROWS = 3340;


function getModelBVisitType(value) {

    if (value === "reactive") return "تفاعلية";
    if (value === "campaign") return "حملة";

    return "اعتيادية";

}


function getModelBEmployeeName(employeeId) {

    if (!employeeId || typeof getEmployeeName !== "function") return "";

    return String(getEmployeeName(employeeId) || "").trim();

}


function getModelBVisitParticipants(visit = {}) {

    const teamSnapshot = visit.teamSnapshot && typeof visit.teamSnapshot === "object"
        ? visit.teamSnapshot
        : {};
    const employeeSnapshot = visit.employeeSnapshot &&
        typeof visit.employeeSnapshot === "object"
        ? visit.employeeSnapshot
        : {};
    const leaderId = String(
        teamSnapshot.leaderId ||
        employeeSnapshot.leaderId ||
        ""
    );
    const memberIds = [
        ...(Array.isArray(teamSnapshot.memberIds) ? teamSnapshot.memberIds : []),
        ...(Array.isArray(employeeSnapshot.memberIds) ? employeeSnapshot.memberIds : []),
        ...(Array.isArray(employeeSnapshot.employeeIds) ? employeeSnapshot.employeeIds : []),
        ...(Array.isArray(visit.participantIds) ? visit.participantIds : [])
    ].map(String).filter(Boolean);
    let leader = String(teamSnapshot.leader || "").trim() ||
        getModelBEmployeeName(leaderId);
    const memberNames = [
        ...(Array.isArray(teamSnapshot.members) ? teamSnapshot.members : []),
        ...(Array.isArray(visit.participants) ? visit.participants : []),
        ...memberIds
            .filter(employeeId => employeeId !== leaderId)
            .map(getModelBEmployeeName)
    ].map(value => String(value || "").trim()).filter(Boolean);
    const uniqueMembers = [...new Set(memberNames)]
        .filter(name => name !== leader);

    if (!leader && uniqueMembers.length > 0) {

        leader = uniqueMembers.shift();

    }

    return {
        leader,
        members: uniqueMembers.join("، ")
    };

}


function getModelBVisitDate(value) {

    const normalizedDate = typeof getNormalizedVisitDate === "function"
        ? getNormalizedVisitDate(value)
        : String(value || "").slice(0, 10);
    const match = normalizedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!match) return null;

    return new Date(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        12
    );

}


function getModelBExternalFacility(visit = {}) {

    const snapshot = visit.facilitySnapshot &&
        typeof visit.facilitySnapshot === "object"
        ? visit.facilitySnapshot
        : {};

    return {
        name: visit.facilityName || snapshot.name || "",
        type: visit.facilityType || snapshot.type || "",
        license: visit.license || snapshot.license || "",
        displayLicense: visit.displayLicense || snapshot.displayLicense ||
            visit.license || snapshot.license || "",
        city: visit.city || snapshot.city || "الرياض"
    };

}


function isModelBExternalVisitExportable(visit) {

    if (!visit || visit.isExternal === false) return false;

    return visit.missionStatus !== "ملغاة" &&
        visit.status !== "cancelled";

}


function collectModelBVisitRows(
    facilities,
    dateFrom,
    dateTo,
    externalVisitRecords = typeof externalVisits === "undefined"
        ? {}
        : externalVisits
) {

    const rows = [];

    (Array.isArray(facilities) ? facilities : []).forEach(facility => {

        const visits = typeof getFacilityVisits === "function"
            ? getFacilityVisits(facility.license)
            : [];

        visits.forEach(visit => {

            if (
                typeof visitMatchesDateRange === "function" &&
                !visitMatchesDateRange(visit, dateFrom, dateTo)
            ) return;

            const visitDateValue =
                visit.date ||
                visit.visitDate ||
                visit.completedAt ||
                visit.createdAt;
            const visitDate = getModelBVisitDate(visitDateValue);

            if (!visitDate) return;

            rows.push({
                facility,
                visit,
                source: "planned",
                visitDate,
                normalizedDate: typeof getNormalizedVisitDate === "function"
                    ? getNormalizedVisitDate(visitDateValue)
                    : String(visitDateValue || "").slice(0, 10)
            });

        });

    });

    Object.values(externalVisitRecords || {})
        .filter(isModelBExternalVisitExportable)
        .forEach(visit => {

            if (
                typeof visitMatchesDateRange === "function" &&
                !visitMatchesDateRange(visit, dateFrom, dateTo)
            ) return;

            const visitDateValue =
                visit.visitDate ||
                visit.date ||
                visit.completedAt ||
                visit.createdAt;
            const visitDate = getModelBVisitDate(visitDateValue);

            if (!visitDate) return;

            rows.push({
                facility: getModelBExternalFacility(visit),
                visit,
                source: "external",
                visitDate,
                normalizedDate: typeof getNormalizedVisitDate === "function"
                    ? getNormalizedVisitDate(visitDateValue)
                    : String(visitDateValue || "").slice(0, 10)
            });

        });

    return rows
        .sort((first, second) => {

            const dateDifference =
                first.normalizedDate.localeCompare(second.normalizedDate);

            if (dateDifference !== 0) return dateDifference;

            return String(first.facility.name || "")
                .localeCompare(String(second.facility.name || ""), "ar");

        })
        .map((record, index) => {

            const participants = getModelBVisitParticipants(record.visit);
            const displayLicense = typeof getFacilityDisplayLicense === "function"
                ? getFacilityDisplayLicense(record.facility)
                : record.facility.license;

            return [
                index + 1,
                "",
                String(record.facility.name || "").trim(),
                String(record.facility.type || "").trim(),
                String(displayLicense || "").trim(),
                record.source === "external"
                    ? "خارج الخطة"
                    : getModelBVisitType(record.visit.visitType),
                record.visitDate,
                "",
                String(record.facility.city || "الرياض").trim(),
                "",
                "",
                "",
                participants.leader,
                participants.members
            ];

        });

}


function escapeModelBOpenXmlText(value) {

    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

}


function replaceModelBOpenXmlCell(sheetXml, address, value, valueType = "string") {

    const pattern = new RegExp(
        `<c\\b([^>]*?\\br="${address}"[^>]*?)(?:\\s*\\/\\s*>|>[\\s\\S]*?<\\/c>)`
    );
    let replaced = false;
    const updatedXml = sheetXml.replace(pattern, (match, rawAttributes) => {

        replaced = true;

        const attributes = rawAttributes
            .replace(/\s+t="[^"]*"/g, "")
            .replace(/\s+$/, "");

        if (value === null || typeof value === "undefined" || value === "") {

            return `<c${attributes}/>`;

        }

        if (valueType === "number") {

            return `<c${attributes}><v>${Number(value)}</v></c>`;

        }

        const text = String(value);
        const preserveSpace = /^\s|\s$/.test(text)
            ? ' xml:space="preserve"'
            : "";

        return `<c${attributes} t="inlineStr"><is><t${preserveSpace}>` +
            `${escapeModelBOpenXmlText(text)}</t></is></c>`;

    });

    if (!replaced) {

        throw new Error(`Model B template cell ${address} is missing.`);

    }

    return updatedXml;

}


function getModelBExcelDateSerial(value) {

    const normalizedDate = typeof getNormalizedVisitDate === "function"
        ? getNormalizedVisitDate(value)
        : String(value || "").slice(0, 10);
    const match = normalizedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!match) throw new Error("Model B visit date is invalid.");

    return Math.floor(
        Date.UTC(
            Number(match[1]),
            Number(match[2]) - 1,
            Number(match[3])
        ) / 86400000
    ) + 25569;

}


function getModelBColumnAddress(columnIndex, rowNumber) {

    return `${String.fromCharCode(65 + columnIndex)}${rowNumber}`;

}


function populateModelBWorksheetXml(sheetXml, rows) {

    if (!Array.isArray(rows) || rows.length === 0) return sheetXml;
    if (rows.length > MODEL_B_MAX_DATA_ROWS) {

        throw new Error("Model B export exceeds the template capacity.");

    }

    let updatedXml = sheetXml;

    // The official template contains only two seeded serial numbers.
    // Clear both before adding the selected visit rows.
    updatedXml = replaceModelBOpenXmlCell(updatedXml, "A3", null);
    updatedXml = replaceModelBOpenXmlCell(updatedXml, "A4", null);

    rows.forEach((row, rowIndex) => {

        const rowNumber = MODEL_B_FIRST_DATA_ROW + rowIndex;

        row.forEach((value, columnIndex) => {

            const address = getModelBColumnAddress(columnIndex, rowNumber);
            const isDateColumn = columnIndex === 6;
            const isSerialColumn = columnIndex === 0;
            const normalizedValue = isDateColumn
                ? getModelBExcelDateSerial(value)
                : value;

            updatedXml = replaceModelBOpenXmlCell(
                updatedXml,
                address,
                normalizedValue,
                isDateColumn || isSerialColumn ? "number" : "string"
            );

        });

    });

    return updatedXml;

}


async function buildModelBWorkbookBlob(templateBytes, rows) {

    const zip = await window.JSZip.loadAsync(templateBytes);
    const worksheetFile = zip.file(MODEL_B_WORKSHEET_PATH);

    if (!worksheetFile) {

        throw new Error(`${MODEL_B_SHEET_NAME} worksheet is missing.`);

    }

    const sheetXml = await worksheetFile.async("string");
    const populatedSheetXml = populateModelBWorksheetXml(sheetXml, rows);

    zip.file(MODEL_B_WORKSHEET_PATH, populatedSheetXml);

    return zip.generateAsync({
        type: "blob",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        compression: "DEFLATE",
        compressionOptions: { level: 6 }
    });

}


function downloadModelBWorkbook(blob, filename) {

    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    link.href = url;
    link.download = filename;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

}


function setModelBExportMessage(text, type = "muted") {

    const message = document.getElementById("modelBExportMessage");

    if (!message) return;

    message.textContent = text;
    message.className = `model-b-export-message text-${type}`;

}


async function exportModelB() {

    if ((!isAdminUser() && !isViewerUser()) || !window.JSZip) return;

    const dateFrom = getNormalizedVisitDate(activeFilters.visitDateFrom);
    const dateTo = getNormalizedVisitDate(activeFilters.visitDateTo);

    if (!dateFrom || !dateTo || dateFrom > dateTo) {

        setModelBExportMessage(
            "حدد تاريخ البداية والنهاية قبل تصدير نموذج ب.",
            "danger"
        );
        return;

    }

    const facilitiesForExport = typeof getMergedFacilities === "function"
        ? getMergedFacilities()
        : allFacilities;
    const rows = collectModelBVisitRows(facilitiesForExport, dateFrom, dateTo);

    if (rows.length === 0) {

        setModelBExportMessage("لا توجد زيارات مسجلة خلال الفترة المحددة.", "warning");
        return;

    }

    const button = document.getElementById("exportModelB");

    if (button) button.disabled = true;
    setModelBExportMessage("جاري تجهيز نموذج ب...", "muted");

    try {

        const response = await fetch(MODEL_B_TEMPLATE_PATH);

        if (!response.ok) throw new Error("Model B template could not be loaded.");

        const workbookBlob = await buildModelBWorkbookBlob(
            await response.arrayBuffer(),
            rows
        );

        downloadModelBWorkbook(
            workbookBlob,
            `نموذج ب - ${dateFrom} إلى ${dateTo}.xlsx`
        );
        setModelBExportMessage(
            `تم تصدير ${rows.length} زيارة، شاملة الزيارات خارج الخطة.`,
            "success"
        );

    } catch (error) {

        console.error("[ModelBExport]", error);
        setModelBExportMessage("تعذر تصدير نموذج ب. حاول مرة أخرى.", "danger");

    } finally {

        if (button) button.disabled = false;

    }

}


function initializeModelBExport() {

    const button = document.getElementById("exportModelB");

    if (
        !button ||
        (!isAdminUser() && !isViewerUser()) ||
        button.dataset.exportInitialized === "true"
    ) return;

    button.dataset.exportInitialized = "true";
    button.addEventListener("click", exportModelB);

}
