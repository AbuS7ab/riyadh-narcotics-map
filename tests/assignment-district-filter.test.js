const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    createCloudRuntime,
    createInitialRows
} = require("./helpers/runtime");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const usersSource = fs.readFileSync(path.join(root, "js/users.js"), "utf8");


function createAdmin() {

    return {
        username: "admin",
        password: "admin",
        displayName: "مدير النظام",
        committeeName: "إدارة الامتثال",
        role: "admin",
        active: true,
        team: { leader: "", members: [] }
    };

}


function createCommittee() {

    return {
        username: "committee4",
        password: "test",
        displayName: "لجنة 4",
        committeeName: "لجنة 4",
        role: "committee",
        active: true,
        team: { leader: "", members: [] }
    };

}


async function createAdminRuntime() {

    const rows = createInitialRows({
        users: {
            value: {
                admin: createAdmin(),
                committee4: createCommittee()
            }
        }
    });
    const runtime = await createCloudRuntime(rows, {
        localStorage: { currentUser: "admin" }
    });

    runtime.loadScript("users");
    await runtime.context.initializeUserState();

    return runtime;

}


function createFacilities() {

    return [
        {
            license: "100",
            name: "صيدلية ألف",
            district: "حي النرجس",
            type: "صيدلية",
            lat: 24.80,
            lng: 46.65
        },
        {
            license: "101",
            name: "صيدلية باء",
            district: "حي النرجس",
            type: "صيدلية",
            lat: 24.81,
            lng: 46.66
        },
        {
            license: "200",
            name: "مجمع جيم",
            district: "حي اليرموك",
            type: "مجمع طبي",
            lat: 24.77,
            lng: 46.78
        }
    ];

}


test("assignment board exposes a read-only district selector", () => {

    assert.match(html, /id="assignmentDistrictFilter"/);
    assert.match(html, /<option value="">كل الأحياء<\/option>/);
    assert.match(usersSource, /districtFilter\.addEventListener\("change"/);

});


test("assignment district and text search compose inside the visible list", async () => {

    const { context } = await createAdminRuntime();
    const facilities = createFacilities();

    context.getFacilityDisplayLicense = facility => facility.license;

    const visibleFacilities = context.getAssignmentBoardFacilities(
        facilities,
        {
            district: "حَيّ النرجس",
            query: "صيدلية",
            visitType: "periodic"
        }
    );

    assert.deepEqual(
        Array.from(visibleFacilities, facility => facility.license),
        ["100", "101"]
    );
    assert.deepEqual(
        Array.from(context.getAssignmentDistrictOptions([
            ...facilities,
            { ...facilities[0], license: "102", district: "حي النرجِس" }
        ])).filter(district => district.includes("النرج")),
        ["حي النرجس"]
    );

});


test("smart assignment cannot leave the selected district", async () => {

    const { context, supabase } = await createAdminRuntime();
    const assignedFacilities = await context.smartAssignFacilities(
        createFacilities(),
        "committee4",
        3,
        "",
        "حي النرجس"
    );
    const savedAssignments = supabase.rows.get("facilityAssignments").value;

    assert.deepEqual(
        Array.from(assignedFacilities, facility => facility.license).sort(),
        ["100", "101"]
    );
    assert.deepEqual(Object.keys(savedAssignments).sort(), ["100", "101"]);
    assert.equal(savedAssignments["200"], undefined);

});


test("clearing the district keeps the existing all-district assignment", async () => {

    const { context, supabase } = await createAdminRuntime();
    const assignedFacilities = await context.smartAssignFacilities(
        createFacilities(),
        "committee4",
        3
    );

    assert.equal(assignedFacilities.length, 3);
    assert.deepEqual(
        Object.keys(supabase.rows.get("facilityAssignments").value).sort(),
        ["100", "101", "200"]
    );

});
