const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const dashboard = fs.readFileSync(
    path.join(root, "js", "dashboard.js"),
    "utf8"
);


function createDashboardRuntime(dateFrom = "", dateTo = "") {

    const elements = new Map();
    const visits = {
        "100": [
            { date: "2026-08-01", violation: false },
            { date: "2026-08-02", violation: true }
        ],
        "200": [
            { date: "2026-08-02", violation: false },
            { date: "2026-07-11", violation: true }
        ]
    };
    const context = {
        activeFilters: {
            visitStatus: "all",
            violation: "all",
            violationAction: "all",
            visitDateFrom: dateFrom,
            visitDateTo: dateTo
        },
        document: {
            querySelectorAll: () => [],
            querySelector: () => null,
            getElementById(id) {

                if (!elements.has(id)) {

                    elements.set(id, { textContent: "" });

                }

                return elements.get(id);

            }
        },
        getFacilityStatus(license) {

            return {
                visitStatus: "visited",
                violation: false,
                visits: visits[String(license)] || []
            };

        },
        getNormalizedVisitDate: value => String(value || "").slice(0, 10),
        visitMatchesDateRange(visit, from, to) {

            const date = String(visit.date || "").slice(0, 10);

            return (!from || date >= from) && (!to || date <= to);

        },
        visitIndicatesViolation: visit => visit.violation === true,
        facilityHasViolationRecord(license) {

            return (visits[String(license)] || [])
                .some(visit => visit.violation === true);

        }
    };

    vm.runInNewContext(dashboard, context);

    return { context, elements };

}


test("dashboard counts only visits and violations inside the selected day", () => {

    const { context, elements } = createDashboardRuntime(
        "2026-08-02",
        "2026-08-02"
    );
    const facilities = [
        { license: "100", type: "صيدلية" },
        { license: "200", type: "مستشفى" }
    ];

    context.updateDashboard(facilities);

    assert.equal(elements.get("visitedCount").textContent, 2);
    assert.equal(elements.get("violationCount").textContent, 1);
    assert.equal(
        elements.get("visitPlanBreakdown").textContent,
        "زيارات الفترة المحددة"
    );

});


test("dashboard keeps cumulative totals when no visit date is selected", () => {

    const { context, elements } = createDashboardRuntime();
    const facilities = [
        { license: "100", type: "صيدلية" },
        { license: "200", type: "مستشفى" }
    ];

    context.updateDashboard(facilities);

    assert.equal(elements.get("visitedCount").textContent, 4);
    assert.equal(elements.get("violationCount").textContent, 2);
    assert.equal(elements.get("visitPlanBreakdown").textContent, "زيارات الخطة");

});
