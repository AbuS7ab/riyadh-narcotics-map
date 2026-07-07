// ========================================
// Facility Details
// ========================================

function showDashboardNeutralState() {

    const details = document.querySelector(".card-body");

    details.innerHTML = `
        <div class="text-muted">
            اختر منشأة من الخريطة أو استخدم الفلاتر لعرض النتائج.
        </div>
    `;

}


function showFacilityList(facilities) {

    const details = document.querySelector(".card-body");

    details.innerHTML = `
        <div id="facilityDrilldownList" class="list-group">
            <div class="list-group-item active">
                تم العثور على ${facilities.length} نتيجة
            </div>
        </div>
    `;

    const list = document.getElementById("facilityDrilldownList");

    if (facilities.length === 0) {

        list.innerHTML += `
            <div class="list-group-item text-muted">
                لا توجد نتائج
            </div>
        `;

        return;

    }

    facilities.forEach(facility => {

        const state = getFacilityStatus(facility.license);
        const item = document.createElement("button");

        let statusText = "قيد الانتظار";
        let statusBadge = "secondary";

        if (state.visitStatus === "visited") {

            statusText = "تمت الزيارة";
            statusBadge = "success";

        } else if (state.visitStatus === "partial") {

            statusText = "لم تستكمل الزيارة";
            statusBadge = "warning";

        }

        item.className = "list-group-item list-group-item-action";
        item.innerHTML = `
            <div class="fw-bold">${facility.name}</div>
            <div class="text-muted small">📄 رقم الترخيص: ${facility.license}</div>
            <div class="text-muted small">📍 الحي: ${facility.district}</div>
            <div class="text-muted small">🏥 النوع: ${facility.type}</div>
            <div class="mt-2">
                <span class="badge bg-${statusBadge}">${statusText}</span>
                ${state.violation
                    ? '<span class="badge bg-danger">يوجد مخالفة</span>'
                    : ''}
            </div>
        `;

        item.addEventListener("click", () => {

            goToFacility(facility);

        });

        list.appendChild(item);

    });

}


function showFacilityDetails(facility) {

    const details = document.querySelector(".card-body");

    const state = getFacilityStatus(facility.license);

    let statusText = "قيد الانتظار";
    let statusBadge = "warning";

    switch (state.visitStatus) {

    case "visited":
        statusText = state.violation
            ? "🔴 تمت الزيارة - يوجد مخالفة"
            : "🟢 تمت الزيارة - لا توجد ملاحظات";
        statusBadge = state.violation ? "danger" : "success";
        break;

    case "partial":
        statusText = "🟠 لم تستكمل الزيارة";
        statusBadge = "warning";
        break;

    default:
        statusText = "🟡 قيد الانتظار";
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

        <hr>

        <h6 class="mb-3">نتيجة الزيارة</h6>

        <select id="visitResult" class="form-select mb-3">
            <option value="pending">قيد الانتظار</option>
            <option value="visited">تمت الزيارة - لا توجد ملاحظات</option>
            <option value="partial">زيارة جزئية</option>
        </select>

        <div class="form-check mb-3">
            <input id="visitViolation" class="form-check-input" type="checkbox">
            <label for="visitViolation" class="form-check-label">يوجد مخالفة</label>
        </div>

        <label for="visitNotes" class="form-label">ملاحظات</label>
        <textarea id="visitNotes" class="form-control mb-3" rows="3"></textarea>

        <button id="saveVisit" class="btn btn-primary w-100">
            حفظ
        </button>

    `;

    const visitResult = document.getElementById("visitResult");
    const visitViolation = document.getElementById("visitViolation");
    const visitNotes = document.getElementById("visitNotes");
    const saveVisit = document.getElementById("saveVisit");

    visitResult.value = state.visitStatus;
    visitViolation.checked = state.violation;
    visitNotes.value = state.notes;

    saveVisit.addEventListener("click", function () {

        const visitStatus = visitResult.value;
        const violation = visitStatus === "pending"
            ? false
            : visitViolation.checked;

        setVisitStatus(facility.license, visitStatus);
        setViolation(facility.license, violation);
        setNotes(facility.license, visitNotes.value);

        applyFilters();

        showFacilityDetails(facility);

    });

}
