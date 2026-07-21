const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const employees = fs.readFileSync(path.join(root, "js/employees.js"), "utf8");
const externalVisits = fs.readFileSync(path.join(root, "js/external-visits.js"), "utf8");
const users = fs.readFileSync(path.join(root, "js/users.js"), "utf8");
const sidebar = fs.readFileSync(path.join(root, "js/sidebar.js"), "utf8");

test("Viewer can see committee cards and the employee performance panel", () => {
    assert.match(
        html,
        /href="#employeePerformancePanel"[^>]*class="management-read-only"|class="management-read-only"[^>]*href="#employeePerformancePanel"/
    );
    assert.match(
        html,
        /id="employeePerformancePanel"[^>]*management-read-only/
    );
    assert.match(
        users,
        /renderCommitteeAssignmentCards[\s\S]*!isAdminUser\(\) && !isViewerUser\(\)/
    );
    assert.match(
        employees,
        /function renderEmployeePerformanceDashboard[\s\S]*!isAdminUser\(\) && !isViewerUser\(\)/
    );
});

test("Viewer can open committee cards and inspect completed and remaining facilities", () => {
    assert.doesNotMatch(
        users,
        /renderCommitteeAssignmentCards[\s\S]*?if \(!isAdminUser\(\)\) return;[\s\S]*?container\.querySelectorAll\("\.committee-card"\)/
    );
    assert.match(
        sidebar,
        /function showCommitteeFacilityList[\s\S]*?!isAdminUser\(\) && !isViewerUser\(\)/
    );
    assert.match(sidebar, /data-admin-assigned-list-filter="remaining"/);
    assert.match(sidebar, /المتبقية \(\$\{remainingCount\}\)/);
    assert.match(sidebar, /const canManageAssignments = isAdminUser\(\);/);
    assert.match(sidebar, /\$\{canManageAssignments \? `/);
    assert.match(
        sidebar,
        /if \(!canManageAssignments\) return;[\s\S]*?selectAll\.addEventListener/
    );
});

test("employee management remains Admin-only", () => {
    assert.match(html, /id="employeesPanel"[^>]*admin-only/);
    assert.match(
        employees,
        /function initializeEmployeesInterface[\s\S]*if \(!isAdminUser\(\)\) return;[\s\S]*employeeForm/
    );
});

test("Viewer can inspect all external visits without write controls", () => {
    assert.match(
        html,
        /id="showExternalVisitsWorkspace"[^>]*management-read-only/
    );
    assert.match(
        html,
        /id="externalMissionStatistics"[^>]*management-read-only/
    );
    assert.match(
        html,
        /id="externalVisitsWorkspace"[^>]*management-read-only/
    );
    assert.match(
        html,
        /id="showExternalVisitForm"[\s\S]*?external-visit-action/
    );
    assert.match(
        externalVisits,
        /function canViewExternalVisit[\s\S]*isAdminUser\(\) \|\| isViewerUser\(\)/
    );
    assert.match(
        externalVisits,
        /function canManageExternalVisit[\s\S]*isAdminUser\(\)/
    );
    assert.match(
        externalVisits,
        /function saveExternalVisitFromForm[\s\S]*!isCommitteeUser\(\) && !isAdminUser\(\)/
    );
    assert.match(
        externalVisits,
        /function deleteExternalVisit[\s\S]*!visit \|\| !isAdminUser\(\)/
    );
});
