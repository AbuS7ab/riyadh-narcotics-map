// ========================================
// Facility Details
// ========================================

function showDashboardNeutralState() {

    const details = document.querySelector(".card-body");

    details.innerHTML = `
        <div class="text-muted">
            اختر منشأة من الخريطة أو استخدم الفلاتر لعرض النتائج.
        </div>
    `;

}


function showFacilityList(facilities, options = {}) {

    const details = document.querySelector(".card-body");

    if (options.fitBounds !== false && typeof fitFacilityBounds === "function") {

        fitFacilityBounds(facilities);

    }

    details.innerHTML = `
        <div id="facilityDrilldownList" class="list-group">
            <div class="list-group-item active">
                تم العثور على ${facilities.length} نتيجة
            </div>
        </div>
    `;

    const list = document.getElementById("facilityDrilldownList");

    if (facilities.length === 0) {

        list.innerHTML += `
            <div class="list-group-item text-muted">
                لا توجد نتائج
            </div>
        `;

        return;

    }

    facilities.forEach(facility => {

        const state = getFacilityStatus(facility.license);
        const item = document.createElement("button");

        let statusText = "قيد الانتظار";
        let statusBadge = "secondary";

        if (state.visitStatus === "visited") {

            statusText = "تمت الزيارة";
            statusBadge = "success";

        } else if (state.visitStatus === "partial") {

            statusText = "لم تستكمل الزيارة";
            statusBadge = "warning";

        }

        item.className = "list-group-item list-group-item-action";
        item.innerHTML = `
            <div class="fw-bold">${facility.name}</div>
            <div class="text-muted small">📄 رقم الترخيص: ${facility.license}</div>
            <div class="text-muted small">📍 الحي: ${facility.district}</div>
            <div class="text-muted small">🏥 النوع: ${facility.type}</div>
            <div class="mt-2">
                <span class="badge bg-${statusBadge}">${statusText}</span>
                ${state.violation
                    ? '<span class="badge bg-danger">يوجد مخالفة</span>'
                    : ''}
            </div>
        `;

        item.addEventListener("click", () => {

            goToFacility(facility);

        });

        list.appendChild(item);

    });

}


function showCommitteeFacilityList(committee, facilities) {

    if (!isAdminUser()) return;

    if (typeof fitFacilityBounds === "function") {

        fitFacilityBounds(facilities);

    }

    const details = document.querySelector(".card-body");

    details.innerHTML = `
        <div id="committeeFacilityList" class="list-group">
            <div class="list-group-item active">
                ${escapeHtml(committee.committeeName)} — ${facilities.length} منشأة
            </div>
        </div>
    `;

    const list = document.getElementById("committeeFacilityList");

    if (facilities.length === 0) {

        list.innerHTML += `
            <div class="list-group-item text-muted">
                لا توجد منشآت مسندة لهذه اللجنة.
            </div>
        `;

        return;

    }

    facilities.forEach(facility => {

        const state = getFacilityStatus(facility.license);
        const assignment = getFacilityAssignment(facility.license);

        if (!isActiveAssignment(assignment)) return;

        const visitDisplay = getVisitStatusDisplay(state);
        const item = document.createElement("button");

        item.className = "list-group-item list-group-item-action";
        item.innerHTML = `
            <div class="fw-bold">${escapeHtml(facility.name)}</div>
            <div class="text-muted small">📄 رقم الترخيص: ${escapeHtml(facility.license)}</div>
            <div class="text-muted small">📍 الحي: ${escapeHtml(facility.district)}</div>
            <div class="text-muted small">🏥 النوع: ${escapeHtml(facility.type)}</div>
            <div class="mt-2">
                <span class="badge bg-${visitDisplay.badge}">${visitDisplay.text}</span>
                ${state.violation
                    ? '<span class="badge bg-danger">يوجد مخالفة</span>'
                    : ''}
            </div>
        `;

        item.addEventListener("click", () => {

            goToFacility(facility);

        });

        list.appendChild(item);

    });

}


function getVisitStatusDisplay(state) {

    if (state.visitStatus === "visited") {

        return {
            text: state.violation
                ? "🔴 تمت الزيارة - يوجد مخالفة"
                : "🟢 تمت الزيارة - لا توجد ملاحظات",
            badge: state.violation ? "danger" : "success"
        };

    }

    if (state.visitStatus === "partial") {

        return {
            text: "🟠 لم تستكمل الزيارة",
            badge: "warning"
        };

    }

    return {
        text: "🟡 قيد الانتظار",
        badge: "secondary"
    };

}


function getVisitTypeLabel(visitType) {

    return visitType === "reactive" ? "تفاعلي" : "دوري";

}


function getVisitResultLabel(visit) {

    if (visit.result === "violation" || visit.violation) return "توجد مخالفة";

    if (visit.result === "incomplete" || visit.visitStatus === "partial") {

        return "لم تكتمل";

    }

    return "لا توجد مخالفة";

}


function renderTeamMembers(members) {

    const filteredMembers = Array.isArray(members)
        ? members.filter(Boolean)
        : [];

    return filteredMembers.length ? filteredMembers.join("، ") : "-";

}


function getAssignmentSnapshot(assignment) {

    if (!assignment) {

        return {
            committeeName: "",
            leader: "",
            members: []
        };

    }

    if (assignment.teamSnapshot) {

        return {
            committeeName: assignment.teamSnapshot.committeeName || "",
            leader: assignment.teamSnapshot.leader || "",
            members: Array.isArray(assignment.teamSnapshot.members)
                ? assignment.teamSnapshot.members
                : []
        };

    }

    const committee = typeof users !== "undefined"
        ? users[assignment.committeeUsername]
        : null;
    const team = committee && typeof normalizeTeam === "function"
        ? normalizeTeam(committee.team)
        : { leader: "", members: [] };

    return {
        committeeName: committee
            ? committee.committeeName || committee.displayName || committee.username
            : assignment.committeeUsername || "",
        leader: team.leader,
        members: team.members
    };

}


function renderAssignmentVisitContext(assignment) {

    if (!assignment) return "";

    const snapshot = getAssignmentSnapshot(assignment);

    return `
        <div class="visit-context border rounded p-2 mb-3">
            <div><strong>اللجنة:</strong> ${escapeHtml(snapshot.committeeName || assignment.committeeUsername || "-")}</div>
            <div><strong>رئيس اللجنة:</strong> ${escapeHtml(snapshot.leader || "-")}</div>
            <div><strong>أعضاء اللجنة:</strong> ${escapeHtml(renderTeamMembers(snapshot.members))}</div>
            <div><strong>نوع الزيارة:</strong> ${getVisitTypeLabel(assignment.visitType)}</div>
            <div><strong>سبب الزيارة:</strong> ${escapeHtml(assignment.visitReason || "الخطة الدورية")}</div>
        </div>
    `;

}


function renderVisitHistory(visits) {

    if (visits.length === 0) {

        return `
            <div class="text-muted small">
                لا يوجد سجل زيارات حتى الآن.
            </div>
        `;

    }

    return visits.map(visit => {

        const display = getVisitStatusDisplay(visit);
        const teamSnapshot = visit.teamSnapshot || {};

        return `
            <div class="border rounded p-2 mb-2">
                <div class="d-flex justify-content-between gap-2">
                    <span class="badge bg-${display.badge}">
                        ${getVisitResultLabel(visit)}
                    </span>
                    <span class="text-muted small">${visit.date || "-"}</span>
                </div>
                <div class="small mt-2"><strong>اللجنة:</strong> ${escapeHtml(visit.committeeName || "-")}</div>
                <div class="small"><strong>رئيس اللجنة:</strong> ${escapeHtml(teamSnapshot.leader || "-")}</div>
                <div class="small"><strong>الأعضاء:</strong> ${escapeHtml(renderTeamMembers(teamSnapshot.members))}</div>
                <div class="small"><strong>نوع الزيارة:</strong> ${getVisitTypeLabel(visit.visitType)}</div>
                <div class="small"><strong>سبب الزيارة:</strong> ${escapeHtml(visit.visitReason || "الخطة الدورية")}</div>
                ${visit.incompleteReason
                    ? `<div class="small"><strong>سبب عدم الاكتمال:</strong> ${escapeHtml(visit.incompleteReason)}</div>`
                    : ""}
                ${visit.notes
                    ? `<div class="small mt-2"><strong>الملاحظات:</strong> ${escapeHtml(visit.notes)}</div>`
                    : ''}
            </div>
        `;

    }).join("");

}


function renderAssignmentControl(facility) {

    if (!isAdminUser()) return "";

    const storedAssignment = getFacilityAssignment(facility.license);
    const assignment = isActiveAssignment(storedAssignment)
        ? storedAssignment
        : null;
    const committeeOptions = getCommitteeUsers().map(user => `
        <option value="${user.username}"
                ${assignment && assignment.committeeUsername === user.username ? "selected" : ""}>
            ${user.displayName} (${user.username})
        </option>
    `).join("");

    return `
        <hr>

        <h6 class="mb-3">إسناد المنشأة</h6>

        <label for="facilityCommittee" class="form-label">اللجنة</label>
        <select id="facilityCommittee" class="form-select mb-3">
            <option value="">اختر اللجنة</option>
            ${committeeOptions}
        </select>

        <label for="assignmentStatus" class="form-label">حالة الإسناد</label>
        <select id="assignmentStatus" class="form-select mb-3">
            <option value="assigned"
                    ${!assignment || assignment.status === "assigned" ? "selected" : ""}>
                مسندة
            </option>
            <option value="completed"
                    ${assignment && assignment.status === "completed" ? "selected" : ""}>
                مكتملة
            </option>
            <option value="in_progress"
                    ${assignment && assignment.status === "in_progress" ? "selected" : ""}>
                قيد التنفيذ
            </option>
            <option value="cancelled"
                    ${assignment && assignment.status === "cancelled" ? "selected" : ""}>
                ملغاة
            </option>
        </select>

        <button id="saveAssignment" class="btn btn-outline-success w-100">
            حفظ الإسناد
        </button>

        ${assignment
            ? `<div class="text-muted small mt-2">
                مسندة حالياً إلى ${assignment.committeeUsername}
            </div>`
            : ""}
    `;

}


function showFacilityDetails(facility) {

    const details = document.querySelector(".card-body");

    const state = getFacilityStatus(facility.license);
    const visits = getFacilityVisits(facility.license);
    const annualVisitCount = getAnnualVisitCount(facility.license);
    const storedAssignment = getFacilityAssignment(facility.license);
    const assignment = isActiveAssignment(storedAssignment) ? storedAssignment : null;

    const statusDisplay = getVisitStatusDisplay(state);

    details.innerHTML = `

        <h5 class="mb-3">${facility.name}</h5>

        <p><strong>🏢 النوع:</strong> ${facility.type}</p>

        <p><strong>📍 الحي:</strong> ${facility.district}</p>

        <p><strong>🛣️ الشارع:</strong> ${facility.street}</p>

        <p><strong>📄 الترخيص:</strong> ${facility.license}</p>

        <hr>

        <p>
            <strong>📌 الحالة:</strong>
            <span class="badge bg-${statusDisplay.badge}">
                ${statusDisplay.text}
            </span>
        </p>

        <p><strong>📅 زيارات السنة:</strong> ${annualVisitCount} / 4</p>

        <a
            href="${facility.google_maps}"
            target="_blank"
            class="btn btn-success w-100 mt-3">

            فتح في Google Maps

        </a>

        ${renderAssignmentControl(facility)}

        ${isCommitteeUser() ? `
            <button id="backToAssignedFacilities"
                    class="btn btn-outline-secondary w-100 mt-3">
                العودة إلى المنشآت المسندة
            </button>
        ` : ""}

        ${isCommitteeUser() ? renderAssignmentVisitContext(assignment) : ""}

        <hr>

        <button id="newVisit" class="btn btn-outline-success w-100 mb-3">
            + زيارة جديدة
        </button>

        <div id="visitForm" class="d-none">
            <h6 class="mb-3">نتيجة الزيارة</h6>

            <label for="visitDate" class="form-label">تاريخ الزيارة</label>
            <input id="visitDate" class="form-control mb-3" type="date">

            <label for="visitResult" class="form-label">نتيجة الزيارة</label>
            <select id="visitResult" class="form-select mb-3">
                <option value="no_violation">لا توجد مخالفة</option>
                <option value="violation">توجد مخالفة</option>
                <option value="incomplete">لم تكتمل</option>
            </select>

            <div id="incompleteReasonGroup" class="mb-3 d-none">
                <label for="incompleteReason" class="form-label">سبب عدم اكتمال الزيارة</label>
                <select id="incompleteReason" class="form-select">
                    <option value="">اختر السبب</option>
                    <option value="المنشأة مغلقة">المنشأة مغلقة</option>
                    <option value="المسؤول غير موجود">المسؤول غير موجود</option>
                    <option value="تعذر الوصول">تعذر الوصول</option>
                    <option value="أخرى">أخرى</option>
                </select>
            </div>

            <label for="visitNotes" class="form-label">ملاحظات</label>
            <textarea id="visitNotes" class="form-control mb-3" rows="3"></textarea>

            <div id="visitSaveMessage" class="small d-none mb-2"></div>

            <button id="saveVisit" class="btn btn-primary w-100">
                حفظ
            </button>
        </div>

        <hr>

        <h6 class="mb-3">السجل الرقابي</h6>

        ${renderVisitHistory(visits)}

    `;

    const newVisit = document.getElementById("newVisit");
    const visitForm = document.getElementById("visitForm");
    const visitDate = document.getElementById("visitDate");
    const visitResult = document.getElementById("visitResult");
    const incompleteReasonGroup = document.getElementById("incompleteReasonGroup");
    const incompleteReason = document.getElementById("incompleteReason");
    const visitNotes = document.getElementById("visitNotes");
    const visitSaveMessage = document.getElementById("visitSaveMessage");
    const saveVisit = document.getElementById("saveVisit");
    const saveAssignment = document.getElementById("saveAssignment");
    const backToAssignedFacilities =
        document.getElementById("backToAssignedFacilities");

    visitDate.value = new Date().toISOString().slice(0, 10);

    const toggleIncompleteReason = () => {

        incompleteReasonGroup.classList.toggle(
            "d-none",
            visitResult.value !== "incomplete"
        );

    };

    visitResult.addEventListener("change", toggleIncompleteReason);
    toggleIncompleteReason();

    newVisit.addEventListener("click", function () {

        visitForm.classList.toggle("d-none");

    });

    if (backToAssignedFacilities) {

        backToAssignedFacilities.addEventListener("click", function () {

            showFacilityList(getAssignedFacilitiesForCurrentUser(allFacilities));

        });

    }

    if (saveAssignment) {

        saveAssignment.addEventListener("click", function () {

            const committeeSelect = document.getElementById("facilityCommittee");
            const assignmentStatus = document.getElementById("assignmentStatus");

            if (!committeeSelect.value) return;

            assignFacilityToCommittee(
                facility.license,
                committeeSelect.value,
                assignmentStatus.value
            );

            showFacilityDetails(facility);

        });
    }

    saveVisit.addEventListener("click", function () {

        const result = visitResult.value;

        if (result === "incomplete" && !incompleteReason.value) {

            visitSaveMessage.textContent = "اختر سبب عدم اكتمال الزيارة.";
            visitSaveMessage.className = "small text-danger mb-2";

            return;

        }

        const storedCurrentAssignment = getFacilityAssignment(facility.license);
        const currentAssignment = isActiveAssignment(storedCurrentAssignment)
            ? storedCurrentAssignment
            : null;
        const assignmentSnapshot = getAssignmentSnapshot(currentAssignment);
        const visitStatus = result === "incomplete" ? "partial" : "visited";

        addVisit(facility.license, {
            assignmentId: currentAssignment ? currentAssignment.id || null : null,
            facilityLicense: facility.license,
            date: visitDate.value,
            committeeUsername: currentAssignment
                ? currentAssignment.committeeUsername
                : currentUser.username,
            committeeName: assignmentSnapshot.committeeName,
            teamSnapshot: {
                leader: assignmentSnapshot.leader,
                members: assignmentSnapshot.members
            },
            visitType: currentAssignment
                ? currentAssignment.visitType || "periodic"
                : "periodic",
            visitReason: currentAssignment
                ? currentAssignment.visitReason || "الخطة الدورية"
                : "الخطة الدورية",
            result,
            incompleteReason: result === "incomplete" ? incompleteReason.value : "",
            visitStatus,
            violation: result === "violation",
            notes: visitNotes.value,
            createdBy: currentUser.username
        });

        updateAssignmentFromVisit(facility.license, result);

        applyFilters();

        showFacilityDetails(facility);

    });

}
