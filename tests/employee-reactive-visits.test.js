const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "js/employees.js"), "utf8");


function createRuntime() {

    const context = vm.createContext({
        console,
        Date,
        Map,
        Set,
        document: {},
        window: {}
    });

    vm.runInContext(source, context, { filename: "employees.js" });
    vm.runInContext(`
        employees = {
            employee1: {
                id: "employee1",
                fullName: "موظف تجريبي",
                employeeNumber: "100",
                isActive: true
            }
        };
        users = {};
        externalVisits = {};
        getMergedFacilities = () => [{
            license: "facility-1",
            type: "مستشفى"
        }];
        getCommitteeUsers = () => [];
        getFacilityAssignment = () => null;
        facilityStatus = {
            "facility-1": {
                visits: [
                    {
                        id: "periodic-1",
                        facilityLicense: "facility-1",
                        date: "2026-07-01",
                        visitStatus: "visited",
                        visitType: "periodic",
                        employeeSnapshot: { employeeIds: ["employee1"] }
                    },
                    {
                        id: "reactive-1",
                        facilityLicense: "facility-1",
                        date: "2026-07-15",
                        visitStatus: "visited",
                        visitType: "reactive",
                        visitReason: "شكوى",
                        employeeSnapshot: { employeeIds: ["employee1"] }
                    },
                    {
                        id: "reactive-2",
                        facilityLicense: "facility-1",
                        date: "2026-07-20",
                        visitStatus: "visited",
                        visitType: "reactive",
                        visitReason: "شكوى",
                        employeeSnapshot: {
                            leaderId: "employee1",
                            employeeIds: ["employee1", "employee1"]
                        }
                    },
                    {
                        id: "reactive-incomplete",
                        facilityLicense: "facility-1",
                        date: "2026-07-25",
                        visitStatus: "not_visited",
                        visitType: "reactive",
                        employeeSnapshot: { employeeIds: ["employee1"] }
                    }
                ]
            }
        };
    `, context);

    return context;

}


test("employee performance counts completed reactive visits separately", () => {

    const context = createRuntime();
    const rows = context.calculateEmployeePerformanceRows({
        from: null,
        to: null,
        committee: "all",
        employeeStatus: "all",
        facilityType: "all",
        search: ""
    });

    assert.equal(rows.length, 1);
    assert.equal(rows[0].completedFacilities, 1);
    assert.equal(rows[0].reactiveVisits, 2);
    assert.deepEqual(Array.from(rows[0].reactiveVisitIds), [
        "id:reactive-1",
        "id:reactive-2"
    ]);

});


test("employee performance export includes the reactive visit count", () => {

    const context = createRuntime();
    const exported = context.getEmployeePerformanceExportRows([{
        fullName: "موظف تجريبي",
        employeeNumber: "100",
        currentCommittees: [],
        completedFacilities: 1,
        reactiveVisits: 2,
        violations: 0,
        externalMissions: 0,
        daysSinceLastActivity: 0,
        isActive: true
    }]);

    assert.equal(exported[0]["الزيارات التفاعلية"], 2);

});
