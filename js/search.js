console.log("search.js loaded");

// ========================================
// Smart Search Engine
// ========================================

function searchFacilities(query) {

    query = query.trim().toLowerCase();

    if (query.length < 2) {
        return [];
    }

    return allFacilities.filter(facility => {

        return (
            facility.name.toLowerCase().includes(query) ||
            String(facility.license).includes(query) ||
            facility.district.toLowerCase().includes(query) ||
            facility.type.toLowerCase().includes(query)
        );

    });

}

// ========================================
// Initialize Search
// ========================================

function initializeSearch() {

    const searchBox = document.getElementById("searchBox");
    const resultsBox = document.getElementById("searchResults");

    searchBox.addEventListener("input", function () {

        const query = this.value.trim();

        resultsBox.innerHTML = "";

        if (query.length < 2) {
            return;
        }

        const results = searchFacilities(query);

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

        results.slice(0, 10).forEach(facility => {

            resultsBox.innerHTML += `

<div class="list-group-item list-group-item-action">

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

</div>

`;

        });

    });

}