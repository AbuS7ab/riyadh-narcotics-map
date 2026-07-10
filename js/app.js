// ========================================
// Raqeeb Geography Platform
// Version 0.5-alpha
// ========================================

let map = null;

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

    if (!isAdminUser() && !isCommitteeUser()) return;

    await initializeMapWhenVisible();

    loadFacilities();

}


// ========================================
// Create Map
// ========================================

function createMap() {

    const map = L.map("map");

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap"
    }).addTo(map);

    return map;
}


function initializeMapWhenVisible() {

    return new Promise(resolve => {

        const waitForVisibleMap = () => {

            const mapContainer = document.getElementById("map");

            if (!mapContainer ||
                mapContainer.offsetWidth === 0 ||
                mapContainer.offsetHeight === 0) {

                requestAnimationFrame(waitForVisibleMap);

                return;

            }

            map = createMap();

            map.invalidateSize(true);
            map.setView(CONFIG.map.center, CONFIG.map.zoom);

            setTimeout(() => {

                map.invalidateSize(true);
                map.setView(CONFIG.map.center, CONFIG.map.zoom);

            }, 250);

            resolve();

        };

        requestAnimationFrame(waitForVisibleMap);

    });

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

                showFacilityList(
                    getAssignedFacilitiesForCurrentUser(allFacilities),
                    { fitBounds: false }
                );

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
