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

        return true;

    });

    refreshView();

}
