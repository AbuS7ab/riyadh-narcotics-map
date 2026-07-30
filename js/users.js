// ========================================
// User State Engine
// ========================================

const usersStorageKey = "narcoUsers";
const assignmentsStorageKey = "facilityAssignments";
const assignmentHistoryStorageKey = "facilityAssignmentHistory";
const assignmentStatuses = ["assigned", "in_progress", "completed", "cancelled"];
const openAssignmentStatuses = ["assigned", "in_progress"];
const defaultPeriodicVisitIntervalDays = 75;
const currentUsername = getCurrentUsername();

const defaultUsers = [
    {
        username: "admin",
        password: "admin",
        displayName: "مدير النظام",
        role: "admin",
        active: true,
        committeeName: "إدارة الامتثال",
        team: {
            leader: "",
            members: []
        }
    }
];

let users = {};
let currentUser = null;
let facilityAssignments = {};
let facilityAssignmentHistory = {};
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


async function initializeUsers() {

    const storedUsers = loadUsers();
    const defaultUsersByUsername = getDefaultUsersByUsername();
    const defaultAdmin = defaultUsersByUsername.admin;

    if (!storedUsers || Object.keys(storedUsers).length === 0) {

        const savedUsers = await mutateCloudCollection(
            "users",
            storedUsers || {},
            defaultUsersByUsername
        );

        return savedUsers;

    }

    const previousUsers = JSON.parse(JSON.stringify(storedUsers));
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

    Object.values(storedUsers).forEach(user => {

        if (!user || typeof user !== "object") return;

        const normalizedTeam = normalizeTeam(user.team);

        if (JSON.stringify(user.team) !== JSON.stringify(normalizedTeam)) {

            user.team = normalizedTeam;
            changed = true;

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

        return mutateCloudCollection("users", previousUsers, storedUsers);

    }

    return storedUsers;

}


function normalizeAssignments(storedAssignments) {

    if (!storedAssignments ||
        typeof storedAssignments !== "object" ||
        Array.isArray(storedAssignments)) {

        return {};

    }

    Object.values(storedAssignments).forEach(assignment => {

        if (!assignmentStatuses.includes(assignment.status)) {

            assignment.status = "assigned";

        }

        if (!assignment.id) {

            assignment.id = createAssignmentId(assignment.facilityLicense);

        }

        if (!assignment.visitType) {

            assignment.visitType = "periodic";

        }

        if (typeof assignment.visitReason !== "string") {

            assignment.visitReason = assignment.visitType === "reactive"
                ? ""
                : "الخطة الدورية";

        }

    });

    return storedAssignments;

}


function normalizeAssignmentHistory(storedHistory) {

    if (!storedHistory ||
        typeof storedHistory !== "object" ||
        Array.isArray(storedHistory)) {

        return {};

    }

    return normalizeAssignments(storedHistory);

}


async function initializeUserState() {

    users = await initializeUsers();
    currentUser = currentUsername ? users[currentUsername] || null : null;
    facilityAssignments = normalizeAssignments(loadAssignments());
    facilityAssignmentHistory = normalizeAssignmentHistory(
        loadAssignmentHistory()
    );

    await seedCloudKey(assignmentsStorageKey, facilityAssignments);
    await seedCloudKey(
        assignmentHistoryStorageKey,
        facilityAssignmentHistory
    );

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


function isViewerUser() {

    return Boolean(
        currentUser &&
        currentUser.active &&
        currentUser.role === "viewer"
    );

}


function isAuthenticatedUser() {

    return Boolean(
        isAdminUser() ||
        isCommitteeUser() ||
        isViewerUser()
    );

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

        if (!["admin", "committee", "viewer"].includes(user.role)) {

            return "دور المستخدم غير صالح.";

        }

        if (typeof user.active !== "boolean") {

            return "حالة النشاط يجب أن تكون صحيحة أو غير صحيحة.";

        }

        if (user.role === "committee" &&
            (typeof user.committeeName !== "string" || user.committeeName.trim() === "")) {

            return "اسم اللجنة مطلوب لكل مستخدم لجنة.";

        }

        if (user.role === "committee" && !user.team) {

            return "بيانات فريق اللجنة مطلوبة.";

        }

        if (user.role === "viewer" &&
            (typeof user.displayName !== "string" || user.displayName.trim() === "")) {

            return "الاسم المعروض مطلوب لكل حساب مطّلع إداري.";

        }

    }

    if (!nextUsers.admin || nextUsers.admin.role !== "admin") {

        return "لا يمكن حذف مدير النظام.";

    }

    return "";

}


function getActiveAssignmentCount(username) {

    return getOpenAssignmentsForCommittee(username).length;

}


function canDeleteUser(username) {

    const user = users[username];

    if (!user || user.role === "admin") return false;

    return getActiveAssignmentCount(username) === 0;

}


function updateUser(username, updates, options = {}) {

    if (!isAdminUser()) return;

    const user = users[username];

    if (!user) return;

    const nextUsers = {
        ...users,
        [username]: { ...user }
    };
    const nextUser = nextUsers[username];

    if (typeof updates.displayName === "string") {

        nextUser.displayName = updates.displayName;

    }

    if (typeof updates.committeeName === "string") {

        nextUser.committeeName = updates.committeeName;

    }

    if (typeof updates.password === "string" && updates.password.trim() !== "") {

        nextUser.password = updates.password;

    }

    if (updates.team && typeof updates.team === "object") {

        nextUser.team = normalizeTeam(updates.team);

    }

    if (["committee", "viewer"].includes(nextUser.role) &&
        typeof updates.active === "boolean") {

        nextUser.active = updates.active;

    }

    if (nextUser.role === "admin") {

        nextUser.active = true;

    }

    if (options.persist !== false) {

        return persistUsers(nextUsers);

    }

    users = nextUsers;

    return Promise.resolve();

}


function getFacilityAssignment(license) {

    return facilityAssignments[String(license)] || null;

}


function isActiveAssignment(assignment) {

    return Boolean(
        assignment &&
        openAssignmentStatuses.includes(assignment.status)
    );

}


function isRetainedAssignment(assignment) {

    return Boolean(assignment && assignment.status !== "cancelled");

}


function getActiveAssignmentsForCommittee(username) {

    const activeAssignments = [
        ...Object.values(facilityAssignmentHistory),
        ...Object.values(facilityAssignments)
    ].filter(assignment => {

        return isRetainedAssignment(assignment) &&
            assignment.committeeUsername === username;

    });

    console.log(
        `Active assignment count for committee ${username}: ${activeAssignments.length}`
    );

    return activeAssignments;

}


function getOpenAssignmentsForCommittee(username) {

    return Object.values(facilityAssignments).filter(assignment => {

        return isActiveAssignment(assignment) &&
            assignment.committeeUsername === username;

    });

}


function getFacilityAssignmentHistory(license) {

    const normalizedLicense = String(license);

    return Object.values(facilityAssignmentHistory)
        .filter(assignment => {

            return String(assignment.facilityLicense) === normalizedLicense;

        })
        .sort((first, second) => {

            return getAssignmentEventTime(second.archivedAt || second.assignedAt) -
                getAssignmentEventTime(first.archivedAt || first.assignedAt);

        });

}


function getAssignmentEventTime(value) {

    const timestamp = new Date(value || 0).getTime();

    return Number.isFinite(timestamp) && timestamp > 0
        ? timestamp
        : 0;

}


function getAssignmentCompletionTime(assignment) {

    if (!assignment || typeof assignment !== "object") return 0;

    const assignedAt = getAssignmentEventTime(assignment.assignedAt);
    const status = typeof getFacilityStatus === "function"
        ? getFacilityStatus(assignment.facilityLicense)
        : null;
    const visits = status && Array.isArray(status.visits)
        ? status.visits
        : [];
    const completedVisits = visits.filter(visit => {

        if (!visitIndicatesCompletion(visit)) return false;

        if (assignment.id && visit.assignmentId) {

            return String(visit.assignmentId) === String(assignment.id);

        }

        if (visit.committeeUsername &&
            String(visit.committeeUsername) !== String(assignment.committeeUsername)) {

            return false;

        }

        const visitTime = getAssignmentEventTime(visit.createdAt || visit.date);

        return !assignedAt || !visitTime || visitTime >= assignedAt;

    });
    const completionTimes = completedVisits
        .map(visit => getAssignmentEventTime(visit.createdAt || visit.date))
        .filter(Boolean)
        .sort((first, second) => first - second);

    if (completionTimes.length > 0) return completionTimes[0];

    return assignment.status === "completed" ? assignedAt : 0;

}


function getCurrentAssignmentCycleForCommittee(
    username,
    assignmentsSnapshot = null
) {

    const assignments = Array.isArray(assignmentsSnapshot)
        ? assignmentsSnapshot
        : getActiveAssignmentsForCommittee(username);

    if (assignments.length === 0) return [];

    const events = [];

    assignments.forEach((assignment, sourceIndex) => {

        const assignedAt = getAssignmentEventTime(assignment.assignedAt);

        events.push({
            type: "assigned",
            timestamp: assignedAt,
            priority: 0,
            sourceIndex,
            assignment
        });

        const completedAt = getAssignmentCompletionTime(assignment);

        if (completedAt) {

            events.push({
                type: "completed",
                timestamp: Math.max(completedAt, assignedAt),
                priority: 1,
                sourceIndex,
                assignment
            });

        }

    });

    events.sort((first, second) => {

        return first.timestamp - second.timestamp ||
            first.priority - second.priority ||
            first.sourceIndex - second.sourceIndex;

    });

    let outstandingCount = 0;
    let currentCycle = [];

    events.forEach(event => {

        if (event.type === "assigned") {

            currentCycle.push(event.assignment);
            outstandingCount += 1;

            return;

        }

        outstandingCount = Math.max(outstandingCount - 1, 0);

        if (outstandingCount === 0) {

            currentCycle = [];

        }

    });

    return outstandingCount > 0 ? currentCycle : [];

}


function visitIndicatesViolation(visit) {

    if (!visit || typeof visit !== "object") return false;

    return visit.violation === true ||
        visit.result === "violation" ||
        visit.status === "violation" ||
        visit.visitStatus === "violation" ||
        (Array.isArray(visit.violations) && visit.violations.length > 0);

}


function visitIndicatesCompletion(visit) {

    if (!visit || typeof visit !== "object") return false;

    return visit.result === "no_violation" ||
        visit.result === "violation" ||
        visit.status === "completed" ||
        visit.status === "visited" ||
        visit.visitStatus === "visited";

}


function facilityHasViolation(license) {

    const status = getFacilityStatus(license);

    if (!status) return false;

    if (status.violation === true ||
        status.result === "violation" ||
        status.status === "violation" ||
        status.visitStatus === "violation" ||
        (Array.isArray(status.violations) && status.violations.length > 0)) {

        return true;

    }

    return Array.isArray(status.visits) &&
        status.visits.some(visitIndicatesViolation);

}


function facilityHasCompletedVisit(license) {

    const status = typeof getFacilityStatus === "function"
        ? getFacilityStatus(license)
        : null;

    if (!status) return false;

    if (status.visitStatus === "visited" ||
        status.status === "completed" ||
        status.status === "visited") {

        return true;

    }

    return Array.isArray(status.visits) &&
        status.visits.some(visitIndicatesCompletion);

}


function getCompletedFacilityVisits(license) {

    const visits = typeof getFacilityVisits === "function"
        ? getFacilityVisits(license)
        : [];

    return visits.filter(visitIndicatesCompletion);

}


function getLatestCompletedFacilityVisit(license) {

    const visits = getCompletedFacilityVisits(license);

    if (visits.length > 0) return visits[0];

    const status = typeof getFacilityStatus === "function"
        ? getFacilityStatus(license)
        : null;

    if (status && facilityHasCompletedVisit(license) && status.visitDate) {

        return {
            date: status.visitDate,
            visitCycleId: null,
            legacyStatusVisit: true
        };

    }

    return null;

}


function getPeriodicVisitPlan(settings = loadAppSettings()) {

    const storedPlan = settings && settings.periodicVisitPlan;
    const cycles = storedPlan && Array.isArray(storedPlan.cycles)
        ? storedPlan.cycles.filter(cycle => cycle && typeof cycle === "object")
        : [];

    return {
        currentCycleId: storedPlan && storedPlan.currentCycleId || "",
        cycles
    };

}


function getActivePeriodicVisitCycle(settings = loadAppSettings()) {

    const plan = getPeriodicVisitPlan(settings);

    return plan.cycles.find(cycle => {

        return cycle.id === plan.currentCycleId &&
            cycle.status === "active";

    }) || null;

}


function hasFacilityCompletedPeriodicCycle(license, cycleId) {

    if (!cycleId) return false;

    return getCompletedFacilityVisits(license).some(visit => {

        return String(visit.visitCycleId || "") === String(cycleId);

    });

}


function getLocalDateDayNumber(value) {

    const match = String(value || "").slice(0, 10).match(
        /^(\d{4})-(\d{2})-(\d{2})$/
    );

    if (!match) return null;

    return Math.floor(Date.UTC(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3])
    ) / 86400000);

}


function addDaysToLocalDate(value, days) {

    const dayNumber = getLocalDateDayNumber(value);

    if (dayNumber === null) return "";

    return new Date((dayNumber + Number(days || 0)) * 86400000)
        .toISOString()
        .slice(0, 10);

}


function getPeriodicAssignmentEligibility(
    facilityOrLicense,
    options = {}
) {

    const facility = facilityOrLicense && typeof facilityOrLicense === "object"
        ? facilityOrLicense
        : typeof findFacilityByOriginalLicense === "function"
            ? findFacilityByOriginalLicense(String(facilityOrLicense || ""))
            : { license: String(facilityOrLicense || "") };
    const license = String(
        facility && facility.license ||
        facilityOrLicense ||
        ""
    );
    const cycle = options.cycle || getActivePeriodicVisitCycle();
    const today = options.today ||
        (typeof getCurrentLocalDateValue === "function"
            ? getCurrentLocalDateValue()
            : new Date().toISOString().slice(0, 10));
    const assignment = getFacilityAssignment(license);

    if (!facility || !isFacilityEligibleForAssignment(facility)) {

        return { eligible: false, reason: "inactive" };

    }

    if (isActiveAssignment(assignment)) {

        return { eligible: false, reason: "assignment" };

    }

    if (!cycle) {

        return facilityHasCompletedVisit(license)
            ? { eligible: false, reason: "visited" }
            : { eligible: true, reason: "unvisited" };

    }

    const cycleLicenses = new Set(
        Array.isArray(cycle.facilityLicenses)
            ? cycle.facilityLicenses.map(String)
            : []
    );

    if (!cycleLicenses.has(license)) {

        return { eligible: false, reason: "outside_cycle" };

    }

    if (hasFacilityCompletedPeriodicCycle(license, cycle.id)) {

        return { eligible: false, reason: "completed_cycle" };

    }

    const latestVisit = getLatestCompletedFacilityVisit(license);

    if (!latestVisit) {

        return {
            eligible: true,
            reason: "no_completed_visit",
            daysUntilDue: 0,
            dueDate: today
        };

    }

    const lastVisitDate = String(latestVisit.date || "").slice(0, 10);
    const minimumIntervalDays = Math.max(
        1,
        Math.floor(
            Number(cycle.minimumIntervalDays) ||
            defaultPeriodicVisitIntervalDays
        )
    );
    const dueDate = addDaysToLocalDate(lastVisitDate, minimumIntervalDays);
    const todayDay = getLocalDateDayNumber(today);
    const dueDay = getLocalDateDayNumber(dueDate);

    if (todayDay === null || dueDay === null) {

        return {
            eligible: false,
            reason: "unknown_visit_date",
            lastVisitDate
        };

    }

    const daysUntilDue = dueDay - todayDay;

    return {
        eligible: daysUntilDue <= 0,
        reason: daysUntilDue <= 0 ? "due" : "waiting",
        lastVisitDate,
        dueDate,
        daysUntilDue
    };

}


function getPeriodicVisitCycleSummary(facilities, options = {}) {

    const cycle = options.cycle || getActivePeriodicVisitCycle();
    const summary = {
        total: 0,
        eligible: 0,
        dueSoon: 0,
        waiting: 0,
        assigned: 0,
        completed: 0,
        unknownVisitDate: 0
    };

    if (!cycle) return summary;

    const cycleLicenses = new Set(
        Array.isArray(cycle.facilityLicenses)
            ? cycle.facilityLicenses.map(String)
            : []
    );

    facilities.forEach(facility => {

        if (!cycleLicenses.has(String(facility.license))) return;

        summary.total += 1;

        const eligibility = getPeriodicAssignmentEligibility(
            facility,
            { ...options, cycle }
        );

        if (eligibility.reason === "completed_cycle") {

            summary.completed += 1;

        } else if (eligibility.reason === "assignment") {

            summary.assigned += 1;

        } else if (eligibility.eligible) {

            summary.eligible += 1;

        } else if (eligibility.reason === "waiting") {

            if (eligibility.daysUntilDue <= 15) {

                summary.dueSoon += 1;

            } else {

                summary.waiting += 1;

            }

        } else if (eligibility.reason === "unknown_visit_date") {

            summary.unknownVisitDate += 1;

        }

    });

    return summary;

}


function isPeriodicVisitCycleComplete(
    cycle,
    facilities = typeof allFacilities === "undefined" ? [] : allFacilities
) {

    if (!cycle) return false;

    const summary = getPeriodicVisitCycleSummary(facilities, { cycle });

    return summary.total > 0 && summary.completed === summary.total;

}


function createPeriodicVisitCycleId(sequence) {

    return `periodic-cycle-${sequence}-${Date.now()}-${
        Math.random().toString(36).slice(2)
    }`;

}


async function startPeriodicVisitCycle(
    facilities,
    minimumIntervalDays = defaultPeriodicVisitIntervalDays
) {

    if (!isAdminUser()) return null;

    const activeFacilities = facilities.filter(facility => {

        return isFacilityEligibleForAssignment(facility);

    });
    const uncoveredFacilities = activeFacilities.filter(facility => {

        return !facilityHasCompletedVisit(facility.license);

    });

    if (uncoveredFacilities.length > 0) {

        const error = new Error(
            `لا يمكن بدء الدورة قبل إكمال التغطية الأولى لـ ${uncoveredFacilities.length} منشأة.`
        );

        error.code = "BASELINE_COVERAGE_INCOMPLETE";
        error.uncoveredCount = uncoveredFacilities.length;

        throw error;

    }

    const intervalDays = Math.max(
        1,
        Math.min(
            365,
            Math.floor(
                Number(minimumIntervalDays) ||
                defaultPeriodicVisitIntervalDays
            )
        )
    );
    let startedCycle = null;

    const savedSettings = await mutateCloudObject("appSettings", settings => {

        const plan = getPeriodicVisitPlan(settings);
        const activeCycle = getActivePeriodicVisitCycle(settings);

        if (activeCycle && !isPeriodicVisitCycleComplete(activeCycle, activeFacilities)) {

            const error = new Error("توجد دورة زيارات دورية نشطة لم تكتمل.");

            error.code = "PERIODIC_CYCLE_ALREADY_ACTIVE";

            throw error;

        }

        const cycles = plan.cycles.map(cycle => {

            if (!activeCycle || cycle.id !== activeCycle.id) return cycle;

            return {
                ...cycle,
                status: "completed",
                completedAt: new Date().toISOString()
            };

        });
        const sequence = cycles.reduce((maximum, cycle) => {

            return Math.max(maximum, Number(cycle.sequence) || 0);

        }, 0) + 1;
        const startedAt = new Date().toISOString();

        startedCycle = {
            id: createPeriodicVisitCycleId(sequence),
            sequence,
            status: "active",
            startedAt,
            startedBy: currentUser.username,
            minimumIntervalDays: intervalDays,
            facilityLicenses: activeFacilities.map(facility => {

                return String(facility.license);

            })
        };

        settings.periodicVisitPlan = {
            currentCycleId: startedCycle.id,
            cycles: [...cycles, startedCycle]
        };

        return settings;

    });

    if (!startedCycle ||
        getActivePeriodicVisitCycle(savedSettings)?.id !== startedCycle.id) {

        throw new Error("تعذر تأكيد بدء دورة الزيارات الدورية.");

    }

    return startedCycle;

}


function getCommitteeKpis(username) {

    const activeAssignments = getActiveAssignmentsForCommittee(username);
    const currentCycleAssignments = getCurrentAssignmentCycleForCommittee(
        username,
        activeAssignments
    );
    const cycleTotal = currentCycleAssignments.length;
    const completedCount = activeAssignments.filter(assignment => {

        return Boolean(getAssignmentCompletionTime(assignment));

    }).length;
    const cycleCompletedCount = currentCycleAssignments.filter(assignment => {

        return Boolean(getAssignmentCompletionTime(assignment));

    }).length;
    const remainingCount = Math.max(cycleTotal - cycleCompletedCount, 0);
    const assignedCount = remainingCount === 0 ? 0 : cycleTotal;
    const violatingFacilities = new Set();

    activeAssignments.forEach(assignment => {

        const license = String(assignment.facilityLicense);

        if (facilityHasViolation(license)) {

            violatingFacilities.add(license);

        }

    });

    const completionRate = cycleTotal === 0
        ? (completedCount > 0 ? 100 : 0)
        : Math.round(((cycleTotal - remainingCount) / cycleTotal) * 100);

    return {
        assignedCount,
        completedCount,
        remainingCount,
        violatingFacilityCount: violatingFacilities.size,
        completionRate
    };

}


function getCompletionRateClass(completionRate) {

    if (completionRate >= 80) return "success";
    if (completionRate >= 50) return "warning";

    return "danger";

}


function normalizeTeam(team) {

    const source = team && typeof team === "object" ? team : {};

    return {
        leader: String(source.leader || "").trim(),
        members: Array.isArray(source.members)
            ? source.members.map(member => String(member || "").trim()).filter(Boolean)
            : []
    };

}


function createTeamSnapshot(committee) {

    const team = normalizeTeam(committee.team);
    const leaderId = String(committee.leaderId || "");
    const memberIds = Array.isArray(committee.memberIds)
        ? committee.memberIds.map(String).filter(Boolean)
        : [];

    return {
        committeeName: committee.committeeName || committee.displayName || committee.username,
        leader: typeof getEmployeeName === "function"
            ? getEmployeeName(leaderId) || team.leader
            : team.leader,
        members: memberIds.length > 0 && typeof getEmployeeName === "function"
            ? memberIds.map(getEmployeeName).filter(Boolean)
            : [...team.members],
        leaderId,
        memberIds: [...memberIds]
    };

}


function createAssignmentId(facilityLicense) {

    return `${String(facilityLicense)}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

}


function normalizeAssignmentMetadata(options = {}) {

    const visitType = options.visitType === "reactive" ? "reactive" : "periodic";
    const visitReason = visitType === "reactive"
        ? String(options.visitReason || "").trim()
        : "الخطة الدورية";
    const activeCycle = visitType === "periodic"
        ? getActivePeriodicVisitCycle()
        : null;
    const visitCycleId = activeCycle
        ? String(options.visitCycleId || activeCycle.id)
        : "";
    const visitCycleNumber = activeCycle
        ? Number(options.visitCycleNumber || activeCycle.sequence) || null
        : null;

    return {
        visitType,
        visitReason,
        visitCycleId,
        visitCycleNumber
    };

}


function createAssignmentBatchId(committeeUsername) {

    return `batch-${committeeUsername}-${Date.now()}-${
        Math.random().toString(36).slice(2)
    }`;

}


function isFacilityEligibleForAssignment(facilityOrLicense) {

    if (typeof isFacilityActive !== "function") return true;

    if (facilityOrLicense && typeof facilityOrLicense === "object") {

        return isFacilityActive(facilityOrLicense);

    }

    if (typeof findFacilityByOriginalLicense !== "function") return true;

    return isFacilityActive(
        findFacilityByOriginalLicense(String(facilityOrLicense || ""))
    );

}


function isComplaintReassignmentAllowed(
    assignment,
    committeeUsername,
    visitType,
    visitReason
) {

    return Boolean(
        isActiveAssignment(assignment) &&
        visitType === "reactive" &&
        String(visitReason || "").trim() === "شكوى" &&
        committeeUsername &&
        assignment.committeeUsername !== committeeUsername
    );

}


function isFacilityAssignableForVisit(
    facilityOrLicense,
    visitType = "periodic",
    options = {}
) {

    if (!isFacilityEligibleForAssignment(facilityOrLicense)) return false;

    const license = String(
        facilityOrLicense && typeof facilityOrLicense === "object"
            ? facilityOrLicense.license
            : facilityOrLicense
    );

    const assignment = getFacilityAssignment(license);

    if (isActiveAssignment(assignment)) {

        return isComplaintReassignmentAllowed(
            assignment,
            String(options.committeeUsername || ""),
            visitType,
            options.visitReason
        );

    }

    if (visitType === "reactive") return true;

    return getPeriodicAssignmentEligibility(facilityOrLicense).eligible;

}


function createArchivedAssignment(assignment, reason) {

    return {
        ...assignment,
        archivedAt: new Date().toISOString(),
        archivedBy: currentUser && currentUser.username || "",
        archiveReason: reason
    };

}


function createComplaintTransferSnapshot(assignment, committeeUsername) {

    const transferredAt = new Date().toISOString();

    return {
        ...assignment,
        statusBeforeArchive: assignment.status,
        status: "cancelled",
        cancelledAt: transferredAt,
        cancelledBy: currentUser && currentUser.username || "",
        cancellationReason: "إعادة إسناد بسبب شكوى",
        transferredAt,
        transferredToCommitteeUsername: committeeUsername
    };

}


async function persistAssignmentReplacement(
    previousAssignments,
    nextAssignments,
    assignmentsToArchive,
    reason
) {

    const nextHistory = { ...facilityAssignmentHistory };

    assignmentsToArchive.forEach(assignment => {

        if (!assignment || !assignment.id) return;

        const archiveReason = typeof reason === "function"
            ? reason(assignment)
            : reason;

        nextHistory[String(assignment.id)] = createArchivedAssignment(
            assignment,
            archiveReason
        );

    });

    const savedCollections = await mutateCloudCollectionsWithRollback([
        {
            key: assignmentHistoryStorageKey,
            previousValue: facilityAssignmentHistory,
            nextValue: nextHistory
        },
        {
            key: assignmentsStorageKey,
            previousValue: previousAssignments,
            nextValue: nextAssignments
        }
    ]);

    facilityAssignmentHistory = normalizeAssignmentHistory(
        savedCollections[assignmentHistoryStorageKey]
    );
    facilityAssignments = normalizeAssignments(
        savedCollections[assignmentsStorageKey]
    );

    return facilityAssignments;

}


async function assignFacilityToCommittee(
    facilityLicense,
    committeeUsername,
    status = "assigned",
    options = {}
) {

    if (!isAdminUser()) return false;

    const committee = users[committeeUsername];

    if (!committee || committee.role !== "committee") return;

    const normalizedLicense = String(facilityLicense);
    const existingAssignment = getFacilityAssignment(normalizedLicense);

    if (status === "cancelled") {

        if (!existingAssignment) return false;

        facilityAssignments = await mutateCloudObject(
            "facilityAssignments",
            nextAssignments => {

                const nextAssignment = nextAssignments[normalizedLicense];

                if (!nextAssignment) return nextAssignments;

                nextAssignment.status = "cancelled";

                return nextAssignments;

            }
        );

        console.log(`Cancelled facility license: ${normalizedLicense}`);
        refreshAssignmentViews(existingAssignment.committeeUsername);

        return true;

    }

    if (!isFacilityEligibleForAssignment(normalizedLicense)) return false;

    const metadata = normalizeAssignmentMetadata(options);

    if (isActiveAssignment(existingAssignment) &&
        existingAssignment.committeeUsername !== committeeUsername) {

        return false;

    }

    if (!isActiveAssignment(existingAssignment) &&
        !isFacilityAssignableForVisit(normalizedLicense, metadata.visitType)) {

        return false;

    }

    const assignedAt = isActiveAssignment(existingAssignment)
        ? existingAssignment.assignedAt
        : new Date().toISOString();
    const assignmentBatchId = options.assignmentBatchId ||
        createAssignmentBatchId(committeeUsername);
    const nextAssignment = {
        id: createAssignmentId(normalizedLicense),
        facilityLicense: normalizedLicense,
        committeeUsername,
        assignedAt,
        assignmentBatchId,
        status: assignmentStatuses.includes(status) ? status : "assigned",
        teamSnapshot: createTeamSnapshot(committee),
        visitType: metadata.visitType,
        visitReason: metadata.visitReason,
        visitCycleId: metadata.visitCycleId || null,
        visitCycleNumber: metadata.visitCycleNumber
    };

    if (existingAssignment && !isActiveAssignment(existingAssignment)) {

        const nextAssignments = {
            ...facilityAssignments,
            [normalizedLicense]: nextAssignment
        };

        await persistAssignmentReplacement(
            facilityAssignments,
            nextAssignments,
            [existingAssignment],
            metadata.visitCycleId
                ? `periodic_cycle_${metadata.visitCycleNumber}`
                : `${metadata.visitType}_reassignment`
        );

    } else {

        facilityAssignments = await mutateCloudObject(
            assignmentsStorageKey,
            nextAssignments => {

                const remoteAssignment = nextAssignments[normalizedLicense];

                if (isActiveAssignment(remoteAssignment) &&
                    remoteAssignment.committeeUsername !== committeeUsername) {

                    throw new Error("المنشأة أُسندت إلى لجنة أخرى أثناء العملية.");

                }

                nextAssignments[normalizedLicense] = {
                    ...nextAssignment,
                    assignedAt: isActiveAssignment(remoteAssignment)
                        ? remoteAssignment.assignedAt
                        : assignedAt,
                    assignmentBatchId: isActiveAssignment(remoteAssignment)
                        ? remoteAssignment.assignmentBatchId || null
                        : assignmentBatchId
                };

                return nextAssignments;

            }
        );

    }

    refreshAssignmentViews(committeeUsername);

    return true;

}


async function cancelAssignmentsForCommittee(committeeUsername, facilityLicenses) {

    if (!isAdminUser()) return 0;

    const selectedLicenses = new Set(
        facilityLicenses.map(license => String(license))
    );
    let cancelledCount = 0;

    facilityAssignments = await mutateCloudObject(
        "facilityAssignments",
        nextAssignments => {

            cancelledCount = 0;

            selectedLicenses.forEach(license => {

                const assignment = nextAssignments[license];

                if (!isActiveAssignment(assignment) ||
                    assignment.committeeUsername !== committeeUsername) return;

                assignment.status = "cancelled";
                cancelledCount += 1;

            });

            return nextAssignments;

        }
    );

    if (cancelledCount === 0) return 0;

    refreshAssignmentViews(committeeUsername);

    return cancelledCount;

}


async function updateAssignmentFromVisit(
    facilityLicense,
    result,
    visitId = "",
    expectedAssignmentId = ""
) {

    if (!isCommitteeUser()) return;

    const normalizedLicense = String(facilityLicense);
    const assignment = getFacilityAssignment(normalizedLicense);

    if (!assignment ||
        assignment.committeeUsername !== currentUser.username ||
        assignment.status === "cancelled") return;

    const status = ["no_violation", "violation", "visited"].includes(result)
        ? "completed"
        : ["incomplete", "partial"].includes(result)
            ? "in_progress"
            : null;

    if (!status || assignment.status === status) return assignment;

    const statusBefore = assignment.status;

    console.info("[VisitSync] saving assignment status", {
        facilityId: normalizedLicense,
        assignmentId: assignment.id || "",
        committeeId: assignment.committeeUsername,
        visitId,
        statusBefore,
        statusAfter: status
    });

    try {

        facilityAssignments = await mutateCloudObject(
            "facilityAssignments",
            nextAssignments => {

                const nextAssignment = nextAssignments[normalizedLicense];

                if (!nextAssignment ||
                    nextAssignment.committeeUsername !== currentUser.username ||
                    (expectedAssignmentId &&
                        String(nextAssignment.id) !== String(expectedAssignmentId)) ||
                    nextAssignment.status === "cancelled") {

                    throw new Error("The active assignment changed before the visit was saved.");

                }

                nextAssignment.status = status;

                return nextAssignments;

            }
        );

    } catch (error) {

        console.error("[VisitSync] assignment upsert failed", {
            facilityId: normalizedLicense,
            assignmentId: assignment.id || "",
            committeeId: assignment.committeeUsername,
            visitId,
            statusBefore,
            statusAfter: statusBefore,
            error
        });

        throw error;

    }

    console.info("[VisitSync] assignment status saved", {
        facilityId: normalizedLicense,
        assignmentId: facilityAssignments[normalizedLicense].id || "",
        committeeId: facilityAssignments[normalizedLicense].committeeUsername,
        visitId,
        statusBefore,
        statusAfter: facilityAssignments[normalizedLicense].status
    });

    return facilityAssignments[normalizedLicense];

}


async function assignFacilitiesToCommittee(facilityLicenses, committeeUsername, options = {}) {

    if (!isAdminUser()) return false;

    const committee = users[committeeUsername];

    if (!committee || committee.role !== "committee" || !committee.active) return false;

    const assignedAt = new Date().toISOString();
    const assignmentBatchId = options.assignmentBatchId ||
        options.smartBatchId ||
        createAssignmentBatchId(committeeUsername);
    const metadata = normalizeAssignmentMetadata(options);
    const uniqueLicenses = [...new Set(facilityLicenses.map(license => String(license)))]
        .filter(license => {

            return isFacilityAssignableForVisit(license, metadata.visitType, {
                committeeUsername,
                visitReason: metadata.visitReason
            });

        });
    let assignedCount = 0;
    const assignmentsToArchive = uniqueLicenses
        .map(license => {

            const assignment = facilityAssignments[license];

            if (!assignment) return null;

            if (isComplaintReassignmentAllowed(
                assignment,
                committeeUsername,
                metadata.visitType,
                metadata.visitReason
            )) {

                return createComplaintTransferSnapshot(
                    assignment,
                    committeeUsername
                );

            }

            return !isActiveAssignment(assignment) ? assignment : null;

        })
        .filter(Boolean);

    if (assignmentsToArchive.length > 0) {

        const nextAssignments = { ...facilityAssignments };

        uniqueLicenses.forEach((license, index) => {

            nextAssignments[license] = {
                id: createAssignmentId(license),
                facilityLicense: license,
                committeeUsername,
                assignedAt,
                assignmentBatchId,
                status: "assigned",
                teamSnapshot: createTeamSnapshot(committee),
                visitType: metadata.visitType,
                visitReason: metadata.visitReason,
                visitCycleId: metadata.visitCycleId || null,
                visitCycleNumber: metadata.visitCycleNumber,
                assignmentSource: options.assignmentSource || "manual",
                smartBatchId: options.smartBatchId || null,
                smartSequence: typeof options.smartSequenceStart === "number"
                    ? options.smartSequenceStart + index
                    : null
            };

        });

        await persistAssignmentReplacement(
            facilityAssignments,
            nextAssignments,
            assignmentsToArchive,
            assignment => {

                if (assignment.statusBeforeArchive) {

                    return "reactive_complaint_transfer";

                }

                return metadata.visitCycleId
                    ? `periodic_cycle_${metadata.visitCycleNumber}`
                    : `${metadata.visitType}_reassignment`;

            }
        );

        assignedCount = uniqueLicenses.length;
        refreshAssignmentViews(committeeUsername);

        return assignedCount;

    }

    facilityAssignments = await mutateCloudObject(
        assignmentsStorageKey,
        nextAssignments => {

            assignedCount = 0;

            uniqueLicenses.forEach(license => {

                const existingAssignment = nextAssignments[license];

                if (isActiveAssignment(existingAssignment) &&
                    existingAssignment.committeeUsername !== committeeUsername) return;

                nextAssignments[license] = {
                    id: createAssignmentId(license),
                    facilityLicense: license,
                    committeeUsername,
                    assignedAt,
                    assignmentBatchId,
                    status: "assigned",
                    teamSnapshot: createTeamSnapshot(committee),
                    visitType: metadata.visitType,
                    visitReason: metadata.visitReason,
                    visitCycleId: metadata.visitCycleId || null,
                    visitCycleNumber: metadata.visitCycleNumber,
                    assignmentSource: options.assignmentSource || "manual",
                    smartBatchId: options.smartBatchId || null,
                    smartSequence: typeof options.smartSequenceStart === "number"
                        ? options.smartSequenceStart + assignedCount
                        : null
                };

                assignedCount += 1;

            });

            return nextAssignments;

        }
    );

    refreshAssignmentViews(committeeUsername);

    return assignedCount;

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
    const committeeAssignments = getActiveAssignmentsForCommittee(committeeUsername);
    const latestSmartBatchAssignment = [...committeeAssignments]
        .filter(assignment => assignment.assignmentSource === "smart" &&
            assignment.smartBatchId)
        .sort((a, b) => {

            const dateDifference =
                new Date(b.assignedAt || 0) - new Date(a.assignedAt || 0);

            if (dateDifference !== 0) return dateDifference;

            return Number(b.smartSequence || 0) - Number(a.smartSequence || 0);

        })[0];

    if (latestSmartBatchAssignment) {

        const facility = facilityByLicense[
            String(latestSmartBatchAssignment.facilityLicense)
        ];

        if (hasValidCoordinates(facility)) return facility;

    }

    const latestActiveAssignment = [...committeeAssignments]
        .sort((a, b) => {

            return new Date(b.assignedAt || 0) - new Date(a.assignedAt || 0);

        })[0];

    if (latestActiveAssignment) {

        const facility = facilityByLicense[String(latestActiveAssignment.facilityLicense)];

        if (hasValidCoordinates(facility)) return facility;

    }

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


function getUniqueFacilitiesByLicense(facilities) {

    const facilityByLicense = new Map();

    facilities.forEach(facility => {

        if (!facility || typeof facility.license === "undefined") return;

        const license = String(facility.license);

        if (!facilityByLicense.has(license)) {

            facilityByLicense.set(license, facility);

        }

    });

    return [...facilityByLicense.values()];

}


function selectNearestNeighborFacilities(candidates, requestedCount, referencePoint) {

    const remainingCandidates = [...candidates];
    const selectedFacilities = [];
    let currentReferencePoint = referencePoint;
    const selectionLimit = Math.min(requestedCount, remainingCandidates.length);

    while (selectedFacilities.length < selectionLimit) {

        let nearestIndex = 0;
        let nearestDistance = Number.POSITIVE_INFINITY;

        remainingCandidates.forEach((facility, index) => {

            const distance = calculateHaversineDistance(currentReferencePoint, facility);

            if (distance < nearestDistance) {

                nearestDistance = distance;
                nearestIndex = index;

            }

        });

        const [nearestFacility] = remainingCandidates.splice(nearestIndex, 1);

        selectedFacilities.push(nearestFacility);
        currentReferencePoint = nearestFacility;

    }

    return selectedFacilities;

}


function getSmartAssignmentIneligibilityReason(facility, duplicateLicenses = new Set()) {

    if (!facility || duplicateLicenses.has(String(facility.license))) {

        return "duplicate";

    }

    if (!hasValidCoordinates(facility)) {

        return "coordinates";

    }

    const eligibility = getPeriodicAssignmentEligibility(facility);

    return eligibility.eligible ? "" : eligibility.reason;

}


function getSmartAssignmentCandidates(facilities, excludedLicense = "") {

    let excludedVisitedCount = 0;
    const candidates = [];
    const selectedLicenses = new Set();

    facilities.forEach(facility => {

        if (!facility || typeof facility.license === "undefined") return;

        const license = String(facility.license);

        if (license === String(excludedLicense)) return;

        if (selectedLicenses.has(license)) return;

        const reason = getSmartAssignmentIneligibilityReason(facility);

        if (reason === "visited") {

            excludedVisitedCount += 1;

        }

        if (!reason) {

            candidates.push(facility);
            selectedLicenses.add(license);

        }

    });

    return { candidates, excludedVisitedCount };

}


async function smartAssignFacilities(
    facilities,
    committeeUsername,
    count,
    startFacilityLicense = ""
) {

    if (!isAdminUser()) return [];

    const committee = users[committeeUsername];
    const requestedCount = Math.floor(Number(count));

    if (!committee ||
        committee.role !== "committee" ||
        !committee.active ||
        requestedCount < 1) return [];

    const existingActiveCount =
        getActiveAssignmentsForCommittee(committeeUsername).length;

    console.log(`Smart assignment existing active count: ${existingActiveCount}`);
    console.log(`Smart assignment requested: ${requestedCount}`);
    console.log(`Smart assignment explicitStartFacility: ${startFacilityLicense || ""}`);

    const selectedStartFacility = facilities.find(facility => {

        return String(facility.license) === String(startFacilityLicense);

    });
    const explicitStartSelected = Boolean(startFacilityLicense);
    const startDuplicateLicenses = new Set();
    const startLicenseCount = facilities.filter(facility => {

        return String(facility.license) === String(startFacilityLicense);

    }).length;

    if (startLicenseCount > 1) {

        startDuplicateLicenses.add(String(startFacilityLicense));

    }

    if (explicitStartSelected) {

        const startReason = getSmartAssignmentIneligibilityReason(
            selectedStartFacility,
            startDuplicateLicenses
        );

        console.log(`Smart assignment eligibility result: ${startReason || "eligible"}`);

        if (startReason) {

            return {
                ok: false,
                message: startReason === "waiting"
                    ? "منشأة البداية لم تبلغ مدة الاستحقاق الزمني."
                    : "منشأة البداية غير مؤهلة للإسناد أو لديها إسناد مفتوح."
            };

        }

    }

    const referencePoint = explicitStartSelected
        ? selectedStartFacility
        : getSmartAssignmentReferencePoint(committeeUsername, facilities);
    const {
        candidates,
        excludedVisitedCount
    } = getSmartAssignmentCandidates(
        facilities,
        explicitStartSelected ? startFacilityLicense : ""
    );
    const startFacilities = explicitStartSelected ? [selectedStartFacility] : [];
    const remainingCount = Math.max(requestedCount - startFacilities.length, 0);
    const nearestFacilities = [
        ...startFacilities,
        ...selectNearestNeighborFacilities(
            candidates,
            remainingCount,
            referencePoint
        )
    ];

    console.log(`Smart assignment selected: ${nearestFacilities.length}`);
    console.log(`Smart assignment selected new count: ${nearestFacilities.length}`);
    console.log(
        `Smart assignment selected licenses in order: ${
            nearestFacilities.map(facility => facility.license).join(",")
        }`
    );
    console.log(`Smart assignment excluded visited count: ${excludedVisitedCount}`);

    if (nearestFacilities.length === 0) return [];

    const smartBatchId = `smart-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    await assignFacilitiesToCommittee(
        nearestFacilities.map(facility => facility.license),
        committeeUsername,
        {
            visitType: "periodic",
            visitReason: "الخطة الدورية",
            assignmentSource: "smart",
            smartBatchId,
            smartSequenceStart: 0
        }
    );

    console.log(
        `Smart assignment final active count: ${
            getActiveAssignmentsForCommittee(committeeUsername).length
        }`
    );

    return nearestFacilities;

}


function getAccessibleFacilities(facilities) {

    if (isAdminUser() || isViewerUser()) return facilities;

    if (!isCommitteeUser()) return [];

    return facilities;

}


function isFacilityAssignedToCurrentCommittee(facility) {

    if (!isCommitteeUser()) return false;

    const assignment = getFacilityAssignment(facility.license);

    return isActiveAssignment(assignment) &&
        assignment.committeeUsername === currentUser.username;

}


function getAssignedFacilitiesForCurrentUser(facilities) {

    if (!isCommitteeUser()) return [];

    return getFacilitiesForCurrentAssignmentCycle(currentUser.username, facilities);

}


function getFacilitiesForActiveAssignments(username, facilities) {

    const activeAssignments = getActiveAssignmentsForCommittee(username);
    const activeFacilityLicenses = new Set(activeAssignments.map(assignment => {

        return String(assignment.facilityLicense);

    }));

    return facilities.filter(facility => {

        return activeFacilityLicenses.has(String(facility.license));

    });

}


function getFacilitiesForCurrentAssignmentCycle(username, facilities) {

    const currentCycleAssignments = getCurrentAssignmentCycleForCommittee(username);
    const currentCycleLicenses = new Set(currentCycleAssignments.map(assignment => {

        return String(assignment.facilityLicense);

    }));

    return facilities.filter(facility => {

        return currentCycleLicenses.has(String(facility.license));

    });

}


function refreshAssignmentViews(username = "") {

    renderCommitteeAssignmentCards();

    if (typeof refreshSyncAuditFromLocalData === "function") {

        refreshSyncAuditFromLocalData();

    }

    if (typeof allFacilities === "undefined" ||
        !Array.isArray(allFacilities) ||
        allFacilities.length === 0) return;

    renderAssignmentBoard(allFacilities);

    if (username &&
        selectedCommitteeUsername === username &&
        typeof showCommitteeFacilityList === "function") {

        showCommitteeFacilityList(
            users[username],
            getFacilitiesForCurrentAssignmentCycle(username, allFacilities)
        );

    }

    if (isCommitteeUser() &&
        currentUser.username === username &&
        typeof showFacilityList === "function") {

        showFacilityList(
            getAssignedFacilitiesForCurrentUser(allFacilities),
            { fitBounds: false, committeeAssignedView: true }
        );

    }

}


function renderCommitteeAssignmentCards() {

    const container = document.getElementById("committeeCards");

    if (!container || (!isAdminUser() && !isViewerUser())) return;

    container.innerHTML = getCommitteeUsers().map(committee => {

        const kpis = getCommitteeKpis(committee.username);
        const progressClass = getCompletionRateClass(kpis.completionRate);

        return `
            <article class="committee-card ${selectedCommitteeUsername === committee.username ? "active" : ""}"
                     data-committee-username="${committee.username}"
                     role="button" tabindex="0"
                     aria-pressed="${selectedCommitteeUsername === committee.username}">
                <div class="committee-card-header">
                    <div class="committee-card-identity">
                        <span class="committee-card-icon">
                            <i class="fa-solid fa-people-group"></i>
                        </span>
                        <div>
                            <h6>${escapeHtml(committee.committeeName)}</h6>
                            <small>${escapeHtml(committee.username)}</small>
                        </div>
                    </div>
                    <span class="badge ${committee.active ? "text-bg-success" : "text-bg-secondary"}">
                        ${committee.active ? "نشطة" : "غير نشطة"}
                    </span>
                </div>
                <div class="committee-card-counts">
                    <span><small>المسندة</small><strong>${kpis.assignedCount}</strong></span>
                    <span class="is-completed"><small>المنجزة</small><strong>${kpis.completedCount}</strong></span>
                    <span class="is-remaining"><small>المتبقي</small><strong>${kpis.remainingCount}</strong></span>
                    <span class="is-violation"><small>المخالفات</small><strong>${kpis.violatingFacilityCount}</strong></span>
                </div>
                <div class="committee-card-progress-row">
                    <span>نسبة الإنجاز</span>
                    <strong>${kpis.completionRate}%</strong>
                </div>
                <div class="committee-card-progress"
                     role="progressbar"
                     aria-label="نسبة الإنجاز"
                     aria-valuemin="0"
                     aria-valuemax="100"
                     aria-valuenow="${kpis.completionRate}">
                    <div class="committee-card-progress-bar ${progressClass}"
                         style="width: ${kpis.completionRate}%"></div>
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

            const assignedFacilities = getFacilitiesForCurrentAssignmentCycle(
                username,
                allFacilities
            );

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


function getUnassignedFacilities(facilities, visitType = "periodic", options = {}) {

    return facilities.filter(facility => {

        return isFacilityAssignableForVisit(facility, visitType, options);

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


function renderPeriodicVisitCyclePanel(facilities) {

    const title = document.getElementById("periodicVisitCycleTitle");
    const description = document.getElementById("periodicVisitCycleDescription");
    const metrics = document.getElementById("periodicVisitCycleMetrics");
    const intervalInput = document.getElementById("periodicVisitIntervalDays");
    const startButton = document.getElementById("startPeriodicVisitCycle");
    const assignmentSearchLabel = document.getElementById("assignmentSearchLabel");

    if (!title ||
        !description ||
        !metrics ||
        !intervalInput ||
        !startButton) return;

    const cycle = getActivePeriodicVisitCycle();
    const activeFacilities = facilities.filter(isFacilityEligibleForAssignment);

    if (!cycle) {

        const uncoveredCount = activeFacilities.filter(facility => {

            return !facilityHasCompletedVisit(facility.license);

        }).length;
        const coveredCount = activeFacilities.length - uncoveredCount;

        title.textContent = "التغطية الأولى";
        description.textContent = uncoveredCount > 0
            ? `يتبقى ${uncoveredCount} منشأة قبل فتح دورة إعادة الزيارة.`
            : "اكتملت التغطية الأولى ويمكن فتح جميع المنشآت للدورة الدورية.";
        metrics.innerHTML = `
            <div class="periodic-cycle-metric">
                <span>المنشآت النشطة</span>
                <strong>${activeFacilities.length}</strong>
            </div>
            <div class="periodic-cycle-metric">
                <span>تمت زيارتها</span>
                <strong>${coveredCount}</strong>
            </div>
            <div class="periodic-cycle-metric">
                <span>لم تُزر</span>
                <strong>${uncoveredCount}</strong>
            </div>
        `;
        startButton.textContent = "بدء دورة الزيارات الدورية";
        startButton.disabled = uncoveredCount > 0;
        intervalInput.disabled = uncoveredCount > 0;

        if (assignmentSearchLabel) {

            assignmentSearchLabel.textContent = "المنشآت غير المسندة";

        }

        return;

    }

    const summary = getPeriodicVisitCycleSummary(activeFacilities, { cycle });
    const isComplete = summary.total > 0 && summary.completed === summary.total;

    title.textContent = `دورة الزيارات الدورية ${cycle.sequence}`;
    description.textContent =
        `فتحت لجميع المنشآت النشطة؛ الإسناد متاح بعد مرور ${cycle.minimumIntervalDays} يومًا من آخر زيارة.`;
    metrics.innerHTML = `
        <div class="periodic-cycle-metric">
            <span>مستحقة الآن</span>
            <strong>${summary.eligible}</strong>
        </div>
        <div class="periodic-cycle-metric">
            <span>خلال 15 يومًا</span>
            <strong>${summary.dueSoon}</strong>
        </div>
        <div class="periodic-cycle-metric">
            <span>لم يحن موعدها</span>
            <strong>${summary.waiting}</strong>
        </div>
        <div class="periodic-cycle-metric">
            <span>مسندة حاليًا</span>
            <strong>${summary.assigned}</strong>
        </div>
        <div class="periodic-cycle-metric">
            <span>مكتملة بالدورة</span>
            <strong>${summary.completed}</strong>
        </div>
        <div class="periodic-cycle-metric">
            <span>تاريخ غير معروف</span>
            <strong>${summary.unknownVisitDate}</strong>
        </div>
    `;
    intervalInput.value = String(
        cycle.minimumIntervalDays || defaultPeriodicVisitIntervalDays
    );
    intervalInput.disabled = !isComplete;
    startButton.textContent = isComplete
        ? "بدء الدورة التالية"
        : `الدورة ${cycle.sequence} نشطة`;
    startButton.disabled = !isComplete;

    if (assignmentSearchLabel) {

        assignmentSearchLabel.textContent = "المنشآت المستحقة للإسناد";

    }

}


function renderAssignmentBoard(facilities) {

    const list = document.getElementById("unassignedFacilitiesList");
    const committeeSelect = document.getElementById("assignmentCommittee");
    const searchInput = document.getElementById("assignmentSearch");
    const visitTypeSelect = document.getElementById("assignmentVisitType");
    const visitReasonSelect = document.getElementById("assignmentVisitReason");
    const startFacilitySelect =
        document.getElementById("smartAssignmentStartFacility");

    if (!list ||
        !committeeSelect ||
        !searchInput ||
        !visitTypeSelect ||
        !visitReasonSelect ||
        !startFacilitySelect ||
        !isAdminUser()) return;

    renderPeriodicVisitCyclePanel(facilities);

    const selectedCommittee = committeeSelect.value;
    const selectedStartFacility = startFacilitySelect.value;
    const selectedVisitType = visitTypeSelect.value === "reactive"
        ? "reactive"
        : "periodic";

    if (selectedVisitType === "reactive") {

        const assignmentSearchLabel =
            document.getElementById("assignmentSearchLabel");

        if (assignmentSearchLabel) {

            assignmentSearchLabel.textContent =
                "المنشآت المتاحة للزيارة التفاعلية";

        }

    }

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
        ${getUnassignedFacilities(facilities, "periodic")
            .filter(hasValidCoordinates)
            .map(facility => {
                const displayLicense = getFacilityDisplayLicense(facility);

                return `
                <option value="${escapeHtml(facility.license)}">
                    ${escapeHtml(facility.name)} —
                    ${escapeHtml(facility.district)} —
                    ${escapeHtml(displayLicense)}
                </option>
            `;
            }).join("")}
    `;

    if (facilities.some(facility => {

        return String(facility.license) === selectedStartFacility &&
            hasValidCoordinates(facility);

    })) {

        startFacilitySelect.value = selectedStartFacility;

    }

    const query = searchInput.value.trim().toLowerCase();
    const unassignedFacilities = getUnassignedFacilities(
        facilities,
        selectedVisitType,
        {
            committeeUsername: selectedCommittee,
            visitReason: visitReasonSelect.value
        }
    ).filter(facility => {

        return [
            facility.name,
            facility.license,
            getFacilityDisplayLicense(facility),
            facility.district,
            facility.type
        ]
            .some(value => String(value || "").toLowerCase().includes(query));

    });

    if (unassignedFacilities.length === 0) {

        list.innerHTML = `
            <div class="text-muted small p-3">${
                selectedVisitType === "periodic" && getActivePeriodicVisitCycle()
                    ? "لا توجد منشآت مستحقة للإسناد حاليًا."
                    : "لا توجد منشآت غير مسندة."
            }</div>
        `;

        return;

    }

    list.innerHTML = unassignedFacilities.map(facility => {
        const displayLicense = getFacilityDisplayLicense(facility);
        const activeAssignment = getFacilityAssignment(facility.license);
        const isComplaintTransfer = isComplaintReassignmentAllowed(
            activeAssignment,
            selectedCommittee,
            selectedVisitType,
            visitReasonSelect.value
        );

        return `
        <label class="assignment-facility-item">
            <input class="form-check-input assignment-facility-checkbox"
                   type="checkbox" value="${escapeHtml(facility.license)}">
            <span>
                <strong>${escapeHtml(facility.name)}</strong>
                <small>الترخيص: ${escapeHtml(displayLicense)}</small>
                <small>${escapeHtml(facility.district)} · ${escapeHtml(facility.type)}</small>
                ${isComplaintTransfer ? `
                    <small class="text-danger">
                        مسندة حاليًا إلى ${escapeHtml(
                            activeAssignment.committeeUsername
                        )} — سيُنقل الإسناد مع حفظ السجل السابق
                    </small>
                ` : ""}
            </span>
        </label>
    `;
    }).join("");

    syncSmartAssignmentStartFromChecked();

}


function initializeAssignmentBoard() {

    const searchInput = document.getElementById("assignmentSearch");
    const list = document.getElementById("unassignedFacilitiesList");
    const assignButton = document.getElementById("assignSelectedFacilities");
    const committeeSelect = document.getElementById("assignmentCommittee");
    const visitTypeSelect = document.getElementById("assignmentVisitType");
    const visitReasonGroup = document.getElementById("assignmentVisitReasonGroup");
    const visitReasonSelect = document.getElementById("assignmentVisitReason");
    const message = document.getElementById("assignmentBoardMessage");
    const smartAssignmentCount = document.getElementById("smartAssignmentCount");
    const startFacilitySelect =
        document.getElementById("smartAssignmentStartFacility");
    const smartAssignButton = document.getElementById("smartAssignFacilities");
    const periodicIntervalInput =
        document.getElementById("periodicVisitIntervalDays");
    const startPeriodicCycleButton =
        document.getElementById("startPeriodicVisitCycle");
    const periodicCycleMessage =
        document.getElementById("periodicVisitCycleMessage");

    if (!searchInput ||
        !list ||
        !assignButton ||
        !committeeSelect ||
        !visitTypeSelect ||
        !visitReasonGroup ||
        !visitReasonSelect ||
        !smartAssignmentCount ||
        !startFacilitySelect ||
        !smartAssignButton ||
        !periodicIntervalInput ||
        !startPeriodicCycleButton ||
        !periodicCycleMessage ||
        !isAdminUser()) return;

    startPeriodicCycleButton.addEventListener("click", async () => {

        const activeCycle = getActivePeriodicVisitCycle();
        const intervalDays = Math.floor(Number(periodicIntervalInput.value));

        if (!Number.isInteger(intervalDays) ||
            intervalDays < 1 ||
            intervalDays > 365) {

            periodicCycleMessage.textContent =
                "أدخل مدة صحيحة بين 1 و365 يومًا.";
            periodicCycleMessage.className = "small text-danger";

            return;

        }

        const actionLabel = activeCycle
            ? "بدء الدورة الدورية التالية"
            : "فتح جميع المنشآت النشطة لدورة الزيارات الدورية";
        const confirmed = window.confirm(
            `${actionLabel} بحد أدنى ${intervalDays} يومًا بين الزيارتين؟\n` +
            "لن تُحذف أو تُعدّل أي زيارة أو إسناد سابق."
        );

        if (!confirmed) return;

        startPeriodicCycleButton.disabled = true;
        periodicCycleMessage.textContent = "جاري بدء الدورة ومزامنتها...";
        periodicCycleMessage.className = "small text-muted";

        try {

            const cycle = await startPeriodicVisitCycle(
                allFacilities,
                intervalDays
            );

            renderAssignmentBoard(allFacilities);

            const refreshedMessage =
                document.getElementById("periodicVisitCycleMessage");

            refreshedMessage.textContent =
                `تم بدء الدورة ${cycle.sequence}. ستظهر المنشآت عند بلوغ الاستحقاق الزمني.`;
            refreshedMessage.className = "small text-success";

        } catch (error) {

            periodicCycleMessage.textContent = error && error.message
                ? error.message
                : "تعذر بدء دورة الزيارات الدورية.";
            periodicCycleMessage.className = "small text-danger";
            renderPeriodicVisitCyclePanel(allFacilities);

        }

    });

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

    const syncVisitReasonVisibility = () => {

        if (visitTypeSelect.value === "periodic") {

            visitReasonGroup.classList.add("d-none");
            visitReasonSelect.value = "";

            return;

        }

        visitReasonGroup.classList.remove("d-none");

    };

    visitTypeSelect.addEventListener("change", syncVisitReasonVisibility);
    visitTypeSelect.addEventListener("change", () => {

        smartAssignmentStartMode = "auto";
        renderAssignmentBoard(allFacilities);

    });
    visitReasonSelect.addEventListener("change", () => {

        renderAssignmentBoard(allFacilities);

    });
    committeeSelect.addEventListener("change", () => {

        renderAssignmentBoard(allFacilities);

    });

    syncVisitReasonVisibility();

    const getManualAssignmentMetadata = () => {

        if (visitTypeSelect.value !== "reactive") {

            return {
                visitType: "periodic",
                visitReason: "الخطة الدورية"
            };

        }

        return {
            visitType: "reactive",
            visitReason: visitReasonSelect.value
        };

    };

    assignButton.addEventListener("click", async () => {

        const selectedFacilities = [...document.querySelectorAll(
            ".assignment-facility-checkbox:checked"
        )].map(checkbox => checkbox.value);

        if (!committeeSelect.value || selectedFacilities.length === 0) {

            message.textContent = "اختر لجنة ومنشأة واحدة على الأقل.";
            message.className = "small text-danger";

            return;

        }

        const assignmentMetadata = getManualAssignmentMetadata();

        if (assignmentMetadata.visitType === "reactive" &&
            !assignmentMetadata.visitReason) {

            message.textContent = "اختر سبب الزيارة التفاعلية.";
            message.className = "small text-danger";

            return;

        }

        const complaintTransferCount = selectedFacilities.filter(license => {

            return isComplaintReassignmentAllowed(
                getFacilityAssignment(license),
                committeeSelect.value,
                assignmentMetadata.visitType,
                assignmentMetadata.visitReason
            );

        }).length;

        if (complaintTransferCount > 0) {

            const confirmed = window.confirm(
                `سيتم نقل إسناد ${complaintTransferCount} منشأة من لجنتها الحالية ` +
                "إلى اللجنة المختارة بسبب شكوى.\n" +
                "ستُحفظ الزيارات والإسنادات السابقة كاملة في السجل. هل تريد المتابعة؟"
            );

            if (!confirmed) return;

        }

        assignButton.disabled = true;
        message.textContent = "جاري حفظ الإسناد ومزامنته...";
        message.className = "small text-muted";

        try {

            await assignFacilitiesToCommittee(
                selectedFacilities,
                committeeSelect.value,
                assignmentMetadata
            );
            smartAssignmentStartMode = "auto";
            renderAssignmentBoard(allFacilities);

            message.textContent = "تم إسناد المنشآت ومزامنتها.";
            message.className = "small text-success";

        } catch (error) {

            message.textContent = "تعذر حفظ الإسناد بسبب مشكلة مزامنة. لم تُعرض العملية كناجحة.";
            message.className = "small text-danger";

        } finally {

            assignButton.disabled = false;

        }

    });

    smartAssignButton.addEventListener("click", async () => {

        const committee = users[committeeSelect.value];
        const count = Math.floor(Number(smartAssignmentCount.value));

        if (!committee || !committee.active || count < 1) {

            message.textContent = "اختر لجنة نشطة وعدداً صحيحاً من المنشآت.";
            message.className = "small text-danger";

            return;

        }

        smartAssignButton.disabled = true;
        message.textContent = "جاري تنفيذ الإسناد الذكي ومزامنته...";
        message.className = "small text-muted";
        let assignedFacilities;

        try {

            assignedFacilities = await smartAssignFacilities(
                allFacilities,
                committee.username,
                count,
                startFacilitySelect.value
            );

        } catch (error) {

            message.textContent = "تعذر حفظ الإسناد الذكي بسبب مشكلة مزامنة.";
            message.className = "small text-danger";
            smartAssignButton.disabled = false;

            return;

        }

        smartAssignButton.disabled = false;

        if (!Array.isArray(assignedFacilities)) {

            message.textContent = assignedFacilities.message || "تعذر تنفيذ الإسناد التلقائي.";
            message.className = "small text-danger";

            return;

        }

        if (assignedFacilities.length === 0) {

            message.textContent = getActivePeriodicVisitCycle()
                ? "لا توجد منشآت مستحقة للإسناد حاليًا."
                : "لا توجد منشآت غير مسندة";
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

    document.body.classList.toggle("authenticated", isAuthenticatedUser());
    document.body.classList.toggle("role-admin", isAdminUser());
    document.body.classList.toggle("role-committee", isCommitteeUser());
    document.body.classList.toggle("role-viewer", isViewerUser());

    document.querySelectorAll(".sidebar-nav .admin-only").forEach(link => {

        link.classList.toggle("d-none", !isAdminUser());

    });

    ["employeesPanel"].forEach(panelId => {

        const panel = document.getElementById(panelId);

        if (panel) panel.classList.toggle("d-none", !isAdminUser());

    });

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


function syncCommitteeEmployeePicker(group) {

    const leaderSelect = group.querySelector(".user-team-leader");

    if (!leaderSelect) return;

    group.querySelectorAll(".user-team-member-checkbox").forEach(checkbox => {

        const isLeader = checkbox.value === leaderSelect.value;

        if (isLeader) checkbox.checked = false;
        checkbox.disabled = isLeader;

    });

}


function initializeCommitteeEmployeePickers(container) {

    if (!container) return;

    container.querySelectorAll(".committee-team-fields").forEach(group => {

        const leaderSelect = group.querySelector(".user-team-leader");

        if (!leaderSelect || leaderSelect.dataset.pickerInitialized === "true") return;

        leaderSelect.dataset.pickerInitialized = "true";
        leaderSelect.addEventListener("change", () => syncCommitteeEmployeePicker(group));
        syncCommitteeEmployeePicker(group);

    });

}


function renderUsersPanel() {

    const usersTableBody = document.getElementById("usersTableBody");

    if (!usersTableBody) return;

    usersTableBody.innerHTML = "";

    getUsers().forEach(user => {

        const row = document.createElement("tr");
        const canDelete = canDeleteUser(user.username);
        const team = normalizeTeam(user.team);
        const leaderId = String(user.leaderId || "");
        const memberIds = Array.isArray(user.memberIds) ? user.memberIds.map(String) : [];
        const roleLabel = user.role === "admin"
            ? "Admin"
            : user.role === "viewer"
                ? "مطّلع إداري"
                : "Committee";
        const isCommittee = user.role === "committee";

        row.dataset.username = user.username;

        row.innerHTML = `
            <td>
                <strong>${user.username}</strong>
                <div class="text-muted small">${roleLabel}</div>
            </td>
            <td>
                <input class="form-control form-control-sm user-display-name"
                       value="${escapeHtml(user.displayName)}">
            </td>
            <td>
                <input class="form-control form-control-sm user-committee-name"
                       value="${escapeHtml(user.committeeName)}"
                       ${isCommittee ? "" : "disabled"}>
            </td>
            <td>
                <div class="committee-team-fields">
                    <label class="small text-muted">رئيس اللجنة</label>
                    <select class="form-select form-select-sm user-team-leader"
                            ${isCommittee ? "" : "disabled"}>
                        <option value="">بدون رئيس</option>
                        ${!isCommittee || typeof getActiveEmployeeOptions !== "function"
                            ? ""
                            : getActiveEmployeeOptions(leaderId)}
                    </select>
                    <label class="small text-muted mt-1">الأعضاء</label>
                    <div class="user-team-members committee-member-options">
                        ${!isCommittee || typeof getActiveEmployeeMemberCheckboxes !== "function"
                            ? ""
                            : getActiveEmployeeMemberCheckboxes(memberIds, leaderId)}
                    </div>
                </div>
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

    initializeCommitteeEmployeePickers(usersTableBody);

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

        const leaderSelect = row.querySelector(".user-team-leader");
        const selectedLeaderId = existingUser.role === "committee" && leaderSelect
            ? leaderSelect.value
            : "";
        const selectedLeader = typeof getEmployeeById === "function"
            ? getEmployeeById(selectedLeaderId)
            : null;
        const leaderId = selectedLeader && selectedLeader.isActive
            ? selectedLeaderId
            : "";
        const memberIds = existingUser.role === "committee"
            ? [...new Set(
                [...row.querySelectorAll(".user-team-member-checkbox:checked")]
                    .map(input => input.value)
                    .filter(id => {

                        const employee = typeof getEmployeeById === "function"
                            ? getEmployeeById(id)
                            : null;

                        return id !== leaderId && employee && employee.isActive;

                    })
            )]
            : [];

        nextUsers[username] = {
            ...existingUser,
            displayName: row.querySelector(".user-display-name").value.trim(),
            committeeName: row.querySelector(".user-committee-name").value.trim(),
            password: row.querySelector(".user-password").value,
            leaderId,
            memberIds,
            active: existingUser.role === "admin"
                ? true
                : row.querySelector(".user-active").checked
        };

        if (existingUser.role === "committee") {

            nextUsers[username].team = normalizeTeam({
                leader: typeof getEmployeeName === "function"
                    ? getEmployeeName(nextUsers[username].leaderId)
                    : "",
                members: typeof getEmployeeName === "function"
                    ? nextUsers[username].memberIds.map(getEmployeeName).filter(Boolean)
                    : []
            });

        }

    });

    return nextUsers;

}


async function persistUsers(nextUsers) {

    if (!isAdminUser()) return false;

    const validationMessage = validateUsersObject(nextUsers);

    if (validationMessage) {

        showUsersSaveMessage(validationMessage, "text-danger");

        return false;

    }

    const savedUsers = await mutateCloudCollection("users", users, nextUsers);

    users = savedUsers;

    renderUsersPanel();
    renderCommitteeAssignmentCards();
    renderAssignmentBoard(allFacilities);

    if (typeof refreshEmployeePerformanceDashboard === "function") {

        refreshEmployeePerformanceDashboard();

    }

    return true;

}


function showDataPortabilityMessage(text, className) {

    const message = document.getElementById("dataPortabilityMessage");

    if (!message) return;

    message.textContent = text;
    message.className = `small ${className}`;

}


function exportAppData() {

    if (!isAdminUser()) return;

    const exportData = {
        version: "v1.0-beta",
        exportedAt: new Date().toISOString(),
        users,
        facilityAssignments,
        facilityAssignmentHistory,
        facilityStatus,
        employees: typeof employees === "undefined" ? {} : employees,
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

    if (!file || !isAdminUser()) return;

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

        const changes = [
            {
                key: "users",
                previousValue: users,
                nextValue: importedData.users
            },
            {
                key: "facilityAssignments",
                previousValue: loadAssignments(),
                nextValue: importedData.facilityAssignments
            },
            {
                key: "facilityStatus",
                previousValue: facilityStatus,
                nextValue: importedData.facilityStatus
            }
        ];

        if (isPortableDataObject(importedData.employees)) {

            changes.push({
                key: "employees",
                previousValue: typeof employees === "undefined" ? {} : employees,
                nextValue: importedData.employees
            });

        }

        if (isPortableDataObject(importedData.facilityAssignmentHistory)) {

            changes.push({
                key: assignmentHistoryStorageKey,
                previousValue: facilityAssignmentHistory,
                nextValue: importedData.facilityAssignmentHistory
            });

        }

        if (isPortableDataObject(importedData.appSettings)) {

            changes.push({
                key: "appSettings",
                previousValue: loadAppSettings(),
                nextValue: importedData.appSettings
            });

        }

        await mutateCloudCollectionsWithRollback(changes);

        showDataPortabilityMessage("تم استيراد البيانات. سيتم تحديث التطبيق...", "text-success");

        setTimeout(() => window.location.reload(), 500);

    } catch (error) {

        console.error("[DataImport] import failed", {
            code: error && error.code || "IMPORT_FAILED",
            error
        });

        showDataPortabilityMessage(
            error && error.code === "CLOUD_ROLLBACK_FAILED"
                ? "فشل الاستيراد وتعذر التراجع الكامل. أوقف التعديلات وراجع سجل المزامنة."
                : "تعذر استيراد البيانات أو مزامنتها، ولم يُعرض الاستيراد كعملية ناجحة.",
            "text-danger"
        );

    }

}


function initializeDataPortability() {

    const exportButton = document.getElementById("exportAppData");
    const importInput = document.getElementById("importAppData");

    if (!exportButton || !importInput || !isAdminUser()) return;

    exportButton.addEventListener("click", exportAppData);

    importInput.addEventListener("change", async event => {

        if (importInput.disabled) return;

        importInput.disabled = true;

        try {

            await importAppData(event.target.files[0]);

        } finally {

            event.target.value = "";
            importInput.disabled = false;

        }

    });

}


function initializeUsersPanel() {

    const usersTableBody = document.getElementById("usersTableBody");
    const saveUsersButton = document.getElementById("saveUsers");
    const usersSaveMessage = document.getElementById("usersSaveMessage");
    const showAddCommitteeFormButton = document.getElementById("showAddCommitteeForm");
    const addCommitteeForm = document.getElementById("addCommitteeForm");
    const addViewerForm = document.getElementById("addViewerForm");

    if (!usersTableBody || !saveUsersButton || !isAdminUser()) return;

    renderUsersPanel();

    const renderNewCommitteeEmployeePicker = () => {

        const leaderSelect = document.getElementById("newCommitteeLeader");
        const membersContainer = document.getElementById("newCommitteeMembers");

        if (!leaderSelect || !membersContainer) return;

        leaderSelect.innerHTML = `
            <option value="">بدون رئيس</option>
            ${typeof getActiveEmployeeOptions === "function"
                ? getActiveEmployeeOptions("")
                : ""}
        `;
        membersContainer.innerHTML = typeof getActiveEmployeeMemberCheckboxes === "function"
            ? getActiveEmployeeMemberCheckboxes([], "")
            : "";
        initializeCommitteeEmployeePickers(addCommitteeForm);
        syncCommitteeEmployeePicker(leaderSelect.closest(".committee-team-fields"));

    };

    renderNewCommitteeEmployeePicker();

    if (showAddCommitteeFormButton && addCommitteeForm) {

        showAddCommitteeFormButton.addEventListener("click", () => {

            addCommitteeForm.classList.toggle("d-none");
            if (!addCommitteeForm.classList.contains("d-none")) {

                renderNewCommitteeEmployeePicker();

            }

        });

        addCommitteeForm.addEventListener("submit", async event => {

            event.preventDefault();

            const submitButton = addCommitteeForm.querySelector('[type="submit"]');

            if (submitButton && submitButton.disabled) return;

            const committeeName = document.getElementById("newCommitteeName").value.trim();
            const username = document.getElementById("newCommitteeUsername").value.trim();
            const password = document.getElementById("newCommitteePassword").value;
            const active = document.getElementById("newCommitteeActive").checked;
            const selectedLeaderId = document.getElementById("newCommitteeLeader").value;
            const selectedLeader = typeof getEmployeeById === "function"
                ? getEmployeeById(selectedLeaderId)
                : null;
            const leaderId = selectedLeader && selectedLeader.isActive
                ? selectedLeaderId
                : "";
            const memberIds = [...new Set([...document.querySelectorAll(
                "#newCommitteeMembers .user-team-member-checkbox:checked"
            )].map(input => input.value).filter(id => {

                const employee = typeof getEmployeeById === "function"
                    ? getEmployeeById(id)
                    : null;

                return id !== leaderId && employee && employee.isActive;

            }))];

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
                    committeeName,
                    id: `committee-${username}`,
                    leaderId,
                    memberIds,
                    team: {
                        leader: typeof getEmployeeName === "function"
                            ? getEmployeeName(leaderId)
                            : "",
                        members: typeof getEmployeeName === "function"
                            ? memberIds.map(getEmployeeName).filter(Boolean)
                            : []
                    }
                }
            };

            if (submitButton) submitButton.disabled = true;

            try {

                if (await persistUsers(nextUsers)) {

                    addCommitteeForm.reset();
                    document.getElementById("newCommitteeActive").checked = true;
                    renderNewCommitteeEmployeePicker();
                    addCommitteeForm.classList.add("d-none");
                    showUsersSaveMessage("تمت إضافة اللجنة وحفظها.", "text-success");

                }

            } catch (error) {

                showUsersSaveMessage("تعذر حفظ اللجنة الجديدة.", "text-danger");

            } finally {

                if (submitButton) submitButton.disabled = false;

            }

        });

    }

    if (addViewerForm) {

        addViewerForm.addEventListener("submit", async event => {

            event.preventDefault();

            if (!isAdminUser()) return;

            const submitButton = addViewerForm.querySelector('[type="submit"]');

            if (submitButton && submitButton.disabled) return;

            const displayName = document.getElementById("newViewerDisplayName").value.trim();
            const username = document.getElementById("newViewerUsername").value.trim();
            const password = document.getElementById("newViewerPassword").value;
            const active = document.getElementById("newViewerActive").checked;

            if (!displayName) {

                showUsersSaveMessage("الاسم المعروض للمطّلع مطلوب.", "text-danger");

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
                    displayName,
                    role: "viewer",
                    active,
                    committeeName: "",
                    leaderId: "",
                    memberIds: [],
                    team: {
                        leader: "",
                        members: []
                    }
                }
            };

            if (submitButton) submitButton.disabled = true;

            try {

                if (await persistUsers(nextUsers)) {

                    addViewerForm.reset();
                    document.getElementById("newViewerActive").checked = true;
                    showUsersSaveMessage("تمت إضافة حساب المطّلع الإداري.", "text-success");

                }

            } catch (error) {

                showUsersSaveMessage("تعذر حفظ حساب المطّلع الإداري.", "text-danger");

            } finally {

                if (submitButton) submitButton.disabled = false;

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
