// ========================================
// Raqeeb Geography Platform
// Version 0.5-alpha
// ========================================

const map = createMap();

let allFacilities = [];

let filteredFacilities = [];

loadFacilities();


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

            allFacilities = facilities;

filteredFacilities = [...facilities];

            // إنشاء حالة لكل منشأة
            facilities.forEach(facility => {

                createFacilityStatus(facility.license);

            });

            refreshView();

            initializeSearch();

            const visitStatusFilter = document.getElementById("visitStatusFilter");

visitStatusFilter.addEventListener("change", function () {

    setFilter("visitStatus", this.value);

});

        })
        .catch(error => console.error(error));

}

function refreshView() {

    updateDashboard(filteredFacilities);

    renderMarkers(filteredFacilities);

}
