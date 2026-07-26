const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const activitySource = fs.readFileSync(
    path.join(root, "js/facility-activity.js"),
    "utf8"
);
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const appSource = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
const usersSource = fs.readFileSync(path.join(root, "js/users.js"), "utf8");


function createActivityRuntime() {

    const context = vm.createContext({ Date });

    vm.runInContext(activitySource, context);

    return context;

}


test("facilities are active by default and cancelled only by an explicit status", () => {

    const context = createActivityRuntime();

    assert.equal(context.isFacilityActive({}), true);
    assert.equal(context.isFacilityActive({ activityStatus: "active" }), true);
    assert.equal(context.isFacilityActive({ activityStatus: "cancelled" }), false);

});


test("cancelling activity requires a reason and records an audit event", () => {

    const context = createActivityRuntime();

    assert.throws(
        () => context.buildFacilityActivityUpdate({}, "cancelled", ""),
        /سبب إلغاء النشاط مطلوب/
    );

    const update = context.buildFacilityActivityUpdate(
        {},
        "cancelled",
        "إلغاء الترخيص",
        "admin",
        "2026-07-26T09:00:00.000Z"
    );

    assert.equal(update.activityStatus, "cancelled");
    assert.equal(update.cancellationReason, "إلغاء الترخيص");
    assert.equal(update.cancelledBy, "admin");
    assert.equal(update.activityHistory.length, 1);
    assert.equal(update.activityHistory[0].status, "cancelled");

});


test("reactivation clears the current cancellation fields but retains history", () => {

    const context = createActivityRuntime();
    const cancelled = {
        activityStatus: "cancelled",
        cancellationReason: "إلغاء سابق",
        cancelledAt: "2026-07-25T09:00:00.000Z",
        cancelledBy: "admin",
        activityHistory: [{
            status: "cancelled",
            reason: "إلغاء سابق",
            changedAt: "2026-07-25T09:00:00.000Z",
            changedBy: "admin"
        }]
    };
    const update = context.buildFacilityActivityUpdate(
        cancelled,
        "active",
        "",
        "admin",
        "2026-07-26T09:00:00.000Z"
    );

    assert.equal(update.activityStatus, "active");
    assert.equal(update.cancellationReason, "");
    assert.equal(update.cancelledAt, "");
    assert.equal(update.activityHistory.length, 2);
    assert.equal(update.activityHistory[1].status, "active");

});


test("activity controls, archive, visibility filtering, and assignment guards are wired", () => {

    assert.match(html, /id="customFacilityActivityStatus"/);
    assert.match(html, /id="customFacilityCancellationReason"/);
    assert.match(html, /id="cancelledFacilitiesList"/);
    assert.match(
        html,
        /js\/facility-activity\.js[\s\S]*js\/users\.js[\s\S]*js\/app\.js/
    );
    assert.match(appSource, /mergedFacilities\.filter\(isFacilityActive\)/);
    assert.match(appSource, /status:\s*"cancelled"[\s\S]*إلغاء نشاط المنشأة/);
    assert.match(
        usersSource,
        /if \(!isFacilityEligibleForAssignment\(normalizedLicense\)\) return false/
    );
    assert.match(
        usersSource,
        /return isFacilityEligibleForAssignment\(facility\)[\s\S]*!isActiveAssignment\(assignment\)/
    );

});
