// ========================================
// Filter Engine
// ========================================

// الفلاتر الحالية
const activeFilters = {

    visitStatus: "all",

    violation: "all",

    assigned: "all",

    district: "all",

    visitDateFrom: "",

    visitDateTo: "",

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


function getNormalizedVisitDate(value) {

    const normalizedValue = String(value || "").slice(0, 10);

    return /^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)
        ? normalizedValue
        : "";

}


function visitMatchesDateRange(visit, dateFrom, dateTo) {

    const visitDate = getNormalizedVisitDate(visit && visit.date);

    if (!visitDate) return false;
    if (dateFrom && visitDate < dateFrom) return false;
    if (dateTo && visitDate > dateTo) return false;

    return true;

}


function facilityHasVisitInDateRange(license, dateFrom, dateTo) {

    const visits = typeof getFacilityVisits === "function"
        ? getFacilityVisits(license)
        : [];

    return visits.some(visit => {

        return visitMatchesDateRange(visit, dateFrom, dateTo);

    });

}


function initializeVisitDateFilter() {

    const dateFromInput = document.getElementById("visitDateFromFilter");
    const dateToInput = document.getElementById("visitDateToFilter");
    const clearButton = document.getElementById("clearVisitDateFilter");
    const errorMessage = document.getElementById("visitDateRangeError");

    if (!dateFromInput || !dateToInput || !clearButton || !errorMessage) return;

    const today = typeof getCurrentLocalDateValue === "function"
        ? getCurrentLocalDateValue()
        : "";

    if (today) {

        dateFromInput.max = today;
        dateToInput.max = today;

    }

    if (dateFromInput.dataset.filterInitialized === "true") return;

    dateFromInput.dataset.filterInitialized = "true";
    dateToInput.dataset.filterInitialized = "true";

    const updateDateRange = () => {

        const dateFrom = getNormalizedVisitDate(dateFromInput.value);
        const dateTo = getNormalizedVisitDate(dateToInput.value);
        const isInvalidRange = Boolean(dateFrom && dateTo && dateFrom > dateTo);

        activeFilters.visitDateFrom = dateFrom;
        activeFilters.visitDateTo = dateTo;

        dateFromInput.setAttribute("aria-invalid", String(isInvalidRange));
        dateToInput.setAttribute("aria-invalid", String(isInvalidRange));
        errorMessage.classList.toggle("d-none", !isInvalidRange);
        clearButton.classList.toggle("d-none", !dateFrom && !dateTo);

        applyFilters({ fitBounds: !isInvalidRange });
        showFacilityList(filteredFacilities, { fitBounds: false });

    };

    dateFromInput.addEventListener("change", updateDateRange);
    dateToInput.addEventListener("change", updateDateRange);

    clearButton.addEventListener("click", () => {

        dateFromInput.value = "";
        dateToInput.value = "";
        updateDateRange();

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

    const dateFrom = getNormalizedVisitDate(activeFilters.visitDateFrom);
    const dateTo = getNormalizedVisitDate(activeFilters.visitDateTo);
    const hasDateFilter = Boolean(dateFrom || dateTo);
    const hasInvalidDateRange = Boolean(dateFrom && dateTo && dateFrom > dateTo);

    filteredFacilities = allFacilities.filter(facility => {

        if (hasInvalidDateRange) {

            return false;

        }

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

        if (
            hasDateFilter &&
            !facilityHasVisitInDateRange(facility.license, dateFrom, dateTo)
        ) {

            return false;

        }

        return true;

    });

    refreshView();

    if (options.fitBounds && typeof fitFacilityBounds === "function") {

        fitFacilityBounds(filteredFacilities);

    }

}
