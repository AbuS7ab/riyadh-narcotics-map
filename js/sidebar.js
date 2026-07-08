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


function showFacilityList(facilities) {

    const details = document.querySelector(".card-body");

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
        const visitDisplay = getVisitStatusDisplay(state);
        const assignmentDisplay = {
            assigned: { text: "Assigned", badge: "secondary" },
            in_progress: { text: "In Progress", badge: "warning" },
            completed: { text: "Completed", badge: "success" },
            cancelled: { text: "Cancelled", badge: "dark" }
        }[assignment.status];
        const category = state.violation
            ? { text: "Violation", badge: "danger" }
            : state.visitStatus === "visited"
                ? { text: "Completed", badge: "success" }
                : state.visitStatus === "partial"
                    ? { text: "Partial", badge: "warning" }
                    : { text: "Remaining", badge: "secondary" };
        const item = document.createElement("button");

        item.className = "list-group-item list-group-item-action";
        item.innerHTML = `
            <div class="d-flex justify-content-between gap-2">
                <div class="fw-bold">${escapeHtml(facility.name)}</div>
                <span class="badge bg-${category.badge}">${category.text}</span>
            </div>
            <div class="text-muted small">📄 رقم الترخيص: ${escapeHtml(facility.license)}</div>
            <div class="text-muted small">📍 الحي: ${escapeHtml(facility.district)}</div>
            <div class="text-muted small">🏥 النوع: ${escapeHtml(facility.type)}</div>
            <div class="mt-2">
                <span class="badge bg-${assignmentDisplay.badge}">
                    Assignment: ${assignmentDisplay.text}
                </span>
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

        return `
            <div class="border rounded p-2 mb-2">
                <div class="d-flex justify-content-between gap-2">
                    <span class="badge bg-${display.badge}">
                        ${display.text}
                    </span>
                    <span class="text-muted small">${visit.date || "-"}</span>
                </div>
                ${visit.violation
                    ? '<div class="text-danger small mt-2">يوجد مخالفة</div>'
                    : ''}
                ${visit.notes
                    ? `<div class="small mt-2">${visit.notes}</div>`
                    : ''}
            </div>
        `;

    }).join("");

}


function renderAssignmentControl(facility) {

    if (!isAdminUser()) return "";

    const assignment = getFacilityAssignment(facility.license);
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

        <hr>

        <button id="newVisit" class="btn btn-outline-success w-100 mb-3">
            + زيارة جديدة
        </button>

        <div id="visitForm" class="d-none">
            <h6 class="mb-3">نتيجة الزيارة</h6>

            <label for="visitDate" class="form-label">تاريخ الزيارة</label>
            <input id="visitDate" class="form-control mb-3" type="date">

            <select id="visitResult" class="form-select mb-3">
                <option value="pending">قيد الانتظار</option>
                <option value="visited">تمت الزيارة - لا توجد ملاحظات</option>
                <option value="partial">زيارة جزئية</option>
            </select>

            <div class="form-check mb-3">
                <input id="visitViolation" class="form-check-input" type="checkbox">
                <label for="visitViolation" class="form-check-label">يوجد مخالفة</label>
            </div>

            <label for="visitNotes" class="form-label">ملاحظات</label>
            <textarea id="visitNotes" class="form-control mb-3" rows="3"></textarea>

            <button id="saveVisit" class="btn btn-primary w-100">
                حفظ
            </button>
        </div>

        <hr>

        <h6 class="mb-3">سجل الزيارات</h6>

        ${renderVisitHistory(visits)}

    `;

    const newVisit = document.getElementById("newVisit");
    const visitForm = document.getElementById("visitForm");
    const visitDate = document.getElementById("visitDate");
    const visitResult = document.getElementById("visitResult");
    const visitViolation = document.getElementById("visitViolation");
    const visitNotes = document.getElementById("visitNotes");
    const saveVisit = document.getElementById("saveVisit");
    const saveAssignment = document.getElementById("saveAssignment");
    const backToAssignedFacilities =
        document.getElementById("backToAssignedFacilities");

    visitDate.value = new Date().toISOString().slice(0, 10);

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

        const visitStatus = visitResult.value;
        const violation = visitStatus === "pending"
            ? false
            : visitViolation.checked;

        addVisit(facility.license, {
            date: visitDate.value,
            visitStatus,
            violation,
            notes: visitNotes.value
        });

        updateAssignmentFromVisit(facility.license, visitStatus);

        applyFilters();

        showFacilityDetails(facility);

    });

}
