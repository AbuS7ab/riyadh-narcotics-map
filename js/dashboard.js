// ========================================
// Dashboard
// ========================================

const operationalKpiCards =
    document.querySelectorAll(".operational-kpi");

operationalKpiCards.forEach(card => {

    card.addEventListener("click", function () {

        toggleDashboardFilter(this);

    });

    card.addEventListener("keydown", function (event) {

        if (event.key === "Enter" || event.key === " ") {

            event.preventDefault();
            toggleDashboardFilter(this);

        }

    });

});

const violationStatCards =
    document.querySelectorAll("[data-violation-action-filter]");

violationStatCards.forEach(card => {

    card.addEventListener("click", () => {

        const selectedFilter = card.dataset.violationActionFilter;
        const nextFilter =
            activeFilters.violationAction === selectedFilter &&
            selectedFilter !== "all"
                ? "all"
                : selectedFilter;

        setFilter("violationAction", nextFilter);
        showFacilityList(filteredFacilities);

    });

});


function toggleDashboardFilter(card) {

    const filterName = card.dataset.filterName;
    const filterValue = card.dataset.filterValue;

    const wasActive =
        String(activeFilters[filterName]) === filterValue;

    resetOperationalKpiFilters();

    const value = wasActive ? "all" : filterValue;

    setFilter(filterName, value);

    if (filterName === "violation") {

        setViolationActionStatisticsVisibility(value !== "all");

        if (value === "all") {

            activeFilters.violationAction = "all";
            applyFilters({ fitBounds: true });

        }

    }

    if (value === "all") {

        showDashboardNeutralState();

    } else {

        showFacilityList(filteredFacilities);

    }

}


function resetOperationalKpiFilters() {

    operationalKpiCards.forEach(card => {

        activeFilters[card.dataset.filterName] = "all";

    });

    activeFilters.violationAction = "all";

    const visitStatusFilter =
        document.getElementById("visitStatusFilter");

    if (visitStatusFilter) {

        visitStatusFilter.value = "all";

    }

    setViolationActionStatisticsVisibility(false);

}


function setViolationActionStatisticsVisibility(isVisible) {

    const statistics =
        document.getElementById("violationActionStatistics");
    const violationCard =
        document.querySelector(".kpi-violation");

    if (!statistics || !violationCard) return;

    statistics.classList.toggle("d-none", !isVisible);
    statistics.setAttribute("aria-hidden", String(!isVisible));
    violationCard.setAttribute("aria-expanded", String(isVisible));
    violationCard.classList.toggle(
        "violation-statistics-expanded",
        isVisible
    );

}


function updateDashboardFilterState() {

    operationalKpiCards.forEach(card => {

        const isActive =
            String(activeFilters[card.dataset.filterName]) ===
            card.dataset.filterValue;

        card.classList.toggle("border", isActive);
        card.classList.toggle("border-primary", isActive);
        card.classList.toggle("border-3", isActive);
        card.setAttribute("aria-pressed", String(isActive));

    });

    violationStatCards.forEach(card => {

        const isActive =
            activeFilters.violationAction ===
            card.dataset.violationActionFilter;

        card.classList.toggle("active", isActive);
        card.setAttribute("aria-pressed", String(isActive));

    });

}


const dashboardBaselineCyclePrefix = "baseline:";
let selectedDashboardYear = "";
let selectedDashboardCycleId = "";
let dashboardPeriodFacilities = [];


function getDashboardPeriodicCycles() {

    if (typeof getPeriodicVisitPlan !== "function") return [];

    const plan = getPeriodicVisitPlan();

    return plan && Array.isArray(plan.cycles)
        ? plan.cycles.filter(cycle => cycle && cycle.id)
        : [];

}


function getDashboardPeriodYear(value) {

    const match = String(value || "").match(/^(\d{4})/);

    return match ? match[1] : "";

}


function getDashboardCycleYear(cycle) {

    return getDashboardPeriodYear(
        cycle && (
            cycle.startedAt ||
            cycle.completedAt ||
            cycle.closedAt
        )
    );

}


function getDashboardCyclesForYear(year) {

    return getDashboardPeriodicCycles()
        .filter(cycle => getDashboardCycleYear(cycle) === String(year))
        .sort((first, second) => {

            const startedAtDifference =
                new Date(first.startedAt || 0) -
                new Date(second.startedAt || 0);

            if (startedAtDifference !== 0) return startedAtDifference;

            return (Number(first.sequence) || 0) -
                (Number(second.sequence) || 0);

        });

}


function getDashboardVisitYear(visit) {

    const value = visit && (
        visit.date ||
        visit.visitDate ||
        visit.completedAt ||
        visit.createdAt
    );

    return getDashboardPeriodYear(value);

}


function isDashboardBaselineVisit(visit, year) {

    return Boolean(
        visit &&
        !visit.visitCycleId &&
        visit.visitType !== "reactive" &&
        getDashboardVisitYear(visit) === String(year || "")
    );

}


function getSelectedDashboardCycleScope() {

    if (!selectedDashboardYear || !selectedDashboardCycleId) return null;

    if (selectedDashboardCycleId.startsWith(dashboardBaselineCyclePrefix)) {

        return {
            type: "baseline",
            year: selectedDashboardYear,
            id: selectedDashboardCycleId,
            cycle: null
        };

    }

    const yearCycles = getDashboardCyclesForYear(selectedDashboardYear);
    const cycleIndex = yearCycles.findIndex(candidate => {

        return String(candidate.id) === selectedDashboardCycleId;

    });
    const cycle = cycleIndex >= 0 ? yearCycles[cycleIndex] : null;

    return cycle
        ? {
            type: "cycle",
            year: selectedDashboardYear,
            id: String(cycle.id),
            cycle,
            yearSequence: cycleIndex + 1
        }
        : null;

}


function setDashboardCycleSelection(year = "", cycleId = "") {

    selectedDashboardYear = String(year || "");
    selectedDashboardCycleId = String(cycleId || "");

    return getSelectedDashboardCycleScope();

}


function dashboardVisitMatchesCycleScope(
    visit,
    scope = getSelectedDashboardCycleScope()
) {

    if (!scope) return true;

    if (scope.type === "baseline") {

        return isDashboardBaselineVisit(visit, scope.year);

    }

    return String(visit && visit.visitCycleId || "") === scope.id;

}


function getDashboardCycleVisits(
    license,
    scope = getSelectedDashboardCycleScope()
) {

    if (!scope || typeof getFacilityVisits !== "function") return [];

    return getFacilityVisits(license).filter(visit => {

        return dashboardVisitMatchesCycleScope(visit, scope);

    });

}


function getDashboardVisitOperationalStatus(visit) {

    if (!visit) return "pending";

    if (visit.result === "incomplete" || visit.visitStatus === "partial") {

        return "partial";

    }

    if (visit.visitStatus === "pending") return "pending";

    if (["no_violation", "violation"].includes(visit.result) ||
        visit.visitStatus === "visited") {

        return "visited";

    }

    return "pending";

}


function getDashboardFacilityCycleState(
    license,
    scope = getSelectedDashboardCycleScope()
) {

    if (!scope) {

        return typeof getFacilityStatus === "function"
            ? getFacilityStatus(license)
            : { visitStatus: "pending", violation: false, visits: [] };

    }

    const visits = getDashboardCycleVisits(license, scope);
    const latestVisit = visits[0] || null;

    return {
        visitStatus: getDashboardVisitOperationalStatus(latestVisit),
        violation: visits.some(visit => {

            return typeof visitIndicatesViolation === "function"
                ? visitIndicatesViolation(visit)
                : visit && (
                    visit.result === "violation" ||
                    visit.violation === true
                );

        }),
        visits
    };

}


function getDashboardScopeFacilityLicenses(facilities, scope) {

    if (scope && scope.type === "cycle" && scope.cycle) {

        return new Set(
            Array.isArray(scope.cycle.facilityLicenses)
                ? scope.cycle.facilityLicenses.map(String)
                : []
        );

    }

    return new Set(facilities.map(facility => String(facility.license)));

}


function getDashboardScopeFacilities(
    facilities,
    scope = getSelectedDashboardCycleScope()
) {

    if (!scope || scope.type === "baseline") return [...facilities];

    const licenses = getDashboardScopeFacilityLicenses(facilities, scope);

    return facilities.filter(facility => {

        return licenses.has(String(facility.license));

    });

}


function getDashboardScopeFacilityObjects(facilities, scope) {

    const facilityByLicense = new Map(facilities.map(facility => [
        String(facility.license),
        facility
    ]));
    const licenses = getDashboardScopeFacilityLicenses(facilities, scope);

    return [...licenses].map(license => {

        if (facilityByLicense.has(license)) return facilityByLicense.get(license);

        if (typeof findFacilityByOriginalLicense === "function") {

            return findFacilityByOriginalLicense(license) || {
                license,
                type: ""
            };

        }

        return { license, type: "" };

    });

}


function getDashboardCycleMetrics(facilities, scope) {

    const licenses = getDashboardScopeFacilityLicenses(facilities, scope);
    const states = [...licenses].map(license => {

        return getDashboardFacilityCycleState(license, scope);

    });
    const visited = states.filter(state => {

        return state.visitStatus === "visited";

    }).length;
    const total = licenses.size;

    return {
        total,
        pending: states.filter(state => {

            return state.visitStatus === "pending";

        }).length,
        visited,
        partial: states.filter(state => {

            return state.visitStatus === "partial";

        }).length,
        violations: states.filter(state => state.violation).length,
        completionRate: total > 0
            ? Math.round((visited / total) * 100)
            : 0
    };

}


function getDashboardAvailableYears(facilities) {

    const years = new Set();

    getDashboardPeriodicCycles().forEach(cycle => {

        const year = getDashboardCycleYear(cycle);

        if (year) years.add(year);

    });

    facilities.forEach(facility => {

        if (typeof getFacilityVisits !== "function") return;

        getFacilityVisits(facility.license).forEach(visit => {

            if (visit.visitType === "reactive") return;

            const year = getDashboardVisitYear(visit);

            if (year) years.add(year);

        });

    });

    if (years.size === 0) {

        years.add(String(new Date().getFullYear()));

    }

    return [...years].sort((first, second) => Number(second) - Number(first));

}


function getDashboardYearCycleOptions(year, facilities) {

    const options = getDashboardCyclesForYear(year)
        .map((cycle, index) => ({
            id: String(cycle.id),
            type: "cycle",
            cycle,
            yearSequence: index + 1
        }));
    const hasBaselineVisits = facilities.some(facility => {

        if (typeof getFacilityVisits !== "function") return false;

        return getFacilityVisits(facility.license).some(visit => {

            return isDashboardBaselineVisit(visit, year);

        });

    });

    if (hasBaselineVisits) {

        options.unshift({
            id: `${dashboardBaselineCyclePrefix}${year}`,
            type: "baseline",
            cycle: null
        });

    }

    return options;

}


function formatDashboardPeriodNumber(value) {

    try {

        return new Intl.NumberFormat("ar-SA", {
            useGrouping: false
        }).format(Number(value));

    } catch (error) {

        return String(value || "");

    }

}


function escapeDashboardPeriodHtml(value) {

    if (typeof escapeHtml === "function") return escapeHtml(String(value || ""));

    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

}


function getDashboardCycleStatusLabel(cycle) {

    if (!cycle) return "";
    if (cycle.status === "active") return "الحالية";
    if (cycle.status === "completed") return "مكتملة";
    if (cycle.status === "closed") return "مغلقة إداريًا";

    return "محفوظة";

}


function getDashboardCycleOptionLabel(option) {

    if (option.type === "baseline") return "التغطية الأولى — تاريخية";

    const sequence = formatDashboardPeriodNumber(
        option.yearSequence || option.cycle && option.cycle.sequence
    );

    return `الدورة ${sequence} — ${getDashboardCycleStatusLabel(option.cycle)}`;

}


function updateDashboardPeriodDescription() {

    const description = document.getElementById("dashboardPeriodDescription");
    const badge = document.getElementById("dashboardPeriodBadge");

    if (!description || !badge) return;

    const scope = getSelectedDashboardCycleScope();

    if (!selectedDashboardYear) {

        description.textContent =
            "تعرض البطاقات نفس الإحصائيات التراكمية الحالية دون تغيير.";
        badge.textContent = "تراكمي";
        badge.className = "dashboard-period-badge is-cumulative";

        return;

    }

    if (!scope) {

        description.textContent =
            `لا توجد دورة محفوظة في سنة ${formatDashboardPeriodNumber(selectedDashboardYear)}.`;
        badge.textContent = "بدون دورة";
        badge.className = "dashboard-period-badge is-cumulative";

        return;

    }

    if (scope.type === "baseline") {

        description.textContent =
            `زيارات سنة ${formatDashboardPeriodNumber(scope.year)} غير المرتبطة بدورة دورية محفوظة.`;
        badge.textContent = "التغطية الأولى";
        badge.className = "dashboard-period-badge";

        return;

    }

    const mode = scope.cycle.availabilityMode === "all"
        ? "إتاحة فورية"
        : `استحقاق بعد ${scope.cycle.minimumIntervalDays || 75} يومًا`;

    description.textContent =
        `سنة ${formatDashboardPeriodNumber(scope.year)} · ${getDashboardCycleOptionLabel({
            type: "cycle",
            cycle: scope.cycle,
            yearSequence: scope.yearSequence
        })} · ${mode}.`;
    badge.textContent = getDashboardCycleStatusLabel(scope.cycle);
    badge.className = "dashboard-period-badge";

}


function chooseDefaultDashboardCycle(options) {

    const activeOption = options.find(option => {

        return option.type === "cycle" && option.cycle.status === "active";

    });

    if (activeOption) return activeOption.id;

    const cycleOptions = options.filter(option => option.type === "cycle");

    if (cycleOptions.length > 0) {

        return cycleOptions[cycleOptions.length - 1].id;

    }

    return options[0] ? options[0].id : "";

}


function renderDashboardCycleSelect(facilities, preferredCycleId = "") {

    const cycleSelect = document.getElementById("dashboardCycleSelect");

    if (!cycleSelect) return;

    if (!selectedDashboardYear) {

        selectedDashboardCycleId = "";
        cycleSelect.innerHTML =
            '<option value="">جميع البيانات الحالية</option>';
        cycleSelect.disabled = true;

        return;

    }

    const options = getDashboardYearCycleOptions(
        selectedDashboardYear,
        facilities
    );
    const optionIds = new Set(options.map(option => option.id));
    const selectedId = optionIds.has(String(preferredCycleId || ""))
        ? String(preferredCycleId)
        : chooseDefaultDashboardCycle(options);

    selectedDashboardCycleId = selectedId;
    cycleSelect.disabled = options.length === 0;
    cycleSelect.innerHTML = options.length > 0
        ? options.map(option => `
            <option value="${escapeDashboardPeriodHtml(option.id)}">
                ${escapeDashboardPeriodHtml(getDashboardCycleOptionLabel(option))}
            </option>
        `).join("")
        : '<option value="">لا توجد دورات محفوظة</option>';
    cycleSelect.value = selectedId;

}


function refreshDashboardCycleSelection() {

    if (typeof resetOperationalKpiFilters === "function") {

        resetOperationalKpiFilters();

    }

    updateDashboardPeriodDescription();

    if (typeof applyFilters === "function") {

        applyFilters({ fitBounds: true });

    } else if (typeof allFacilities !== "undefined") {

        updateDashboard(allFacilities);

    }

    if (typeof showDashboardNeutralState === "function") {

        showDashboardNeutralState();

    }

}


function initializeDashboardCycleSelectors(facilities) {

    const yearSelect = document.getElementById("dashboardYearSelect");
    const cycleSelect = document.getElementById("dashboardCycleSelect");

    if (!yearSelect || !cycleSelect) return;

    dashboardPeriodFacilities = Array.isArray(facilities)
        ? [...facilities]
        : [];

    const years = getDashboardAvailableYears(dashboardPeriodFacilities);

    if (selectedDashboardYear && !years.includes(selectedDashboardYear)) {

        selectedDashboardYear = "";
        selectedDashboardCycleId = "";

    }

    yearSelect.innerHTML = `
        <option value="">الإجمالي الحالي — تراكمي</option>
        ${years.map(year => `
            <option value="${year}">
                ${formatDashboardPeriodNumber(year)}
            </option>
        `).join("")}
    `;
    yearSelect.value = selectedDashboardYear;
    renderDashboardCycleSelect(
        dashboardPeriodFacilities,
        selectedDashboardCycleId
    );
    updateDashboardPeriodDescription();

    if (yearSelect.dataset.dashboardPeriodInitialized === "true") return;

    yearSelect.dataset.dashboardPeriodInitialized = "true";
    cycleSelect.dataset.dashboardPeriodInitialized = "true";

    yearSelect.addEventListener("change", () => {

        selectedDashboardYear = yearSelect.value;
        selectedDashboardCycleId = "";
        renderDashboardCycleSelect(dashboardPeriodFacilities);
        refreshDashboardCycleSelection();

    });

    cycleSelect.addEventListener("change", () => {

        selectedDashboardCycleId = cycleSelect.value;
        refreshDashboardCycleSelection();

    });

}


function updateCycleScopedDashboard(facilities, scope) {

    const metrics = getDashboardCycleMetrics(facilities, scope);
    const scopeFacilities = getDashboardScopeFacilityObjects(facilities, scope);
    const hospitals = scopeFacilities.filter(facility => {

        return String(facility.type || "").includes("مستشفى");

    }).length;
    const pharmacies = scopeFacilities.filter(facility => {

        return String(facility.type || "").includes("صيدلية");

    }).length;
    const medicalCenters = scopeFacilities.filter(facility => {

        return String(facility.type || "").includes("مجمع");

    }).length;
    const phc = scopeFacilities.filter(facility => {

        return String(facility.type || "").includes("رعاية");

    }).length;
    const ambulance = scopeFacilities.filter(facility => {

        return String(facility.type || "").includes("إسعاف");

    }).length;
    const others = Math.max(
        metrics.total -
        hospitals -
        pharmacies -
        medicalCenters -
        phc -
        ambulance,
        0
    );

    document.getElementById("totalCount").textContent = metrics.total;
    document.getElementById("hospitalCount").textContent = hospitals;
    document.getElementById("pharmacyCount").textContent = pharmacies;
    document.getElementById("medicalCenterCount").textContent = medicalCenters;
    document.getElementById("phcCount").textContent = phc;
    document.getElementById("ambulanceCount").textContent = ambulance;
    document.getElementById("otherCount").textContent = others;
    document.getElementById("pendingCount").textContent = metrics.pending;
    document.getElementById("visitedCount").textContent = metrics.visited;
    document.getElementById("partialCount").textContent = metrics.partial;
    document.getElementById("violationCount").textContent = metrics.violations;
    document.getElementById("completionRate").textContent =
        `${metrics.completionRate}%`;
    document.getElementById("visitPlanBreakdown").textContent =
        "منشآت الدورة المحددة";
    document.getElementById("violationPlanBreakdown").textContent =
        "مخالفات الدورة المحددة";

    const externalStats = typeof getExternalVisitStats === "function"
        ? getExternalVisitStats()
        : { total: 0, violations: 0, completed: 0, inProgress: 0, cancelled: 0 };

    document.getElementById("externalMissionsTotal").textContent = externalStats.total;
    document.getElementById("externalMissionsCompleted").textContent = externalStats.completed;
    document.getElementById("externalMissionsInProgress").textContent = externalStats.inProgress;
    document.getElementById("externalMissionsCancelled").textContent = externalStats.cancelled;
    document.getElementById("externalMissionsViolating").textContent = externalStats.violations;

    if (typeof getViolationActionStats === "function") {

        const violationActionStats = getViolationActionStats(
            scopeFacilities,
            "",
            "",
            visit => dashboardVisitMatchesCycleScope(visit, scope)
        );

        document.getElementById("violationActionsTotal").textContent =
            violationActionStats.total;
        document.getElementById("violationActionsFollowUp").textContent =
            violationActionStats.underFollowUp;
        document.getElementById("violationActionsReferred").textContent =
            violationActionStats.referred;
        document.getElementById("violationActionsCorrected").textContent =
            violationActionStats.corrected;
        document.getElementById("violationActionsResolutionRate").textContent =
            `${violationActionStats.resolutionRate}%`;

    }

    updateDashboardFilterState();

}


function updateDashboard(facilities) {

    const dashboardCycleScope = getSelectedDashboardCycleScope();

    if (dashboardCycleScope) {

        updateCycleScopedDashboard(facilities, dashboardCycleScope);

        return;

    }

    document.getElementById("totalCount").textContent = facilities.length;

    const hospitals =
        facilities.filter(f => f.type.includes("مستشفى")).length;

    const pharmacies =
        facilities.filter(f => f.type.includes("صيدلية")).length;

    const medicalCenters =
        facilities.filter(f => f.type.includes("مجمع")).length;

    const phc =
        facilities.filter(f => f.type.includes("رعاية")).length;

    const ambulance =
        facilities.filter(f => f.type.includes("إسعاف")).length;

    const others =
        facilities.length -
        hospitals -
        pharmacies -
        medicalCenters -
        phc -
        ambulance;

    document.getElementById("hospitalCount").textContent = hospitals;
    document.getElementById("pharmacyCount").textContent = pharmacies;
    document.getElementById("medicalCenterCount").textContent = medicalCenters;
    document.getElementById("phcCount").textContent = phc;
    document.getElementById("ambulanceCount").textContent = ambulance;
    document.getElementById("otherCount").textContent = others;

    const states = facilities.map(f => getFacilityStatus(f.license));
    const dateFrom = typeof getNormalizedVisitDate === "function"
        ? getNormalizedVisitDate(activeFilters.visitDateFrom)
        : "";
    const dateTo = typeof getNormalizedVisitDate === "function"
        ? getNormalizedVisitDate(activeFilters.visitDateTo)
        : "";
    const hasDateFilter = Boolean(dateFrom || dateTo);
    const plannedVisits = states.flatMap(state => {

        return Array.isArray(state.visits) ? state.visits : [];

    }).filter(visit => {

        return !hasDateFilter || (
            typeof visitMatchesDateRange === "function" &&
            visitMatchesDateRange(visit, dateFrom, dateTo)
        );

    });
    const plannedVisitTotal = plannedVisits.length;
    const plannedViolationTotal = hasDateFilter
        ? plannedVisits.filter(visit => {

            return typeof visitIndicatesViolation === "function"
                ? visitIndicatesViolation(visit)
                : Boolean(visit.violation);

        }).length
        : facilities.filter(facility => {

            if (typeof facilityHasViolationRecord === "function") {

                return facilityHasViolationRecord(facility.license);

            }

            return getFacilityStatus(facility.license).violation === true;

        }).length;
    const externalStats = typeof getExternalVisitStats === "function"
        ? getExternalVisitStats()
        : { total: 0, violations: 0, completed: 0, inProgress: 0, cancelled: 0 };

    const visited =
        states.filter(state => state.visitStatus === "visited").length;

    document.getElementById("visitedCount").textContent = plannedVisitTotal;
    document.getElementById("visitPlanBreakdown").textContent = hasDateFilter
        ? "زيارات الفترة المحددة"
        : "زيارات الخطة";

    document.getElementById("violationCount").textContent = plannedViolationTotal;
    document.getElementById("violationPlanBreakdown").textContent = hasDateFilter
        ? "مخالفات الفترة المحددة"
        : "مخالفات الخطة";
    document.getElementById("externalMissionsTotal").textContent = externalStats.total;
    document.getElementById("externalMissionsCompleted").textContent = externalStats.completed;
    document.getElementById("externalMissionsInProgress").textContent = externalStats.inProgress;
    document.getElementById("externalMissionsCancelled").textContent = externalStats.cancelled;
    document.getElementById("externalMissionsViolating").textContent = externalStats.violations;

    if (typeof getViolationActionStats === "function") {

        const violationActionStats = getViolationActionStats(
            facilities,
            dateFrom,
            dateTo
        );

        document.getElementById("violationActionsTotal").textContent =
            violationActionStats.total;
        document.getElementById("violationActionsFollowUp").textContent =
            violationActionStats.underFollowUp;
        document.getElementById("violationActionsReferred").textContent =
            violationActionStats.referred;
        document.getElementById("violationActionsCorrected").textContent =
            violationActionStats.corrected;
        document.getElementById("violationActionsResolutionRate").textContent =
            `${violationActionStats.resolutionRate}%`;

    }

    document.getElementById("pendingCount").textContent =
        states.filter(state => state.visitStatus === "pending").length;

    document.getElementById("partialCount").textContent =
        states.filter(state => state.visitStatus === "partial").length;

    const completionRate = facilities.length > 0
        ? Math.round((visited / facilities.length) * 100)
        : 0;

    document.getElementById("completionRate").textContent =
        `${completionRate}%`;

    updateDashboardFilterState();

}
