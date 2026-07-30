console.log("search.js loaded");

// ========================================
// Smart Search Engine
// ========================================

function searchFacilities(query) {

    query = query.trim().toLowerCase();

    if (query.length < 2) {
        return [];
    }

    const searchableFacilities = Array.isArray(filteredFacilities)
        ? filteredFacilities
        : allFacilities;

    return searchableFacilities
    .filter(facility => {

        const displayLicense = getFacilityDisplayLicense(facility);

        return (
            facility.name.toLowerCase().includes(query) ||
            String(facility.license).includes(query) ||
            displayLicense.toLowerCase().includes(query) ||
            facility.district.toLowerCase().includes(query) ||
            facility.type.toLowerCase().includes(query)
        );

    })
    .sort((a, b) => {

        const score = (facility) => {

            const displayLicense = getFacilityDisplayLicense(facility);

            if (facility.name.toLowerCase().startsWith(query)) return 1;

            if (facility.name.toLowerCase().includes(query)) return 2;

            if (facility.district.toLowerCase().includes(query)) return 3;

            if (facility.type.toLowerCase().includes(query)) return 4;

            if (String(facility.license).includes(query) ||
                displayLicense.toLowerCase().includes(query)) return 5;

            return 99;

        };

        return score(a) - score(b);

    });

}

// ========================================
// Initialize Search
// ========================================

function initializeSearch() {

    const searchBox = document.getElementById("searchBox");
    const resultsBox = document.getElementById("searchResults");
    const clearButton = document.getElementById("clearSearch");

    document.addEventListener("click", function (event) {

    if (
        !searchBox.contains(event.target) &&
        !resultsBox.contains(event.target)
    ) {

        resultsBox.innerHTML = "";

    }

});

    searchBox.addEventListener("input", function () {

        const query = this.value.trim();

        // إظهار أو إخفاء زر المسح
if (query.length > 0) {
    clearButton.classList.remove("d-none");
} else {
    clearButton.classList.add("d-none");
}

        resultsBox.innerHTML = "";

        if (query.length < 2) {
            return;
        }

        const results = searchFacilities(query);
        const visibleResults = results.slice(0, 10);
        const externalResults = typeof searchExternalVisits === "function"
            ? searchExternalVisits(query).slice(0, 10)
            : [];

        if (typeof fitFacilityBounds === "function") {

            fitFacilityBounds(visibleResults);

        }

        resultsBox.innerHTML = `
            <div class="search-results-heading">
                <span>منشآت الخطة</span>
                <strong>${results.length}</strong>
            </div>
        `;

        if (results.length === 0 && externalResults.length === 0) {

            resultsBox.innerHTML = `
                <div class="list-group-item text-muted">
                    لا توجد نتائج
                </div>
            `;

            return;

        }

        visibleResults.forEach(facility => {

    const item = document.createElement("button");
    const displayLicense = getFacilityDisplayLicense(facility);

    const state = getFacilityStatus(facility.license);
    const statusLabel = state.visitStatus === "visited"
        ? "تمت الزيارة"
        : state.visitStatus === "partial"
            ? "غير مكتملة"
            : "قيد الانتظار";
    const statusClass = state.visitStatus === "visited"
        ? "success"
        : state.visitStatus === "partial"
            ? "warning"
            : "secondary";

    item.className = "list-group-item list-group-item-action search-result-card";

    item.innerHTML = `
        <div class="search-result-card-header">
            <div class="fw-bold">
                ${escapeHtml(facility.name)}
            </div>
            <span class="badge bg-${statusClass}">
                ${statusLabel}
            </span>
        </div>
        <div class="search-result-meta">
            <span>
                <i class="fa-regular fa-file-lines"></i>
                ${escapeHtml(displayLicense)}
            </span>
            <span>
                <i class="fa-solid fa-location-dot"></i>
                ${escapeHtml(facility.district || "-")}
            </span>
            <span>
                <i class="fa-regular fa-building"></i>
                ${escapeHtml(facility.type || "-")}
            </span>
        </div>
    `;

    item.addEventListener("click", () => {

        goToFacility(facility);

        searchBox.value = "";

        resultsBox.innerHTML = "";

    });

    resultsBox.appendChild(item);

});

        if (externalResults.length > 0) {

            resultsBox.innerHTML += `
                <div class="search-results-heading">
                    <span>المهام خارج الخطة</span>
                    <strong>${externalResults.length}</strong>
                </div>
            `;

        }

        externalResults.forEach(visit => {

            const snapshot = visit.facilitySnapshot || {};
            const item = document.createElement("button");

            item.className = "list-group-item list-group-item-action";

            item.innerHTML = `
                <div class="d-flex align-items-center justify-content-between gap-2">
                    <div class="fw-bold">${escapeHtml(visit.facilityName || snapshot.name || "")}</div>
                    <span class="badge text-bg-info">${escapeHtml(visit.missionNumber || "خارج الخطة")}</span>
                </div>
                <div class="text-muted small">📍 المدينة: ${escapeHtml(snapshot.city || "")}</div>
                ${snapshot.license
                    ? `<div class="text-muted small">📄 رقم الترخيص: ${escapeHtml(snapshot.license)}</div>`
                    : ""}
                ${visit.taskNumber || visit.transactionNumber
                    ? `<div class="text-muted small">رقم المرجع: ${escapeHtml(visit.taskNumber || visit.transactionNumber)}</div>`
                    : ""}
            `;

            item.addEventListener("click", () => {

                showExternalVisitDetails(getExternalMissionId(visit));

                searchBox.value = "";

                resultsBox.innerHTML = "";

            });

            resultsBox.appendChild(item);

        });

    });

    // زر مسح البحث
clearButton.addEventListener("click", function () {

    searchBox.value = "";

    resultsBox.innerHTML = "";

    clearButton.classList.add("d-none");

    searchBox.focus();

});

}
