const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const facilities = JSON.parse(
    fs.readFileSync(path.join(root, "data/facilities.json"), "utf8")
);
const appSource = fs.readFileSync(path.join(root, "js/app.js"), "utf8");


test("Roshd facility license exists only once in the source data", () => {

    const matches = facilities.filter(facility => {

        return String(facility.license).trim() === "1400076142";

    });

    assert.equal(matches.length, 1);
    assert.equal(matches[0].name.trim(), "شركة رشد التخصصية الطبية");
    assert.equal(matches[0].type, "مجمع / مركز طبي");

});


test("base facility merge ignores repeated license numbers defensively", () => {

    assert.match(
        appSource,
        /baseFacilities\.forEach[\s\S]*if \(licenses\.has\(license\)\)[\s\S]*return;[\s\S]*licenses\.add\(license\)/
    );

});
