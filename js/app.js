// ========================================
// Raqeeb Geography Platform
// Version 0.5-alpha
// ========================================

let map = null;

let allFacilities = [];

let filteredFacilities = [];

let baseFacilities = [];

let customFacilities = {};

initializeApp();


async function initializeApp() {

    await initializeCloudData();

    initializeFacilityStatusState();

    initializeUserState();

    seedCloudKey("appSettings", loadAppSettings());
    seedCloudKey("customFacilities", loadCustomFacilities());

    await flushCloudWrites();

    initializeUserInterface();
    initializeCustomFacilitiesPanel();

    if (!isAdminUser() && !isCommitteeUser()) return;

    await initializeMapWhenVisible();

    loadFacilities();

}


// ========================================
// Create Map
// ========================================

function createMap() {

    const map = L.map("map");

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap"
    }).addTo(map);

    return map;
}


function initializeMapWhenVisible() {

    return new Promise(resolve => {

        const waitForVisibleMap = () => {

            const mapContainer = document.getElementById("map");

            if (!mapContainer ||
                mapContainer.offsetWidth === 0 ||
                mapContainer.offsetHeight === 0) {

                requestAnimationFrame(waitForVisibleMap);

                return;

            }

            map = createMap();

            map.invalidateSize(true);
            map.setView(CONFIG.map.center, CONFIG.map.zoom);

            setTimeout(() => {

                map.invalidateSize(true);
                map.setView(CONFIG.map.center, CONFIG.map.zoom);

            }, 250);

            resolve();

        };

        requestAnimationFrame(waitForVisibleMap);

    });

}
// ========================================
// Load Facilities
// ========================================

function loadFacilities() {

    fetch("data/facilities.json")
        .then(response => response.json())
        .then(facilities => {

            baseFacilities = facilities.map(facility => ({
                ...facility,
                isCustom: false
            }));
            customFacilities = loadCustomFacilities();

            syncFacilityCollections();

            initializeSearch();

            const visitStatusFilter = document.getElementById("visitStatusFilter");

visitStatusFilter.addEventListener("change", function () {

    setFilter("visitStatus", this.value);

});

            const assignedFacilitiesFilter =
                document.getElementById("assignedFacilitiesFilter");

            if (assignedFacilitiesFilter) {

                assignedFacilitiesFilter.addEventListener("change", function () {

                    setFilter("assigned", this.value);

                    if (isCommitteeUser()) {

                        showFacilityList(filteredFacilities);

                    }

                });

            }

        })
        .catch(error => console.error(error));

}


function getMergedFacilities() {

    const mergedFacilities = [];
    const licenses = new Set();

    baseFacilities.forEach(facility => {

        const license = String(facility.license);

        licenses.add(license);
        mergedFacilities.push({
            ...facility,
            isCustom: false
        });

    });

    Object.values(customFacilities).forEach(facility => {

        const license = String(facility.license);

        if (licenses.has(license)) return;

        licenses.add(license);
        mergedFacilities.push({
            ...facility,
            isCustom: true
        });

    });

    return mergedFacilities;

}


function syncFacilityCollections() {

    const mergedFacilities = getMergedFacilities();

    mergedFacilities.forEach(facility => {

        createFacilityStatus(facility.license, {
            persist: !facility.isCustom
        });

    });

    allFacilities = getAccessibleFacilities(mergedFacilities);
    filteredFacilities = [...allFacilities];

    refreshView();
    renderAssignmentBoard(allFacilities);

    if (isCommitteeUser()) {

        showFacilityList(
            getAssignedFacilitiesForCurrentUser(allFacilities),
            { fitBounds: false }
        );

    }

}


function trimCustomFacilityInput(value) {

    return String(value || "").trim();

}


function collectCustomFacilityFormData() {

    const latitudeValue = trimCustomFacilityInput(
        document.getElementById("customFacilityLat").value
    );
    const longitudeValue = trimCustomFacilityInput(
        document.getElementById("customFacilityLng").value
    );

    return {
        originalLicense: trimCustomFacilityInput(
            document.getElementById("customFacilityOriginalLicense").value
        ),
        name: trimCustomFacilityInput(document.getElementById("customFacilityName").value),
        type: trimCustomFacilityInput(document.getElementById("customFacilityType").value),
        license: trimCustomFacilityInput(document.getElementById("customFacilityLicense").value),
        district: trimCustomFacilityInput(document.getElementById("customFacilityDistrict").value),
        street: trimCustomFacilityInput(document.getElementById("customFacilityStreet").value),
        sector: trimCustomFacilityInput(document.getElementById("customFacilitySector").value),
        latRaw: latitudeValue,
        lngRaw: longitudeValue,
        lat: Number(latitudeValue),
        lng: Number(longitudeValue),
        google_maps: trimCustomFacilityInput(document.getElementById("customFacilityMaps").value)
    };

}


function buildCustomFacility(data) {

    const googleMapsUrl = data.google_maps ||
        `https://www.google.com/maps?q=${data.lat},${data.lng}`;

    return {
        name: data.name,
        type: data.type,
        license: data.license,
        district: data.district,
        street: data.street,
        sector: data.sector,
        lat: data.lat,
        lng: data.lng,
        google_maps: googleMapsUrl,
        source: "custom"
    };

}


function validateCustomFacility(data) {

    const originalLicense = data.originalLicense;
    const editingSameLicense = originalLicense &&
        originalLicense === data.license;

    if (!data.name) return "اسم المنشأة مطلوب.";
    if (!data.license) return "رقم الترخيص مطلوب.";
    if (!data.latRaw ||
        !data.lngRaw ||
        !Number.isFinite(data.lat) ||
        data.lat < -90 ||
        data.lat > 90 ||
        !Number.isFinite(data.lng) ||
        data.lng < -180 ||
        data.lng > 180) {

        return "خط العرض وخط الطول مطلوبان وبصيغة صحيحة.";

    }

    const licenseExistsInBase = baseFacilities.some(facility => {

        return String(facility.license) === data.license;

    });
    const licenseExistsInCustom = Boolean(customFacilities[data.license]);

    if (licenseExistsInBase ||
        (licenseExistsInCustom && !editingSameLicense)) {

        return "رقم الترخيص موجود مسبقاً.";

    }

    const duplicateNameAndCoordinates = getMergedFacilities().some(facility => {

        if (editingSameLicense &&
            String(facility.license) === originalLicense) return false;

        return facility.name === data.name &&
            Number(facility.lat) === data.lat &&
            Number(facility.lng) === data.lng;

    });

    if (duplicateNameAndCoordinates) {

        return "توجد منشأة بنفس الاسم والإحداثيات.";

    }

    return "";

}


function showCustomFacilityMessage(text, className) {

    const message = document.getElementById("customFacilityMessage");

    if (!message) return;

    message.textContent = text;
    message.className = `small ${className}`;

}


function resetCustomFacilityForm() {

    const form = document.getElementById("customFacilityForm");

    if (!form) return;

    form.reset();
    document.getElementById("customFacilityOriginalLicense").value = "";
    form.classList.add("d-none");
    showCustomFacilityMessage("", "d-none");

}


async function persistCustomFacilities(nextCustomFacilities) {

    customFacilities = nextCustomFacilities;

    await saveCustomFacilities(customFacilities);

    syncFacilityCollections();

}


async function saveCustomFacilityFromForm() {

    const data = collectCustomFacilityFormData();
    const validationMessage = validateCustomFacility(data);

    if (validationMessage) {

        showCustomFacilityMessage(validationMessage, "text-danger");

        return;

    }

    const nextCustomFacilities = { ...customFacilities };

    if (data.originalLicense && data.originalLicense !== data.license) {

        delete nextCustomFacilities[data.originalLicense];

    }

    nextCustomFacilities[data.license] = buildCustomFacility(data);

    await persistCustomFacilities(nextCustomFacilities);
    resetCustomFacilityForm();

}


function editCustomFacility(license) {

    if (!isAdminUser()) return;

    const facility = customFacilities[String(license)];
    const form = document.getElementById("customFacilityForm");

    if (!facility || !form) return;

    form.classList.remove("d-none");
    document.getElementById("customFacilityOriginalLicense").value = facility.license;
    document.getElementById("customFacilityName").value = facility.name || "";
    document.getElementById("customFacilityType").value = facility.type || "";
    document.getElementById("customFacilityLicense").value = facility.license || "";
    document.getElementById("customFacilityDistrict").value = facility.district || "";
    document.getElementById("customFacilityStreet").value = facility.street || "";
    document.getElementById("customFacilitySector").value = facility.sector || "";
    document.getElementById("customFacilityLat").value =
        typeof facility.lat === "undefined" ? "" : facility.lat;
    document.getElementById("customFacilityLng").value =
        typeof facility.lng === "undefined" ? "" : facility.lng;
    document.getElementById("customFacilityMaps").value = facility.google_maps || "";
    showCustomFacilityMessage("", "d-none");

}


async function deleteCustomFacility(license) {

    if (!isAdminUser()) return;

    const key = String(license);
    const facility = customFacilities[key];

    if (!facility) return;

    const assignment = getFacilityAssignment(key);
    const visits = getFacilityVisits(key);

    if (isActiveAssignment(assignment) || visits.length > 0) {

        alert("لا يمكن حذف منشأة لديها إسناد نشط أو زيارات.");

        return;

    }

    if (!confirm("هل تريد حذف المنشأة المضافة؟")) return;

    const nextCustomFacilities = { ...customFacilities };

    delete nextCustomFacilities[key];

    await persistCustomFacilities(nextCustomFacilities);
    showDashboardNeutralState();

}


function initializeCustomFacilitiesPanel() {

    const showFormButton = document.getElementById("showCustomFacilityForm");
    const form = document.getElementById("customFacilityForm");
    const cancelButton = document.getElementById("cancelCustomFacilityEdit");

    if (!showFormButton || !form || !isAdminUser()) return;

    showFormButton.addEventListener("click", () => {

        form.classList.toggle("d-none");

    });

    form.addEventListener("submit", event => {

        event.preventDefault();

        saveCustomFacilityFromForm().catch(() => {

            showCustomFacilityMessage("تعذر حفظ المنشأة.", "text-danger");

        });

    });

    if (cancelButton) {

        cancelButton.addEventListener("click", resetCustomFacilityForm);

    }

}

function refreshView() {

    updateDashboard(allFacilities);

    renderCommitteeAssignmentCards();

    renderMarkers(filteredFacilities);

}
