// ========================================
// Filter Engine
// ========================================

// الفلاتر الحالية
const activeFilters = {

    visitStatus: "all",

    violation: "all",

    assigned: "all",

    district: "all",

    type: "all"

};


// تحديث فلتر
function setFilter(filterName, value) {

    activeFilters[filterName] = value;

    if (filterName === "visitStatus") {

        const visitStatusFilter =
            document.getElementById("visitStatusFilter");

        visitStatusFilter.value = value;

    }

    applyFilters();

}


// تطبيق الفلاتر
function applyFilters() {

    filteredFacilities = allFacilities.filter(facility => {

        const state = getFacilityStatus(facility.license);

        if (
            activeFilters.visitStatus !== "all" &&
            state.visitStatus !== activeFilters.visitStatus
        ) {
            return false;
        }

        if (
            activeFilters.violation !== "all" &&
            String(state.violation) !== String(activeFilters.violation)
        ) {
            return false;
        }

        return true;

    });

    refreshView();

}
