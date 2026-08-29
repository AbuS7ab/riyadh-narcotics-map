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
const filters = fs.readFileSync(
    path.join(root, "js", "filters.js"),
    "utf8"
);
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");


function createElement() {

    return {
        textContent: "",
        innerHTML: "",
        className: "",
        value: "",
        disabled: false,
        dataset: {},
        addEventListener() {},
        setAttribute() {},
        classList: {
            toggle() {},
            add() {},
            remove() {}
        }
    };

}


function createDashboardPeriodRuntime() {

    const elements = new Map();
    const cycles = [
        {
            id: "cycle-1",
            sequence: 1,
            status: "completed",
            startedAt: "2026-02-01T08:00:00.000Z",
            completedAt: "2026-05-01T08:00:00.000Z",
            minimumIntervalDays: 75,
            facilityLicenses: ["100", "200"]
        },
        {
            id: "cycle-2",
            sequence: 2,
            status: "active",
            startedAt: "2026-08-01T08:00:00.000Z",
            minimumIntervalDays: 75,
            availabilityMode: "all",
            facilityLicenses: ["100", "200"]
        }
    ];
    const visits = {
        100: [
            {
                id: "100-cycle-2",
                date: "2026-08-20",
                visitCycleId: "cycle-2",
                visitCycleNumber: 2,
                visitType: "periodic",
                result: "incomplete",
                visitStatus: "partial",
                violation: false
            },
            {
                id: "100-cycle-1",
                date: "2026-03-01",
                visitCycleId: "cycle-1",
                visitCycleNumber: 1,
                visitType: "periodic",
                result: "no_violation",
                visitStatus: "visited",
                violation: false
            },
            {
                id: "100-baseline",
                date: "2026-01-05",
                visitCycleId: null,
                visitType: "periodic",
                result: "no_violation",
                visitStatus: "visited",
                violation: false
            }
        ],
        200: [
            {
                id: "200-cycle-2",
                date: "2026-08-21",
                visitCycleId: "cycle-2",
                visitCycleNumber: 2,
                visitType: "periodic",
                result: "violation",
                visitStatus: "visited",
                violation: true
            },
            {
                id: "200-cycle-1",
                date: "2026-03-02",
                visitCycleId: "cycle-1",
                visitCycleNumber: 1,
                visitType: "periodic",
                result: "violation",
                visitStatus: "visited",
                violation: true
            }
        ],
        300: [
            {
                id: "300-baseline",
                date: "2026-01-06",
                visitCycleId: null,
                visitType: "periodic",
                result: "no_violation",
                visitStatus: "visited",
                violation: false
            }
        ]
    };
    const context = {
        Intl,
        activeFilters: {
            visitStatus: "all",
            violation: "all",
            violationAction: "all",
            visitDateFrom: "",
            visitDateTo: ""
        },
        document: {
            querySelectorAll: () => [],
            querySelector: () => null,
            getElementById(id) {

                if (!elements.has(id)) elements.set(id, createElement());

                return elements.get(id);

            }
        },
        getPeriodicVisitPlan: () => ({
            currentCycleId: "cycle-2",
            cycles
        }),
        getFacilityVisits: license => visits[String(license)] || [],
        getFacilityStatus(license) {

            const facilityVisits = visits[String(license)] || [];
            const latestVisit = facilityVisits[0];

            return {
                visitStatus: latestVisit
                    ? latestVisit.visitStatus
                    : "pending",
                violation: facilityVisits.some(visit => visit.violation),
                visits: facilityVisits
            };

        },
        visitIndicatesViolation: visit => visit.violation === true,
        facilityHasViolationRecord: license => {

            return (visits[String(license)] || []).some(visit => {

                return visit.violation === true;

            });

        }
    };

    vm.runInNewContext(dashboard, context);

    return { context, elements };

}


const facilities = [
    { license: "100", type: "صيدلية" },
    { license: "200", type: "مستشفى" },
    { license: "300", type: "مجمع طبي" }
];


test("the default dashboard keeps the existing cumulative calculations", () => {

    const { context, elements } = createDashboardPeriodRuntime();

    context.updateDashboard(facilities);

    assert.equal(elements.get("totalCount").textContent, 3);
    assert.equal(elements.get("visitedCount").textContent, 6);
    assert.equal(elements.get("partialCount").textContent, 1);
    assert.equal(elements.get("violationCount").textContent, 1);
    assert.equal(elements.get("completionRate").textContent, "67%");
    assert.equal(elements.get("visitPlanBreakdown").textContent, "زيارات الخطة");

});


test("selecting a year and cycle scopes every operational KPI to that cycle", () => {

    const { context, elements } = createDashboardPeriodRuntime();

    context.setDashboardCycleSelection("2026", "cycle-2");
    context.updateDashboard(facilities);

    assert.equal(elements.get("totalCount").textContent, 2);
    assert.equal(elements.get("pendingCount").textContent, 0);
    assert.equal(elements.get("visitedCount").textContent, 1);
    assert.equal(elements.get("partialCount").textContent, 1);
    assert.equal(elements.get("violationCount").textContent, 1);
    assert.equal(elements.get("completionRate").textContent, "50%");
    assert.equal(
        elements.get("visitPlanBreakdown").textContent,
        "منشآت الدورة المحددة"
    );
    assert.deepEqual(
        Array.from(
            context.getDashboardScopeFacilities(
                facilities,
                context.getSelectedDashboardCycleScope()
            ),
            facility => facility.license
        ),
        ["100", "200"]
    );

});


test("historical visits without a cycle remain available as the baseline", () => {

    const { context, elements } = createDashboardPeriodRuntime();
    const options = context.getDashboardYearCycleOptions("2026", facilities);

    assert.deepEqual(
        Array.from(options, option => option.id),
        ["baseline:2026", "cycle-1", "cycle-2"]
    );
    assert.equal(options[1].yearSequence, 1);
    assert.equal(options[2].yearSequence, 2);

    context.setDashboardCycleSelection("2026", "baseline:2026");
    context.updateDashboard(facilities);

    assert.equal(elements.get("totalCount").textContent, 3);
    assert.equal(elements.get("pendingCount").textContent, 1);
    assert.equal(elements.get("visitedCount").textContent, 2);
    assert.equal(elements.get("partialCount").textContent, 0);
    assert.equal(elements.get("completionRate").textContent, "67%");

});


test("operational KPI filters stay inside the selected cycle", () => {

    const { context } = createDashboardPeriodRuntime();

    context.allFacilities = facilities;
    context.filteredFacilities = [...facilities];
    context.refreshView = () => {};
    context.fitFacilityBounds = () => {};
    vm.runInNewContext(filters, context);

    context.setDashboardCycleSelection("2026", "cycle-2");
    context.setFilter("visitStatus", "visited");

    assert.deepEqual(
        Array.from(context.filteredFacilities, facility => facility.license),
        ["200"]
    );

    context.setFilter("visitStatus", "partial");

    assert.deepEqual(
        Array.from(context.filteredFacilities, facility => facility.license),
        ["100"]
    );

    context.setFilter("visitStatus", "all");
    context.setFilter("violation", "true");

    assert.deepEqual(
        Array.from(context.filteredFacilities, facility => facility.license),
        ["200"]
    );

});


test("year and cycle controls are read-only dashboard selectors", () => {

    assert.match(html, /id="dashboardYearSelect"/);
    assert.match(html, /id="dashboardCycleSelect"/);
    assert.match(html, /الإجمالي الحالي — تراكمي/);
    assert.doesNotMatch(
        dashboard,
        /mutateCloudObject|saveAppSettings|saveFacilityStatus|writeCloudObject/
    );

});
