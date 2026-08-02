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


function updateDashboard(facilities) {

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
    const plannedVisitTotal = states.reduce((total, state) => {

        return total + (Array.isArray(state.visits) ? state.visits.length : 0);

    }, 0);
    const plannedViolationTotal = facilities.filter(facility => {

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
    document.getElementById("visitPlanBreakdown").textContent = "زيارات الخطة";

    document.getElementById("violationCount").textContent = plannedViolationTotal;
    document.getElementById("violationPlanBreakdown").textContent = "مخالفات الخطة";
    document.getElementById("externalMissionsTotal").textContent = externalStats.total;
    document.getElementById("externalMissionsCompleted").textContent = externalStats.completed;
    document.getElementById("externalMissionsInProgress").textContent = externalStats.inProgress;
    document.getElementById("externalMissionsCancelled").textContent = externalStats.cancelled;
    document.getElementById("externalMissionsViolating").textContent = externalStats.violations;

    if (typeof getViolationActionStats === "function") {

        const violationActionStats = getViolationActionStats(facilities);

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
