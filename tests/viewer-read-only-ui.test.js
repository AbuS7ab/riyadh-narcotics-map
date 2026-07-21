const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const employees = fs.readFileSync(path.join(root, "js/employees.js"), "utf8");
const users = fs.readFileSync(path.join(root, "js/users.js"), "utf8");

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

test("employee management remains Admin-only", () => {
    assert.match(html, /id="employeesPanel"[^>]*admin-only/);
    assert.match(
        employees,
        /function initializeEmployeesInterface[\s\S]*if \(!isAdminUser\(\)\) return;[\s\S]*employeeForm/
    );
});
