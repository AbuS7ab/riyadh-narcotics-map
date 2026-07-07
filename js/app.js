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

            updateDashboard(facilities);

            renderMarkers(facilities);

            initializeSearch();

            const visitStatusFilter = document.getElementById("visitStatusFilter");

visitStatusFilter.addEventListener("change", function () {

    setFilter("visitStatus", this.value);

});

        })
        .catch(error => console.error(error));

}

// ========================================
// Dashboard
// ========================================

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

}
