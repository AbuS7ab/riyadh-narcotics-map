console.log("search.js loaded");

// ========================================
// Smart Search Engine
// ========================================

function searchFacilities(query) {

    query = query.trim().toLowerCase();

    if (query.length < 2) {
        return [];
    }

    return allFacilities
    .filter(facility => {

        return (
            facility.name.toLowerCase().includes(query) ||
            String(facility.license).includes(query) ||
            facility.district.toLowerCase().includes(query) ||
            facility.type.toLowerCase().includes(query)
        );

    })
    .sort((a, b) => {

        const score = (facility) => {

            if (facility.name.toLowerCase().startsWith(query)) return 1;

            if (facility.name.toLowerCase().includes(query)) return 2;

            if (facility.district.toLowerCase().includes(query)) return 3;

            if (facility.type.toLowerCase().includes(query)) return 4;

            if (String(facility.license).includes(query)) return 5;

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

        if (typeof fitFacilityBounds === "function") {

            fitFacilityBounds(visibleResults);

        }

        resultsBox.innerHTML = `
<div class="list-group-item active">
تم العثور على ${results.length} نتيجة
</div>
`;

        if (results.length === 0) {

            resultsBox.innerHTML = `
                <div class="list-group-item text-muted">
                    لا توجد نتائج
                </div>
            `;

            return;

        }

        visibleResults.forEach(facility => {

    const item = document.createElement("button");

    item.className = "list-group-item list-group-item-action";

    item.innerHTML = `
        <div class="fw-bold">
            ${facility.name}
        </div>

        <div class="text-muted small">
            📄 رقم الترخيص: ${facility.license}
        </div>

        <div class="text-muted small">
            📍 الحي: ${facility.district}
        </div>

        <div class="text-muted small">
            🏥 النوع: ${facility.type}
        </div>
    `;

    item.addEventListener("click", () => {

        goToFacility(facility);

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
