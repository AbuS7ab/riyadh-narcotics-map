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

        if (!assignment.id) {

            assignment.id = createAssignmentId(assignment.facilityLicense);
            changed = true;

        }

        if (!assignment.visitType) {

            assignment.visitType = "periodic";
            changed = true;

        }

        if (typeof assignment.visitReason !== "string") {

            assignment.visitReason = assignment.visitType === "reactive"
                ? ""
                : "الخطة الدورية";
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

        if (user.role === "committee" && !user.team) {

            return "بيانات فريق اللجنة مطلوبة.";

        }

    }

    if (!nextUsers.admin || nextUsers.admin.role !== "admin") {

        return "لا يمكن حذف مدير النظام.";

    }

    return "";

}


function getActiveAssignmentCount(username) {

    return getActiveAssignmentsForCommittee(username).length;

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

    if (updates.team && typeof updates.team === "object") {

        user.team = normalizeTeam(updates.team);

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


function isActiveAssignment(assignment) {

    return assignment &&
        assignment.status !== "cancelled";

}


function getActiveAssignmentsForCommittee(username) {

    const activeAssignments = Object.values(facilityAssignments).filter(assignment => {

        return isActiveAssignment(assignment) &&
            assignment.committeeUsername === username;

    });

    console.log(
        `Active assignment count for committee ${username}: ${activeAssignments.length}`
    );

    return activeAssignments;

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

    const status = getFacilityStatus(license);

    if (!status) return false;

    if (status.visitStatus === "visited" ||
        status.status === "completed" ||
        status.status === "visited") {

        return true;

    }

    return Array.isArray(status.visits) &&
        status.visits.some(visitIndicatesCompletion);

}


function getCommitteeKpis(username) {

    const activeAssignments = getActiveAssignmentsForCommittee(username);
    const assignedCount = activeAssignments.length;
    const completedCount = activeAssignments.filter(assignment => {

        return assignment.status === "completed" ||
            facilityHasCompletedVisit(assignment.facilityLicense);

    }).length;
    const violatingFacilities = new Set();

    activeAssignments.forEach(assignment => {

        const license = String(assignment.facilityLicense);

        if (facilityHasViolation(license)) {

            violatingFacilities.add(license);

        }

    });

    const completionRate = assignedCount === 0
        ? 0
        : Math.round((completedCount / assignedCount) * 100);

    return {
        assignedCount,
        completedCount,
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

    return { visitType, visitReason };

}


function assignFacilityToCommittee(
    facilityLicense,
    committeeUsername,
    status = "assigned",
    options = {}
) {

    const committee = users[committeeUsername];

    if (!committee || committee.role !== "committee") return;

    const existingAssignment = getFacilityAssignment(facilityLicense);

    if (status === "cancelled") {

        if (!existingAssignment) return false;

        existingAssignment.status = "cancelled";

        console.log(`Cancelled facility license: ${facilityLicense}`);

        saveAssignments(facilityAssignments);
        refreshAssignmentViews(existingAssignment.committeeUsername);

        return true;

    }

    if (isActiveAssignment(existingAssignment) &&
        existingAssignment.committeeUsername !== committeeUsername) {

        return false;

    }

    const assignedAt = isActiveAssignment(existingAssignment)
        ? existingAssignment.assignedAt
        : new Date().toISOString();
    const metadata = normalizeAssignmentMetadata(options);

    facilityAssignments[String(facilityLicense)] = {
        id: createAssignmentId(facilityLicense),
        facilityLicense: String(facilityLicense),
        committeeUsername,
        assignedAt,
        status: assignmentStatuses.includes(status) ? status : "assigned",
        teamSnapshot: createTeamSnapshot(committee),
        visitType: metadata.visitType,
        visitReason: metadata.visitReason
    };

    saveAssignments(facilityAssignments);

    refreshAssignmentViews(committeeUsername);

    return true;

}


function cancelAssignmentsForCommittee(committeeUsername, facilityLicenses) {

    if (!isAdminUser()) return 0;

    const selectedLicenses = new Set(
        facilityLicenses.map(license => String(license))
    );
    let cancelledCount = 0;

    selectedLicenses.forEach(license => {

        const assignment = getFacilityAssignment(license);

        if (!isActiveAssignment(assignment) ||
            assignment.committeeUsername !== committeeUsername) {

            return;

        }

        assignment.status = "cancelled";
        cancelledCount += 1;

    });

    if (cancelledCount === 0) return 0;

    saveAssignments(facilityAssignments);
    refreshAssignmentViews(committeeUsername);

    return cancelledCount;

}


function updateAssignmentFromVisit(facilityLicense, result) {

    if (!isCommitteeUser()) return;

    const assignment = getFacilityAssignment(facilityLicense);

    if (!assignment ||
        assignment.committeeUsername !== currentUser.username ||
        assignment.status === "cancelled") return;

    const status = ["no_violation", "violation", "visited"].includes(result)
        ? "completed"
        : ["incomplete", "partial"].includes(result)
            ? "in_progress"
            : null;

    if (!status || assignment.status === status) return;

    assignment.status = status;

    saveAssignments(facilityAssignments);

}


function assignFacilitiesToCommittee(facilityLicenses, committeeUsername, options = {}) {

    if (!isAdminUser()) return false;

    const committee = users[committeeUsername];

    if (!committee || committee.role !== "committee" || !committee.active) return false;

    const assignedAt = new Date().toISOString();
    const metadata = normalizeAssignmentMetadata(options);
    const uniqueLicenses = [...new Set(facilityLicenses.map(license => String(license)))];
    let assignedCount = 0;

    uniqueLicenses.forEach(license => {

        const existingAssignment = getFacilityAssignment(license);

        if (isActiveAssignment(existingAssignment) &&
            existingAssignment.committeeUsername !== committeeUsername) {

            return;

        }

        facilityAssignments[String(license)] = {
            id: createAssignmentId(license),
            facilityLicense: String(license),
            committeeUsername,
            assignedAt,
            status: "assigned",
            teamSnapshot: createTeamSnapshot(committee),
            visitType: metadata.visitType,
            visitReason: metadata.visitReason,
            assignmentSource: options.assignmentSource || "manual",
            smartBatchId: options.smartBatchId || null,
            smartSequence: typeof options.smartSequenceStart === "number"
                ? options.smartSequenceStart + assignedCount
                : null
        };

        assignedCount += 1;

    });

    saveAssignments(facilityAssignments);
    refreshAssignmentViews(committeeUsername);

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

    const assignment = getFacilityAssignment(facility.license);

    if (isActiveAssignment(assignment)) {

        return "assignment";

    }

    const visits = typeof getFacilityVisits === "function"
        ? getFacilityVisits(facility.license)
        : [];

    if (visits.length > 0) {

        return "visited";

    }

    const status = typeof getFacilityStatus === "function"
        ? getFacilityStatus(facility.license)
        : null;

    if (status &&
        (status.visitStatus === "visited" ||
            status.visitStatus === "partial" ||
            status.visitStatus === "violation" ||
            status.violation === true)) {

        return "visited";

    }

    return "";

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


function smartAssignFacilities(
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
                message: "منشأة البداية غير مؤهلة للإسناد لأنها مسندة أو تمت زيارتها سابقاً."
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

    assignFacilitiesToCommittee(
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

    if (isAdminUser()) return facilities;

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

    return getFacilitiesForActiveAssignments(currentUser.username, facilities);

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


function refreshAssignmentViews(username = "") {

    renderCommitteeAssignmentCards();

    if (typeof allFacilities === "undefined" ||
        !Array.isArray(allFacilities) ||
        allFacilities.length === 0) return;

    renderAssignmentBoard(allFacilities);

    if (username &&
        selectedCommitteeUsername === username &&
        typeof showCommitteeFacilityList === "function") {

        showCommitteeFacilityList(
            users[username],
            getFacilitiesForActiveAssignments(username, allFacilities)
        );

    }

    if (isCommitteeUser() &&
        currentUser.username === username &&
        typeof showFacilityList === "function") {

        showFacilityList(
            getAssignedFacilitiesForCurrentUser(allFacilities),
            { fitBounds: false }
        );

    }

}


function renderCommitteeAssignmentCards() {

    const container = document.getElementById("committeeCards");

    if (!container || !isAdminUser()) return;

    container.innerHTML = getCommitteeUsers().map(committee => {

        const kpis = getCommitteeKpis(committee.username);
        const progressClass = getCompletionRateClass(kpis.completionRate);

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
                    <span>المسندة <strong>${kpis.assignedCount}</strong></span>
                    <span>المنجزة <strong>${kpis.completedCount}</strong></span>
                    <span>المخالفات <strong>${kpis.violatingFacilityCount}</strong></span>
                    <span>نسبة الإنجاز <strong>${kpis.completionRate}%</strong></span>
                </div>
                <div class="committee-card-progress"
                     aria-label="نسبة الإنجاز ${kpis.completionRate}%">
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

            const activeAssignments = getActiveAssignmentsForCommittee(username);
            const activeFacilityLicenses = new Set(activeAssignments.map(assignment => {

                return String(assignment.facilityLicense);

            }));
            const assignedFacilities = allFacilities.filter(facility => {

                return activeFacilityLicenses.has(String(facility.license));

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

        return !isActiveAssignment(assignment);

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
    const unassignedFacilities = getUnassignedFacilities(facilities).filter(facility => {

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
            <div class="text-muted small p-3">لا توجد منشآت غير مسندة.</div>
        `;

        return;

    }

    list.innerHTML = unassignedFacilities.map(facility => {
        const displayLicense = getFacilityDisplayLicense(facility);

        return `
        <label class="assignment-facility-item">
            <input class="form-check-input assignment-facility-checkbox"
                   type="checkbox" value="${escapeHtml(facility.license)}">
            <span>
                <strong>${escapeHtml(facility.name)}</strong>
                <small>الترخيص: ${escapeHtml(displayLicense)}</small>
                <small>${escapeHtml(facility.district)} · ${escapeHtml(facility.type)}</small>
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

    const syncVisitReasonVisibility = () => {

        if (visitTypeSelect.value === "periodic") {

            visitReasonGroup.classList.add("d-none");
            visitReasonSelect.value = "";

            return;

        }

        visitReasonGroup.classList.remove("d-none");

    };

    visitTypeSelect.addEventListener("change", syncVisitReasonVisibility);

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

    assignButton.addEventListener("click", () => {

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

        assignFacilitiesToCommittee(
            selectedFacilities,
            committeeSelect.value,
            assignmentMetadata
        );
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

        if (!Array.isArray(assignedFacilities)) {

            message.textContent = assignedFacilities.message || "تعذر تنفيذ الإسناد التلقائي.";
            message.className = "small text-danger";

            return;

        }

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

    document.querySelectorAll(".sidebar-nav .admin-only").forEach(link => {

        link.classList.toggle("d-none", !isAdminUser());

    });

    ["employeesPanel", "employeePerformancePanel"].forEach(panelId => {

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
                <div class="committee-team-fields">
                    <label class="small text-muted">رئيس اللجنة</label>
                    <select class="form-select form-select-sm user-team-leader"
                            ${user.role === "admin" ? "disabled" : ""}>
                        <option value="">بدون رئيس</option>
                        ${user.role === "admin" || typeof getActiveEmployeeOptions !== "function"
                            ? ""
                            : getActiveEmployeeOptions(leaderId)}
                    </select>
                    <label class="small text-muted mt-1">الأعضاء</label>
                    <div class="user-team-members committee-member-options">
                        ${user.role === "admin" || typeof getActiveEmployeeMemberCheckboxes !== "function"
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

    const exportData = {
        version: "v1.0-beta",
        exportedAt: new Date().toISOString(),
        users,
        facilityAssignments,
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
            saveFacilityStatus(importedData.facilityStatus),
            isPortableDataObject(importedData.employees)
                ? saveEmployees(importedData.employees)
                : Promise.resolve()
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
