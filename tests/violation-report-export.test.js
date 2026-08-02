const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(
    path.join(root, "js", "violation-report-export.js"),
    "utf8"
);
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const filtersSource = fs.readFileSync(
    path.join(root, "js", "filters.js"),
    "utf8"
);


function createRuntime() {

    const visits = {
        "100": [{
            id: "old-violation",
            date: "2026-06-15",
            result: "violation",
            violation: true,
            visitType: "periodic",
            visitReason: "الخطة الدورية",
            committeeName: "اللجنة الأولى",
            notes: "مخالفة قديمة"
        }, {
            id: "current-violation",
            date: "2026-07-20",
            result: "violation",
            violation: true,
            visitType: "reactive",
            visitReason: "شكوى",
            committeeName: "اللجنة الأولى",
            transactionNumber: "VISIT-22",
            violationDetails: "عدم مطابقة السجل",
            violationActions: [{
                id: "referral-1",
                type: "referred",
                effectiveDate: "2026-07-22",
                transactionNumber: "REF-77",
                destination: "لجنة المخالفات",
                notes: "تمت الإحالة"
            }]
        }, {
            id: "clean-visit",
            date: "2026-07-25",
            result: "no_violation",
            violation: false
        }],
        "200": [{
            id: "follow-up-violation",
            date: "2026-07-18",
            result: "violation",
            violation: true,
            notes: "حفظ غير آمن"
        }]
    };
    const writes = [];
    const context = vm.createContext({
        console,
        Date,
        window: {
            XLSX: {
                utils: {
                    book_new: () => ({}),
                    json_to_sheet: rows => ({ "!ref": `A1:O${rows.length + 1}` }),
                    book_append_sheet: (workbook, worksheet, name) => {
                        workbook.sheet = worksheet;
                        workbook.sheetName = name;
                    }
                },
                writeFile: (workbook, filename) => writes.push({ workbook, filename })
            }
        },
        document: { getElementById: () => null },
        users: {},
        filteredFacilities: [{
            license: "100",
            name: "مستشفى الاختبار",
            type: "مستشفى",
            district: "الملز"
        }, {
            license: "200",
            name: "صيدلية الاختبار",
            type: "صيدلية",
            district: "النسيم"
        }],
        activeFilters: {
            violation: "true",
            violationAction: "all",
            visitDateFrom: "2026-07-01",
            visitDateTo: "2026-07-31"
        },
        getNormalizedVisitDate: value => String(value || "").slice(0, 10),
        getFacilityVisits: license => visits[String(license)] || [],
        visitIndicatesViolation: visit => visit.violation === true,
        getViolationActions: visit => [...(visit.violationActions || [])]
            .sort((a, b) => String(b.effectiveDate).localeCompare(a.effectiveDate)),
        getViolationActionStateDisplay: visit => ({
            label: (visit.violationActions || []).some(action => action.type === "referred")
                ? "أُحيلت للجنة المخالفات"
                : "قيد المتابعة"
        }),
        violationVisitMatchesActionFilter: (visit, filter) => {
            if (filter === "follow_up") return !(visit.violationActions || []).length;
            return (visit.violationActions || []).some(action => action.type === filter);
        },
        isAdminUser: () => true,
        isViewerUser: () => false,
        getCurrentLocalDateValue: () => "2026-08-02"
    });

    vm.runInContext(source, context);

    return { context, writes };

}


test("violation report exports one row per violating visit in the selected period", () => {

    const { context } = createRuntime();
    const rows = context.collectViolationReportRows(
        context.filteredFacilities,
        context.activeFilters
    );

    assert.equal(rows.length, 2);
    assert.deepEqual(
        Array.from(rows, row => row["اسم المنشأة"]),
        ["مستشفى الاختبار", "صيدلية الاختبار"]
    );
    assert.equal(rows[0]["رقم المعاملة"], "REF-77");
    assert.equal(rows[0]["حالة الإجراء"], "أُحيلت للجنة المخالفات");
    assert.equal(rows[0]["تفاصيل المخالفة"], "عدم مطابقة السجل");

});


test("violation report respects the selected action filter", () => {

    const { context } = createRuntime();
    const rows = context.collectViolationReportRows(
        context.filteredFacilities,
        { ...context.activeFilters, violationAction: "referred" }
    );

    assert.equal(rows.length, 1);
    assert.equal(rows[0]["رقم الترخيص"], "100");

});


test("violation workbook is right-to-left with filters and useful widths", () => {

    const { context } = createRuntime();
    const rows = context.collectViolationReportRows(
        context.filteredFacilities,
        context.activeFilters
    );
    const workbook = context.buildViolationReportWorkbook(rows);

    assert.equal(workbook.sheetName, "تقرير المخالفات");
    assert.equal(workbook.Workbook.Views[0].RTL, true);
    assert.equal(workbook.sheet["!autofilter"].ref, "A1:O3");
    assert.equal(workbook.sheet["!cols"].length, 15);

});


test("violation report control is wired into the management dashboard", () => {

    assert.match(html, /id="exportViolationReport"/);
    assert.match(html, /js\/violation-report-export\.js/);
    assert.match(filtersSource, /initializeViolationReportExport\(\)/);

});
