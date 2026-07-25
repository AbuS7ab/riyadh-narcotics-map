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

function normalizeDistrictFilterValue(value) {

    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
        .replace(/[أإآ]/g, "ا")
        .replace(/ى/g, "ي")
        .replace(/ة/g, "ه")
        .replace(/\s+/g, " ");

}


function initializeDistrictFilter(facilities) {

    const districtFilter = document.getElementById("districtFilter");
    const districtOptions = document.getElementById("districtOptions");

    if (!districtFilter || !districtOptions) return;

    const districtsByNormalizedName = new Map();
    const configuredDistricts = Array.isArray(window.RIYADH_DISTRICTS)
        ? window.RIYADH_DISTRICTS
        : [];

    [...configuredDistricts, ...facilities.map(facility => facility.district)]
        .map(value => String(value || "").trim())
        .filter(Boolean)
        .forEach(district => {

            const normalizedDistrict = normalizeDistrictFilterValue(district);

            if (!districtsByNormalizedName.has(normalizedDistrict)) {

                districtsByNormalizedName.set(normalizedDistrict, district);

            }

        });

    const districts = [...districtsByNormalizedName.values()]
        .sort((first, second) => first.localeCompare(second, "ar"));

    districtOptions.innerHTML = "";

    districts.forEach(district => {

        const option = document.createElement("option");

        option.value = district;
        districtOptions.appendChild(option);

    });

    if (districtFilter.dataset.filterInitialized === "true") return;

    districtFilter.dataset.filterInitialized = "true";
    districtFilter.addEventListener("input", function () {

        setFilter("district", this.value.trim() || "all");
        showFacilityList(filteredFacilities, { fitBounds: false });

    });

}


// تحديث فلتر
function setFilter(filterName, value) {

    activeFilters[filterName] = value;

    if (filterName === "visitStatus") {

        const visitStatusFilter =
            document.getElementById("visitStatusFilter");

        visitStatusFilter.value = value;

    }

    if (filterName === "assigned") {

        const assignedFacilitiesFilter =
            document.getElementById("assignedFacilitiesFilter");

        if (assignedFacilitiesFilter) {

            assignedFacilitiesFilter.value = value;

        }

    }

    if (filterName === "district") {

        const districtFilter = document.getElementById("districtFilter");

        if (districtFilter) {

            districtFilter.value = value === "all" ? "" : value;

        }

    }

    applyFilters({ fitBounds: true });

}


// تطبيق الفلاتر
function applyFilters(options = {}) {

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

        if (
            activeFilters.assigned === "assigned" &&
            typeof isFacilityAssignedToCurrentCommittee === "function" &&
            !isFacilityAssignedToCurrentCommittee(facility)
        ) {
            return false;
        }

        if (activeFilters.district !== "all") {

            const districtQuery =
                normalizeDistrictFilterValue(activeFilters.district);
            const facilityDistrict =
                normalizeDistrictFilterValue(facility.district);

            if (!facilityDistrict.includes(districtQuery)) {

                return false;

            }

        }

        return true;

    });

    refreshView();

    if (options.fitBounds && typeof fitFacilityBounds === "function") {

        fitFacilityBounds(filteredFacilities);

    }

}
