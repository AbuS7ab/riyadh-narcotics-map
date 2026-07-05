// ========================================
// Map
// ========================================

function createMap() {

    const map = L.map("map").setView([24.7136, 46.6753], 10);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap"
    }).addTo(map);

    return map;

}