const test = require("node:test");
const assert = require("node:assert/strict");

const {
    createCloudRuntime,
    createInitialRows
} = require("./helpers/runtime");


async function createVisitRuntime(rows = createInitialRows()) {

    const runtime = await createCloudRuntime(rows);

    runtime.loadScript("status");
    await runtime.context.initializeFacilityStatusState();

    return runtime;

}


function createVisit(id, overrides = {}) {

    return {
        id,
        facilityLicense: "100",
        visitStatus: "visited",
        result: "no_violation",
        committeeUsername: "committee4",
        ...overrides
    };

}


test("concurrent completed visits for one facility are both retained", async () => {

    const { context, supabase } = await createVisitRuntime();

    await Promise.all([
        context.addVisit("100", createVisit("visit-a", {
            committeeUsername: "committeeA"
        })),
        context.addVisit("100", createVisit("visit-b", {
            committeeUsername: "committeeB",
            result: "violation",
            violation: true
        }))
    ]);

    const visits = supabase.rows.get("facilityStatus").value["100"].visits;

    assert.deepEqual(
        visits.map(visit => visit.id).sort(),
        ["visit-a", "visit-b"]
    );

});


test("retrying the same visit id is idempotent", async () => {

    const { context, supabase } = await createVisitRuntime();
    const visit = createVisit("stable-visit-id");

    await context.addVisit("100", visit);
    await context.addVisit("100", visit);

    const visits = supabase.rows.get("facilityStatus").value["100"].visits;

    assert.equal(visits.length, 1);
    assert.equal(visits[0].id, "stable-visit-id");

});


test("a failed visit write does not change remote or in-memory status", async () => {

    const { context, debug, supabase } = await createVisitRuntime();

    supabase.failNextWrite("facilityStatus");

    await assert.rejects(
        context.addVisit("100", createVisit("failed-visit")),
        /simulated cloud failure/
    );

    assert.equal(supabase.rows.get("facilityStatus").value["100"], undefined);
    assert.equal(context.getFacilityStatus("100"), undefined);
    assert.equal(debug.loadFacilityStatus()["100"], undefined);

});


test("rollback removes only the failed visit and preserves other visits", async () => {

    const { context, supabase } = await createVisitRuntime();

    await context.addVisit("100", createVisit("visit-to-rollback"));
    await context.addVisit("100", createVisit("visit-to-keep", {
        date: "2026-07-21"
    }));
    await context.rollbackVisitAfterAssignmentFailure("100", "visit-to-rollback");

    const visits = supabase.rows.get("facilityStatus").value["100"].visits;

    assert.deepEqual(visits.map(visit => visit.id), ["visit-to-keep"]);
    assert.equal(
        supabase.rows.get("facilityStatus").value["100"].visitStatus,
        "visited"
    );

});


test("an incomplete visit remains partial and is not marked as a violation", async () => {

    const { context, supabase } = await createVisitRuntime();

    await context.addVisit("100", createVisit("incomplete-visit", {
        visitStatus: "partial",
        result: "incomplete",
        incompleteReason: "تعذر مقابلة المسؤول",
        violation: false
    }));

    const status = supabase.rows.get("facilityStatus").value["100"];
    const visit = status.visits[0];

    assert.equal(status.visitStatus, "partial");
    assert.equal(status.violation, false);
    assert.equal(visit.result, "incomplete");
    assert.equal(visit.incompleteReason, "تعذر مقابلة المسؤول");

});


test("a future visit date is rejected before any cloud write", async () => {

    const { context, supabase } = await createVisitRuntime();
    const writesBefore = supabase.writeCount("facilityStatus");

    await assert.rejects(
        context.addVisit("100", createVisit("future-visit", {
            date: "2999-01-01"
        })),
        /Future visit dates are not allowed/
    );

    assert.equal(supabase.writeCount("facilityStatus"), writesBefore);
    assert.equal(supabase.rows.get("facilityStatus").value["100"], undefined);
    assert.equal(context.getFacilityStatus("100"), undefined);

});
