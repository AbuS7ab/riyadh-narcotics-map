// ========================================
// User State Engine
// ========================================

const usersStorageKey = "narcoUsers";
const assignmentsStorageKey = "facilityAssignments";
const assignmentStatuses = ["assigned", "in_progress", "completed", "cancelled"];
const currentUsername = getCurrentUsername();

const defaultUsers = [
    {
        username: "admin",
        password: "admin",
        displayName: "مدير النظام",
        role: "admin",
        active: true,
        committeeName: "إدارة الامتثال"
    }
];

let users = {};
let currentUser = null;
let facilityAssignments = {};
let selectedCommitteeUsername = null;
let smartAssignmentStartMode = "auto";


function getDefaultUsersByUsername() {

    return defaultUsers.reduce((result, user) => {

        result[user.username] = { ...user };

        return result;

    }, {});

}


function escapeHtml(value) {

    return String(value || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

}


function getCurrentUsername() {

    try {

        return localStorage.getItem("currentUser");

    } catch (error) {

        return null;

    }

}


function initializeUsers() {

    const storedUsers = loadUsers();
    const defaultUsersByUsername = getDefaultUsersByUsername();
    const defaultAdmin = defaultUsersByUsername.admin;

    if (!storedUsers || Object.keys(storedUsers).length === 0) {

        try {

            saveUsers(defaultUsersByUsername);

        } catch (error) {

            // Continue with in-memory defaults when localStorage is unavailable.

        }

        return defaultUsersByUsername;

    }

    let changed = false;

    if (!storedUsers.admin) {

        storedUsers.admin = { ...defaultAdmin };
        changed = true;

    } else {

        Object.keys(defaultAdmin).forEach(key => {

            if (typeof storedUsers.admin[key] === "undefined") {

                storedUsers.admin[key] = defaultAdmin[key];
                changed = true;

            }

        });

    }

    if (storedUsers.admin) {

        if (storedUsers.admin.role !== "admin") {

            storedUsers.admin.role = "admin";
            changed = true;

        }

        if (storedUsers.admin.active !== true) {

            storedUsers.admin.active = true;
            changed = true;

        }

    }

    if (changed) {

        try {

            saveUsers(storedUsers);

        } catch (error) {

            // Continue without persistence when localStorage is unavailable.

        }

    }

    return storedUsers;

}


function normalizeAssignments(storedAssignments) {

    if (!storedAssignments ||
        typeof storedAssignments !== "object" ||
        Array.isArray(storedAssignments)) {

        return {};

    }

    let changed = false;

    Object.values(storedAssignments).forEach(assignment => {

        if (!assignmentStatuses.includes(assignment.status)) {

            assignment.status = "assigned";
            changed = true;

        }

    });

    if (changed) {

        saveAssignments(storedAssignments);

    }

    return storedAssignments;

}


function initializeUserState() {

    users = initializeUsers();
    currentUser = currentUsername ? users[currentUsername] || null : null;
    facilityAssignments = normalizeAssignments(loadAssignments());

    seedCloudKey(assignmentsStorageKey, facilityAssignments);

}


function getCurrentUser() {

    return currentUser;

}


function isAdminUser() {

    return currentUser && currentUser.active && currentUser.role === "admin";

}


function isCommitteeUser() {

    return currentUser && currentUser.active && currentUser.role === "committee";

}


function getUsers() {

    return Object.values(users)
        .filter(user => user && typeof user === "object")
        .sort((a, b) => {

            if (a.role === "admin" && b.role !== "admin") return -1;
            if (a.role !== "admin" && b.role === "admin") return 1;

            return String(a.username || "").localeCompare(String(b.username || ""));

        });

}


function getCommitteeUsers() {

    return getUsers().filter(user => user.role === "committee");

}


function validateUsersObject(nextUsers) {

    if (!nextUsers || typeof nextUsers !== "object" || Array.isArray(nextUsers)) {

        return "بيانات المستخدمين غير صالحة.";

    }

    const seenUsernames = new Set();

    for (const [key, user] of Object.entries(nextUsers)) {

        if (!user || typeof user !== "object" || Array.isArray(user)) {

            return "بيانات أحد المستخدمين غير صالحة.";

        }

        const username = String(user.username || "").trim();

        if (!username) return "اسم المستخدم مطلوب لكل مستخدم.";
        if (username !== key) return "مفتاح المستخدم يجب أن يطابق اسم المستخدم.";
        if (seenUsernames.has(username)) return "اسم المستخدم مكرر.";

        seenUsernames.add(username);

        if (typeof user.password !== "string" || user.password.trim() === "") {

            return "كلمة المرور مطلوبة لكل مستخدم.";

        }

        if (!["admin", "committee"].includes(user.role)) {

            return "دور المستخدم غير صالح.";

        }

        if (typeof user.active !== "boolean") {

            return "حالة النشاط يجب أن تكون صحيحة أو غير صحيحة.";

        }

        if (user.role === "committee" &&
            (typeof user.committeeName !== "string" || user.committeeName.trim() === "")) {

            return "اسم اللجنة مطلوب لكل مستخدم لجنة.";

        }

    }

    if (!nextUsers.admin || nextUsers.admin.role !== "admin") {

        return "لا يمكن حذف مدير النظام.";

    }

    return "";

}


function getActiveAssignmentCount(username) {

    return Object.values(facilityAssignments).filter(assignment => {

        return assignment &&
            assignment.committeeUsername === username &&
            assignment.status !== "cancelled";

    }).length;

}


function canDeleteUser(username) {

    const user = users[username];

    if (!user || user.role === "admin") return false;

    return getActiveAssignmentCount(username) === 0;

}


function updateUser(username, updates, options = {}) {

    const user = users[username];

    if (!user) return;

    if (typeof updates.displayName === "string") {

        user.displayName = updates.displayName;

    }

    if (typeof updates.committeeName === "string") {

        user.committeeName = updates.committeeName;

    }

    if (typeof updates.password === "string" && updates.password.trim() !== "") {

        user.password = updates.password;

    }

    if (user.role === "committee" && typeof updates.active === "boolean") {

        user.active = updates.active;

    }

    if (user.role === "admin") {

        user.active = true;

    }

    if (options.persist !== false) {

        return saveUsers(users);

    }

    return Promise.resolve();

}


function getFacilityAssignment(license) {

    return facilityAssignments[String(license)] || null;

}


function assignFacilityToCommittee(facilityLicense, committeeUsername, status = "assigned") {

    const committee = users[committeeUsername];

    if (!committee || committee.role !== "committee") return;

    const existingAssignment = getFacilityAssignment(facilityLicense);

    facilityAssignments[String(facilityLicense)] = {
        facilityLicense: String(facilityLicense),
        committeeUsername,
        assignedAt: existingAssignment
            ? existingAssignment.assignedAt
            : new Date().toISOString(),
        status: assignmentStatuses.includes(status) ? status : "assigned"
    };

    saveAssignments(facilityAssignments);

    renderCommitteeAssignmentCards();

}


function updateAssignmentFromVisit(facilityLicense, visitStatus) {

    if (!isCommitteeUser()) return;

    const assignment = getFacilityAssignment(facilityLicense);

    if (!assignment ||
        assignment.committeeUsername !== currentUser.username ||
        assignment.status === "cancelled") return;

    const status = visitStatus === "visited"
        ? "completed"
        : visitStatus === "partial"
            ? "in_progress"
            : null;

    if (!status || assignment.status === status) return;

    assignment.status = status;

    saveAssignments(facilityAssignments);

}


function assignFacilitiesToCommittee(facilityLicenses, committeeUsername) {

    if (!isAdminUser()) return false;

    const committee = users[committeeUsername];

    if (!committee || committee.role !== "committee" || !committee.active) return false;

    const assignedAt = new Date().toISOString();

    facilityLicenses.forEach(license => {

        facilityAssignments[String(license)] = {
            facilityLicense: String(license),
            committeeUsername,
            assignedAt,
            status: "assigned"
        };

    });

    saveAssignments(facilityAssignments);
    renderCommitteeAssignmentCards();

    return true;

}


function hasValidCoordinates(facility) {

    if (!facility ||
        facility.lat === null ||
        facility.lng === null ||
        facility.lat === "" ||
        facility.lng === "") return false;

    const latitude = Number(facility.lat);
    const longitude = Number(facility.lng);

    return Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        latitude >= -90 && latitude <= 90 &&
        longitude >= -180 && longitude <= 180;

}


function calculateHaversineDistance(from, to) {

    const earthRadiusKm = 6371;
    const toRadians = degrees => Number(degrees) * Math.PI / 180;
    const latitudeDifference = toRadians(to.lat) - toRadians(from.lat);
    const longitudeDifference = toRadians(to.lng) - toRadians(from.lng);
    const fromLatitude = toRadians(from.lat);
    const toLatitude = toRadians(to.lat);
    const haversine =
        Math.sin(latitudeDifference / 2) ** 2 +
        Math.cos(fromLatitude) * Math.cos(toLatitude) *
        Math.sin(longitudeDifference / 2) ** 2;

    return earthRadiusKm * 2 * Math.atan2(
        Math.sqrt(haversine),
        Math.sqrt(1 - haversine)
    );

}


function getSmartAssignmentReferencePoint(committeeUsername, facilities) {

    const facilityByLicense = facilities.reduce((result, facility) => {

        result[String(facility.license)] = facility;

        return result;

    }, {});
    const committeeAssignments = Object.values(facilityAssignments).filter(assignment => {

        return assignment.committeeUsername === committeeUsername;

    });
    const visitedFacilities = [];

    committeeAssignments.forEach(assignment => {

        const facility = facilityByLicense[String(assignment.facilityLicense)];

        if (!hasValidCoordinates(facility)) return;

        getFacilityVisits(assignment.facilityLicense)
            .filter(visit => visit.visitStatus === "visited")
            .forEach(visit => visitedFacilities.push({ facility, visit }));

    });

    visitedFacilities.sort((a, b) => {

        const dateDifference =
            new Date(b.visit.date || 0) - new Date(a.visit.date || 0);

        return dateDifference ||
            new Date(b.visit.createdAt || 0) - new Date(a.visit.createdAt || 0);

    });

    if (visitedFacilities.length > 0) return visitedFacilities[0].facility;

    const completedAssignment = committeeAssignments
        .filter(assignment => {

            return assignment.status === "completed" &&
                hasValidCoordinates(facilityByLicense[String(assignment.facilityLicense)]);

        })
        .sort((a, b) => new Date(b.assignedAt || 0) - new Date(a.assignedAt || 0))[0];

    if (completedAssignment) {

        return facilityByLicense[String(completedAssignment.facilityLicense)];

    }

    return { lat: 24.7136, lng: 46.6753 };

}


function smartAssignFacilities(
    facilities,
    committeeUsername,
    count,
    startFacilityLicense = ""
) {

    if (!isAdminUser()) return [];

    const committee = users[committeeUsername];
    const assignmentCount = Math.floor(Number(count));

    if (!committee ||
        committee.role !== "committee" ||
        !committee.active ||
        assignmentCount < 1) return [];

    const selectedStartFacility = facilities.find(facility => {

        return String(facility.license) === String(startFacilityLicense);

    });
    const referencePoint = hasValidCoordinates(selectedStartFacility)
        ? selectedStartFacility
        : getSmartAssignmentReferencePoint(committeeUsername, facilities);
    const nearestFacilities = getUnassignedFacilities(facilities)
        .filter(hasValidCoordinates)
        .map(facility => ({
            facility,
            distance: calculateHaversineDistance(referencePoint, facility)
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, assignmentCount)
        .map(candidate => candidate.facility);

    if (nearestFacilities.length === 0) return [];

    assignFacilitiesToCommittee(
        nearestFacilities.map(facility => facility.license),
        committeeUsername
    );

    return nearestFacilities;

}


function getAccessibleFacilities(facilities) {

    if (isAdminUser()) return facilities;

    if (!isCommitteeUser()) return [];

    return facilities;

}


function isFacilityAssignedToCurrentCommittee(facility) {

    if (!isCommitteeUser()) return false;

    const assignment = getFacilityAssignment(facility.license);

    return assignment &&
        assignment.committeeUsername === currentUser.username;

}


function getAssignedFacilitiesForCurrentUser(facilities) {

    return facilities.filter(facility => {

        return isFacilityAssignedToCurrentCommittee(facility);

    });

}


function renderCommitteeAssignmentCards() {

    const container = document.getElementById("committeeCards");

    if (!container || !isAdminUser()) return;

    const assignments = Object.values(facilityAssignments);

    container.innerHTML = getCommitteeUsers().map(committee => {

        const committeeAssignments = assignments.filter(assignment => {

            return assignment.committeeUsername === committee.username;

        });

        const activeAssignments = committeeAssignments.filter(assignment => {

            return assignment.status !== "cancelled";

        });
        const inProgress = activeAssignments.filter(assignment => {

            return assignment.status === "in_progress";

        }).length;
        const completed = activeAssignments.filter(assignment => {

            return assignment.status === "completed";

        }).length;
        const assigned = activeAssignments.length;

        return `
            <article class="committee-card ${selectedCommitteeUsername === committee.username ? "active" : ""}"
                     data-committee-username="${committee.username}"
                     role="button" tabindex="0"
                     aria-pressed="${selectedCommitteeUsername === committee.username}">
                <div class="committee-card-header">
                    <div>
                        <h6>${escapeHtml(committee.committeeName)}</h6>
                        <small>${committee.username}</small>
                    </div>
                    <span class="badge ${committee.active ? "text-bg-success" : "text-bg-secondary"}">
                        ${committee.active ? "نشطة" : "غير نشطة"}
                    </span>
                </div>
                <div class="committee-card-counts">
                    <span>المسندة <strong>${assigned}</strong></span>
                    <span>قيد التنفيذ <strong>${inProgress}</strong></span>
                    <span>المكتملة <strong>${completed}</strong></span>
                    <span>المتبقية <strong>${assigned - completed}</strong></span>
                </div>
            </article>
        `;

    }).join("");

    container.querySelectorAll(".committee-card").forEach(card => {

        const toggleDrilldown = () => {

            const username = card.dataset.committeeUsername;

            if (selectedCommitteeUsername === username) {

                selectedCommitteeUsername = null;
                renderCommitteeAssignmentCards();
                showDashboardNeutralState();

                return;

            }

            selectedCommitteeUsername = username;
            renderCommitteeAssignmentCards();

            const assignedFacilities = allFacilities.filter(facility => {

                const assignment = getFacilityAssignment(facility.license);

                return assignment && assignment.committeeUsername === username;

            });

            showCommitteeFacilityList(users[username], assignedFacilities);

        };

        card.addEventListener("click", toggleDrilldown);

        card.addEventListener("keydown", event => {

            if (event.key === "Enter" || event.key === " ") {

                event.preventDefault();
                toggleDrilldown();

            }

        });

    });

}


function getUnassignedFacilities(facilities) {

    return facilities.filter(facility => {

        const assignment = getFacilityAssignment(facility.license);

        return !assignment || assignment.status === "cancelled";

    });

}


function syncSmartAssignmentStartFromChecked() {

    const startFacilitySelect =
        document.getElementById("smartAssignmentStartFacility");

    if (!startFacilitySelect || smartAssignmentStartMode === "manual") return;

    const firstCheckedFacility = document.querySelector(
        ".assignment-facility-checkbox:checked"
    );

    startFacilitySelect.value = firstCheckedFacility
        ? firstCheckedFacility.value
        : "";

}


function renderAssignmentBoard(facilities) {

    const list = document.getElementById("unassignedFacilitiesList");
    const committeeSelect = document.getElementById("assignmentCommittee");
    const searchInput = document.getElementById("assignmentSearch");
    const startFacilitySelect =
        document.getElementById("smartAssignmentStartFacility");

    if (!list ||
        !committeeSelect ||
        !searchInput ||
        !startFacilitySelect ||
        !isAdminUser()) return;

    const selectedCommittee = committeeSelect.value;
    const selectedStartFacility = startFacilitySelect.value;

    committeeSelect.innerHTML = `
        <option value="">اختر اللجنة</option>
        ${getCommitteeUsers()
            .filter(committee => committee.active)
            .map(committee => `
                <option value="${committee.username}">
                    ${escapeHtml(committee.committeeName)}
                </option>
            `).join("")}
    `;

    if (users[selectedCommittee] && users[selectedCommittee].active) {

        committeeSelect.value = selectedCommittee;

    }

    startFacilitySelect.innerHTML = `
        <option value="">تحديد تلقائي لنقطة البداية</option>
        ${facilities
            .filter(hasValidCoordinates)
            .map(facility => `
                <option value="${escapeHtml(facility.license)}">
                    ${escapeHtml(facility.name)} —
                    ${escapeHtml(facility.district)} —
                    ${escapeHtml(facility.license)}
                </option>
            `).join("")}
    `;

    if (facilities.some(facility => {

        return String(facility.license) === selectedStartFacility &&
            hasValidCoordinates(facility);

    })) {

        startFacilitySelect.value = selectedStartFacility;

    }

    const query = searchInput.value.trim().toLowerCase();
    const unassignedFacilities = getUnassignedFacilities(facilities).filter(facility => {

        return [facility.name, facility.license, facility.district, facility.type]
            .some(value => String(value || "").toLowerCase().includes(query));

    });

    if (unassignedFacilities.length === 0) {

        list.innerHTML = `
            <div class="text-muted small p-3">لا توجد منشآت غير مسندة.</div>
        `;

        return;

    }

    list.innerHTML = unassignedFacilities.map(facility => `
        <label class="assignment-facility-item">
            <input class="form-check-input assignment-facility-checkbox"
                   type="checkbox" value="${escapeHtml(facility.license)}">
            <span>
                <strong>${escapeHtml(facility.name)}</strong>
                <small>الترخيص: ${escapeHtml(facility.license)}</small>
                <small>${escapeHtml(facility.district)} · ${escapeHtml(facility.type)}</small>
            </span>
        </label>
    `).join("");

    syncSmartAssignmentStartFromChecked();

}


function initializeAssignmentBoard() {

    const searchInput = document.getElementById("assignmentSearch");
    const list = document.getElementById("unassignedFacilitiesList");
    const assignButton = document.getElementById("assignSelectedFacilities");
    const committeeSelect = document.getElementById("assignmentCommittee");
    const message = document.getElementById("assignmentBoardMessage");
    const smartAssignmentCount = document.getElementById("smartAssignmentCount");
    const startFacilitySelect =
        document.getElementById("smartAssignmentStartFacility");
    const smartAssignButton = document.getElementById("smartAssignFacilities");

    if (!searchInput ||
        !list ||
        !assignButton ||
        !committeeSelect ||
        !smartAssignmentCount ||
        !startFacilitySelect ||
        !smartAssignButton ||
        !isAdminUser()) return;

    searchInput.addEventListener("input", () => {

        renderAssignmentBoard(allFacilities);

    });

    list.addEventListener("change", event => {

        if (!event.target.classList.contains("assignment-facility-checkbox")) return;

        syncSmartAssignmentStartFromChecked();

    });

    startFacilitySelect.addEventListener("change", () => {

        smartAssignmentStartMode = startFacilitySelect.value ? "manual" : "auto";

        syncSmartAssignmentStartFromChecked();

    });

    assignButton.addEventListener("click", () => {

        const selectedFacilities = [...document.querySelectorAll(
            ".assignment-facility-checkbox:checked"
        )].map(checkbox => checkbox.value);

        if (!committeeSelect.value || selectedFacilities.length === 0) {

            message.textContent = "اختر لجنة ومنشأة واحدة على الأقل.";
            message.className = "small text-danger";

            return;

        }

        assignFacilitiesToCommittee(selectedFacilities, committeeSelect.value);
        smartAssignmentStartMode = "auto";
        renderAssignmentBoard(allFacilities);

        message.textContent = "تم إسناد المنشآت بنجاح.";
        message.className = "small text-success";

    });

    smartAssignButton.addEventListener("click", () => {

        const committee = users[committeeSelect.value];
        const count = Math.floor(Number(smartAssignmentCount.value));

        if (!committee || !committee.active || count < 1) {

            message.textContent = "اختر لجنة نشطة وعدداً صحيحاً من المنشآت.";
            message.className = "small text-danger";

            return;

        }

        const assignedFacilities = smartAssignFacilities(
            allFacilities,
            committee.username,
            count,
            startFacilitySelect.value
        );

        if (assignedFacilities.length === 0) {

            message.textContent = "لا توجد منشآت غير مسندة";
            message.className = "small text-danger";

            return;

        }

        renderAssignmentBoard(allFacilities);

        message.textContent = `تم إسناد ${assignedFacilities.length} منشأة حسب الأقرب.`;
        message.className = "small text-success";

    });

}


function applyRoleView() {

    const mobileCurrentUser = document.getElementById("mobileCurrentUser");

    if (mobileCurrentUser && currentUser) {

        mobileCurrentUser.textContent = currentUser.displayName || currentUser.username;

    }

    document.body.classList.toggle("authenticated", Boolean(
        isAdminUser() || isCommitteeUser()
    ));
    document.body.classList.toggle("role-admin", isAdminUser());
    document.body.classList.toggle("role-committee", isCommitteeUser());

}


function initializeSession() {

    const loginForm = document.getElementById("loginForm");
    const logoutButtons = document.querySelectorAll(".logout-button");

    if (loginForm) {

        loginForm.addEventListener("submit", event => {

            event.preventDefault();

            const username = document.getElementById("loginUsername").value.trim();
            const password = document.getElementById("loginPassword").value;
            const message = document.getElementById("loginMessage");
            const user = users[username];

            if (user && user.password === password && !user.active) {

                message.textContent = "الحساب غير مفعل";
                message.classList.remove("d-none");

                return;

            }

            if (!user || user.password !== password) {

                message.textContent = "اسم المستخدم أو كلمة المرور غير صحيحة";
                message.classList.remove("d-none");

                return;

            }

            localStorage.setItem("currentUser", user.username);
            window.location.reload();

        });

    }

    if (logoutButtons.length) {

        logoutButtons.forEach(logoutButton => {

            logoutButton.addEventListener("click", () => {

                localStorage.removeItem("currentUser");
                window.location.reload();

            });

        });

    }

}


function renderUsersPanel() {

    const usersTableBody = document.getElementById("usersTableBody");

    if (!usersTableBody) return;

    usersTableBody.innerHTML = "";

    getUsers().forEach(user => {

        const row = document.createElement("tr");
        const canDelete = canDeleteUser(user.username);

        row.dataset.username = user.username;

        row.innerHTML = `
            <td>
                <strong>${user.username}</strong>
                <div class="text-muted small">${user.role === "admin" ? "Admin" : "Committee"}</div>
            </td>
            <td>
                <input class="form-control form-control-sm user-display-name"
                       value="${escapeHtml(user.displayName)}">
            </td>
            <td>
                <input class="form-control form-control-sm user-committee-name"
                       value="${escapeHtml(user.committeeName)}">
            </td>
            <td>
                <div class="input-group input-group-sm user-password-group">
                    <input class="form-control user-password"
                           type="password"
                           value="${escapeHtml(user.password)}">
                    <button class="btn btn-outline-secondary user-toggle-password"
                            type="button"
                            title="إظهار كلمة المرور"
                            aria-label="إظهار كلمة المرور">
                        <i class="fa-solid fa-eye"></i>
                    </button>
                    <button class="btn btn-outline-secondary user-reset-password"
                            type="button"
                            title="إعادة تعيين كلمة المرور إلى 1234">
                        1234
                    </button>
                </div>
            </td>
            <td class="text-center">
                <input class="form-check-input user-active"
                       type="checkbox"
                       ${user.active ? "checked" : ""}
                       ${user.role === "admin" ? "disabled" : ""}>
            </td>
            <td class="text-center">
                <button class="btn btn-outline-danger btn-sm user-delete"
                        type="button"
                        title="${user.role === "admin" ? "لا يمكن حذف مدير النظام" : canDelete ? "حذف المستخدم" : "لا يمكن حذف لجنة لديها إسنادات نشطة"}"
                        ${canDelete ? "" : "disabled"}>
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        `;

        usersTableBody.appendChild(row);

    });

}


function showUsersSaveMessage(text, className) {

    const usersSaveMessage = document.getElementById("usersSaveMessage");

    if (!usersSaveMessage) return;

    usersSaveMessage.textContent = text;
    usersSaveMessage.className = `${className} small`;

}


function getUsersFromPanel(usersTableBody) {

    const nextUsers = {};

    usersTableBody.querySelectorAll("tr").forEach(row => {

        const username = row.dataset.username;
        const existingUser = users[username];

        if (!existingUser) return;

        nextUsers[username] = {
            ...existingUser,
            displayName: row.querySelector(".user-display-name").value.trim(),
            committeeName: row.querySelector(".user-committee-name").value.trim(),
            password: row.querySelector(".user-password").value,
            active: existingUser.role === "admin"
                ? true
                : row.querySelector(".user-active").checked
        };

    });

    return nextUsers;

}


async function persistUsers(nextUsers) {

    const validationMessage = validateUsersObject(nextUsers);

    if (validationMessage) {

        showUsersSaveMessage(validationMessage, "text-danger");

        return false;

    }

    users = nextUsers;

    await saveUsers(users, { throwOnError: true });

    renderUsersPanel();
    renderCommitteeAssignmentCards();
    renderAssignmentBoard(allFacilities);

    return true;

}


function showDataPortabilityMessage(text, className) {

    const message = document.getElementById("dataPortabilityMessage");

    if (!message) return;

    message.textContent = text;
    message.className = `small ${className}`;

}


function exportAppData() {

    const exportData = {
        version: "v1.0-beta",
        exportedAt: new Date().toISOString(),
        users,
        facilityAssignments,
        facilityStatus,
        appSettings: loadAppSettings()
    };

    const blob = new Blob(
        [JSON.stringify(exportData, null, 2)],
        { type: "application/json" }
    );
    const downloadLink = document.createElement("a");

    downloadLink.href = URL.createObjectURL(blob);
    downloadLink.download = `narco-compliance-data-${new Date().toISOString().slice(0, 10)}.json`;
    downloadLink.click();

    URL.revokeObjectURL(downloadLink.href);
    showDataPortabilityMessage("تم تصدير البيانات بنجاح.", "text-success");

}


function isPortableDataObject(value) {

    return value &&
        typeof value === "object" &&
        !Array.isArray(value);

}


async function importAppData(file) {

    if (!file) return;

    try {

        const importedData = JSON.parse(await file.text());

        if (!isPortableDataObject(importedData) ||
            !isPortableDataObject(importedData.users) ||
            !isPortableDataObject(importedData.facilityAssignments) ||
            !isPortableDataObject(importedData.facilityStatus)) {

            showDataPortabilityMessage("ملف البيانات غير صالح.", "text-danger");

            return;

        }

        const validationMessage = validateUsersObject(importedData.users);

        if (validationMessage) {

            showDataPortabilityMessage(validationMessage, "text-danger");

            return;

        }

        await Promise.all([
            saveUsers(importedData.users),
            saveAssignments(importedData.facilityAssignments),
            saveFacilityStatus(importedData.facilityStatus)
        ]);

        if (isPortableDataObject(importedData.appSettings)) {

            await saveAppSettings(importedData.appSettings);

        }

        showDataPortabilityMessage("تم استيراد البيانات. سيتم تحديث التطبيق...", "text-success");

        setTimeout(() => window.location.reload(), 500);

    } catch (error) {

        showDataPortabilityMessage("تعذر قراءة ملف البيانات.", "text-danger");

    }

}


function initializeDataPortability() {

    const exportButton = document.getElementById("exportAppData");
    const importInput = document.getElementById("importAppData");

    if (!exportButton || !importInput || !isAdminUser()) return;

    exportButton.addEventListener("click", exportAppData);

    importInput.addEventListener("change", event => {

        importAppData(event.target.files[0]);
        event.target.value = "";

    });

}


function initializeUsersPanel() {

    const usersTableBody = document.getElementById("usersTableBody");
    const saveUsersButton = document.getElementById("saveUsers");
    const usersSaveMessage = document.getElementById("usersSaveMessage");
    const showAddCommitteeFormButton = document.getElementById("showAddCommitteeForm");
    const addCommitteeForm = document.getElementById("addCommitteeForm");

    if (!usersTableBody || !saveUsersButton || !isAdminUser()) return;

    renderUsersPanel();

    if (showAddCommitteeFormButton && addCommitteeForm) {

        showAddCommitteeFormButton.addEventListener("click", () => {

            addCommitteeForm.classList.toggle("d-none");

        });

        addCommitteeForm.addEventListener("submit", async event => {

            event.preventDefault();

            const committeeName = document.getElementById("newCommitteeName").value.trim();
            const username = document.getElementById("newCommitteeUsername").value.trim();
            const password = document.getElementById("newCommitteePassword").value;
            const active = document.getElementById("newCommitteeActive").checked;

            if (!committeeName) {

                showUsersSaveMessage("اسم اللجنة مطلوب.", "text-danger");

                return;

            }

            if (!username) {

                showUsersSaveMessage("اسم المستخدم مطلوب.", "text-danger");

                return;

            }

            if (users[username]) {

                showUsersSaveMessage("اسم المستخدم موجود مسبقاً.", "text-danger");

                return;

            }

            if (!password.trim()) {

                showUsersSaveMessage("كلمة المرور مطلوبة.", "text-danger");

                return;

            }

            const nextUsers = {
                ...users,
                [username]: {
                    username,
                    password,
                    displayName: committeeName,
                    role: "committee",
                    active,
                    committeeName
                }
            };

            try {

                if (await persistUsers(nextUsers)) {

                    addCommitteeForm.reset();
                    document.getElementById("newCommitteeActive").checked = true;
                    addCommitteeForm.classList.add("d-none");
                    showUsersSaveMessage("تمت إضافة اللجنة وحفظها.", "text-success");

                }

            } catch (error) {

                showUsersSaveMessage("تعذر حفظ اللجنة الجديدة.", "text-danger");

            }

        });

    }

    usersTableBody.addEventListener("click", event => {

        const toggleButton = event.target.closest(".user-toggle-password");
        const resetButton = event.target.closest(".user-reset-password");
        const deleteButton = event.target.closest(".user-delete");
        const row = event.target.closest("tr");

        if (!row || (!toggleButton && !resetButton && !deleteButton)) return;

        const passwordInput = row.querySelector(".user-password");

        if (!passwordInput && !deleteButton) return;

        if (deleteButton) {

            const username = row.dataset.username;

            if (!canDeleteUser(username)) {

                showUsersSaveMessage("لا يمكن حذف مدير النظام أو لجنة لديها إسنادات نشطة.", "text-danger");

                return;

            }

            const nextUsers = { ...users };

            delete nextUsers[username];

            persistUsers(nextUsers)
                .then(saved => {

                    if (saved) {

                        showUsersSaveMessage("تم حذف المستخدم وحفظ التغيير.", "text-success");

                    }

                })
                .catch(() => {

                    showUsersSaveMessage("تعذر حذف المستخدم.", "text-danger");

                });

            return;

        }

        if (toggleButton) {

            const shouldShowPassword = passwordInput.type === "password";

            passwordInput.type = shouldShowPassword ? "text" : "password";
            toggleButton.title = shouldShowPassword
                ? "إخفاء كلمة المرور"
                : "إظهار كلمة المرور";
            toggleButton.setAttribute("aria-label", toggleButton.title);
            toggleButton.innerHTML = shouldShowPassword
                ? '<i class="fa-solid fa-eye-slash"></i>'
                : '<i class="fa-solid fa-eye"></i>';

            return;

        }

        passwordInput.value = "1234";
        passwordInput.focus();

    });

    saveUsersButton.addEventListener("click", async function () {

        saveUsersButton.disabled = true;
        showUsersSaveMessage("جاري حفظ بيانات المستخدمين...", "text-muted");

        try {

            if (await persistUsers(getUsersFromPanel(usersTableBody))) {

                showUsersSaveMessage("تم حفظ بيانات المستخدمين.", "text-success");

                setTimeout(() => {

                    if (usersSaveMessage) {

                        usersSaveMessage.classList.add("d-none");

                    }

                }, 2500);

            }

        } catch (error) {

            showUsersSaveMessage("تعذر حفظ بيانات المستخدمين. تحقق من الاتصال أو إعدادات Supabase.", "text-danger");

        } finally {

            saveUsersButton.disabled = false;

        }

    });

}


function initializeUserInterface() {

    applyRoleView();

    initializeSession();

    initializeAssignmentBoard();

    initializeDataPortability();

    initializeUsersPanel();

}
