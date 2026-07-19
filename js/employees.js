let employees = {};
let employeePerformanceCache = null;
let employeePerformanceRows = [];
let employeePerformanceVisibleRows = [];
let employeePerformancePage = 1;
let employeePerformanceSort = { key: "completedFacilities", direction: "desc" };
const employeePerformancePageSize = 10;


function normalizeEmployeeName(value) {

    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[\u064B-\u065F\u0670]/g, "")
        .replace(/\s+/g, " ");

}


function createEmployeeId() {

    return `employee-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

}


function findEmployeeByNormalizedName(name, records = employees) {

    const normalizedName = normalizeEmployeeName(name);

    if (!normalizedName) return null;

    return Object.values(records).find(employee => {

        return employee && normalizeEmployeeName(employee.fullName) === normalizedName;

    }) || null;

}


function createMigratedEmployee(fullName, records) {

    const existing = findEmployeeByNormalizedName(fullName, records);

    if (existing) return existing;

    const now = new Date().toISOString();
    const employee = {
        id: createEmployeeId(),
        employeeNumber: "",
        fullName: String(fullName || "").trim(),
        jobTitle: "",
        isActive: true,
        createdAt: now,
        updatedAt: now
    };

    records[employee.id] = employee;

    return employee;

}


function migrateCommitteeEmployees(currentUsers, currentEmployees) {

    const nextEmployees = { ...(currentEmployees || {}) };
    const nextUsers = { ...(currentUsers || {}) };
    let employeesChanged = false;
    let usersChanged = false;

    Object.entries(nextUsers).forEach(([username, user]) => {

        if (!user || user.role !== "committee") return;

        const team = normalizeTeam(user.team);
        let leaderId = String(user.leaderId || "");
        let memberIds = Array.isArray(user.memberIds)
            ? user.memberIds.map(String).filter(Boolean)
            : [];

        if (!leaderId && team.leader) {

            const beforeCount = Object.keys(nextEmployees).length;
            leaderId = createMigratedEmployee(team.leader, nextEmployees).id;
            employeesChanged = employeesChanged || Object.keys(nextEmployees).length > beforeCount;

        }

        if (!Array.isArray(user.memberIds)) {

            memberIds = team.members.map(name => {

                const beforeCount = Object.keys(nextEmployees).length;
                const employee = createMigratedEmployee(name, nextEmployees);

                employeesChanged = employeesChanged || Object.keys(nextEmployees).length > beforeCount;

                return employee.id;

            });

        }

        const uniqueMemberIds = [...new Set(memberIds.filter(id => id !== leaderId))];
        const committeeId = user.id || `committee-${username}`;

        if (user.id !== committeeId ||
            user.leaderId !== leaderId ||
            JSON.stringify(user.memberIds || null) !== JSON.stringify(uniqueMemberIds)) {

            nextUsers[username] = {
                ...user,
                id: committeeId,
                leaderId,
                memberIds: uniqueMemberIds
            };
            usersChanged = true;

        }

    });

    return { employees: nextEmployees, users: nextUsers, employeesChanged, usersChanged };

}


async function initializeEmployeesState() {

    const migrated = migrateCommitteeEmployees(users, loadEmployees());

    employees = migrated.employees;
    users = migrated.users;

    if (migrated.employeesChanged) await saveEmployees(employees);
    else await seedCloudKey("employees", employees);

    if (migrated.usersChanged) await saveUsers(users);

    currentUser = currentUsername ? users[currentUsername] || null : null;

}


function getEmployees() {

    return Object.values(employees)
        .filter(employee => employee && typeof employee === "object")
        .sort((a, b) => String(a.fullName || "").localeCompare(String(b.fullName || ""), "ar"));

}


function getEmployeeById(employeeId) {

    return employees[String(employeeId || "")] || null;

}


function getEmployeeName(employeeId) {

    const employee = getEmployeeById(employeeId);

    return employee ? employee.fullName : "";

}


function getCommitteeEmployeeIds(committee, activeOnly = false) {

    if (!committee) return [];

    const ids = [committee.leaderId, ...(Array.isArray(committee.memberIds) ? committee.memberIds : [])]
        .map(String)
        .filter(Boolean);

    return [...new Set(ids)].filter(id => {

        const employee = getEmployeeById(id);

        return employee && (!activeOnly || employee.isActive);

    });

}


function getActiveCommitteeEmployeeSnapshot(committeeUsername) {

    const committee = users[committeeUsername];
    const activeIds = getCommitteeEmployeeIds(committee, true);
    const leaderId = activeIds.includes(String(committee && committee.leaderId || ""))
        ? String(committee.leaderId)
        : "";
    const memberIds = activeIds.filter(id => id !== leaderId);

    return { leaderId, memberIds, employeeIds: [...activeIds] };

}


function getActiveEmployeeOptions(selectedId = "") {

    const normalizedSelectedId = String(selectedId || "");

    return getEmployees()
        .filter(employee => employee.isActive)
        .map(employee => `
            <option value="${escapeHtml(employee.id)}"
                    ${String(employee.id) === normalizedSelectedId ? "selected" : ""}>
                ${escapeHtml(employee.fullName)}
            </option>
        `).join("");

}


function getActiveEmployeeMemberCheckboxes(selectedIds = [], leaderId = "") {

    const selected = new Set(selectedIds.map(String));
    const normalizedLeaderId = String(leaderId || "");

    return getEmployees()
        .filter(employee => employee.isActive)
        .map(employee => {

            const employeeId = String(employee.id);
            const isLeader = employeeId === normalizedLeaderId;

            return `
                <label class="committee-member-option">
                    <input class="form-check-input user-team-member-checkbox" type="checkbox"
                           value="${escapeHtml(employee.id)}"
                           ${selected.has(employeeId) && !isLeader ? "checked" : ""}
                           ${isLeader ? "disabled" : ""}>
                    <span>${escapeHtml(employee.fullName)}</span>
                </label>
            `;

        }).join("");

}


function validateEmployeeInput(data) {

    if (!data.fullName) return "اسم الموظف مطلوب.";

    if (data.employeeNumber) {

        const duplicate = getEmployees().find(employee => {

            return employee.id !== data.id &&
                String(employee.employeeNumber || "").trim().toLowerCase() ===
                data.employeeNumber.toLowerCase();

        });

        if (duplicate) return "الرقم الوظيفي مستخدم لموظف آخر.";

    }

    return "";

}


async function saveEmployeeFromForm() {

    if (!isAdminUser()) return;

    const id = document.getElementById("employeeId").value.trim();
    const existing = id ? getEmployeeById(id) : null;
    const data = {
        id,
        fullName: document.getElementById("employeeFullName").value.trim(),
        employeeNumber: document.getElementById("employeeNumber").value.trim(),
        jobTitle: document.getElementById("employeeJobTitle").value.trim(),
        isActive: document.getElementById("employeeIsActive").checked
    };
    const validationMessage = validateEmployeeInput(data);

    if (validationMessage) {

        showEmployeeMessage(validationMessage, "text-danger");
        return;

    }

    const employeeId = existing ? existing.id : createEmployeeId();
    const now = new Date().toISOString();

    employees = {
        ...employees,
        [employeeId]: {
            ...(existing || {}),
            id: employeeId,
            employeeNumber: data.employeeNumber,
            fullName: data.fullName,
            jobTitle: data.jobTitle,
            isActive: data.isActive,
            createdAt: existing && existing.createdAt ? existing.createdAt : now,
            updatedAt: now
        }
    };

    await saveEmployees(employees);
    resetEmployeeForm();
    renderEmployeesPanel();
    renderUsersPanel();
    updateEmployeeDashboard();
    refreshEmployeePerformanceDashboard();
    showEmployeeMessage("تم حفظ الموظف.", "text-success");

}


function resetEmployeeForm() {

    const form = document.getElementById("employeeForm");

    if (!form) return;

    form.reset();
    document.getElementById("employeeId").value = "";
    document.getElementById("employeeIsActive").checked = true;
    document.getElementById("cancelEmployeeEdit").classList.add("d-none");

}


function editEmployee(employeeId) {

    const employee = getEmployeeById(employeeId);

    if (!employee || !isAdminUser()) return;

    document.getElementById("employeeId").value = employee.id;
    document.getElementById("employeeFullName").value = employee.fullName || "";
    document.getElementById("employeeNumber").value = employee.employeeNumber || "";
    document.getElementById("employeeJobTitle").value = employee.jobTitle || "";
    document.getElementById("employeeIsActive").checked = Boolean(employee.isActive);
    document.getElementById("cancelEmployeeEdit").classList.remove("d-none");
    document.getElementById("employeeForm").scrollIntoView({ behavior: "smooth", block: "center" });

}


function showEmployeeMessage(text, className) {

    const message = document.getElementById("employeeMessage");

    if (!message) return;

    message.textContent = text;
    message.className = `col-12 small ${className}`;

}


function searchEmployees(query) {

    const normalizedQuery = String(query || "").trim().toLowerCase();

    return getEmployees().filter(employee => {

        return [employee.fullName, employee.employeeNumber, employee.jobTitle].some(value => {

            return String(value || "").toLowerCase().includes(normalizedQuery);

        });

    });

}


function getEmployeeVisitRecords(employeeId) {

    const records = [];

    Object.entries(facilityStatus || {}).forEach(([license, status]) => {

        (Array.isArray(status.visits) ? status.visits : []).forEach(visit => {

            const ids = getPerformanceEventEmployeeIds(
                visit,
                visit.facilityLicense || license
            );
            const hasEmployeeCredit = ids.includes(String(employeeId));

            if (hasEmployeeCredit && visit.visitStatus === "visited") {

                records.push({ ...visit, facilityLicense: visit.facilityLicense || license });

            }

        });

    });

    return records;

}


function getEmployeeExternalMissions(employee) {

    if (typeof externalVisits === "undefined") return [];

    const normalizedName = normalizeEmployeeName(employee.fullName);

    return Object.values(externalVisits).filter(mission => {

        const ids = Array.isArray(mission.participantIds) ? mission.participantIds.map(String) : [];
        const names = typeof getExternalMissionParticipants === "function"
            ? getExternalMissionParticipants(mission)
            : [];

        return ids.includes(String(employee.id)) ||
            names.some(name => normalizeEmployeeName(name) === normalizedName);

    });

}


function getEmployeeProfile(employeeId) {

    const employee = getEmployeeById(employeeId);

    if (!employee) return null;

    const visits = getEmployeeVisitRecords(employeeId);
    const missions = getEmployeeExternalMissions(employee);
    const activityDates = [
        ...visits.map(visit => visit.createdAt || visit.date),
        ...missions.map(mission => mission.updatedAt || mission.createdAt || mission.visitDate)
    ].filter(Boolean).sort((a, b) => new Date(b) - new Date(a));

    return {
        employee,
        currentCommittees: getCommitteeUsers().filter(committee => {

            return getCommitteeEmployeeIds(committee).includes(String(employeeId));

        }),
        lastActivity: activityDates[0] || "",
        completedFacilities: new Set(visits.map(visit => String(visit.facilityLicense))).size,
        violations: new Set(
            visits.filter(visit => visit.violation || visit.result === "violation")
                .map(visit => String(visit.facilityLicense))
        ).size,
        externalMissions: missions.length
    };

}


function getEmployeeAchievementVisitType(value) {

    if (value === "reactive") return "تفاعلية";
    if (value === "periodic") return "اعتيادية";

    return "-";

}


function getEmployeeAchievementLocation(city, district) {

    return [city, district].map(value => String(value || "").trim()).filter(Boolean).join(" / ");

}


function getEmployeeAchievementRecords(employeeId) {

    const employee = getEmployeeById(employeeId);

    if (!employee) return [];

    const plannedRecords = getEmployeeVisitRecords(employeeId).map(visit => {

        const facility = typeof findFacilityByOriginalLicense === "function"
            ? findFacilityByOriginalLicense(visit.facilityLicense)
            : null;

        return {
            id: visit.id,
            date: visit.date || visit.createdAt || "",
            createdAt: visit.createdAt || "",
            facilityName: facility && facility.name || "-",
            facilityLicense: facility
                ? typeof getFacilityDisplayLicense === "function"
                    ? getFacilityDisplayLicense(facility)
                    : facility.license
                : visit.facilityLicense || "-",
            location: getEmployeeAchievementLocation(
                facility && facility.city,
                facility && facility.district
            ) || "-",
            missionType: "مهمة عمل ميدانية",
            missionDetails: visit.visitReason || "-",
            visitType: getEmployeeAchievementVisitType(visit.visitType),
            committeeName: visit.committeeName || "-",
            status: visit.visitStatus === "visited" ? "مكتملة" : "غير مكتملة",
            missionNumber: ""
        };

    });
    const externalRecords = getEmployeeExternalMissions(employee)
        .filter(mission => !mission.missionStatus || mission.missionStatus === "مكتملة")
        .map(mission => {

            const snapshot = mission.facilitySnapshot || {};

            return {
                id: mission.id || mission.externalVisitId || mission.missionNumber,
                date: mission.visitDate || mission.date || mission.createdAt || "",
                createdAt: mission.createdAt || "",
                facilityName: mission.facilityName || snapshot.name || "-",
                facilityLicense: snapshot.license || "-",
                location: getEmployeeAchievementLocation(snapshot.city, snapshot.district) || "-",
                missionType: "مهمة خارج الخطة",
                missionDetails: mission.visitReason || mission.missionTypeOther || mission.missionType || "-",
                visitType: getEmployeeAchievementVisitType(mission.visitType),
                committeeName: mission.committeeName || "-",
                status: mission.missionStatus === "مكتملة" || !mission.missionStatus
                    ? "مكتملة"
                    : "غير مكتملة",
                missionNumber: mission.missionNumber || ""
            };

        });

    return [...plannedRecords, ...externalRecords].sort((first, second) => {

        const dateDifference = new Date(second.date || 0) - new Date(first.date || 0);

        if (dateDifference !== 0) return dateDifference;

        return new Date(second.createdAt || 0) - new Date(first.createdAt || 0);

    });

}


function getEmployeeAchievementExportData(employeeId) {

    const employee = getEmployeeById(employeeId);

    if (!employee) return null;

    const achievements = getEmployeeAchievementRecords(employeeId);
    const rows = [
        ["سجل إنجاز الموظف"],
        ["اسم الموظف", employee.fullName || ""],
        ["رقم الموظف", employee.employeeNumber || ""],
        ["المسمى الوظيفي", employee.jobTitle || ""],
        [],
        [
            "التاريخ",
            "اسم المنشأة",
            "رقم الترخيص",
            "نوع المهمة",
            "تفاصيل المهمة",
            "نوع الزيارة",
            "اللجنة",
            "الحالة"
        ],
        ...achievements.map(record => [
            record.date,
            record.facilityName,
            record.facilityLicense,
            record.missionType,
            record.missionDetails,
            record.visitType,
            record.committeeName,
            record.status
        ])
    ];

    return { employee, achievements, rows };

}


function exportEmployeeAchievementRecord(employeeId) {

    if (!isAdminUser() || !window.XLSX) return;

    const report = getEmployeeAchievementExportData(employeeId);

    if (!report) return;

    const workbook = window.XLSX.utils.book_new();
    const worksheet = window.XLSX.utils.aoa_to_sheet(report.rows);

    worksheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }];
    worksheet["!cols"] = [
        { wch: 14 }, { wch: 30 }, { wch: 18 }, { wch: 22 },
        { wch: 28 }, { wch: 14 }, { wch: 22 }, { wch: 14 }
    ];
    window.XLSX.utils.book_append_sheet(workbook, worksheet, "سجل الإنجازات");

    const safeName = String(report.employee.fullName || "موظف").replace(/[\\/:*?"<>|]/g, "-");

    window.XLSX.writeFile(workbook, `سجل إنجاز الموظف - ${safeName}.xlsx`);

}


function showEmployeeDetails(employeeId) {

    const profile = getEmployeeProfile(employeeId);
    const detailsPanel = document.getElementById("employeeAchievementPanel");
    const details = document.getElementById("employeeAchievementContent");

    if (!isAdminUser() || !profile || !detailsPanel || !details) return;

    const employee = profile.employee;
    const achievements = getEmployeeAchievementRecords(employeeId);

    details.innerHTML = `
        <div class="d-flex align-items-center justify-content-between gap-2 mb-3 flex-wrap">
            <h5 class="mb-0">سجل إنجازات ${escapeHtml(employee.fullName)}</h5>
            <button id="exportEmployeeAchievements" type="button" class="btn btn-outline-success btn-sm">
                <i class="fa-solid fa-file-excel"></i> تصدير Excel
            </button>
        </div>
        <p><strong>المسمى الوظيفي:</strong> ${escapeHtml(employee.jobTitle || "-")}</p>
        <p><strong>الحالة:</strong> ${employee.isActive ? "نشط" : "غير نشط"}</p>
        <p><strong>اللجان الحالية:</strong> ${escapeHtml(profile.currentCommittees.map(item => item.committeeName).join("، ") || "-")}</p>
        <p><strong>آخر نشاط:</strong> ${escapeHtml(profile.lastActivity || "-")}</p>
        <p><strong>المنشآت المكتملة المسجلة:</strong> ${profile.completedFacilities}</p>
        <p><strong>المخالفات المسجلة:</strong> ${profile.violations}</p>
        <p><strong>المهام خارج الخطة:</strong> ${profile.externalMissions}</p>
        <div class="table-responsive mt-3 employee-achievement-table-wrap">
            <table class="table table-sm align-middle employee-achievement-table">
                <thead><tr>
                    <th>التاريخ</th><th>اسم المنشأة</th><th>رقم الترخيص</th><th>المدينة/الحي</th>
                    <th>نوع المهمة</th><th>تفاصيل المهمة</th><th>نوع الزيارة</th><th>اللجنة</th>
                    <th>الحالة</th><th>رقم المهمة</th>
                </tr></thead>
                <tbody>
                    ${achievements.length > 0 ? achievements.map(record => `
                        <tr>
                            <td>${escapeHtml(record.date || "-")}</td>
                            <td>${escapeHtml(record.facilityName)}</td>
                            <td>${escapeHtml(record.facilityLicense)}</td>
                            <td>${escapeHtml(record.location)}</td>
                            <td>${escapeHtml(record.missionType)}</td>
                            <td>${escapeHtml(record.missionDetails)}</td>
                            <td>${escapeHtml(record.visitType)}</td>
                            <td>${escapeHtml(record.committeeName)}</td>
                            <td><span class="badge ${record.status === "مكتملة" ? "text-bg-success" : "text-bg-warning"}">${record.status}</span></td>
                            <td>${escapeHtml(record.missionNumber || "-")}</td>
                        </tr>
                    `).join("") : `
                        <tr><td colspan="10" class="text-muted text-center py-3">لا توجد إنجازات مكتملة مسجلة.</td></tr>
                    `}
                </tbody>
            </table>
        </div>
    `;

    document.getElementById("exportEmployeeAchievements")
        .addEventListener("click", () => exportEmployeeAchievementRecord(employeeId));

    detailsPanel.classList.remove("d-none");
    detailsPanel.scrollIntoView({ behavior: "smooth", block: "start" });

}


function canDeleteEmployee(employeeId) {

    const profile = getEmployeeProfile(employeeId);

    return Boolean(profile) &&
        profile.currentCommittees.length === 0 &&
        profile.completedFacilities === 0 &&
        profile.externalMissions === 0;

}


async function deleteEmployee(employeeId) {

    if (!isAdminUser() || !canDeleteEmployee(employeeId)) return;
    if (!confirm("هل تريد حذف الموظف؟")) return;

    const nextEmployees = { ...employees };

    delete nextEmployees[String(employeeId)];
    employees = nextEmployees;
    await saveEmployees(employees);
    renderEmployeesPanel();
    renderUsersPanel();
    updateEmployeeDashboard();
    refreshEmployeePerformanceDashboard();

}


function renderEmployeesPanel() {

    const body = document.getElementById("employeesTableBody");
    const search = document.getElementById("employeeSearch");

    if (!body || !isAdminUser()) return;

    const visibleEmployees = searchEmployees(search ? search.value : "");

    body.innerHTML = visibleEmployees.map(employee => `
        <tr>
            <td><strong>${escapeHtml(employee.fullName)}</strong></td>
            <td>${escapeHtml(employee.employeeNumber || "-")}</td>
            <td>${escapeHtml(employee.jobTitle || "-")}</td>
            <td><span class="badge ${employee.isActive ? "text-bg-success" : "text-bg-secondary"}">${employee.isActive ? "نشط" : "غير نشط"}</span></td>
            <td>
                <button type="button" class="btn btn-sm btn-outline-primary employee-details" data-id="${escapeHtml(employee.id)}">التفاصيل</button>
                <button type="button" class="btn btn-sm btn-outline-secondary employee-edit" data-id="${escapeHtml(employee.id)}">تعديل</button>
                <button type="button" class="btn btn-sm btn-outline-danger employee-delete" data-id="${escapeHtml(employee.id)}"
                        ${canDeleteEmployee(employee.id) ? "" : "disabled"}>حذف</button>
            </td>
        </tr>
    `).join("");

    body.querySelectorAll(".employee-details").forEach(button => {

        button.addEventListener("click", () => showEmployeeDetails(button.dataset.id));

    });
    body.querySelectorAll(".employee-edit").forEach(button => {

        button.addEventListener("click", () => editEmployee(button.dataset.id));

    });
    body.querySelectorAll(".employee-delete").forEach(button => {

        button.addEventListener("click", () => {

            deleteEmployee(button.dataset.id).catch(() => {

                showEmployeeMessage("تعذر حذف الموظف.", "text-danger");

            });

        });

    });

}


function updateEmployeeDashboard() {

    const total = document.getElementById("employeeCount");
    const active = document.getElementById("activeEmployeeCount");

    if (total) total.textContent = getEmployees().length;
    if (active) active.textContent = getEmployees().filter(employee => employee.isActive).length;

}


function initializeEmployeesInterface() {

    if (!isAdminUser()) return;

    updateEmployeeDashboard();
    initializeEmployeePerformanceDashboard();

    const form = document.getElementById("employeeForm");
    const search = document.getElementById("employeeSearch");
    const cancel = document.getElementById("cancelEmployeeEdit");

    renderEmployeesPanel();
    if (form) form.addEventListener("submit", event => {

        event.preventDefault();
        saveEmployeeFromForm().catch(() => showEmployeeMessage("تعذر حفظ الموظف.", "text-danger"));

    });
    if (search) search.addEventListener("input", renderEmployeesPanel);
    if (cancel) cancel.addEventListener("click", resetEmployeeForm);

}


function invalidateEmployeePerformanceCache() {

    employeePerformanceCache = null;

}


function getPerformanceFacilityCategory(type) {

    const normalizedType = String(type || "");

    if (normalizedType.includes("مستشفى")) return "hospital";
    if (normalizedType.includes("صيدلية")) return "pharmacy";
    if (normalizedType.includes("مجمع")) return "complex";
    if (normalizedType.includes("مركز صحي") || normalizedType.includes("رعاية")) return "health_center";
    if (normalizedType.includes("إسعاف")) return "ambulance";

    return "other";

}


function getExistingEmployeeIds(employeeIds) {

    return [...new Set(employeeIds.map(String).filter(employeeId => {

        return employeeId && Boolean(getEmployeeById(employeeId));

    }))];

}


function getTeamSnapshotEmployeeIds(teamSnapshot = {}) {

    const snapshotIds = getExistingEmployeeIds([
        teamSnapshot.leaderId,
        ...(Array.isArray(teamSnapshot.memberIds) ? teamSnapshot.memberIds : [])
    ]);
    const matchedNameIds = [
        teamSnapshot.leader,
        ...(Array.isArray(teamSnapshot.members) ? teamSnapshot.members : [])
    ].map(name => {

        const employee = findEmployeeByNormalizedName(name);

        return employee ? String(employee.id) : "";

    });

    return getExistingEmployeeIds([...snapshotIds, ...matchedNameIds]);

}


function getHistoricalVisitAssignment(visit, facilityLicense) {

    const license = String(visit.facilityLicense || facilityLicense || "");

    if (!license || typeof getFacilityAssignment !== "function") return null;

    const assignment = getFacilityAssignment(license);

    if (!assignment) return null;

    if (assignment.facilityLicense &&
        String(assignment.facilityLicense) !== license) return null;

    if (visit.committeeUsername &&
        assignment.committeeUsername !== visit.committeeUsername) return null;

    return assignment;

}


function getPerformanceEventEmployeeIds(visit, facilityLicense = "") {

    if (visit.committeeUsername === "committee1") return [];

    const snapshot = visit.employeeSnapshot || {};
    const explicitIds = [
        snapshot.leaderId,
        ...(Array.isArray(snapshot.memberIds) ? snapshot.memberIds : []),
        ...(Array.isArray(snapshot.employeeIds) ? snapshot.employeeIds : [])
    ];
    const validExplicitIds = getExistingEmployeeIds(explicitIds);

    if (validExplicitIds.length > 0) return validExplicitIds;

    const visitTeamIds = getTeamSnapshotEmployeeIds(visit.teamSnapshot || {});

    if (visitTeamIds.length > 0) return visitTeamIds;

    const assignment = getHistoricalVisitAssignment(visit, facilityLicense);

    if (!assignment || assignment.committeeUsername === "committee1") return [];

    const assignmentTeamIds = getTeamSnapshotEmployeeIds(
        assignment.teamSnapshot || {}
    );

    if (assignmentTeamIds.length > 0) return assignmentTeamIds;

    if (!visit.committeeUsername ||
        assignment.committeeUsername !== visit.committeeUsername) return [];

    const committee = typeof users !== "undefined"
        ? users[visit.committeeUsername]
        : null;

    if (!committee || committee.role !== "committee") return [];

    return getExistingEmployeeIds([
        committee.leaderId,
        ...(Array.isArray(committee.memberIds) ? committee.memberIds : [])
    ]);

}


function buildEmployeePerformanceCache() {

    if (employeePerformanceCache) return employeePerformanceCache;

    const plannedByEmployee = new Map();
    const missionsByEmployee = new Map();
    const facilities = typeof getMergedFacilities === "function" ? getMergedFacilities() : [];
    const facilityByLicense = new Map(facilities.map(facility => [String(facility.license), facility]));

    const addEmployeeEvent = (target, employeeId, event) => {

        if (!target.has(employeeId)) target.set(employeeId, []);
        target.get(employeeId).push(event);

    };

    Object.entries(facilityStatus || {}).forEach(([license, status]) => {

        (Array.isArray(status.visits) ? status.visits : []).forEach(visit => {

            if (visit.visitStatus !== "visited") return;

            const facility = facilityByLicense.get(String(visit.facilityLicense || license)) || {};
            const event = {
                id: visit.id,
                date: visit.date || visit.createdAt || "",
                facilityLicense: String(visit.facilityLicense || license),
                facilityType: getPerformanceFacilityCategory(facility.type),
                committeeUsername: visit.committeeUsername || "",
                violation: Boolean(visit.violation || visit.result === "violation")
            };

            getPerformanceEventEmployeeIds(
                visit,
                visit.facilityLicense || license
            ).forEach(employeeId => {

                addEmployeeEvent(plannedByEmployee, employeeId, event);

            });

        });

    });

    Object.values(typeof externalVisits === "undefined" ? {} : externalVisits).forEach(mission => {

        if (!mission || mission.isExternal === false) return;

        const ids = Array.isArray(mission.participantIds) && mission.participantIds.length > 0
            ? mission.participantIds.map(String)
            : getExternalMissionParticipants(mission).map(name => {

                const employee = findEmployeeByNormalizedName(name);

                return employee ? employee.id : "";

            }).filter(Boolean);
        const snapshot = mission.facilitySnapshot || {};
        const event = {
            id: mission.id || mission.externalVisitId || mission.missionNumber,
            date: mission.visitDate || mission.date || mission.createdAt || "",
            facilityType: getPerformanceFacilityCategory(mission.facilityType || snapshot.type),
            committeeUsername: mission.committeeUsername || mission.committeeId || ""
        };

        [...new Set(ids)].forEach(employeeId => addEmployeeEvent(missionsByEmployee, employeeId, event));

    });

    employeePerformanceCache = { plannedByEmployee, missionsByEmployee };

    return employeePerformanceCache;

}


function parsePerformanceDate(value, endOfDay = false) {

    if (!value) return null;

    const date = new Date(`${String(value).slice(0, 10)}T${endOfDay ? "23:59:59.999" : "00:00:00"}`);

    return Number.isNaN(date.getTime()) ? null : date;

}


function getPerformancePeriodRange(period, customFrom, customTo) {

    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    if (period === "custom") {

        return {
            from: parsePerformanceDate(customFrom),
            to: parsePerformanceDate(customTo, true)
        };

    }

    if (period === "week") start.setDate(start.getDate() - start.getDay());
    if (period === "month") start.setDate(1);
    if (period === "quarter") {

        start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1);

    }
    if (period === "year") start.setMonth(0, 1);

    return { from: start, to: end };

}


function performanceEventMatches(event, filters) {

    const eventDate = parsePerformanceDate(event.date);

    if (filters.from && (!eventDate || eventDate < filters.from)) return false;
    if (filters.to && (!eventDate || eventDate > filters.to)) return false;
    if (filters.committee !== "all" && event.committeeUsername !== filters.committee) return false;
    if (filters.facilityType !== "all" && event.facilityType !== filters.facilityType) return false;

    return true;

}


function getEmployeePerformanceFilters() {

    const period = document.getElementById("performancePeriod").value;
    const range = getPerformancePeriodRange(
        period,
        document.getElementById("performanceDateFrom").value,
        document.getElementById("performanceDateTo").value
    );

    return {
        period,
        ...range,
        committee: document.getElementById("performanceCommittee").value,
        employeeStatus: document.getElementById("performanceEmployeeStatus").value,
        facilityType: document.getElementById("performanceFacilityType").value,
        search: document.getElementById("performanceEmployeeSearch").value.trim().toLowerCase()
    };

}


function getDaysSincePerformanceActivity(value) {

    const activityDate = parsePerformanceDate(value);

    if (!activityDate) return null;

    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    return Math.max(0, Math.floor((todayStart - activityDate) / 86400000));

}


function getPerformanceActivityLabel(days) {

    if (days === null) return "-";
    if (days === 0) return "اليوم";
    if (days === 1) return "أمس";

    return `قبل ${days} يوم`;

}


function calculateEmployeePerformanceRows(filters) {

    const cache = buildEmployeePerformanceCache();

    return getEmployees().map(employee => {

        const plannedEvents = (cache.plannedByEmployee.get(String(employee.id)) || [])
            .filter(event => performanceEventMatches(event, filters));
        const missionEvents = (cache.missionsByEmployee.get(String(employee.id)) || [])
            .filter(event => performanceEventMatches(event, filters));
        const committees = getCommitteeUsers().filter(committee => {

            return getCommitteeEmployeeIds(committee).includes(String(employee.id));

        });
        const activityDates = [
            ...plannedEvents.map(event => event.date),
            ...missionEvents.map(event => event.date)
        ].filter(Boolean).sort((a, b) => new Date(b) - new Date(a));
        const lastActivity = activityDates[0] || "";
        const daysSinceLastActivity = getDaysSincePerformanceActivity(lastActivity);
        const completedFacilityIds = [...new Set(plannedEvents.map(event => event.facilityLicense))];
        const violationFacilityIds = [...new Set(
            plannedEvents.filter(event => event.violation).map(event => event.facilityLicense)
        )];
        const externalMissionIds = [...new Set(missionEvents.map(event => event.id))];

        return {
            id: employee.id,
            fullName: employee.fullName,
            employeeNumber: employee.employeeNumber || "",
            currentCommittees: committees,
            committeeNames: committees.map(item => item.committeeName).join("، "),
            completedFacilities: completedFacilityIds.length,
            violations: violationFacilityIds.length,
            externalMissions: externalMissionIds.length,
            completedFacilityIds,
            violationFacilityIds,
            externalMissionIds,
            lastActivity,
            daysSinceLastActivity,
            isActive: Boolean(employee.isActive),
            hasSelectedCommitteeActivity: filters.committee === "all" ||
                plannedEvents.some(event => event.committeeUsername === filters.committee) ||
                missionEvents.some(event => event.committeeUsername === filters.committee)
        };

    }).filter(row => {

        if (filters.employeeStatus === "active" && !row.isActive) return false;
        if (filters.employeeStatus === "inactive" && row.isActive) return false;
        if (filters.search && ![row.fullName, row.employeeNumber].some(value => {

            return String(value || "").toLowerCase().includes(filters.search);

        })) return false;
        if (filters.committee !== "all" &&
            !row.currentCommittees.some(committee => committee.username === filters.committee) &&
            !row.hasSelectedCommitteeActivity) return false;

        return true;

    });

}


function sortEmployeePerformanceRows(rows) {

    const { key, direction } = employeePerformanceSort;
    const multiplier = direction === "asc" ? 1 : -1;

    return [...rows].sort((a, b) => {

        const first = a[key];
        const second = b[key];

        if (key === "lastActivity") {

            return ((new Date(first || 0)) - (new Date(second || 0))) * multiplier;

        }
        if (typeof first === "number" || typeof first === "boolean") {

            return (Number(first) - Number(second)) * multiplier;

        }

        return String(first || "").localeCompare(String(second || ""), "ar") * multiplier;

    });

}


function updateEmployeePerformanceKpis(rows) {

    document.getElementById("performanceEmployeeCount").textContent = rows.length;
    document.getElementById("performanceActiveCount").textContent = rows.filter(row => row.isActive).length;
    document.getElementById("performanceCompletedCount").textContent = new Set(
        rows.flatMap(row => row.completedFacilityIds)
    ).size;
    document.getElementById("performanceViolationCount").textContent = new Set(
        rows.flatMap(row => row.violationFacilityIds)
    ).size;
    document.getElementById("performanceMissionCount").textContent = new Set(
        rows.flatMap(row => row.externalMissionIds)
    ).size;

}


function renderEmployeePerformanceDashboard(resetPage = false) {

    const body = document.getElementById("employeePerformanceTableBody");

    if (!isAdminUser() || !body) return;
    if (resetPage) employeePerformancePage = 1;

    employeePerformanceRows = sortEmployeePerformanceRows(
        calculateEmployeePerformanceRows(getEmployeePerformanceFilters())
    );

    const totalPages = Math.max(1, Math.ceil(employeePerformanceRows.length / employeePerformancePageSize));

    employeePerformancePage = Math.min(employeePerformancePage, totalPages);
    const startIndex = (employeePerformancePage - 1) * employeePerformancePageSize;

    employeePerformanceVisibleRows = employeePerformanceRows.slice(
        startIndex,
        startIndex + employeePerformancePageSize
    );
    body.innerHTML = employeePerformanceVisibleRows.map((row, index) => `
        <tr data-employee-id="${escapeHtml(row.id)}">
            <td>${startIndex + index + 1}</td>
            <td>
                <button type="button" class="employee-achievement-link" data-employee-id="${escapeHtml(row.id)}">
                    ${escapeHtml(row.fullName)}
                </button>
            </td>
            <td>${escapeHtml(row.employeeNumber || "-")}</td>
            <td>${escapeHtml(row.committeeNames || "-")}</td>
            <td>${row.completedFacilities}</td><td>${row.violations}</td><td>${row.externalMissions}</td>
            <td class="${row.daysSinceLastActivity !== null && row.daysSinceLastActivity > 14 ? "activity-warning" : ""}">${getPerformanceActivityLabel(row.daysSinceLastActivity)}</td>
            <td class="${row.daysSinceLastActivity !== null && row.daysSinceLastActivity > 14 ? "activity-warning" : ""}">${row.daysSinceLastActivity === null ? "-" : row.daysSinceLastActivity}</td>
            <td><span class="badge ${row.isActive ? "text-bg-success" : "text-bg-secondary"}">${row.isActive ? "نشط" : "غير نشط"}</span></td>
            <td><button type="button" class="btn btn-sm btn-outline-primary performance-details">التفاصيل</button></td>
        </tr>
    `).join("");

    body.querySelectorAll("tr").forEach(row => {

        row.addEventListener("click", () => showEmployeeDetails(row.dataset.employeeId));
        row.querySelector(".employee-achievement-link").addEventListener("click", event => {

            event.stopPropagation();
            showEmployeeDetails(event.currentTarget.dataset.employeeId);

        });
        row.querySelector(".performance-details").addEventListener("click", event => {

            event.stopPropagation();
            showEmployeeDetails(row.dataset.employeeId);

        });

    });

    document.getElementById("employeePerformanceEmpty").classList.toggle("d-none", employeePerformanceRows.length > 0);
    document.querySelector(".employee-performance-table-wrap").classList.toggle("d-none", employeePerformanceRows.length === 0);
    document.querySelector(".employee-performance-pagination").classList.toggle("d-none", employeePerformanceRows.length === 0);
    document.getElementById("performancePageInfo").textContent = `صفحة ${employeePerformancePage} من ${totalPages}`;
    document.getElementById("performancePreviousPage").disabled = employeePerformancePage <= 1;
    document.getElementById("performanceNextPage").disabled = employeePerformancePage >= totalPages;
    updateEmployeePerformanceKpis(employeePerformanceRows);

}


function getEmployeePerformanceExportRows(rows = employeePerformanceVisibleRows) {

    return rows.map((row, index) => ({
        "#": (employeePerformancePage - 1) * employeePerformancePageSize + index + 1,
        "الموظف": row.fullName,
        "الرقم الوظيفي": row.employeeNumber,
        "اللجان الحالية": row.currentCommittees.map(item => item.committeeName).join("، "),
        "المنشآت المنجزة": row.completedFacilities,
        "المخالفات": row.violations,
        "المهام خارج الخطة": row.externalMissions,
        "آخر نشاط": getPerformanceActivityLabel(row.daysSinceLastActivity),
        "أيام منذ آخر نشاط": row.daysSinceLastActivity === null ? "" : row.daysSinceLastActivity,
        "الحالة": row.isActive ? "نشط" : "غير نشط"
    }));

}


function exportVisibleEmployeePerformanceRows() {

    if (!isAdminUser()) return;

    if (!window.XLSX) {

        alert("مكتبة تصدير Excel غير متاحة.");
        return;

    }

    const exportRows = getEmployeePerformanceExportRows();
    const workbook = window.XLSX.utils.book_new();
    const worksheet = window.XLSX.utils.json_to_sheet(exportRows);

    window.XLSX.utils.book_append_sheet(workbook, worksheet, "أداء الموظفين");
    window.XLSX.writeFile(workbook, `employee-performance-${new Date().toISOString().slice(0, 10)}.xlsx`);

}


function initializeEmployeePerformanceDashboard() {

    const panel = document.getElementById("employeePerformancePanel");

    if (!isAdminUser() || !panel) return;

    const committeeSelect = document.getElementById("performanceCommittee");

    committeeSelect.innerHTML = `<option value="all">الكل</option>${getCommitteeUsers().map(committee => `
        <option value="${escapeHtml(committee.username)}">${escapeHtml(committee.committeeName)}</option>
    `).join("")}`;

    [
        "performancePeriod",
        "performanceDateFrom",
        "performanceDateTo",
        "performanceCommittee",
        "performanceEmployeeStatus",
        "performanceFacilityType"
    ].forEach(id => document.getElementById(id).addEventListener("change", () => {

        document.getElementById("performanceCustomDates").classList.toggle(
            "d-none",
            document.getElementById("performancePeriod").value !== "custom"
        );
        renderEmployeePerformanceDashboard(true);

    }));
    document.getElementById("performanceEmployeeSearch").addEventListener("input", () => {

        renderEmployeePerformanceDashboard(true);

    });
    document.querySelectorAll("[data-performance-sort]").forEach(header => {

        header.addEventListener("click", () => {

            const key = header.dataset.performanceSort;

            employeePerformanceSort = {
                key,
                direction: employeePerformanceSort.key === key && employeePerformanceSort.direction === "desc"
                    ? "asc"
                    : "desc"
            };
            renderEmployeePerformanceDashboard(true);

        });

    });
    document.getElementById("performancePreviousPage").addEventListener("click", () => {

        employeePerformancePage -= 1;
        renderEmployeePerformanceDashboard();

    });
    document.getElementById("performanceNextPage").addEventListener("click", () => {

        employeePerformancePage += 1;
        renderEmployeePerformanceDashboard();

    });
    document.getElementById("exportEmployeePerformance").addEventListener("click", exportVisibleEmployeePerformanceRows);
    renderEmployeePerformanceDashboard();

}


function refreshEmployeePerformanceDashboard() {

    if (!isAdminUser()) return;

    invalidateEmployeePerformanceCache();
    renderEmployeePerformanceDashboard();

}
