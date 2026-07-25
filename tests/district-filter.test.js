const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const filters = fs.readFileSync(path.join(root, "js/filters.js"), "utf8");
const districts = fs.readFileSync(path.join(root, "js/districts.js"), "utf8");

test("district search control is connected to the Riyadh district suggestions", () => {
    assert.match(html, /id="districtFilter"[\s\S]*?list="districtOptions"/);
    assert.match(html, /id="districtOptions"/);
    assert.match(html, /<script src="js\/districts\.js"><\/script>[\s\S]*?<script src="js\/filters\.js"><\/script>/);

    const context = { window: {} };

    vm.runInNewContext(districts, context);

    assert.ok(Array.isArray(context.window.RIYADH_DISTRICTS));
    assert.ok(context.window.RIYADH_DISTRICTS.length >= 170);
    assert.ok(context.window.RIYADH_DISTRICTS.includes("الملقا"));
    assert.ok(context.window.RIYADH_DISTRICTS.includes("خشم العان"));
});

test("district filtering tolerates common Arabic spelling variants", () => {
    const districtFilter = {
        value: "",
        dataset: {}
    };
    const context = {
        window: {},
        allFacilities: [
            { license: "1", district: "السعاده" },
            { license: "2", district: "إشبيليه" },
            { license: "3", district: "الملقا" }
        ],
        filteredFacilities: [],
        document: {
            getElementById(id) {
                return id === "districtFilter" ? districtFilter : null;
            }
        },
        getFacilityStatus() {
            return { visitStatus: "pending", violation: false };
        },
        refreshView() {},
        fitFacilityBounds() {}
    };

    vm.runInNewContext(filters, context);

    context.setFilter("district", "السعادة");
    assert.deepEqual(
        Array.from(context.filteredFacilities, facility => facility.license),
        ["1"]
    );

    context.setFilter("district", "اشبيلية");
    assert.deepEqual(
        Array.from(context.filteredFacilities, facility => facility.license),
        ["2"]
    );

    context.setFilter("district", "ا");
    assert.equal(context.filteredFacilities.length, 3);
});
