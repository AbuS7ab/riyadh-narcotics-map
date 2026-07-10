// ========================================
// Raqeeb Geography Platform
// Version 0.5-alpha
// ========================================

const map = createMap();

let allFacilities = [];

let filteredFacilities = [];

initializeApp();


async function initializeApp() {

    await initializeCloudData();

    initializeFacilityStatusState();

    initializeUserState();

    seedCloudKey("appSettings", loadAppSettings());

    await flushCloudWrites();

    initializeUserInterface();

    loadFacilities();

}


// ========================================
// Create Map
// ========================================

function createMap() {

    const map = L.map("map").setView([24.7136, 46.6753], 10);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap"
    }).addTo(map);

    return map;
}
// ========================================
// Load Facilities
// ========================================

function loadFacilities() {

    fetch("data/facilities.json")
        .then(response => response.json())
        .then(facilities => {

            // إنشاء حالة لكل منشأة
            facilities.forEach(facility => {

                createFacilityStatus(facility.license);

            });

            allFacilities = getAccessibleFacilities(facilities);

filteredFacilities = [...allFacilities];

            refreshView();

            renderAssignmentBoard(allFacilities);

            initializeSearch();

            if (isCommitteeUser()) {

                showFacilityList(getAssignedFacilitiesForCurrentUser(allFacilities));

            }

            const visitStatusFilter = document.getElementById("visitStatusFilter");

visitStatusFilter.addEventListener("change", function () {

    setFilter("visitStatus", this.value);

});

            const assignedFacilitiesFilter =
                document.getElementById("assignedFacilitiesFilter");

            if (assignedFacilitiesFilter) {

                assignedFacilitiesFilter.addEventListener("change", function () {

                    setFilter("assigned", this.value);

                    if (isCommitteeUser()) {

                        showFacilityList(filteredFacilities);

                    }

                });

            }

        })
        .catch(error => console.error(error));

}

function refreshView() {

    updateDashboard(allFacilities);

    renderCommitteeAssignmentCards();

    renderMarkers(filteredFacilities);

}
