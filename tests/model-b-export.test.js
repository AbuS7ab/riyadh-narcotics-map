const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");

const projectRoot = path.join(__dirname, "..");


function createContext(overrides = {}) {

    const visitsByLicense = overrides.visitsByLicense || {};
    const employeeNames = overrides.employeeNames || {};
    const context = vm.createContext({
        console,
        Date,
        window: {},
        document: { getElementById: () => null },
        getEmployeeName: id => employeeNames[id] || "",
        getFacilityDisplayLicense: facility =>
            facility.displayLicense || facility.license,
        getFacilityVisits: license => visitsByLicense[license] || [],
        getNormalizedVisitDate(value) {

            if (value instanceof Date) {

                const year = value.getFullYear();
                const month = String(value.getMonth() + 1).padStart(2, "0");
                const day = String(value.getDate()).padStart(2, "0");

                return `${year}-${month}-${day}`;

            }

            return String(value || "").slice(0, 10);

        },
        visitMatchesDateRange(visit, dateFrom, dateTo) {

            const date = String(
                visit.date ||
                visit.visitDate ||
                visit.completedAt ||
                visit.createdAt ||
                ""
            ).slice(0, 10);

            return Boolean(date) &&
                (!dateFrom || date >= dateFrom) &&
                (!dateTo || date <= dateTo);

        },
        ...overrides.context
    });

    vm.runInContext(
        fs.readFileSync(path.join(projectRoot, "js/model-b-export.js"), "utf8"),
        context
    );

    return context;

}


test("Model B exports every visit in range and keeps the requested columns blank", () => {

    const facilities = [
        {
            name: "صيدلية الاختبار",
            type: "صيدلية",
            license: "00123",
            displayLicense: "00123",
            city: "الرياض"
        }
    ];
    const context = createContext({
        visitsByLicense: {
            "00123": [
                {
                    date: "2026-07-20",
                    visitType: "periodic",
                    teamSnapshot: {
                        leader: "أحمد",
                        members: ["سارة", "محمد"]
                    }
                },
                {
                    date: "2026-07-22",
                    visitType: "reactive",
                    teamSnapshot: {
                        leader: "أحمد",
                        members: ["سارة"]
                    }
                },
                { date: "2026-07-27", visitType: "periodic" }
            ]
        }
    });
    const rows = context.collectModelBVisitRows(
        facilities,
        "2026-07-19",
        "2026-07-23"
    );

    assert.equal(rows.length, 2);
    assert.equal(rows[0].length, 14);
    assert.equal(rows[0][0], 1);
    assert.equal(rows[1][0], 2);
    assert.equal(rows[0][4], "00123");
    assert.equal(rows[0][5], "اعتيادية");
    assert.equal(rows[1][5], "تفاعلية");
    assert.equal(rows[0][12], "أحمد");
    assert.equal(rows[0][13], "سارة، محمد");

    [1, 7, 9, 10, 11].forEach(columnIndex => {

        assert.equal(rows[0][columnIndex], "");
        assert.equal(rows[1][columnIndex], "");

    });

});


test("Model B uses historical participant ids without duplicating the leader", () => {

    const context = createContext({
        employeeNames: {
            leader: "قائد اللجنة",
            member1: "عضو أول",
            member2: "عضو ثان"
        },
        visitsByLicense: {
            "1400": [{
                date: "2026-07-21",
                employeeSnapshot: {
                    leaderId: "leader",
                    memberIds: ["member1", "member2"],
                    employeeIds: ["leader", "member1", "member2"]
                }
            }]
        }
    });
    const rows = context.collectModelBVisitRows(
        [{ name: "منشأة", type: "مستشفى", license: "1400" }],
        "2026-07-21",
        "2026-07-21"
    );

    assert.equal(rows[0][8], "الرياض");
    assert.equal(rows[0][12], "قائد اللجنة");
    assert.equal(rows[0][13], "عضو أول، عضو ثان");

});


test("Model B includes non-cancelled external visits in the selected range", () => {

    const context = createContext({
        employeeNames: {
            memberId: "عضو بالمعرف"
        }
    });
    const rows = context.collectModelBVisitRows(
        [{
            name: "منشأة داخل الخطة",
            type: "صيدلية",
            license: "100"
        }],
        "2026-07-20",
        "2026-07-26",
        {
            external1: {
                isExternal: true,
                facilityName: "منشأة خارج الخطة",
                facilityType: "مستشفى عام",
                facilitySnapshot: {
                    license: "EXT-001",
                    city: "الخرج"
                },
                visitDate: "2026-07-23",
                missionStatus: "مكتملة",
                missionType: "بلاغ",
                teamSnapshot: {
                    leader: "قائد المهمة"
                },
                participants: ["قائد المهمة", "عضو مباشر"],
                participantIds: ["memberId"]
            },
            externalCancelled: {
                isExternal: true,
                facilityName: "مهمة ملغاة",
                visitDate: "2026-07-24",
                missionStatus: "ملغاة"
            },
            externalOutsideRange: {
                isExternal: true,
                facilityName: "مهمة قديمة",
                visitDate: "2026-07-10",
                missionStatus: "مكتملة"
            }
        }
    );

    assert.equal(rows.length, 1);
    assert.equal(rows[0][2], "منشأة خارج الخطة");
    assert.equal(rows[0][3], "مستشفى عام");
    assert.equal(rows[0][4], "EXT-001");
    assert.equal(rows[0][5], "خارج الخطة");
    assert.equal(rows[0][8], "الخرج");
    assert.equal(rows[0][12], "قائد المهمة");
    assert.equal(rows[0][13], "عضو مباشر، عضو بالمعرف");

    [1, 7, 9, 10, 11].forEach(columnIndex => {

        assert.equal(rows[0][columnIndex], "");

    });

});


test("Model B merges planned and external visits in chronological order", () => {

    const context = createContext({
        visitsByLicense: {
            "100": [{
                date: "2026-07-24",
                visitType: "periodic"
            }]
        }
    });
    const rows = context.collectModelBVisitRows(
        [{
            name: "منشأة داخل الخطة",
            type: "صيدلية",
            license: "100"
        }],
        "2026-07-20",
        "2026-07-26",
        {
            external1: {
                facilityName: "منشأة خارج الخطة",
                visitDate: "2026-07-22",
                missionStatus: "قيد التنفيذ"
            }
        }
    );

    assert.equal(rows.length, 2);
    assert.equal(rows[0][2], "منشأة خارج الخطة");
    assert.equal(rows[0][5], "خارج الخطة");
    assert.equal(rows[1][2], "منشأة داخل الخطة");
    assert.equal(rows[1][5], "اعتيادية");

});


test("Model B Open XML population preserves styles and leaves official blank columns empty", () => {

    const context = createContext();
    const templateXml = [
        "<worksheet><sheetData><row r=\"3\">",
        "<c r=\"A3\" s=\"30\"><v>1</v></c>",
        "<c r=\"B3\" s=\"83\"/>",
        "<c r=\"C3\" s=\"88\"/>",
        "<c r=\"D3\" s=\"31\"/>",
        "<c r=\"E3\" s=\"87\"/>",
        "<c r=\"F3\" s=\"32\"/>",
        "<c r=\"G3\" s=\"91\"/>",
        "<c r=\"H3\" s=\"32\"/>",
        "<c r=\"I3\" s=\"32\"/>",
        "<c r=\"J3\" s=\"32\"/>",
        "<c r=\"K3\" s=\"15\"/>",
        "<c r=\"L3\" s=\"32\"/>",
        "<c r=\"M3\" s=\"32\"/>",
        "<c r=\"N3\" s=\"32\"/>",
        "</row><row r=\"4\"><c r=\"A4\" s=\"30\"><v>2</v></c></row>",
        "</sheetData></worksheet>"
    ].join("");
    const row = [
        1, "", "منشأة & اختبار", "صيدلية", "00123", "اعتيادية",
        new Date(2026, 6, 20, 12), "", "الرياض", "", "", "",
        "قائد اللجنة", "عضو أول"
    ];
    const populatedXml = context.populateModelBWorksheetXml(templateXml, [row]);

    assert.match(
        populatedXml,
        /<c r="C3" s="88" t="inlineStr"><is><t>منشأة &amp; اختبار<\/t><\/is><\/c>/
    );
    assert.match(populatedXml, /<c r="E3" s="87" t="inlineStr"><is><t>00123/);
    assert.match(populatedXml, /<c r="G3" s="91"><v>46223<\/v><\/c>/);

    ["B3", "H3", "J3", "K3", "L3"].forEach(address => {

        assert.match(populatedXml, new RegExp(`<c r="${address}" s="\\d+"\\/>`));

    });

});


test("Model B fills missing template cells when a long export reaches a sparse row", () => {

    const context = createContext();
    const rowThreeCells = Array.from({ length: 14 }, (_, columnIndex) => {

        const address = `${String.fromCharCode(65 + columnIndex)}3`;

        return `<c r="${address}" s="${30 + columnIndex}"/>`;

    }).join("");
    const templateXml = [
        "<worksheet><sheetData>",
        `<row r="3">${rowThreeCells}</row>`,
        '<row r="4"><c r="A4" s="30"/></row>',
        "</sheetData></worksheet>"
    ].join("");
    const rows = [
        [
            1, "", "منشأة أولى", "صيدلية", "001", "اعتيادية",
            new Date(2026, 6, 20, 12), "", "الرياض", "", "", "",
            "قائد", "عضو"
        ],
        [
            2, "", "منشأة ثانية", "مستشفى", "002", "اعتيادية",
            new Date(2026, 6, 21, 12), "", "الرياض", "", "", "",
            "قائد", "عضو"
        ]
    ];
    const populatedXml = context.populateModelBWorksheetXml(templateXml, rows);

    assert.match(
        populatedXml,
        /<c r="C4" s="32" t="inlineStr"><is><t>منشأة ثانية<\/t><\/is><\/c>/
    );
    assert.match(populatedXml, /<c r="N4" s="43" t="inlineStr">/);
    assert.match(populatedXml, /<c r="B4" s="31"\/>/);
    assert.match(populatedXml, /<c r="H4" s="37"\/>/);

});


test("Model B template and export controls are wired into the application", () => {

    const html = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
    const filters = fs.readFileSync(
        path.join(projectRoot, "js/filters.js"),
        "utf8"
    );

    assert.ok(fs.existsSync(
        path.join(projectRoot, "assets/model-b-template.xlsx")
    ));
    assert.match(html, /id="exportModelB"/);
    assert.match(html, /jszip@3\.10\.1/);
    assert.match(html, /js\/model-b-export\.js/);
    assert.match(filters, /initializeModelBExport\(\)/);
    assert.match(
        fs.readFileSync(
            path.join(projectRoot, "js/model-b-export.js"),
            "utf8"
        ),
        /getMergedFacilities\(\)/
    );
    assert.match(
        fs.readFileSync(
            path.join(projectRoot, "js/model-b-export.js"),
            "utf8"
        ),
        /typeof externalVisits === "undefined"/
    );

});
