// ========================================
// Facility Details
// ========================================

function showFacilityDetails(facility) {

    const details = document.querySelector(".card-body");

    const state = getFacilityStatus(facility.license);

    let statusText = "قيد الانتظار";
    let statusBadge = "warning";

    switch (state.visitStatus) {

    case "visited":
        statusText = "تمت الزيارة";
        statusBadge = "success";
        break;

    case "partial":
        statusText = "لم تستكمل الزيارة";
        statusBadge = "warning";
        break;

    case "violation":
        statusText = "يوجد مخالفة";
        statusBadge = "danger";
        break;

    default:
        statusText = "قيد الانتظار";
        statusBadge = "secondary";

}

    details.innerHTML = `

        <h5 class="mb-3">${facility.name}</h5>

        <p><strong>🏢 النوع:</strong> ${facility.type}</p>

        <p><strong>📍 الحي:</strong> ${facility.district}</p>

        <p><strong>🛣️ الشارع:</strong> ${facility.street}</p>

        <p><strong>📄 الترخيص:</strong> ${facility.license}</p>

        <hr>

        <p>
            <strong>📌 الحالة:</strong>
            <span class="badge bg-${statusBadge}">
                ${statusText}
            </span>
        </p>

        <a
            href="${facility.google_maps}"
            target="_blank"
            class="btn btn-success w-100 mt-3">

            فتح في Google Maps

        </a>

    `;

}