const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
    createCloudRuntime,
    createInitialRows
} = require("./helpers/runtime");

const root = path.resolve(__dirname, "..");
const migration = fs.readFileSync(
    path.join(
        root,
        "supabase",
        "migrations",
        "202607290001_violation_actions.sql"
    ),
    "utf8"
);
const rollback = fs.readFileSync(
    path.join(
        root,
        "supabase",
        "rollback",
        "202607290001_violation_actions.down.sql"
    ),
    "utf8"
);
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sidebar = fs.readFileSync(
    path.join(root, "js", "sidebar.js"),
    "utf8"
);
const dashboard = fs.readFileSync(
    path.join(root, "js", "dashboard.js"),
    "utf8"
);
const filters = fs.readFileSync(
    path.join(root, "js", "filters.js"),
    "utf8"
);


function createUser(role) {

    return {
        username: role,
        password: "test",
        displayName: role,
        committeeName: role,
        role,
        active: true,
        team: { leader: "", members: [] }
    };

}


async function createViolationRuntime(role = "admin") {

    const rows = createInitialRows({
        users: {
            value: {
                admin: createUser("admin"),
                committee: createUser("committee"),
                viewer: createUser("viewer")
            }
        },
        facilityStatus: {
            value: {
                "100": {
                    visitStatus: "visited",
                    violation: true,
                    visits: [{
                        id: "violation-1",
                        facilityLicense: "100",
                        date: "2026-07-20",
                        result: "violation",
                        visitStatus: "visited",
                        violation: true
                    }]
                }
            }
        }
    });
    const runtime = await createCloudRuntime(rows, {
        localStorage: { currentUser: role }
    });

    runtime.loadScript("users");
    await runtime.context.initializeUserState();
    runtime.loadScript("status");
    await runtime.context.initializeFacilityStatusState();
    runtime.loadScript("violation-actions");

    return runtime;

}


test("Admin can refer a violation and transaction number is mandatory", async () => {

    const { context, supabase } = await createViolationRuntime();

    await assert.rejects(
        context.addViolationAction("100", "violation-1", {
            type: "referred",
            effectiveDate: "2026-07-21"
        }),
        /transaction number/i
    );

    await context.addViolationAction("100", "violation-1", {
        type: "referred",
        effectiveDate: "2026-07-21",
        transactionNumber: "TX-123",
        destination: "لجنة المخالفات"
    });

    const visit = supabase.rows.get("facilityStatus").value["100"].visits[0];

    assert.equal(visit.violationActions.length, 1);
    assert.equal(visit.violationActions[0].transactionNumber, "TX-123");
    assert.equal(context.getViolationActionStats().referred, 1);

});


test("Violation action statistics are hidden until the violation KPI is selected", () => {

    assert.match(
        html,
        /class="dashboard-card operational-kpi kpi-violation"[\s\S]*?aria-controls="violationActionStatistics"[\s\S]*?aria-expanded="false"/
    );
    assert.match(
        html,
        /id="violationActionStatistics"[\s\S]*?management-read-only d-none[\s\S]*?aria-hidden="true"/
    );
    assert.match(
        dashboard,
        /if \(filterName === "violation"\)[\s\S]*?setViolationActionStatisticsVisibility\(value !== "all"\)/
    );
    assert.match(
        dashboard,
        /function setViolationActionStatisticsVisibility[\s\S]*?classList\.toggle\("d-none", !isVisible\)[\s\S]*?aria-expanded/
    );

});


test("operational KPI cards keep only one dashboard filter active", () => {

    assert.match(
        dashboard,
        /const wasActive =\s*String\(activeFilters\[filterName\]\) === filterValue;[\s\S]*?resetOperationalKpiFilters\(\);[\s\S]*?const value = wasActive \? "all" : filterValue;/
    );
    assert.match(
        dashboard,
        /function resetOperationalKpiFilters\(\)[\s\S]*?activeFilters\[card\.dataset\.filterName\] = "all";[\s\S]*?activeFilters\.violationAction = "all";/
    );
    assert.match(
        dashboard,
        /resetOperationalKpiFilters\(\)[\s\S]*?visitStatusFilter\.value = "all";[\s\S]*?setViolationActionStatisticsVisibility\(false\);/
    );

});


test("referral and correction remain in the same immutable timeline", async () => {

    const { context } = await createViolationRuntime();

    await context.addViolationAction("100", "violation-1", {
        type: "referred",
        effectiveDate: "2026-07-21",
        transactionNumber: "TX-123"
    });
    await context.addViolationAction("100", "violation-1", {
        type: "corrected",
        effectiveDate: "2026-07-23",
        notes: "تم التحقق من التصحيح"
    });

    const actions = context.getViolationActions(
        context.getFacilityVisits("100")[0]
    );
    const stats = context.getViolationActionStats();

    assert.equal(actions.length, 2);
    assert.equal(stats.total, 1);
    assert.equal(stats.referred, 1);
    assert.equal(stats.corrected, 1);
    assert.equal(stats.resolutionRate, 100);
    assert.equal("averageResolutionDays" in stats, false);

});


test("correction reason is required and shown with an explicit label", async () => {

    const { context } = await createViolationRuntime();

    await assert.rejects(
        context.addViolationAction("100", "violation-1", {
            type: "corrected",
            effectiveDate: "2026-07-23"
        }),
        /Correction reason is required/i
    );

    await context.addViolationAction("100", "violation-1", {
        type: "corrected",
        effectiveDate: "2026-07-23",
        notes: "استكمال السجل وتصحيح الرصيد"
    });

    const visit = context.getFacilityVisits("100")[0];
    const markup = context.renderViolationActionTimeline(visit, "100");

    assert.match(markup, /سبب التلافي:/);
    assert.match(markup, /استكمال السجل وتصحيح الرصيد/);

});


test("correction survives a later facility mutation and normalization", async () => {

    const { context, supabase } = await createViolationRuntime();

    await context.addViolationAction("100", "violation-1", {
        type: "corrected",
        effectiveDate: "2026-07-23",
        notes: "تم تلافي الملاحظة"
    });
    await context.setNotes("100", "تحديث لاحق لا علاقة له بالمخالفة");

    const remoteVisit =
        supabase.rows.get("facilityStatus").value["100"].visits[0];
    const localVisit = context.getFacilityVisits("100")[0];

    assert.equal(remoteVisit.violationActions.length, 1);
    assert.equal(remoteVisit.violationActions[0].type, "corrected");
    assert.equal(localVisit.violationActions.length, 1);
    assert.equal(context.getViolationActionState(localVisit), "corrected");

});


test("durable ledger preserves a correction when the legacy mirror fails", async () => {

    const { context, supabase } = await createViolationRuntime();

    supabase.failNextWrite("facilityStatus");

    await context.addViolationAction("100", "violation-1", {
        type: "corrected",
        effectiveDate: "2026-07-23",
        notes: "تم تلافي الملاحظة"
    });

    const ledger = supabase.rows.get("violationActionLedger").value;
    const ledgerRecord = ledger["100::violation-1"];
    const visit = context.getFacilityVisits("100")[0];

    assert.equal(ledgerRecord.actions.length, 1);
    assert.equal(ledgerRecord.actions[0].type, "corrected");

    visit.violationActions = [];
    context.mergeViolationActionLedgerIntoFacilityStatus();

    assert.equal(visit.violationActions.length, 1);
    assert.equal(context.getViolationActionState(visit), "corrected");

});


test("existing embedded actions migrate once into the durable ledger", async () => {

    const { context, supabase } = await createViolationRuntime();
    const visit = context.getFacilityVisits("100")[0];

    visit.violationActions = [];
    visit.violationActions.push({
        id: "existing-correction",
        type: "corrected",
        effectiveDate: "2026-07-23",
        notes: "إجراء محفوظ سابقًا"
    });

    await context.initializeViolationActionState();
    await context.initializeViolationActionState();

    const ledger = supabase.rows.get("violationActionLedger").value;
    const actions = ledger["100::violation-1"].actions;

    assert.equal(actions.length, 1);
    assert.equal(actions[0].id, "existing-correction");
    assert.equal(supabase.writeCount("violationActionLedger"), 1);

});


test("historical violations remain discoverable after a later clean visit", async () => {

    const { context } = await createViolationRuntime();
    const status = context.getFacilityStatus("100");

    status.visits.push(context.createVisitRecord({
        id: "clean-visit",
        facilityLicense: "100",
        date: "2026-07-25",
        result: "no_violation",
        visitStatus: "visited"
    }));

    assert.equal(context.facilityHasViolationRecord("100"), true);
    assert.equal(
        context.facilityMatchesViolationActionFilter("100", "all"),
        true
    );

    context.visitMatchesDateRange = (visit, from, to) => {

        return (!from || visit.date >= from) && (!to || visit.date <= to);

    };

    assert.equal(
        context.facilityHasViolationRecord(
            "100",
            "2026-07-25",
            "2026-07-25"
        ),
        false
    );
    assert.equal(
        context.getViolationActionStats(
            [{ license: "100" }],
            "2026-07-25",
            "2026-07-25"
        ).total,
        0
    );

});


test("violation action statistic cards filter matching facilities", async () => {

    const { context } = await createViolationRuntime();

    assert.equal(
        context.facilityMatchesViolationActionFilter("100", "follow_up"),
        true
    );
    assert.equal(
        context.facilityMatchesViolationActionFilter("100", "referred"),
        false
    );

    await context.addViolationAction("100", "violation-1", {
        type: "referred",
        effectiveDate: "2026-07-21",
        transactionNumber: "TX-123"
    });

    assert.equal(
        context.facilityMatchesViolationActionFilter("100", "referred"),
        true
    );
    assert.equal(
        context.facilityMatchesViolationActionFilter("100", "corrected"),
        false
    );

    assert.match(html, /data-violation-action-filter="follow_up"/);
    assert.match(html, /data-violation-action-filter="referred"/);
    assert.match(html, /data-violation-action-filter="corrected"/);
    assert.match(
        filters,
        /facilityMatchesViolationActionFilter\([\s\S]*?activeFilters\.violationAction/
    );
    assert.match(
        dashboard,
        /violationStatCards[\s\S]*?showFacilityList\(filteredFacilities\)/
    );

});


test("average processing days is removed from the dashboard", () => {

    assert.doesNotMatch(html, /violationActionsAverageDays/);
    assert.doesNotMatch(html, /متوسط أيام المعالجة/);
    assert.doesNotMatch(dashboard, /averageResolutionDays/);

});


test("dashboard statistics exclude facilities hidden from the active workspace", async () => {

    const { context } = await createViolationRuntime();

    assert.equal(context.getViolationActionStats().total, 1);
    assert.equal(context.getViolationActionStats([]).total, 0);
    assert.equal(
        context.getViolationActionStats([{ license: "100" }]).total,
        1
    );
    assert.match(
        dashboard,
        /getViolationActionStats\(\s*facilities,\s*dateFrom,\s*dateTo\s*\)/
    );

});


test("Committee and Viewer cannot write violation actions", async () => {

    for (const role of ["committee", "viewer"]) {

        const { context } = await createViolationRuntime(role);

        await assert.rejects(
            context.addViolationAction("100", "violation-1", {
                type: "corrected",
                effectiveDate: "2026-07-21"
            }),
            /Admin authorization/i
        );

    }

});


test("database policy restricts action writes to Admin and management reads", () => {

    assert.match(
        migration,
        /alter table public\.violation_actions enable row level security/i
    );
    assert.match(
        migration,
        /create policy violation_actions_admin_insert[\s\S]*?narco_private\.is_admin\(\)/i
    );
    assert.match(
        migration,
        /create policy violation_actions_select_management[\s\S]*?narco_private\.is_management\(\)/i
    );
    assert.match(
        migration,
        /action_type <> 'referred' or btrim\(transaction_number\) <> ''/i
    );
    assert.doesNotMatch(
        migration,
        /grant\s+(?:update|delete)[\s\S]*?violation_actions/i
    );
    assert.match(rollback, /drop table if exists public\.violation_actions/i);

});


test("management statistics and Admin action controls are wired into the UI", () => {

    assert.match(html, /id="violationActionStatistics"[^>]*management-read-only/i);
    assert.match(html, /id="violationActionsReferred"/i);
    assert.match(html, /id="violationActionsCorrected"/i);
    assert.match(html, /id="violationActionDialog"/i);
    assert.match(
        sidebar,
        /renderViolationActionTimeline\(visit,\s*facilityLicense\)/
    );

});


test("legacy violating visits use the parent facility license for action updates", async () => {

    const { context } = await createViolationRuntime();
    const legacyVisit = {
        id: "legacy-violation",
        date: "2026-07-20",
        result: "violation",
        visitStatus: "visited",
        violation: true
    };

    const markup = context.renderViolationActionTimeline(legacyVisit, "100");

    assert.match(markup, /data-facility-license="100"/);
    assert.match(markup, /data-visit-id="legacy-violation"/);

});

async function createBulkRuntime(role = "admin") {
    const runtime = await createViolationRuntime(role);
    await runtime.context.mutateFacilityRecord("100", facility => {
        facility.visits.push({ id: "violation-2", date: "2026-07-21", result: "violation", violation: true });
        facility.visits.push({ id: "clean", date: "2026-07-22", result: "compliant", violation: false });
    });
    await runtime.context.mutateFacilityRecord("100", () => {});
    return runtime;
}

const bulkTargets = [
    { facilityLicense: "100", visitId: "violation-1" },
    { facilityLicense: "100", visitId: "violation-2" }
];
const bulkInput = { notes: "تم تنفيذ الإجراء الموحد", effectiveDate: "2026-07-23" };

test("bulk correction preserves visit facts and updates only selected violations", async () => {
    const { context, supabase } = await createBulkRuntime();
    const before = structuredClone(supabase.rows.get("facilityStatus").value["100"].visits);
    const result = await context.addBulkViolationCorrections([bulkTargets[0], bulkTargets[0]], bulkInput);
    assert.equal(result.saved.length, 1);
    const after = supabase.rows.get("facilityStatus").value["100"].visits;
    assert.equal(after[0].violationActions[0].notes, bulkInput.notes);
    const { violationActions, ...facts } = after[0];
    const { violationActions: oldActions, ...oldFacts } = before[0];
    assert.deepEqual(facts, oldFacts);
    assert.deepEqual(after.slice(1), before.slice(1));
    assert.equal(context.getViolationActionStats().total, 2);
    assert.equal(context.getViolationActionStats().corrected, 1);
});

test("bulk correction reports individual failures and retry avoids duplicates", async () => {
    const { context, supabase } = await createBulkRuntime();
    supabase.failNextWrite("violationActionLedger");
    const first = await context.addBulkViolationCorrections(bulkTargets, bulkInput);
    assert.equal(first.failed.length, 1);
    assert.equal(first.saved.length, 1);
    const retry = await context.addBulkViolationCorrections(bulkTargets, bulkInput);
    assert.equal(retry.saved.length, 1);
    assert.equal(retry.skipped.length, 1);
    const visits = supabase.rows.get("facilityStatus").value["100"].visits;
    assert.equal(visits[0].violationActions.length, 1);
    assert.equal(visits[1].violationActions.length, 1);
});

test("bulk correction rejects blank reasons and future dates before writing", async () => {
    const { context, supabase } = await createBulkRuntime();
    const before = JSON.stringify([...supabase.rows]);
    await assert.rejects(context.addBulkViolationCorrections(bulkTargets, { ...bulkInput, notes: "  " }), /reason/);
    await assert.rejects(context.addBulkViolationCorrections(bulkTargets, { ...bulkInput, effectiveDate: "2999-01-01" }), /future/i);
    assert.equal(JSON.stringify([...supabase.rows]), before);
    const invalid = await context.addBulkViolationCorrections([{ facilityLicense: "100", visitId: "clean" }], bulkInput);
    assert.equal(invalid.failed.length, 1);
    assert.equal(JSON.stringify([...supabase.rows]), before);
});

test("bulk correction excludes corrected visits and respects cycle and date scope", async () => {
    const { context } = await createBulkRuntime();
    await context.addBulkViolationCorrections([bulkTargets[0]], bulkInput);
    context.dashboardVisitMatchesCycleScope = visit => visit.id === "violation-2";
    context.visitMatchesDateRange = visit => visit.date === "2026-07-21";
    const candidates = context.getBulkCorrectionCandidates([{ license: "100" }], { visitDateFrom: "2026-07-21" }, { id: "cycle-2" });
    assert.deepEqual(Array.from(candidates, row => row.visit.id), ["violation-2"]);
    assert.equal(context.getBulkCorrectionCandidates([{ license: "999" }]).length, 0);
});

test("bulk correction rejects Viewer and Committee without cloud writes", async () => {
    for (const role of ["viewer", "committee"]) {
        const { context, supabase } = await createViolationRuntime(role);
        const before = JSON.stringify([...supabase.rows]);
        await assert.rejects(context.addBulkViolationCorrections([bulkTargets[0]], bulkInput), /Admin/);
        assert.equal(JSON.stringify([...supabase.rows]), before);
    }
});

test("concurrent bulk corrections keep only one correction in the durable ledger", async () => {
    const { context, supabase } = await createBulkRuntime();
    await Promise.all([
        context.addBulkViolationCorrections([bulkTargets[0]], bulkInput),
        context.addBulkViolationCorrections([bulkTargets[0]], bulkInput)
    ]);
    const records = Object.values(supabase.rows.get("violationActionLedger").value);
    assert.equal(records.length, 1);
    assert.equal(records[0].actions.length, 1);
});

test("bulk correction applies one reason across different facilities without losing referral history", async () => {
    const { context, supabase } = await createBulkRuntime();
    await context.mutateCloudObject("facilityStatus", statuses => {
        statuses["200"] = { visits: [{ id: "gov-visit", date: "2026-07-20", result: "violation", violation: true }] };
        return statuses;
    });
    await context.initializeFacilityStatusState();
    await context.addViolationAction("100", "violation-1", {
        type: "referred", effectiveDate: "2026-07-21", transactionNumber: "TX-1"
    });
    const result = await context.addBulkViolationCorrections([
        bulkTargets[0], { facilityLicense: "200", visitId: "gov-visit" }
    ], bulkInput);
    assert.equal(result.saved.length, 2);
    const first = supabase.rows.get("facilityStatus").value["100"].visits[0];
    const second = supabase.rows.get("facilityStatus").value["200"].visits[0];
    assert.equal(first.violationActions.length, 2);
    assert.equal(first.violationActions[0].transactionNumber, "TX-1");
    assert.equal(first.violationActions[1].notes, second.violationActions[0].notes);
});

test("bulk correction controls retain only failed selections for retry", async () => {
    const { context, document } = await createBulkRuntime();
    const elements = new Map();
    const element = id => {
        if (!elements.has(id)) elements.set(id, {
            value: "", textContent: "", innerHTML: "", dataset: {}, disabled: false,
            listeners: {}, addEventListener(type, listener) { this.listeners[type] = listener; },
            reset() {}, showModal() {}, close() {},
            querySelectorAll() { return []; }
        });
        return elements.get(id);
    };
    document.getElementById = element;
    context.escapeHtml = String;
    context.allFacilities = [{ license: "100", name: "مستشفى حكومي", district: "الملز" }];
    context.initializeBulkCorrectionControls();
    context.openBulkCorrectionDialog();
    const change = element("bulkCorrectionList").listeners.change;
    change({ target: { dataset: { bulkCorrectionIndex: "0" }, checked: true } });
    change({ target: { dataset: { bulkCorrectionIndex: "1" }, checked: true } });
    element("bulkCorrectionReason").value = bulkInput.notes;
    element("bulkCorrectionDate").value = bulkInput.effectiveDate;
    let calls = 0;
    context.addBulkViolationCorrections = async targets => {
        calls++;
        assert.equal(targets.length, calls === 1 ? 2 : 1);
        if (calls === 2) assert.equal(targets[0].visitId, "violation-2");
        return calls === 1 ? { saved: [targets[0]], skipped: [], failed: [targets[1]] } :
            { saved: targets, skipped: [], failed: [] };
    };
    const submit = element("bulkCorrectionForm").listeners.submit;
    await submit({ preventDefault() {} });
    assert.match(element("bulkCorrectionMessage").textContent, /تعذر حفظ 1/);
    assert.match(element("bulkCorrectionCount").textContent, /المحددة: 1/);
    await submit({ preventDefault() {} });
    assert.match(element("bulkCorrectionCount").textContent, /المحددة: 0/);
    assert.equal(calls, 2);
});
