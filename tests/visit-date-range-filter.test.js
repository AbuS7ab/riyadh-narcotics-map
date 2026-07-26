const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const filters = fs.readFileSync(path.join(root, "js/filters.js"), "utf8");
const search = fs.readFileSync(path.join(root, "js/search.js"), "utf8");

function createContext() {
    const visits = {
        "1": [
            { id: "a", date: "2026-07-09", visitStatus: "visited" },
            { id: "b", date: "2026-07-10", visitStatus: "visited" },
            { id: "c", date: "2026-07-15", visitStatus: "partial" }
        ],
        "2": [
            { id: "d", date: "2026-07-16", visitStatus: "visited" }
        ],
        "3": []
    };

    return {
        window: {},
        allFacilities: [
            { license: "1", district: "الملقا" },
            { license: "2", district: "الياسمين" },
            { license: "3", district: "العقيق" }
        ],
        filteredFacilities: [],
        document: {
            getElementById() {
                return null;
            }
        },
        getFacilityStatus() {
            return { visitStatus: "visited", violation: false };
        },
        getFacilityVisits(license) {
            return visits[String(license)] || [];
        },
        refreshView() {},
        fitFacilityBounds() {}
    };
}

test("visit date range controls are available with an explicit clear action", () => {
    assert.match(html, /id="visitDateRangeFilter"[\s\S]*?type="text"/);
    assert.match(html, /id="visitDateFromFilter"[\s\S]*?type="date"/);
    assert.match(html, /id="visitDateToFilter"[\s\S]*?type="date"/);
    assert.match(html, /id="clearVisitDateFilter"/);
    assert.match(html, /id="visitDateRangeError"/);
    assert.match(html, /flatpickr\.min\.css/);
    assert.match(html, /flatpickr\/dist\/l10n\/ar\.js/);
    assert.match(filters, /mode:\s*"range"/);
});

test("calendar maximum date is passed as a Date instead of a display-formatted string", () => {
    assert.match(filters, /const currentLocalDate = new Date\(\)/);
    assert.match(filters, /maxDate:\s*currentLocalDate/);
    assert.doesNotMatch(filters, /maxDate:\s*today/);
});

test("visit dates accept current and legacy date fields and formats", () => {
    const context = createContext();

    vm.runInNewContext(filters, context);

    assert.equal(
        context.visitMatchesDateRange(
            { visitDate: "2026-7-10" },
            "2026-07-10",
            "2026-07-10"
        ),
        true
    );
    assert.equal(
        context.visitMatchesDateRange(
            { completedAt: "15/07/2026" },
            "2026-07-15",
            "2026-07-15"
        ),
        true
    );
    assert.equal(
        context.visitMatchesDateRange(
            { createdAt: "2026-07-16T20:15:00.000Z" },
            "2026-07-16",
            "2026-07-16"
        ),
        true
    );
});

test("date range includes both boundary dates and facilities appear once", () => {
    const context = createContext();

    vm.runInNewContext(filters, context);

    context.setFilter("visitDateFrom", "2026-07-10");
    context.setFilter("visitDateTo", "2026-07-15");

    assert.deepEqual(
        Array.from(context.filteredFacilities, facility => facility.license),
        ["1"]
    );
});

test("a single date boundary supports open-ended filtering", () => {
    const context = createContext();

    vm.runInNewContext(filters, context);

    context.setFilter("visitDateFrom", "2026-07-15");
    assert.deepEqual(
        Array.from(context.filteredFacilities, facility => facility.license),
        ["1", "2"]
    );

    context.setFilter("visitDateFrom", "");
    context.setFilter("visitDateTo", "2026-07-10");
    assert.deepEqual(
        Array.from(context.filteredFacilities, facility => facility.license),
        ["1"]
    );
});

test("an inverted range returns no misleading results", () => {
    const context = createContext();

    vm.runInNewContext(filters, context);

    context.setFilter("visitDateFrom", "2026-07-15");
    context.setFilter("visitDateTo", "2026-07-10");

    assert.equal(context.filteredFacilities.length, 0);
});

test("text search stays within the active filtered facilities", () => {
    const context = {
        console: { log() {} },
        allFacilities: [
            {
                license: "1",
                name: "منشأة داخل المدة",
                district: "الملقا",
                type: "صيدلية"
            },
            {
                license: "2",
                name: "منشأة خارج المدة",
                district: "الملقا",
                type: "صيدلية"
            }
        ],
        filteredFacilities: [],
        getFacilityDisplayLicense(facility) {
            return facility.license;
        }
    };

    context.filteredFacilities = [context.allFacilities[0]];
    vm.runInNewContext(search, context);

    const results = context.searchFacilities("منشأة");

    assert.deepEqual(
        Array.from(results, facility => facility.license),
        ["1"]
    );
});
