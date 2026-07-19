let externalVisits = {};
const externalMissionTypes = [
    "مشاركة مع جهة حكومية",
    "تكليف إداري",
    "بلاغ",
    "متابعة",
    "حملة مشتركة",
    "توجيه عاجل",
    "أخرى"
];
const externalMissionStatuses = ["جديدة", "قيد التنفيذ", "مكتملة", "ملغاة"];


async function initializeExternalVisitsState() {

    externalVisits = loadExternalVisits();
    const migrated = migrateExternalMissionRecords(externalVisits);

    externalVisits = migrated.records;

    if (migrated.changed) {

        await saveExternalVisits(externalVisits);

        return;

    }

    await seedCloudKey("externalVisits", externalVisits);

}


function getExternalMissionYear(visit) {

    const source = visit.visitDate || visit.date || visit.createdAt || "";
    const match = String(source).match(/^(\d{4})/);

    return match ? match[1] : String(new Date().getFullYear());

}


function generateExternalMissionNumber(records, year = String(new Date().getFullYear())) {

    const prefix = `MT-${year}-`;
    let highestSequence = 0;

    Object.values(records || {}).forEach(visit => {

        const missionNumber = String(visit && visit.missionNumber || "");
        const match = missionNumber.match(new RegExp(`^${prefix}(\\d{6})$`));

        if (match) highestSequence = Math.max(highestSequence, Number(match[1]));

    });

    return `${prefix}${String(highestSequence + 1).padStart(6, "0")}`;

}


function migrateExternalMissionRecords(records) {

    const migratedRecords = { ...(records || {}) };
    let changed = false;

    Object.keys(migratedRecords).forEach(key => {

        const visit = migratedRecords[key];

        if (!visit || typeof visit !== "object") return;

        const migratedVisit = { ...visit };

        if (!migratedVisit.missionNumber) {

            migratedVisit.missionNumber = generateExternalMissionNumber(
                migratedRecords,
                getExternalMissionYear(migratedVisit)
            );
            migratedRecords[key] = migratedVisit;
            changed = true;

        }

        if (!migratedVisit.missionType) {

            migratedVisit.missionType = "أخرى";
            changed = true;

        }

        if (!migratedVisit.missionStatus) {

            migratedVisit.missionStatus = "مكتملة";
            changed = true;

        }

        migratedRecords[key] = migratedVisit;

    });

    return { records: migratedRecords, changed };

}


function trimExternalVisitInput(value) {

    return String(value || "").trim();

}


function getExternalVisitList() {

    return Object.values(externalVisits)
        .filter(visit => visit && visit.isExternal !== false)
        .filter(canViewExternalVisit)
        .sort((a, b) => {

            const dateCompare =
                new Date(b.visitDate || b.date || 0) -
                new Date(a.visitDate || a.date || 0);

            if (dateCompare !== 0) return dateCompare;

            return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);

        });

}


function canViewExternalVisit(visit) {

    if (!visit) return false;
    if (isAdminUser()) return true;
    if (!isCommitteeUser() || !currentUser) return false;

    const currentIdentity = [
        currentUser.username,
        currentUser.displayName,
        currentUser.committeeName
    ].map(value => String(value || "").trim().toLowerCase()).filter(Boolean);
    const team = visit.teamSnapshot || {};
    const visitIdentity = [
        visit.createdBy,
        visit.committeeId,
        visit.committeeUsername,
        visit.committeeName,
        ...(Array.isArray(visit.participants) ? visit.participants : []),
        team.committeeName,
        team.leader,
        ...(Array.isArray(team.members) ? team.members : [])
    ].map(value => String(value || "").trim().toLowerCase()).filter(Boolean);

    return currentIdentity.some(identity => visitIdentity.includes(identity));

}


function createExternalVisitId() {

    return `external-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

}


function findExternalMissionRecord(identifier) {

    const normalizedIdentifier = String(identifier || "");

    return externalVisits[normalizedIdentifier] ||
        Object.values(externalVisits).find(visit => {

            return visit && (
                String(visit.id || "") === normalizedIdentifier ||
                String(visit.externalVisitId || "") === normalizedIdentifier
            );

        }) || null;

}


function getExternalMissionId(visit) {

    return visit ? visit.id || visit.externalVisitId || "" : "";

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
        missionType: document.getElementById("externalMissionType").value,
        missionTypeOther: trimExternalVisitInput(
            document.getElementById("externalMissionTypeOther").value
        ),
        missionStatus: document.getElementById("externalMissionStatus").value,
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
        directingEntity: trimExternalVisitInput(
            document.getElementById("externalDirectingEntity").value
        ),
        participatingEntity: trimExternalVisitInput(
            document.getElementById("externalParticipatingEntity").value
        ),
        participants: trimExternalVisitInput(
            document.getElementById("externalParticipants").value
        ).split(/[،,]/).map(value => value.trim()).filter(Boolean),
        violationDetails: trimExternalVisitInput(
            document.getElementById("externalViolationDetails").value
        ),
        notes: trimExternalVisitInput(document.getElementById("externalVisitNotes").value)
    };

}


function validateExternalVisit(data) {

    if (!data.facilityName) return "اسم المنشأة مطلوب.";
    if (!externalMissionTypes.includes(data.missionType)) return "نوع المهمة مطلوب.";
    if (!externalMissionStatuses.includes(data.missionStatus)) return "حالة المهمة مطلوبة.";
    if (!data.visitReason) return "سبب المهمة مطلوب.";
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
        ? findExternalMissionRecord(data.externalVisitId)
        : null;
    const externalVisitId = data.externalVisitId || createExternalVisitId();
    const committeeSnapshot = existing || getCurrentCommitteeSnapshot();
    const visitStatus = data.result === "incomplete" ? "partial" : "visited";
    const missionNumber = existing && existing.missionNumber
        ? existing.missionNumber
        : generateExternalMissionNumber(externalVisits);
    const participants = data.participants.length > 0
        ? data.participants
        : [
            committeeSnapshot.teamSnapshot && committeeSnapshot.teamSnapshot.leader,
            ...((committeeSnapshot.teamSnapshot && committeeSnapshot.teamSnapshot.members) || [])
        ].filter(Boolean);
    const participantIds = existing && Array.isArray(existing.participantIds)
        ? [...existing.participantIds]
        : typeof getActiveCommitteeEmployeeSnapshot === "function"
            ? getActiveCommitteeEmployeeSnapshot(
                committeeSnapshot.committeeUsername ||
                (currentUser && currentUser.username) || ""
            ).employeeIds
            : [];

    return {
        ...(existing || {}),
        externalVisitId,
        id: externalVisitId,
        isExternal: true,
        missionNumber,
        missionType: data.missionType,
        missionTypeOther: data.missionType === "أخرى" ? data.missionTypeOther : "",
        missionStatus: data.missionStatus,
        facilityName: data.facilityName,
        facilityType: data.facilityType,
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
        committeeId: committeeSnapshot.committeeId ||
            committeeSnapshot.committeeUsername || "",
        committeeName: committeeSnapshot.committeeName || "",
        teamSnapshot: committeeSnapshot.teamSnapshot || { leader: "", members: [] },
        visitReason: data.visitReason,
        result: data.result,
        visitStatus,
        violation: data.result === "violation",
        notes: data.notes,
        visitDate: data.visitDate || new Date().toISOString().slice(0, 10),
        date: data.visitDate || new Date().toISOString().slice(0, 10),
        transactionNumber: data.transactionNumber,
        taskNumber: data.transactionNumber,
        directingEntity: data.directingEntity,
        participatingEntity: data.participatingEntity,
        participants,
        participantIds,
        coordinates: data.latRaw
            ? { lat: data.lat, lng: data.lng }
            : null,
        violationDetails: data.violationDetails,
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

    if (typeof invalidateEmployeePerformanceCache === "function") {

        invalidateEmployeePerformanceCache();

    }

    await saveExternalVisits(externalVisits);

    if (typeof updateDashboard === "function") {

        updateDashboard(allFacilities);

    }


    renderExternalVisitsWorkspace();

}


function resetExternalVisitForm() {

    const form = document.getElementById("externalVisitForm");
    const panel = document.getElementById("externalVisitPanel");
    const date = document.getElementById("externalVisitDate");
    const reason = document.getElementById("externalVisitReason");
    const missionStatus = document.getElementById("externalMissionStatus");

    if (!form || !panel) return;

    form.reset();
    document.getElementById("externalVisitId").value = "";
    if (date) date.value = new Date().toISOString().slice(0, 10);
    if (reason) reason.value = "توجيه إداري";
    if (missionStatus) missionStatus.value = "مكتملة";
    updateExternalMissionTypeOtherVisibility();
    panel.classList.add("d-none");
    showExternalVisitMessage("", "d-none");

}


function showExternalVisitForm(externalVisitId = "") {

    if (!isCommitteeUser() && !isAdminUser()) return;
    if (externalVisitId && !isAdminUser()) return;

    const panel = document.getElementById("externalVisitPanel");
    const form = document.getElementById("externalVisitForm");

    if (!panel || !form) return;

    resetExternalVisitForm();
    panel.classList.remove("d-none");

    if (!externalVisitId) return;

    const visit = findExternalMissionRecord(externalVisitId);
    const snapshot = visit && visit.facilitySnapshot ? visit.facilitySnapshot : {};

    if (!visit) return;

    document.getElementById("externalVisitId").value = getExternalMissionId(visit);
    document.getElementById("externalFacilityName").value =
        visit.facilityName || snapshot.name || "";
    document.getElementById("externalFacilityType").value =
        visit.facilityType || snapshot.type || "";
    document.getElementById("externalFacilityCity").value = snapshot.city || "";
    document.getElementById("externalFacilityLicense").value = snapshot.license || "";
    document.getElementById("externalFacilityDistrict").value = snapshot.district || "";
    document.getElementById("externalFacilityAddress").value = snapshot.address || "";
    document.getElementById("externalMissionType").value = visit.missionType || "أخرى";
    document.getElementById("externalMissionTypeOther").value = visit.missionTypeOther || "";
    document.getElementById("externalMissionStatus").value = visit.missionStatus || "مكتملة";
    updateExternalMissionTypeOtherVisibility();
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
        visit.taskNumber || visit.transactionNumber || "";
    document.getElementById("externalDirectingEntity").value =
        visit.directingEntity || "";
    document.getElementById("externalParticipatingEntity").value =
        visit.participatingEntity || "";
    document.getElementById("externalParticipants").value =
        getExternalMissionParticipants(visit).join("، ");
    document.getElementById("externalViolationDetails").value =
        visit.violationDetails || "";
    document.getElementById("externalVisitNotes").value = visit.notes || "";

}


async function saveExternalVisitFromForm() {

    const data = collectExternalVisitFormData();

    if (data.externalVisitId && !isAdminUser()) return;

    const validationMessage = validateExternalVisit(data);

    if (validationMessage) {

        showExternalVisitMessage(validationMessage, "text-danger");

        return;

    }

    const record = buildExternalVisitRecord(data);
    const nextExternalVisits = { ...externalVisits };
    const existingKey = Object.keys(nextExternalVisits).find(key => {

        return getExternalMissionId(nextExternalVisits[key]) === data.externalVisitId;

    });

    if (existingKey && existingKey !== record.externalVisitId) delete nextExternalVisits[existingKey];
    nextExternalVisits[record.externalVisitId] = record;

    await persistExternalVisits(nextExternalVisits);
    showExternalVisitMessage("تم حفظ المهمة خارج الخطة.", "text-success");
    showExternalVisitDetails(record.externalVisitId);

}


function canManageExternalVisit(visit) {

    return Boolean(visit) && isAdminUser();

}


async function deleteExternalVisit(externalVisitId) {

    const visit = findExternalMissionRecord(externalVisitId);

    if (!visit || !isAdminUser()) return;
    if (!confirm("هل تريد حذف المهمة خارج الخطة؟")) return;

    const nextExternalVisits = { ...externalVisits };

    const recordKey = Object.keys(nextExternalVisits).find(key => {

        return nextExternalVisits[key] === visit;

    });

    if (recordKey) delete nextExternalVisits[recordKey];

    await persistExternalVisits(nextExternalVisits);
    showDashboardNeutralState();

}


function getExternalVisitResultLabel(visit) {

    if (visit.result === "violation" || visit.violation) return "توجد مخالفة";

    return "لا توجد مخالفة";

}


function getExternalMissionParticipants(visit) {

    if (Array.isArray(visit && visit.participants)) return visit.participants.filter(Boolean);

    const team = visit && visit.teamSnapshot ? visit.teamSnapshot : {};

    return [team.leader, ...(Array.isArray(team.members) ? team.members : [])].filter(Boolean);

}


function getExternalMissionStatusClass(status) {

    if (status === "مكتملة") return "success";
    if (status === "قيد التنفيذ") return "warning";
    if (status === "ملغاة") return "secondary";

    return "info";

}


function showExternalVisitDetails(externalVisitId) {

    const visit = findExternalMissionRecord(externalVisitId);
    const details = document.querySelector(".card-body");

    if (!visit || !canViewExternalVisit(visit) || !details) return;

    const snapshot = visit.facilitySnapshot || {};
    const participants = getExternalMissionParticipants(visit).join("، ");
    const mapUrl = getExternalVisitMapUrl(visit);

    details.innerHTML = `
        <div class="d-flex align-items-center justify-content-between gap-2 mb-3">
            <h5 class="mb-0">تفاصيل المهمة</h5>
            <span class="badge text-bg-info">${escapeHtml(visit.missionNumber || "")}</span>
        </div>

        <div class="external-mission-details-section">
            <h6>بيانات المهمة</h6>
            <p><strong>رقم المهمة:</strong> ${escapeHtml(visit.missionNumber || "-")}</p>
            <p><strong>نوع المهمة:</strong> ${escapeHtml(visit.missionType || "أخرى")}${visit.missionTypeOther ? ` — ${escapeHtml(visit.missionTypeOther)}` : ""}</p>
            <p><strong>حالة المهمة:</strong> <span class="badge text-bg-${getExternalMissionStatusClass(visit.missionStatus)}">${escapeHtml(visit.missionStatus || "مكتملة")}</span></p>
            <p><strong>سبب المهمة:</strong> ${escapeHtml(visit.visitReason || "-")}</p>
            <p><strong>رقم التكليف/المرجع:</strong> ${escapeHtml(visit.taskNumber || visit.transactionNumber || "-")}</p>
            <p><strong>الجهة الموجهة:</strong> ${escapeHtml(visit.directingEntity || "-")}</p>
            <p><strong>الجهة المشاركة:</strong> ${escapeHtml(visit.participatingEntity || "-")}</p>
        </div>

        <div class="external-mission-details-section">
            <h6>بيانات المنشأة</h6>
            <p><strong>اسم المنشأة:</strong> ${escapeHtml(visit.facilityName || snapshot.name || "-")}</p>
            <p><strong>نوع المنشأة:</strong> ${escapeHtml(visit.facilityType || snapshot.type || "-")}</p>
            <p><strong>الموقع/الإحداثيات:</strong> ${escapeHtml(getExternalMissionCoordinatesLabel(visit) || "غير متوفر")}</p>
        </div>

        <div class="external-mission-details-section">
            <h6>التنفيذ</h6>
            <p><strong>تاريخ الزيارة:</strong> ${escapeHtml(visit.visitDate || visit.date || "-")}</p>
            <p><strong>اللجنة:</strong> ${escapeHtml(visit.committeeName || "-")}</p>
            <p><strong>المشاركون:</strong> ${escapeHtml(participants || "-")}</p>
            <p><strong>منشئ السجل:</strong> ${escapeHtml(visit.createdBy || "-")}</p>
            <p><strong>الملاحظات:</strong> ${escapeHtml(visit.notes || "-")}</p>
        </div>

        <div class="external-mission-details-section">
            <h6>النتيجة</h6>
            <p><strong>المخالفة:</strong> ${getExternalVisitResultLabel(visit)}</p>
            <p><strong>تفاصيل المخالفة:</strong> ${escapeHtml(visit.violationDetails || "-")}</p>
        </div>

        ${mapUrl
            ? `<a href="${escapeHtml(mapUrl)}" target="_blank" rel="noopener" class="btn btn-success w-100 mt-2">
                فتح الموقع
            </a>`
            : ""}

        ${canManageExternalVisit(visit) ? `
            <div class="d-flex gap-2 mt-3">
                <button id="editExternalVisit" type="button" class="btn btn-outline-primary w-50">
                    تعديل المهمة
                </button>
                <button id="deleteExternalVisit" type="button" class="btn btn-outline-danger w-50">
                    حذف المهمة
                </button>
            </div>
        ` : ""}
    `;

    const editButton = document.getElementById("editExternalVisit");
    const deleteButton = document.getElementById("deleteExternalVisit");

    if (editButton) {

        editButton.addEventListener("click", () => {

            showExternalVisitForm(getExternalMissionId(visit));

        });

    }

    if (deleteButton) {

        deleteButton.addEventListener("click", () => {

            deleteExternalVisit(getExternalMissionId(visit));

        });

    }

}


function getExternalMissionCoordinatesLabel(visit) {

    const snapshot = visit && visit.facilitySnapshot ? visit.facilitySnapshot : {};
    const coordinates = visit && visit.coordinates ? visit.coordinates : snapshot;

    if (coordinates.lat === null || coordinates.lat === "" ||
        coordinates.lng === null || coordinates.lng === "" ||
        !Number.isFinite(Number(coordinates.lat)) ||
        !Number.isFinite(Number(coordinates.lng))) return "";

    return `${coordinates.lat}, ${coordinates.lng}`;

}


function getExternalVisitMapUrl(visit) {

    const snapshot = visit && visit.facilitySnapshot ? visit.facilitySnapshot : {};
    const coordinates = visit && visit.coordinates ? visit.coordinates : snapshot;
    const configuredUrl = String(snapshot.mapUrl || "").trim();

    if (/^https?:\/\//i.test(configuredUrl)) return configuredUrl;

    if (coordinates.lat !== null && coordinates.lat !== "" &&
        coordinates.lng !== null && coordinates.lng !== "" &&
        Number.isFinite(Number(coordinates.lat)) && Number.isFinite(Number(coordinates.lng))) {

        return `https://www.google.com/maps?q=${encodeURIComponent(`${coordinates.lat},${coordinates.lng}`)}`;

    }

    return "";

}


function searchExternalVisits(query) {

    const normalizedQuery = String(query || "").trim().toLowerCase();

    if (normalizedQuery.length < 2) return [];

    return getExternalVisitList().filter(visit => {

        const snapshot = visit.facilitySnapshot || {};

        return [
            visit.missionNumber,
            visit.facilityName,
            snapshot.name,
            visit.missionType,
            visit.missionTypeOther,
            visit.missionStatus,
            visit.taskNumber,
            visit.transactionNumber,
            visit.visitReason,
            visit.committeeName,
            visit.committeeUsername,
            visit.createdBy,
            visit.directingEntity,
            visit.participatingEntity,
            ...(getExternalMissionParticipants(visit)),
            visit.notes,
            visit.violationDetails
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


function renderExternalVisitsWorkspace() {

    const list = document.getElementById("externalVisitsList");
    const count = document.getElementById("externalVisitsCount");
    const visits = getExternalVisitList();

    if (count) count.textContent = visits.length;
    if (!list) return;

    if (visits.length === 0) {

        list.innerHTML = `<div class="text-muted text-center py-4">لا توجد مهام خارج الخطة.</div>`;
        return;

    }

    list.innerHTML = "";

    visits.forEach(visit => {

        const snapshot = visit.facilitySnapshot || {};
        const item = document.createElement("article");

        item.className = `external-visit-card${visit.missionStatus === "ملغاة" ? " is-cancelled" : ""}`;
        item.innerHTML = `
            <div class="external-visit-card-heading">
                <div>
                    <strong>${escapeHtml(visit.missionNumber || "-")}</strong>
                    <small>${escapeHtml(visit.facilityName || snapshot.name || "بدون اسم")}</small>
                </div>
                <span class="badge text-bg-${getExternalMissionStatusClass(visit.missionStatus)}">${escapeHtml(visit.missionStatus || "مكتملة")}</span>
            </div>
            <div class="external-visit-card-meta">
                <span><b>نوع المهمة:</b> ${escapeHtml(visit.missionType || "أخرى")}</span>
                <span><b>التاريخ:</b> ${escapeHtml(visit.visitDate || visit.date || "-")}</span>
                <span><b>الجهة:</b> ${escapeHtml(visit.participatingEntity || visit.directingEntity || "-")}</span>
                <span><b>اللجنة/المستخدم:</b> ${escapeHtml(visit.committeeName || visit.createdBy || "-")}</span>
                <span><b>المخالفة:</b> ${externalVisitIndicatesViolation(visit) ? "نعم" : "لا"}</span>
            </div>
            <button type="button" class="btn btn-sm btn-outline-primary">التفاصيل</button>
        `;
        item.querySelector("button").addEventListener("click", () => {

            showExternalVisitDetails(getExternalMissionId(visit));

        });
        list.appendChild(item);

    });

}


function getExternalVisitStats() {

    const visits = getExternalVisitList();

    return {
        total: visits.length,
        violations: new Set(
            visits
                .filter(externalVisitIndicatesViolation)
                .map(visit => getExternalMissionId(visit) || visit.missionNumber)
        ).size,
        completed: visits.filter(visit => visit.missionStatus === "مكتملة").length,
        inProgress: visits.filter(visit => visit.missionStatus === "قيد التنفيذ").length,
        cancelled: visits.filter(visit => visit.missionStatus === "ملغاة").length
    };

}


function initializeExternalVisitControls() {

    const showButton = document.getElementById("showExternalVisitForm");
    const form = document.getElementById("externalVisitForm");
    const cancelButton = document.getElementById("cancelExternalVisit");
    const date = document.getElementById("externalVisitDate");
    const workspaceButton = document.getElementById("showExternalVisitsWorkspace");
    const workspace = document.getElementById("externalVisitsWorkspace");
    const missionType = document.getElementById("externalMissionType");

    renderExternalVisitsWorkspace();

    if (workspaceButton && workspace) {

        workspaceButton.addEventListener("click", () => {

            workspace.classList.toggle("d-none");
            if (!workspace.classList.contains("d-none")) {

                renderExternalVisitsWorkspace();
                workspace.scrollIntoView({ behavior: "smooth", block: "start" });

            }

        });

    }

    if (date) {

        date.value = new Date().toISOString().slice(0, 10);

    }

    if (missionType) {

        missionType.addEventListener("change", updateExternalMissionTypeOtherVisibility);
        updateExternalMissionTypeOtherVisibility();

    }

    if (showButton) {

        showButton.addEventListener("click", () => showExternalVisitForm());

    }

    if (form) {

        form.addEventListener("submit", event => {

            event.preventDefault();

            saveExternalVisitFromForm().catch(() => {

                showExternalVisitMessage("تعذر حفظ المهمة خارج الخطة.", "text-danger");

            });

        });

    }

    if (cancelButton) {

        cancelButton.addEventListener("click", resetExternalVisitForm);

    }

}


function updateExternalMissionTypeOtherVisibility() {

    const missionType = document.getElementById("externalMissionType");
    const otherField = document.getElementById("externalMissionTypeOtherField");

    if (!missionType || !otherField) return;

    otherField.classList.toggle("d-none", missionType.value !== "أخرى");

}
