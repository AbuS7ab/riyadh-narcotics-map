// ========================================
// Raqeeb Geography Platform
// Version 0.5-alpha
// ========================================

const map = createMap();

let allFacilities = [];

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

            updateDashboard(facilities);

            renderMarkers(facilities);

            initializeSearch();

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


// ========================================
// Markers
// ========================================

function renderMarkers(facilities) {

      const markers = L.markerClusterGroup();
      
    const bounds = [];

    facilities.forEach(facility => {

        const marker =
            L.marker([facility.lat, facility.lng]);

            markers.addLayer(marker);

        marker.bindPopup(`
            <b>${facility.name}</b><br>
            ${facility.type}<br>
            ${facility.district}
        `);

        marker.on("click", () => {

            showFacilityDetails(facility);

        });

        bounds.push([facility.lat, facility.lng]);

    });

    map.addLayer(markers);
    
    map.fitBounds(bounds);

    console.log(`تم تحميل ${facilities.length} منشأة`);

}


// ========================================
// Facility Details
// ========================================

function showFacilityDetails(facility) {

    const details =
        document.querySelector(".card-body");

    details.innerHTML = `

        <p><strong>🏥 الاسم:</strong> ${facility.name}</p>

        <p><strong>🏢 النوع:</strong> ${facility.type}</p>

        <p><strong>📍 الحي:</strong> ${facility.district}</p>

        <p><strong>🛣️ الشارع:</strong> ${facility.street}</p>

        <p><strong>📄 الترخيص:</strong> ${facility.license}</p>

        <a
            href="${facility.google_maps}"
            target="_blank"
            class="btn btn-success w-100 mt-3">

            فتح في Google Maps

        </a>

    `;

}