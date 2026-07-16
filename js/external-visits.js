let externalVisits = {};


function initializeExternalVisitsState() {

    externalVisits = loadExternalVisits();

    seedCloudKey("externalVisits", externalVisits);

}


function trimExternalVisitInput(value) {

    return String(value || "").trim();

}


function getExternalVisitList() {

    return Object.values(externalVisits)
        .filter(visit => visit && visit.isExternal)
        .sort((a, b) => {

            const dateCompare =
                new Date(b.visitDate || b.date || 0) -
                new Date(a.visitDate || a.date || 0);

            if (dateCompare !== 0) return dateCompare;

            return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);

        });

}


function createExternalVisitId() {

    return `external-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

}


function getCurrentCommitteeSnapshot() {

    const user = currentUser && users[currentUser.username]
        ? users[currentUser.username]
        : currentUser;

    if (!user) {

        return {
            committeeUsername: "",
            committeeName: "",
            teamSnapshot: { leader: "", members: [] }
        };

    }

    const team = typeof normalizeTeam === "function"
        ? normalizeTeam(user.team)
        : { leader: "", members: [] };

    return {
        committeeUsername: user.username || "",
        committeeName: user.committeeName || user.displayName || user.username || "",
        teamSnapshot: {
            committeeName: user.committeeName || user.displayName || user.username || "",
            leader: team.leader || "",
            members: team.members || []
        }
    };

}


function collectExternalVisitFormData() {

    const latRaw = trimExternalVisitInput(
        document.getElementById("externalFacilityLat").value
    );
    const lngRaw = trimExternalVisitInput(
        document.getElementById("externalFacilityLng").value
    );

    return {
        externalVisitId: trimExternalVisitInput(
            document.getElementById("externalVisitId").value
        ),
        facilityName: trimExternalVisitInput(document.getElementById("externalFacilityName").value),
        facilityType: trimExternalVisitInput(document.getElementById("externalFacilityType").value),
        city: trimExternalVisitInput(document.getElementById("externalFacilityCity").value),
        license: trimExternalVisitInput(document.getElementById("externalFacilityLicense").value),
        district: trimExternalVisitInput(document.getElementById("externalFacilityDistrict").value),
        address: trimExternalVisitInput(document.getElementById("externalFacilityAddress").value),
        visitType: document.getElementById("externalVisitType").value,
        visitReason: document.getElementById("externalVisitReason").value,
        result: document.getElementById("externalVisitResult").value,
        visitDate: document.getElementById("externalVisitDate").value,
        latRaw,
        lngRaw,
        lat: Number(latRaw),
        lng: Number(lngRaw),
        mapUrl: trimExternalVisitInput(document.getElementById("externalFacilityMapUrl").value),
        transactionNumber: trimExternalVisitInput(
            document.getElementById("externalTransactionNumber").value
        ),
        notes: trimExternalVisitInput(document.getElementById("externalVisitNotes").value)
    };

}


function validateExternalVisit(data) {

    if (!data.facilityName) return "اسم المنشأة مطلوب.";
    if (!data.facilityType) return "نوع المنشأة مطلوب.";
    if (!data.city) return "المدينة مطلوبة.";
    if (!data.visitType) return "نوع الزيارة مطلوب.";
    if (!data.visitReason) return "سبب الزيارة مطلوب.";
    if (!data.result) return "نتيجة الزيارة مطلوبة.";

    if ((data.latRaw || data.lngRaw) &&
        (!data.latRaw ||
            !data.lngRaw ||
            !Number.isFinite(data.lat) ||
            data.lat < -90 ||
            data.lat > 90 ||
            !Number.isFinite(data.lng) ||
            data.lng < -180 ||
            data.lng > 180)) {

        return "الإحداثيات يجب أن تكون مكتملة وبصيغة صحيحة.";

    }

    return "";

}


function buildExternalVisitRecord(data) {

    const existing = data.externalVisitId
        ? externalVisits[data.externalVisitId]
        : null;
    const externalVisitId = data.externalVisitId || createExternalVisitId();
    const committeeSnapshot = existing || getCurrentCommitteeSnapshot();
    const visitStatus = data.result === "incomplete" ? "partial" : "visited";

    return {
        ...(existing || {}),
        externalVisitId,
        id: externalVisitId,
        isExternal: true,
        facilitySnapshot: {
            name: data.facilityName,
            type: data.facilityType,
            license: data.license,
            city: data.city,
            district: data.district,
            address: data.address,
            lat: data.latRaw ? data.lat : null,
            lng: data.lngRaw ? data.lng : null,
            mapUrl: data.mapUrl
        },
        committeeUsername: committeeSnapshot.committeeUsername || "",
        committeeName: committeeSnapshot.committeeName || "",
        teamSnapshot: committeeSnapshot.teamSnapshot || { leader: "", members: [] },
        visitType: data.visitType,
        visitReason: data.visitReason,
        result: data.result,
        visitStatus,
        violation: data.result === "violation",
        notes: data.notes,
        visitDate: data.visitDate || new Date().toISOString().slice(0, 10),
        date: data.visitDate || new Date().toISOString().slice(0, 10),
        transactionNumber: data.transactionNumber,
        createdAt: existing && existing.createdAt
            ? existing.createdAt
            : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: existing && existing.createdBy
            ? existing.createdBy
            : currentUser && currentUser.username
                ? currentUser.username
                : ""
    };

}


function showExternalVisitMessage(text, className) {

    const message = document.getElementById("externalVisitMessage");

    if (!message) return;

    message.textContent = text;
    message.className = `small ${className}`;

}


async function persistExternalVisits(nextExternalVisits) {

    externalVisits = nextExternalVisits;

    await saveExternalVisits(externalVisits);

    if (typeof updateDashboard === "function") {

        updateDashboard(allFacilities);

    }

}


function resetExternalVisitForm() {

    const form = document.getElementById("externalVisitForm");
    const panel = document.getElementById("externalVisitPanel");
    const date = document.getElementById("externalVisitDate");
    const reason = document.getElementById("externalVisitReason");

    if (!form || !panel) return;

    form.reset();
    document.getElementById("externalVisitId").value = "";
    if (date) date.value = new Date().toISOString().slice(0, 10);
    if (reason) reason.value = "الخطة الدورية";
    panel.classList.add("d-none");
    showExternalVisitMessage("", "d-none");

}


function showExternalVisitForm(externalVisitId = "") {

    if (!isCommitteeUser() && !isAdminUser()) return;

    const panel = document.getElementById("externalVisitPanel");
    const form = document.getElementById("externalVisitForm");

    if (!panel || !form) return;

    resetExternalVisitForm();
    panel.classList.remove("d-none");

    if (!externalVisitId) return;

    const visit = externalVisits[String(externalVisitId)];
    const snapshot = visit && visit.facilitySnapshot ? visit.facilitySnapshot : {};

    if (!visit) return;

    document.getElementById("externalVisitId").value = visit.externalVisitId;
    document.getElementById("externalFacilityName").value = snapshot.name || "";
    document.getElementById("externalFacilityType").value = snapshot.type || "";
    document.getElementById("externalFacilityCity").value = snapshot.city || "";
    document.getElementById("externalFacilityLicense").value = snapshot.license || "";
    document.getElementById("externalFacilityDistrict").value = snapshot.district || "";
    document.getElementById("externalFacilityAddress").value = snapshot.address || "";
    document.getElementById("externalVisitType").value = visit.visitType || "periodic";
    document.getElementById("externalVisitReason").value =
        visit.visitReason || "الخطة الدورية";
    document.getElementById("externalVisitResult").value = visit.result || "no_violation";
    document.getElementById("externalVisitDate").value =
        visit.visitDate || visit.date || new Date().toISOString().slice(0, 10);
    document.getElementById("externalFacilityLat").value =
        snapshot.lat === null || typeof snapshot.lat === "undefined" ? "" : snapshot.lat;
    document.getElementById("externalFacilityLng").value =
        snapshot.lng === null || typeof snapshot.lng === "undefined" ? "" : snapshot.lng;
    document.getElementById("externalFacilityMapUrl").value = snapshot.mapUrl || "";
    document.getElementById("externalTransactionNumber").value =
        visit.transactionNumber || "";
    document.getElementById("externalVisitNotes").value = visit.notes || "";

}


async function saveExternalVisitFromForm() {

    const data = collectExternalVisitFormData();
    const validationMessage = validateExternalVisit(data);

    if (validationMessage) {

        showExternalVisitMessage(validationMessage, "text-danger");

        return;

    }

    const record = buildExternalVisitRecord(data);
    const nextExternalVisits = {
        ...externalVisits,
        [record.externalVisitId]: record
    };

    await persistExternalVisits(nextExternalVisits);
    showExternalVisitMessage("تم حفظ زيارة خارج الخطة.", "text-success");
    showExternalVisitDetails(record.externalVisitId);

}


function canManageExternalVisit(visit) {

    return Boolean(visit) && isAdminUser();

}


async function deleteExternalVisit(externalVisitId) {

    const visit = externalVisits[String(externalVisitId)];

    if (!visit || !isAdminUser()) return;
    if (!confirm("هل تريد حذف زيارة خارج الخطة؟")) return;

    const nextExternalVisits = { ...externalVisits };

    delete nextExternalVisits[String(externalVisitId)];

    await persistExternalVisits(nextExternalVisits);
    showDashboardNeutralState();

}


function getExternalVisitResultLabel(visit) {

    if (visit.result === "violation" || visit.violation) return "توجد مخالفة";
    if (visit.result === "incomplete" || visit.visitStatus === "partial") {

        return "لم تكتمل";

    }

    return "لا توجد مخالفة";

}


function showExternalVisitDetails(externalVisitId) {

    const visit = externalVisits[String(externalVisitId)];
    const details = document.querySelector(".card-body");

    if (!visit || !details) return;

    const snapshot = visit.facilitySnapshot || {};
    const statusClass = visit.violation
        ? "danger"
        : visit.visitStatus === "partial"
            ? "warning"
            : "success";

    details.innerHTML = `
        <div class="d-flex align-items-center justify-content-between gap-2 mb-3">
            <h5 class="mb-0">${escapeHtml(snapshot.name || "")}</h5>
            <span class="badge text-bg-info">خارج الخطة</span>
        </div>

        <p><strong>🏢 النوع:</strong> ${escapeHtml(snapshot.type || "")}</p>
        <p><strong>📍 المدينة:</strong> ${escapeHtml(snapshot.city || "")}</p>
        ${snapshot.district
            ? `<p><strong>الحي:</strong> ${escapeHtml(snapshot.district)}</p>`
            : ""}
        ${snapshot.address
            ? `<p><strong>العنوان:</strong> ${escapeHtml(snapshot.address)}</p>`
            : ""}
        ${snapshot.license
            ? `<p><strong>📄 الترخيص:</strong> ${escapeHtml(snapshot.license)}</p>`
            : ""}
        ${visit.transactionNumber
            ? `<p><strong>رقم المعاملة أو المهمة:</strong> ${escapeHtml(visit.transactionNumber)}</p>`
            : ""}

        <hr>

        <p><strong>اللجنة:</strong> ${escapeHtml(visit.committeeName || "")}</p>
        <p><strong>نوع الزيارة:</strong> ${getVisitTypeLabel(visit.visitType)}</p>
        <p><strong>سبب الزيارة:</strong> ${escapeHtml(visit.visitReason || "")}</p>
        <p>
            <strong>النتيجة:</strong>
            <span class="badge bg-${statusClass}">${getExternalVisitResultLabel(visit)}</span>
        </p>
        <p><strong>تاريخ الزيارة:</strong> ${escapeHtml(visit.visitDate || visit.date || "")}</p>
        ${visit.notes
            ? `<p><strong>الملاحظات:</strong> ${escapeHtml(visit.notes)}</p>`
            : ""}

        ${snapshot.mapUrl
            ? `<a href="${escapeHtml(snapshot.mapUrl)}" target="_blank" class="btn btn-success w-100 mt-2">
                فتح الموقع
            </a>`
            : ""}

        ${canManageExternalVisit(visit) ? `
            <div class="d-flex gap-2 mt-3">
                <button id="editExternalVisit" type="button" class="btn btn-outline-primary w-50">
                    تعديل الزيارة
                </button>
                <button id="deleteExternalVisit" type="button" class="btn btn-outline-danger w-50">
                    حذف الزيارة
                </button>
            </div>
        ` : ""}
    `;

    const editButton = document.getElementById("editExternalVisit");
    const deleteButton = document.getElementById("deleteExternalVisit");

    if (editButton) {

        editButton.addEventListener("click", () => {

            showExternalVisitForm(visit.externalVisitId);

        });

    }

    if (deleteButton) {

        deleteButton.addEventListener("click", () => {

            deleteExternalVisit(visit.externalVisitId);

        });

    }

}


function searchExternalVisits(query) {

    const normalizedQuery = String(query || "").trim().toLowerCase();

    if (normalizedQuery.length < 2) return [];

    return getExternalVisitList().filter(visit => {

        const snapshot = visit.facilitySnapshot || {};

        return [
            snapshot.name,
            snapshot.license,
            snapshot.city,
            snapshot.district,
            visit.transactionNumber
        ].some(value => {

            return String(value || "").toLowerCase().includes(normalizedQuery);

        });

    });

}


function externalVisitIndicatesViolation(visit) {

    return visit &&
        (visit.violation === true ||
            visit.result === "violation" ||
            visit.visitStatus === "violation");

}


function getExternalVisitStats() {

    const visits = getExternalVisitList();

    return {
        total: visits.length,
        violations: visits.filter(externalVisitIndicatesViolation).length,
        periodic: visits.filter(visit => visit.visitType !== "reactive").length,
        reactive: visits.filter(visit => visit.visitType === "reactive").length
    };

}


function initializeExternalVisitControls() {

    const showButton = document.getElementById("showExternalVisitForm");
    const form = document.getElementById("externalVisitForm");
    const cancelButton = document.getElementById("cancelExternalVisit");
    const date = document.getElementById("externalVisitDate");

    if (date) {

        date.value = new Date().toISOString().slice(0, 10);

    }

    if (showButton) {

        showButton.addEventListener("click", () => showExternalVisitForm());

    }

    if (form) {

        form.addEventListener("submit", event => {

            event.preventDefault();

            saveExternalVisitFromForm().catch(() => {

                showExternalVisitMessage("تعذر حفظ زيارة خارج الخطة.", "text-danger");

            });

        });

    }

    if (cancelButton) {

        cancelButton.addEventListener("click", resetExternalVisitForm);

    }

}
