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


function toggleDashboardFilter(card) {

    const filterName = card.dataset.filterName;
    const filterValue = card.dataset.filterValue;

    const value = String(activeFilters[filterName]) === filterValue
        ? "all"
        : filterValue;

    setFilter(filterName, value);

    if (value === "all") {

        showDashboardNeutralState();

    } else {

        showFacilityList(filteredFacilities);

    }

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
    const plannedViolationTotal = states.filter(state => state.violation === true).length;
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
