const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sidebar = fs.readFileSync(path.join(root, "js/sidebar.js"), "utf8");

test("Admin facility details preserve a return path to the selected committee", () => {
    assert.match(
        sidebar,
        /const adminCommitteeUsername = isAdminUser\(\) &&[\s\S]*?selectedCommitteeUsername[\s\S]*?users\[selectedCommitteeUsername\]/
    );
    assert.match(
        sidebar,
        /const canReturnToAssignedFacilities = Boolean\([\s\S]*?isCommitteeUser\(\) \|\| adminCommitteeUsername[\s\S]*?\)/
    );
    assert.match(
        sidebar,
        /\$\{canReturnToAssignedFacilities \? `[\s\S]*?id="backToAssignedFacilities"[\s\S]*?العودة إلى المنشآت المسندة/
    );
});

test("Admin back button restores the same committee list and assignment filter", () => {
    assert.match(
        sidebar,
        /if \(adminCommitteeUsername\) \{[\s\S]*?showCommitteeFacilityList\([\s\S]*?users\[adminCommitteeUsername\][\s\S]*?getFacilitiesForCurrentAssignmentCycle\([\s\S]*?adminCommitteeUsername,[\s\S]*?allFacilities[\s\S]*?\)[\s\S]*?return;/
    );
    assert.match(
        sidebar,
        /showFacilityList\([\s\S]*?getAssignedFacilitiesForCurrentUser\(allFacilities\)[\s\S]*?committeeAssignedView: true/
    );
});
