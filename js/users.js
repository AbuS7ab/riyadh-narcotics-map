// ========================================
// User State Engine
// ========================================

const usersStorageKey = "narcoUsers";
const assignmentsStorageKey = "facilityAssignments";
const currentUsername = getCurrentUsername();

const defaultUsers = [
    {
        username: "admin",
        password: "admin",
        displayName: "مدير النظام",
        role: "admin",
        active: true,
        committeeName: "إدارة الامتثال"
    },
    {
        username: "committee1",
        password: "committee1",
        displayName: "اللجنة الأولى",
        role: "committee",
        active: true,
        committeeName: "اللجنة الأولى"
    },
    {
        username: "committee2",
        password: "committee2",
        displayName: "اللجنة الثانية",
        role: "committee",
        active: true,
        committeeName: "اللجنة الثانية"
    },
    {
        username: "committee3",
        password: "committee3",
        displayName: "اللجنة الثالثة",
        role: "committee",
        active: true,
        committeeName: "اللجنة الثالثة"
    },
    {
        username: "committee4",
        password: "committee4",
        displayName: "اللجنة الرابعة",
        role: "committee",
        active: true,
        committeeName: "اللجنة الرابعة"
    }
];

const users = initializeUsers();
const currentUser = users[currentUsername] || users.admin;
const facilityAssignments = loadAssignments();


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


function loadUsers() {

    try {

        const storedUsers = JSON.parse(localStorage.getItem(usersStorageKey));

        return storedUsers &&
            typeof storedUsers === "object" &&
            !Array.isArray(storedUsers)
            ? storedUsers
            : null;

    } catch (error) {

        return null;

    }

}


function getCurrentUsername() {

    try {

        return localStorage.getItem("currentUser") || "admin";

    } catch (error) {

        return "admin";

    }

}


function saveUsers() {

    try {

        localStorage.setItem(usersStorageKey, JSON.stringify(users));

    } catch (error) {

        // Continue without persistence when localStorage is unavailable.

    }

}


function loadAssignments() {

    try {

        const storedAssignments =
            JSON.parse(localStorage.getItem(assignmentsStorageKey));

        return storedAssignments &&
            typeof storedAssignments === "object" &&
            !Array.isArray(storedAssignments)
            ? storedAssignments
            : {};

    } catch (error) {

        return {};

    }

}


function saveAssignments() {

    try {

        localStorage.setItem(
            assignmentsStorageKey,
            JSON.stringify(facilityAssignments)
        );

    } catch (error) {

        // Continue without persistence when localStorage is unavailable.

    }

}


function initializeUsers() {

    const storedUsers = loadUsers();
    const defaultUsersByUsername = getDefaultUsersByUsername();

    if (!storedUsers) {

        try {

            localStorage.setItem(usersStorageKey, JSON.stringify(defaultUsersByUsername));

        } catch (error) {

            // Continue with in-memory defaults when localStorage is unavailable.

        }

        return defaultUsersByUsername;

    }

    let changed = false;

    defaultUsers.forEach(user => {

        if (!storedUsers[user.username]) {

            storedUsers[user.username] = { ...user };
            changed = true;

        } else {

            Object.keys(user).forEach(key => {

                if (typeof storedUsers[user.username][key] === "undefined") {

                    storedUsers[user.username][key] = user[key];
                    changed = true;

                }

            });

        }

    });

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

            localStorage.setItem(usersStorageKey, JSON.stringify(storedUsers));

        } catch (error) {

            // Continue without persistence when localStorage is unavailable.

        }

    }

    return storedUsers;

}


function getCurrentUser() {

    return currentUser;

}


function isAdminUser() {

    return currentUser && currentUser.role === "admin";

}


function isCommitteeUser() {

    return currentUser && currentUser.role === "committee";

}


function getUsers() {

    return defaultUsers.map(user => users[user.username]).filter(Boolean);

}


function getCommitteeUsers() {

    return getUsers().filter(user => user.role === "committee");

}


function updateUser(username, updates) {

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

    saveUsers();

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
        status: status === "completed" ? "completed" : "assigned"
    };

    saveAssignments();

}


function getAccessibleFacilities(facilities) {

    if (isAdminUser()) return facilities;

    if (!isCommitteeUser() || !currentUser.active) return [];

    return facilities.filter(facility => {

        const assignment = getFacilityAssignment(facility.license);

        return assignment &&
            assignment.committeeUsername === currentUser.username;

    });

}


function applyRoleView() {

    document.body.classList.toggle("role-admin", isAdminUser());
    document.body.classList.toggle("role-committee", isCommitteeUser());

}


function renderUsersPanel() {

    const usersTableBody = document.getElementById("usersTableBody");

    if (!usersTableBody) return;

    usersTableBody.innerHTML = "";

    getUsers().forEach(user => {

        const row = document.createElement("tr");

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
                <input class="form-control form-control-sm user-password"
                       type="password"
                       value="${escapeHtml(user.password)}">
            </td>
            <td class="text-center">
                <input class="form-check-input user-active"
                       type="checkbox"
                       ${user.active ? "checked" : ""}
                       ${user.role === "admin" ? "disabled" : ""}>
            </td>
        `;

        usersTableBody.appendChild(row);

    });

}


function initializeUsersPanel() {

    const usersTableBody = document.getElementById("usersTableBody");
    const saveUsersButton = document.getElementById("saveUsers");
    const usersSaveMessage = document.getElementById("usersSaveMessage");

    if (!usersTableBody || !saveUsersButton || !isAdminUser()) return;

    renderUsersPanel();

    saveUsersButton.addEventListener("click", function () {

        usersTableBody.querySelectorAll("tr").forEach(row => {

            updateUser(row.dataset.username, {
                displayName: row.querySelector(".user-display-name").value,
                committeeName: row.querySelector(".user-committee-name").value,
                password: row.querySelector(".user-password").value,
                active: row.querySelector(".user-active").checked
            });

        });

        renderUsersPanel();

        if (usersSaveMessage) {

            usersSaveMessage.classList.remove("d-none");

            setTimeout(() => {

                usersSaveMessage.classList.add("d-none");

            }, 2500);

        }

    });

}


applyRoleView();

initializeUsersPanel();
