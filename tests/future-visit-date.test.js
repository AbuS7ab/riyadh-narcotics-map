const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sidebar = fs.readFileSync(path.join(root, "js/sidebar.js"), "utf8");
const migration = fs.readFileSync(
    path.join(
        root,
        "supabase",
        "migrations",
        "202607230001_prevent_future_visit_dates.sql"
    ),
    "utf8"
);


test("visit form limits the selected date to the local current day", () => {

    assert.match(sidebar, /visitDate\.max = today;/);
    assert.match(
        sidebar,
        /if \(isFutureVisitDate\(visitDate\.value\)\)[\s\S]*?لا يمكن حفظ زيارة بتاريخ مستقبلي/
    );

});


test("database rejects future visit dates using Riyadh local time", () => {

    assert.match(
        migration,
        /new\.visit_date\s*>\s*\(clock_timestamp\(\) at time zone 'Asia\/Riyadh'\)::date/i
    );
    assert.match(
        migration,
        /before insert or update of visit_date[\s\S]*?on public\.facility_visits/i
    );
    assert.match(migration, /errcode = '22007'/i);

});
