let markers = L.markerClusterGroup();

let facilityMarkers = {};

// ========================================
// Markers
// ========================================

function renderMarkers(facilities) {

    facilityMarkers = {};

    markers.clearLayers();

    const bounds = [];

    facilities.forEach(facility => {

        const marker = L.marker([facility.lat, facility.lng]);

        facilityMarkers[String(facility.license)] = marker;

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

    if (!map.hasLayer(markers)) {

    map.addLayer(markers);

}

    if (bounds.length > 0) {

        map.fitBounds(bounds);

    }

    console.log(`تم تحميل ${facilities.length} منشأة`);

}


// ========================================
// Navigation Engine
// ========================================

function goToFacility(facility) {

    const marker = facilityMarkers[String(facility.license)];

    if (!marker) {
        console.error("Marker not found:", facility.license);
        return;
    }

    map.setView(
        [facility.lat, facility.lng],
        16,
        {
            animate: true
        }
    );

    marker.openPopup();

    showFacilityDetails(facility);

}
