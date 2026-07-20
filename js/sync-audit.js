// ========================================
// Synchronization Integrity Audit
// ========================================

let currentSyncAuditReport = null;


function isSyncAuditObject(value) {

    return value && typeof value === "object" && !Array.isArray(value);

}


function isSyncAuditCompletedVisit(visit) {

    if (!isSyncAuditObject(visit)) return false;

    return visit.visitStatus === "visited" ||
        visit.status === "visited" ||
        visit.status === "completed" ||
        visit.result === "no_violation" ||
        visit.result === "violation";

}


function getSyncAuditVisitEmployeeIds(visit) {

    const employeeSnapshot = isSyncAuditObject(visit.employeeSnapshot)
        ? visit.employeeSnapshot
        : {};
    const teamSnapshot = isSyncAuditObject(visit.teamSnapshot)
        ? visit.teamSnapshot
        : {};

    return [...new Set([
        employeeSnapshot.leaderId,
        ...(Array.isArray(employeeSnapshot.memberIds) ? employeeSnapshot.memberIds : []),
        ...(Array.isArray(employeeSnapshot.employeeIds) ? employeeSnapshot.employeeIds : []),
        teamSnapshot.leaderId,
        ...(Array.isArray(teamSnapshot.memberIds) ? teamSnapshot.memberIds : [])
    ].map(value => String(value || "")).filter(Boolean))];

}


function createSyncAuditIssue(type, data = {}) {

    const identity = [
        type,
        data.facilityLicense || "-",
        data.assignmentId || "-",
        data.visitId || "-",
        data.recordKey || "-"
    ].join(":");

    return {
        id: identity,
        type,
        severity: data.severity || "warning",
        facilityLicense: String(data.facilityLicense || ""),
        assignmentId: String(data.assignmentId || ""),
        visitId: String(data.visitId || ""),
        title: data.title || "مشكلة مزامنة",
        details: data.details || "",
        recommendation: data.recommendation || "تحتاج مراجعة إدارية.",
        repair: data.repair || null
    };

}


function auditSyncIntegrity(data = {}) {

    const statuses = isSyncAuditObject(data.facilityStatus)
        ? data.facilityStatus
        : {};
    const assignments = isSyncAuditObject(data.facilityAssignments)
        ? data.facilityAssignments
        : {};
    const employees = isSyncAuditObject(data.employees) ? data.employees : {};
    const users = isSyncAuditObject(data.users) ? data.users : {};
    const issues = [];
    const visits = [];
    const assignmentsById = new Map();
    const visitsById = new Map();

    Object.entries(assignments).forEach(([assignmentKey, assignment]) => {

        if (!isSyncAuditObject(assignment)) return;

        const facilityLicense = String(assignment.facilityLicense || assignmentKey);
        const assignmentId = String(assignment.id || "");

        if (assignmentId) assignmentsById.set(assignmentId, { assignmentKey, assignment });

        if (!assignmentId) {

            issues.push(createSyncAuditIssue("assignment_missing_id", {
                facilityLicense,
                recordKey: assignmentKey,
                severity: "error",
                title: "إسناد دون معرّف",
                details: "سجل الإسناد لا يحتوي assignmentId.",
                recommendation: "راجع السجل قبل أي تعديل؛ لا يُنشأ معرّف تلقائيًا أثناء الفحص."
            }));

        }

        if (String(assignmentKey) !== facilityLicense) {

            issues.push(createSyncAuditIssue("assignment_facility_mismatch", {
                facilityLicense,
                assignmentId,
                recordKey: assignmentKey,
                severity: "error",
                title: "عدم تطابق منشأة الإسناد",
                details: `مفتاح السجل ${assignmentKey} لا يطابق facilityLicense ${facilityLicense}.`,
                recommendation: "تحتاج مراجعة يدوية لتحديد المعرّف الصحيح للمنشأة."
            }));

        }

        const committeeUsername = String(assignment.committeeUsername || "");

        if (committeeUsername && !users[committeeUsername]) {

            issues.push(createSyncAuditIssue("assignment_unknown_committee", {
                facilityLicense,
                assignmentId,
                recordKey: committeeUsername,
                severity: "warning",
                title: "إسناد مرتبط بلجنة غير موجودة",
                details: `اللجنة ${committeeUsername} غير موجودة في سجل المستخدمين.`,
                recommendation: "تحقق من حذف اللجنة أو تغيّر اسم المستخدم قبل إعادة الربط."
            }));

        }

    });

    Object.entries(statuses).forEach(([statusKey, status]) => {

        if (!isSyncAuditObject(status)) return;

        const statusVisits = Array.isArray(status.visits) ? status.visits : [];

        statusVisits.forEach((visit, visitIndex) => {

            if (!isSyncAuditObject(visit)) return;

            const visitId = String(visit.id || "");
            const facilityLicense = String(visit.facilityLicense || statusKey);
            const record = { statusKey, visitIndex, visit, visitId, facilityLicense };

            visits.push(record);

            if (!visitId) {

                issues.push(createSyncAuditIssue("visit_missing_id", {
                    facilityLicense,
                    recordKey: String(visitIndex),
                    severity: "error",
                    title: "زيارة دون معرّف",
                    details: `الزيارة رقم ${visitIndex + 1} داخل سجل المنشأة لا تحتوي visitId.`,
                    recommendation: "لا تُعدّل تلقائيًا حتى لا يتغير سجل تاريخي دون مراجعة."
                }));

            } else {

                const records = visitsById.get(visitId) || [];

                records.push(record);
                visitsById.set(visitId, records);

            }

            if (String(statusKey) !== facilityLicense) {

                issues.push(createSyncAuditIssue("visit_facility_mismatch", {
                    facilityLicense,
                    visitId,
                    recordKey: statusKey,
                    severity: "error",
                    title: "عدم تطابق منشأة الزيارة",
                    details: `الزيارة محفوظة تحت ${statusKey} بينما facilityLicense هو ${facilityLicense}.`,
                    recommendation: "تحتاج مراجعة يدوية قبل نقل الزيارة بين سجلات المنشآت."
                }));

            }

            const employeeIds = getSyncAuditVisitEmployeeIds(visit);

            if (employeeIds.length === 0) {

                issues.push(createSyncAuditIssue("visit_missing_participants", {
                    facilityLicense,
                    visitId,
                    recordKey: String(visitIndex),
                    severity: "info",
                    title: "زيارة بلا معرّفات مشاركين",
                    details: "لا تحتوي الزيارة employeeSnapshot أو معرّفات أعضاء صالحة.",
                    recommendation: "سجل تاريخي للمراجعة فقط؛ لا تُنسب الزيارة تلقائيًا لموظفين."
                }));

            } else {

                const unknownEmployeeIds = employeeIds.filter(employeeId => !employees[employeeId]);

                if (unknownEmployeeIds.length > 0) {

                    issues.push(createSyncAuditIssue("visit_unknown_participants", {
                        facilityLicense,
                        visitId,
                        recordKey: unknownEmployeeIds.join(","),
                        severity: "warning",
                        title: "مشاركون غير موجودين في سجل الموظفين",
                        details: `المعرّفات غير الموجودة: ${unknownEmployeeIds.join("، ")}.`,
                        recommendation: "تحقق من حذف الموظف أو خطأ المعرّف؛ لا تُحتسب تلقائيًا."
                    }));

                }

            }

        });

    });

    visitsById.forEach((records, visitId) => {

        if (records.length < 2) return;

        issues.push(createSyncAuditIssue("duplicate_visit_id", {
            facilityLicense: records[0].facilityLicense,
            visitId,
            recordKey: String(records.length),
            severity: "error",
            title: "معرّف زيارة مكرر",
            details: `visitId مكرر ${records.length} مرات.`,
            recommendation: "قارن السجلات يدويًا؛ لا يُحذف أي سجل تلقائيًا."
        }));

    });

    visits.filter(record => isSyncAuditCompletedVisit(record.visit)).forEach(record => {

        const { visit, visitId, facilityLicense } = record;
        const assignmentId = String(visit.assignmentId || "");

        if (!assignmentId) {

            issues.push(createSyncAuditIssue("completed_visit_unlinked", {
                facilityLicense,
                visitId,
                recordKey: record.statusKey,
                severity: "info",
                title: "زيارة مكتملة بلا رابط إسناد",
                details: "الزيارة مكتملة لكنها لا تحتوي assignmentId، وقد تكون زيارة تاريخية أو إدارية.",
                recommendation: "للمراجعة فقط؛ لا يُغلق إسناد حالي اعتمادًا على التخمين."
            }));

            return;

        }

        const assignmentRecord = assignmentsById.get(assignmentId);

        if (!assignmentRecord) {

            issues.push(createSyncAuditIssue("visit_assignment_not_found", {
                facilityLicense,
                assignmentId,
                visitId,
                severity: "error",
                title: "إسناد الزيارة غير موجود",
                details: `الزيارة تشير إلى الإسناد ${assignmentId} لكنه غير موجود.`,
                recommendation: "راجع سجل الإسنادات التاريخي قبل اتخاذ أي إجراء."
            }));

            return;

        }

        const { assignmentKey, assignment } = assignmentRecord;
        const assignmentLicense = String(assignment.facilityLicense || assignmentKey);
        const visitCommittee = String(visit.committeeUsername || "");
        const assignmentCommittee = String(assignment.committeeUsername || "");
        const sameFacility = assignmentLicense === facilityLicense;
        const sameCommittee = Boolean(visitCommittee) && visitCommittee === assignmentCommittee;

        if (!sameFacility || !sameCommittee) {

            issues.push(createSyncAuditIssue("visit_assignment_mismatch", {
                facilityLicense,
                assignmentId,
                visitId,
                severity: "error",
                title: "عدم تطابق الزيارة مع الإسناد",
                details: !sameFacility
                    ? `منشأة الزيارة ${facilityLicense} لا تطابق منشأة الإسناد ${assignmentLicense}.`
                    : `لجنة الزيارة ${visitCommittee || "-"} لا تطابق لجنة الإسناد ${assignmentCommittee || "-"}.`,
                recommendation: "لا يمكن الإصلاح آليًا؛ يجب تحديد السجل الصحيح يدويًا."
            }));

            return;

        }

        if (["assigned", "in_progress"].includes(assignment.status)) {

            issues.push(createSyncAuditIssue("completed_visit_open_assignment", {
                facilityLicense,
                assignmentId,
                visitId,
                severity: "error",
                title: "زيارة مكتملة وإسناد ما زال مفتوحًا",
                details: `الزيارة ${visitId} مكتملة، وحالة الإسناد الحالية ${assignment.status}.`,
                recommendation: "يمكن تغيير حالة هذا الإسناد فقط إلى completed بعد التأكيد.",
                repair: {
                    type: "complete_assignment",
                    assignmentKey: String(assignmentKey),
                    assignmentId,
                    visitId,
                    facilityLicense,
                    committeeUsername: assignmentCommittee,
                    statusBefore: assignment.status,
                    statusAfter: "completed"
                }
            }));

        } else if (assignment.status === "cancelled") {

            issues.push(createSyncAuditIssue("completed_visit_cancelled_assignment", {
                facilityLicense,
                assignmentId,
                visitId,
                severity: "warning",
                title: "زيارة مكتملة مرتبطة بإسناد ملغي",
                details: "الإسناد المرتبط بالزيارة حالته cancelled.",
                recommendation: "لا يُعاد فتح أو إكمال الإسناد الملغي تلقائيًا."
            }));

        }

    });

    Object.entries(assignments).forEach(([assignmentKey, assignment]) => {

        if (!isSyncAuditObject(assignment) || assignment.status !== "completed") return;

        const facilityLicense = String(assignment.facilityLicense || assignmentKey);
        const assignmentId = String(assignment.id || "");
        const committeeUsername = String(assignment.committeeUsername || "");
        const hasCompletedVisit = visits.some(record => {

            if (!isSyncAuditCompletedVisit(record.visit) ||
                record.facilityLicense !== facilityLicense) return false;

            const visitAssignmentId = String(record.visit.assignmentId || "");
            const visitCommittee = String(record.visit.committeeUsername || "");

            if (assignmentId && visitAssignmentId) return visitAssignmentId === assignmentId;

            return !visitAssignmentId && Boolean(committeeUsername) &&
                visitCommittee === committeeUsername;

        });

        if (!hasCompletedVisit) {

            issues.push(createSyncAuditIssue("completed_assignment_without_visit", {
                facilityLicense,
                assignmentId,
                recordKey: assignmentKey,
                severity: "warning",
                title: "إسناد مكتمل دون زيارة مكتملة",
                details: "لم يوجد سجل زيارة مكتملة يطابق المنشأة والإسناد.",
                recommendation: "قد يكون إغلاقًا إداريًا؛ راجعه دون إعادة فتحه تلقائيًا."
            }));

        }

    });

    const severityOrder = { error: 0, warning: 1, info: 2 };

    issues.sort((first, second) => {

        return (severityOrder[first.severity] - severityOrder[second.severity]) ||
            first.facilityLicense.localeCompare(second.facilityLicense) ||
            first.type.localeCompare(second.type);

    });

    return {
        generatedAt: new Date().toISOString(),
        issues,
        summary: {
            total: issues.length,
            error: issues.filter(issue => issue.severity === "error").length,
            warning: issues.filter(issue => issue.severity === "warning").length,
            info: issues.filter(issue => issue.severity === "info").length,
            repairable: issues.filter(issue => Boolean(issue.repair)).length
        }
    };

}


function getSyncAuditLocalData() {

    return {
        facilityStatus: typeof facilityStatus === "undefined" ? {} : facilityStatus,
        facilityAssignments: typeof facilityAssignments === "undefined" ? {} : facilityAssignments,
        employees: typeof employees === "undefined" ? {} : employees,
        users: typeof users === "undefined" ? {} : users
    };

}


function getSyncAuditSeverityLabel(severity) {

    if (severity === "error") return "عالية";
    if (severity === "warning") return "متوسطة";

    return "معلومة";

}


function renderSyncAuditReport(report) {

    const body = document.getElementById("syncAuditIssuesBody");
    const emptyState = document.getElementById("syncAuditEmptyState");
    const updatedAt = document.getElementById("syncAuditUpdatedAt");

    if (!body) return;

    document.getElementById("syncAuditTotal").textContent = report.summary.total;
    document.getElementById("syncAuditErrors").textContent = report.summary.error;
    document.getElementById("syncAuditWarnings").textContent = report.summary.warning;
    document.getElementById("syncAuditRepairable").textContent = report.summary.repairable;

    if (updatedAt) {

        updatedAt.textContent = `آخر فحص: ${new Date(report.generatedAt).toLocaleString("ar-SA")}`;

    }

    if (emptyState) emptyState.classList.toggle("d-none", report.issues.length > 0);

    body.innerHTML = report.issues.map(issue => `
        <tr>
            <td><span class="sync-audit-severity ${escapeHtml(issue.severity)}">${escapeHtml(getSyncAuditSeverityLabel(issue.severity))}</span></td>
            <td><strong>${escapeHtml(issue.title)}</strong><div class="small text-muted">${escapeHtml(issue.type)}</div></td>
            <td>${escapeHtml(issue.facilityLicense || "-")}</td>
            <td><div>${escapeHtml(issue.details)}</div><div class="small text-muted mt-1">${escapeHtml(issue.recommendation)}</div></td>
            <td>${issue.repair ? `
                <button type="button" class="btn btn-sm btn-outline-success sync-audit-repair" data-issue-id="${escapeHtml(issue.id)}">
                    معاينة الإصلاح
                </button>
            ` : '<span class="text-muted small">مراجعة فقط</span>'}</td>
        </tr>
    `).join("");

    body.querySelectorAll(".sync-audit-repair").forEach(button => {

        button.addEventListener("click", async () => {

            if (button.disabled) return;

            const issue = currentSyncAuditReport.issues.find(item => {

                return item.id === button.dataset.issueId;

            });

            if (!issue || !issue.repair) return;

            const approved = window.confirm([
                "معاينة الإصلاح الآمن:",
                `المنشأة: ${issue.facilityLicense}`,
                `الإسناد: ${issue.assignmentId}`,
                `الزيارة الداعمة: ${issue.visitId}`,
                `الحالة: ${issue.repair.statusBefore} ← completed`,
                "",
                "لن تُعدّل الزيارة أو أي إسناد آخر. هل تريد المتابعة؟"
            ].join("\n"));

            if (!approved) return;

            button.disabled = true;

            try {

                await repairSyncAuditIssue(issue.id);

            } catch (error) {

                console.error("[SyncRecovery] repair failed", { issueId: issue.id, error });
                window.alert("تعذر تنفيذ الإصلاح الآمن. لم تُعرض العملية كناجحة.");

            } finally {

                button.disabled = false;

            }

        });

    });

}


async function runSyncIntegrityAudit(options = {}) {

    const refreshCloud = options.refreshCloud === true;
    let data = getSyncAuditLocalData();

    if (refreshCloud && typeof peekCloudObjectStrict === "function") {

        const [latestStatus, latestAssignments, latestEmployees, latestUsers] = await Promise.all([
            peekCloudObjectStrict("facilityStatus"),
            peekCloudObjectStrict("facilityAssignments"),
            peekCloudObjectStrict("employees"),
            peekCloudObjectStrict("users")
        ]);

        data = {
            facilityStatus: latestStatus,
            facilityAssignments: latestAssignments,
            employees: latestEmployees,
            users: latestUsers
        };

    }

    currentSyncAuditReport = auditSyncIntegrity(data);
    renderSyncAuditReport(currentSyncAuditReport);

    return currentSyncAuditReport;

}


function refreshSyncAuditFromLocalData() {

    if (!currentSyncAuditReport ||
        typeof isAdminUser !== "function" ||
        !isAdminUser()) return;

    runSyncIntegrityAudit().catch(error => {

        console.error("[SyncAudit] local refresh failed", error);

    });

}


async function repairSyncAuditIssue(issueId) {

    if (typeof isAdminUser !== "function" || !isAdminUser()) {

        throw new Error("Only an administrator can repair synchronization issues.");

    }

    const [latestStatus, latestAssignments, latestEmployees, latestUsers] = await Promise.all([
        peekCloudObjectStrict("facilityStatus"),
        peekCloudObjectStrict("facilityAssignments"),
        peekCloudObjectStrict("employees"),
        peekCloudObjectStrict("users")
    ]);
    const latestReport = auditSyncIntegrity({
        facilityStatus: latestStatus,
        facilityAssignments: latestAssignments,
        employees: latestEmployees,
        users: latestUsers
    });
    const issue = latestReport.issues.find(item => item.id === issueId);

    if (!issue || !issue.repair || issue.repair.type !== "complete_assignment") {

        throw new Error("The issue changed or is no longer safely repairable.");

    }

    const repair = issue.repair;
    const assignment = latestAssignments[repair.assignmentKey];

    if (!assignment ||
        String(assignment.id || "") !== repair.assignmentId ||
        String(assignment.facilityLicense || repair.assignmentKey) !== repair.facilityLicense ||
        String(assignment.committeeUsername || "") !== repair.committeeUsername ||
        assignment.status !== repair.statusBefore) {

        throw new Error("The assignment changed before repair.");

    }

    const nextAssignments = {
        ...latestAssignments,
        [repair.assignmentKey]: {
            ...assignment,
            status: "completed"
        }
    };

    console.info("[SyncRecovery] completing verified assignment", {
        facilityId: repair.facilityLicense,
        assignmentId: repair.assignmentId,
        committeeId: repair.committeeUsername,
        visitId: repair.visitId,
        statusBefore: repair.statusBefore,
        statusAfter: "completed"
    });

    const savedAssignments = await mutateCloudCollection(
        "facilityAssignments",
        latestAssignments,
        nextAssignments
    );

    facilityAssignments = typeof normalizeAssignments === "function"
        ? normalizeAssignments(savedAssignments)
        : savedAssignments;

    if (typeof refreshAssignmentViews === "function") {

        refreshAssignmentViews(repair.committeeUsername);

    }

    currentSyncAuditReport = auditSyncIntegrity({
        facilityStatus: latestStatus,
        facilityAssignments: savedAssignments,
        employees: latestEmployees,
        users: latestUsers
    });
    renderSyncAuditReport(currentSyncAuditReport);

    return savedAssignments[repair.assignmentKey];

}


function initializeSyncAuditPanel() {

    if (typeof isAdminUser !== "function" || !isAdminUser()) return;

    const refreshButton = document.getElementById("runSyncAudit");

    if (!refreshButton) return;

    runSyncIntegrityAudit().catch(error => {

        console.error("[SyncAudit] initial audit failed", error);

    });

    refreshButton.addEventListener("click", async () => {

        if (refreshButton.disabled) return;

        refreshButton.disabled = true;
        refreshButton.textContent = "جاري الفحص...";

        try {

            await runSyncIntegrityAudit({ refreshCloud: true });

        } catch (error) {

            console.error("[SyncAudit] refresh failed", error);
            window.alert("تعذر قراءة أحدث بيانات المزامنة. لم يتم تعديل أي سجل.");

        } finally {

            refreshButton.disabled = false;
            refreshButton.innerHTML = '<i class="fa-solid fa-rotate"></i> فحص أحدث البيانات';

        }

    });

}
