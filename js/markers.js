let markers = L.markerClusterGroup();

let facilityMarkers = {};

// ========================================
// Markers
// ========================================

function renderMarkers(facilities) {

    facilityMarkers = {};

    markers.clearLayers();

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

    });

    if (!map.hasLayer(markers)) {

        map.addLayer(markers);

    }

    map.invalidateSize(true);

    console.log(`تم تحميل ${facilities.length} منشأة`);

}


function fitFacilityBounds(facilities) {

    if (!Array.isArray(facilities) || facilities.length === 0) {

        map.invalidateSize(true);
        map.setView(CONFIG.map.center, CONFIG.map.zoom);

        return;

    }

    const bounds = facilities
        .filter(facility => Number.isFinite(Number(facility.lat)) &&
            Number.isFinite(Number(facility.lng)))
        .map(facility => [Number(facility.lat), Number(facility.lng)]);

    if (bounds.length === 0) {

        map.invalidateSize(true);
        map.setView(CONFIG.map.center, CONFIG.map.zoom);

        return;

    }

    const latitudes = bounds.map(point => point[0]);
    const longitudes = bounds.map(point => point[1]);
    const latitudeSpan = Math.max(...latitudes) - Math.min(...latitudes);
    const longitudeSpan = Math.max(...longitudes) - Math.min(...longitudes);

    map.invalidateSize(true);

    if (latitudeSpan > 2 || longitudeSpan > 2) {

        map.setView(CONFIG.map.center, CONFIG.map.zoom);

        return;

    }

    if (bounds.length === 1) {

        map.flyTo(bounds[0], 16);

        return;

    }

    map.fitBounds(bounds, {
        maxZoom: 15,
        padding: [28, 28]
    });

}


// ========================================
// Navigation Engine
// ========================================

function goToFacility(facility) {

    const marker = facilityMarkers[String(facility.license)];

    if (!marker) {

        renderMarkers([facility]);

    }

    const targetMarker = facilityMarkers[String(facility.license)];
    const targetLocation = [Number(facility.lat), Number(facility.lng)];

    map.invalidateSize(true);

    map.flyTo(targetLocation, 16);

    if (targetMarker && markers.zoomToShowLayer) {

        markers.zoomToShowLayer(targetMarker, () => {

            targetMarker.openPopup();

        });

    } else if (targetMarker) {

        targetMarker.openPopup();

    }

    showFacilityDetails(facility);

}
