// ================================
// Raqeeb Geography Platform
// Version 0.4
// ================================

// إنشاء الخريطة
const map = L.map("map").setView([24.7136, 46.6753], 10);

// طبقة OpenStreetMap
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap"
}).addTo(map);

// قراءة ملف JSON
fetch("data/facilities.json")
.then(response => response.json())
.then(facilities => {

    // تكبير الخريطة تلقائياً لتشمل جميع المنشآت
// ================= Dashboard =================

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

    const bounds = [];

    facilities.forEach(facility => {

        const marker = L.marker([facility.lat, facility.lng]).addTo(map);

        marker.bindPopup(`
            <b>${facility.name}</b><br>
            ${facility.type}<br>
            ${facility.district}
        `);

        // عند الضغط على Marker
        marker.on("click", () => {

            document.querySelector(".card-body").innerHTML = `
                <p><strong>🏥 الاسم:</strong> ${facility.name}</p>
                <p><strong>🏢 النوع:</strong> ${facility.type}</p>
                <p><strong>📍 الحي:</strong> ${facility.district}</p>
                <p><strong>🛣️ الشارع:</strong> ${facility.street}</p>
                <p><strong>📄 الترخيص:</strong> ${facility.license}</p>

                <a href="${facility.google_maps}"
                   target="_blank"
                   class="btn btn-success w-100 mt-3">
                   فتح في Google Maps
                </a>
            `;

        });

        bounds.push([facility.lat, facility.lng]);

    });

    map.fitBounds(bounds);

    console.log(`تم تحميل ${facilities.length} منشأة`);

})
.catch(error => {

    console.error(error);

});