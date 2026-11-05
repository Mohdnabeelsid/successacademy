// ==========================================================================
// FEE MANAGEMENT PAGE CONTROLLER (ADMIN)
// ==========================================================================

import { requireAuth } from "../services/auth-service.js";
import { renderSidebar } from "../components/sidebar.js";
import { toast } from "../components/toast.js";
import { showConfirmModal } from "../components/confirm-modal.js";
import { setButtonLoading } from "../utils/ui-helpers.js";
import { getISTTodayIso, formatISTFullDate, formatLogDate } from "../utils/date-time.js";
import { listStudents, getStudentsByBranch } from "../services/student-service.js";
import {
  recordPayment,
  getAllPayments,
  deletePayment,
  getMonthlyFeeForClass,
  ADMISSION_FEE_AMOUNT,
  FEE_TYPES,
  PAYMENT_METHODS,
  formatMonthYear,
  normalizeClassForFee
} from "../services/fee-service.js";

let admin = null;
let allStudents = [];
let studentMap = {};
let allPayments = [];
let admissionPaidSet = new Set();

(async function init() {
  // Safety timeout to guarantee loader never hangs indefinitely
  setTimeout(() => {
    const loader = document.getElementById("page-loader");
    if (loader && !loader.classList.contains("done")) {
      loader.classList.add("done");
    }
  }, 2500);

  try {
    admin = await requireAuth("admin", "admin-login.html");
    const adminBranch = admin.branch || "ALL";
    const subLabel = adminBranch === "ALL" ? "All-Branch Admin" : `${adminBranch} Branch Admin`;

    renderSidebar("admin", "fees", {
      name: admin.name,
      sub: subLabel
    });

    const metaLabel = document.getElementById("branch-meta-label");
    if (metaLabel) {
      metaLabel.textContent = adminBranch === "ALL" 
        ? "All Branches · Fees & Payments" 
        : `${adminBranch} Branch · Fees & Payments`;
    }

    // Set auto-recorded date preview
    const autoDateDisplay = document.getElementById("auto-recorded-date-display");
    if (autoDateDisplay) {
      autoDateDisplay.textContent = formatISTFullDate();
    }

    // Default month inputs to current month
    const todayIso = getISTTodayIso();
    const currentMonthKey = todayIso.substring(0, 7);
    const payMonthInput = document.getElementById("pay-month-input");
    if (payMonthInput) payMonthInput.value = currentMonthKey;

    // Wire buttons & modal events upfront so UI is immediately interactive
    wireEventListeners();

    await loadData();
  } catch (err) {
    console.error("Initialization error:", err);
    toast.error("Failed to load fees dashboard.");
  } finally {
    const loader = document.getElementById("page-loader");
    if (loader) loader.classList.add("done");
  }
})();

async function loadData() {
  try {
    const adminBranch = admin.branch || "ALL";
    const studentsRes = await getStudentsByBranch(adminBranch);
    allStudents = studentsRes || [];
    studentMap = {};
    allStudents.forEach((s) => {
      studentMap[s.id] = s;
    });

    // Populate student dropdown in modal
    populateStudentSelect();

    // Fetch payments
    await refreshPayments();
  } catch (err) {
    console.error("Error loading fees data:", err);
    toast.error("Could not fetch fee data.");
  }
}

async function refreshPayments() {
  const adminBranch = admin.branch || "ALL";
  allPayments = await getAllPayments({
    branch: adminBranch
  });

  // Track students who have paid admission
  admissionPaidSet = new Set();
  allPayments.forEach((p) => {
    if (p.feeType === FEE_TYPES.ADMISSION) {
      admissionPaidSet.add(p.studentId);
    }
  });

  updateStats(allPayments);
  renderTable();
}

function updateStats(payments) {
  const currentMonthKey = getISTTodayIso().substring(0, 7);
  let totalAll = 0;
  let totalMonth = 0;
  let cashTotal = 0;
  let cashCount = 0;
  let upiTotal = 0;
  let upiCount = 0;

  payments.forEach((p) => {
    const amt = Number(p.amount) || 0;
    totalAll += amt;

    const pDate = p.paymentDate ? String(p.paymentDate).substring(0, 7) : "";
    if (pDate === currentMonthKey || p.monthYear === currentMonthKey) {
      totalMonth += amt;
    }

    if (p.paymentMethod === PAYMENT_METHODS.CASH) {
      cashTotal += amt;
      cashCount++;
    } else if (p.paymentMethod === PAYMENT_METHODS.UPI) {
      upiTotal += amt;
      upiCount++;
    }
  });

  const elTotal = document.getElementById("stat-total-collected");
  if (elTotal) elTotal.textContent = `₹${totalAll.toLocaleString("en-IN")}`;

  const elMonth = document.getElementById("stat-month-collected");
  if (elMonth) elMonth.textContent = `₹${totalMonth.toLocaleString("en-IN")}`;

  const elMonthLabel = document.getElementById("stat-month-label");
  if (elMonthLabel) elMonthLabel.textContent = formatMonthYear(currentMonthKey);

  const elCash = document.getElementById("stat-cash-collected");
  if (elCash) elCash.textContent = `₹${cashTotal.toLocaleString("en-IN")}`;
  const elCashCount = document.getElementById("stat-cash-count");
  if (elCashCount) elCashCount.textContent = `${cashCount} payment${cashCount === 1 ? "" : "s"}`;

  const elUpi = document.getElementById("stat-upi-collected");
  if (elUpi) elUpi.textContent = `₹${upiTotal.toLocaleString("en-IN")}`;
  const elUpiCount = document.getElementById("stat-upi-count");
  if (elUpiCount) elUpiCount.textContent = `${upiCount} payment${upiCount === 1 ? "" : "s"}`;
}

function populateStudentSelect() {
  const select = document.getElementById("pay-student-select");
  if (!select) return;

  const sortedStudents = [...allStudents].sort((a, b) =>
    (a.name || "").localeCompare(b.name || "")
  );

  let html = `<option value="">-- Choose student (${sortedStudents.length}) --</option>`;
  sortedStudents.forEach((s) => {
    const adm = s.admissionNumber || "—";
    const cls = s.class || "—";
    const branch = s.branch || "";
    html += `<option value="${s.id}" data-class="${cls}" data-branch="${branch}">[${adm}] ${s.name} (Class ${cls})</option>`;
  });
  select.innerHTML = html;
}

function getFilteredPayments() {
  const search = (document.getElementById("filter-search")?.value || "").toLowerCase().trim();
  const filterClass = document.getElementById("filter-class")?.value || "";
  const filterFeeType = document.getElementById("filter-fee-type")?.value || "all";
  const filterMethod = document.getElementById("filter-method")?.value || "all";
  const filterMonth = document.getElementById("filter-month")?.value || "";

  return allPayments.filter((p) => {
    // Resolve student
    const student = p.student || studentMap[p.studentId] || {};
    const studentName = (student.name || "").toLowerCase();
    const admNo = (student.admissionNumber || "").toLowerCase();
    const studentClass = student.class || "";

    if (search) {
      if (!studentName.includes(search) && !admNo.includes(search)) {
        return false;
      }
    }

    if (filterClass) {
      const studentNorm = normalizeClassForFee(studentClass);
      const targetNorm = normalizeClassForFee(filterClass);
      if (studentNorm !== targetNorm) return false;
    }

    if (filterFeeType !== "all" && p.feeType !== filterFeeType) {
      return false;
    }

    if (filterMethod !== "all" && p.paymentMethod !== filterMethod) {
      return false;
    }

    if (filterMonth) {
      const pMonth = p.monthYear || (p.paymentDate ? String(p.paymentDate).substring(0, 7) : "");
      if (pMonth !== filterMonth) return false;
    }

    return true;
  });
}

function renderTable() {
  const tbody = document.getElementById("payments-tbody");
  const countPill = document.getElementById("payment-count-pill");
  const summaryText = document.getElementById("table-summary-text");
  if (!tbody) return;

  const filtered = getFilteredPayments();
  if (countPill) countPill.textContent = filtered.length;

  if (summaryText) {
    const totalAmount = filtered.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
    summaryText.textContent = `Showing ${filtered.length} of ${allPayments.length} entries · Total: ₹${totalAmount.toLocaleString("en-IN")}`;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 48px; color: var(--c-text-muted);">
          <div style="font-size: 28px; margin-bottom: 8px;">💳</div>
          <div style="font-weight: 600; font-size: var(--fs-sm);">No fee records found</div>
          <div style="font-size: var(--fs-xs); margin-top: 4px;">Click "Record Payment" to add student fees.</div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered
    .map((p) => {
      const student = p.student || studentMap[p.studentId] || {};
      const studentName = student.name || "Unknown Student";
      const admNo = student.admissionNumber || "—";
      const sClass = student.class || "—";

      const formattedDate = p.paymentDate ? formatLogDate(p.paymentDate) : "—";
      const isAdmission = p.feeType === FEE_TYPES.ADMISSION;
      const typeBadge = isAdmission
        ? `<span class="method-badge type-badge-admission">Admission Fee</span>`
        : `<span class="method-badge type-badge-monthly">Monthly Fee</span>`;

      const periodText = isAdmission
        ? `<span style="color:var(--c-text-muted); font-size:var(--fs-xs);">One-time</span>`
        : `<strong>${formatMonthYear(p.monthYear)}</strong>`;

      const isUpi = p.paymentMethod === PAYMENT_METHODS.UPI;
      const methodBadge = isUpi
        ? `<span class="method-badge method-badge-upi">📱 UPI</span>`
        : `<span class="method-badge method-badge-cash">💵 Cash</span>`;

      const amountFormatted = `₹${(Number(p.amount) || 0).toLocaleString("en-IN")}`;
      const remarks = p.remarks ? escapeHtml(p.remarks) : `<span style="color:var(--c-text-muted);">—</span>`;

      return `
        <tr data-payment-id="${p.id}">
          <td style="white-space: nowrap; font-size: var(--fs-xs); font-weight: 600;">
            ${formattedDate}
          </td>
          <td>
            <div style="font-weight: 700; font-size: var(--fs-sm);">${escapeHtml(studentName)}</div>
            <div style="font-size: var(--fs-xs); color: var(--c-text-muted); font-family: monospace;">Adm: ${escapeHtml(admNo)}</div>
          </td>
          <td>
            <span class="badge">Class ${escapeHtml(sClass)}</span>
          </td>
          <td>${typeBadge}</td>
          <td>${periodText}</td>
          <td style="font-weight: 700; color: var(--c-text); font-size: var(--fs-sm);">
            ${amountFormatted}
          </td>
          <td>${methodBadge}</td>
          <td style="font-size: var(--fs-xs); max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${remarks}
          </td>
          <td style="text-align: right; white-space: nowrap;">
            <button 
              type="button" 
              class="btn btn-ghost btn-sm btn-delete-payment" 
              data-id="${p.id}" 
              data-student="${escapeHtml(studentName)}"
              data-amount="${p.amount}"
              style="color: var(--c-danger); padding: 4px 8px;"
              title="Delete payment">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function wireEventListeners() {
  // Filters
  document.getElementById("filter-search")?.addEventListener("input", renderTable);
  document.getElementById("filter-class")?.addEventListener("change", renderTable);
  document.getElementById("filter-fee-type")?.addEventListener("change", renderTable);
  document.getElementById("filter-method")?.addEventListener("change", renderTable);
  document.getElementById("filter-month")?.addEventListener("change", renderTable);

  document.getElementById("btn-reset-filters")?.addEventListener("click", () => {
    const s = document.getElementById("filter-search");
    const c = document.getElementById("filter-class");
    const t = document.getElementById("filter-fee-type");
    const m = document.getElementById("filter-method");
    const mo = document.getElementById("filter-month");
    if (s) s.value = "";
    if (c) c.value = "";
    if (t) t.value = "all";
    if (m) m.value = "all";
    if (mo) mo.value = "";
    renderTable();
  });

  // Modal open & close
  const modal = document.getElementById("record-payment-modal");
  const openModalBtn = document.getElementById("btn-open-record-modal");
  const closeModalBtn = document.getElementById("btn-close-record-modal");
  const cancelModalBtn = document.getElementById("btn-cancel-record-modal");

  const openModal = () => {
    resetPaymentForm();
    modal?.classList.add("active");
  };

  const closeModal = () => {
    modal?.classList.remove("active");
  };

  openModalBtn?.addEventListener("click", openModal);
  closeModalBtn?.addEventListener("click", closeModal);
  cancelModalBtn?.addEventListener("click", closeModal);

  modal?.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal?.classList.contains("active")) {
      closeModal();
    }
  });

  // Student selection in modal
  const studentSelect = document.getElementById("pay-student-select");
  studentSelect?.addEventListener("change", onStudentSelected);

  // Fee type radio selection
  document.querySelectorAll('input[name="fee_type"]').forEach((radio) => {
    radio.addEventListener("change", onFeeTypeChanged);
  });

  // Payment method cards
  document.querySelectorAll('input[name="payment_method"]').forEach((radio) => {
    radio.addEventListener("change", onPaymentMethodChanged);
  });

  // Form submit
  document.getElementById("record-payment-form")?.addEventListener("submit", handleRecordPaymentSubmit);

  // Delete payment action via event delegation
  document.getElementById("payments-tbody")?.addEventListener("click", handleDeletePaymentClick);
}

function resetPaymentForm() {
  const form = document.getElementById("record-payment-form");
  if (form) form.reset();

  const preview = document.getElementById("pay-student-preview");
  if (preview) preview.style.display = "none";

  const monthlyRadio = document.querySelector('input[name="fee_type"][value="monthly"]');
  if (monthlyRadio) monthlyRadio.checked = true;

  const cashRadio = document.querySelector('input[name="payment_method"][value="cash"]');
  if (cashRadio) cashRadio.checked = true;

  const monthInput = document.getElementById("pay-month-input");
  if (monthInput) monthInput.value = getISTTodayIso().substring(0, 7);

  updateCardRadioStyles();
  onFeeTypeChanged();
}

function updateCardRadioStyles() {
  // Update Fee Type cards
  const feeTypeMonthlyCard = document.getElementById("fee-type-monthly-card");
  const feeTypeAdmissionCard = document.getElementById("fee-type-admission-card");
  const isMonthly = document.querySelector('input[name="fee_type"]:checked')?.value === "monthly";

  if (feeTypeMonthlyCard) feeTypeMonthlyCard.classList.toggle("active", isMonthly);
  if (feeTypeAdmissionCard) feeTypeAdmissionCard.classList.toggle("active", !isMonthly);

  // Update Method cards
  const cashCard = document.getElementById("method-cash-card");
  const upiCard = document.getElementById("method-upi-card");
  const isCash = document.querySelector('input[name="payment_method"]:checked')?.value === "cash";

  if (cashCard) cashCard.classList.toggle("active", isCash);
  if (upiCard) upiCard.classList.toggle("active", !isCash);
}

function onStudentSelected() {
  const studentId = document.getElementById("pay-student-select")?.value;
  const preview = document.getElementById("pay-student-preview");
  const previewClass = document.getElementById("preview-student-class");
  const previewBranch = document.getElementById("preview-student-branch");
  const previewAdmission = document.getElementById("preview-admission-status");

  if (!studentId || !studentMap[studentId]) {
    if (preview) preview.style.display = "none";
    return;
  }

  const student = studentMap[studentId];
  if (preview) preview.style.display = "block";
  if (previewClass) previewClass.textContent = student.class || "—";
  if (previewBranch) previewBranch.textContent = student.branch || "—";

  const isAdmissionPaid = admissionPaidSet.has(studentId);
  if (previewAdmission) {
    previewAdmission.innerHTML = isAdmissionPaid
      ? `<span class="badge badge-success">Admission Paid ✅</span>`
      : `<span class="badge badge-warning">Admission Pending ⏳</span>`;
  }

  // Update fee amount
  updateCalculatedAmount();
}

function onFeeTypeChanged() {
  updateCardRadioStyles();
  const selectedType = document.querySelector('input[name="fee_type"]:checked')?.value;
  const monthWrapper = document.getElementById("field-month-wrapper");
  const monthInput = document.getElementById("pay-month-input");

  if (selectedType === FEE_TYPES.ADMISSION) {
    if (monthWrapper) monthWrapper.style.display = "none";
    if (monthInput) monthInput.required = false;
  } else {
    if (monthWrapper) monthWrapper.style.display = "block";
    if (monthInput) monthInput.required = true;
  }

  updateCalculatedAmount();
}

function onPaymentMethodChanged() {
  updateCardRadioStyles();
}

function updateCalculatedAmount() {
  const studentId = document.getElementById("pay-student-select")?.value;
  const selectedType = document.querySelector('input[name="fee_type"]:checked')?.value;
  const amountInput = document.getElementById("pay-amount-input");
  const amountHint = document.getElementById("pay-amount-hint");
  if (!amountInput) return;

  if (selectedType === FEE_TYPES.ADMISSION) {
    amountInput.value = ADMISSION_FEE_AMOUNT;
    if (amountHint) {
      amountHint.textContent = `Standard admission fee is ₹${ADMISSION_FEE_AMOUNT} for all students.`;
    }
  } else {
    // Monthly fee based on class
    const student = studentMap[studentId];
    if (student) {
      const fee = getMonthlyFeeForClass(student.class);
      amountInput.value = fee || "";
      if (amountHint) {
        amountHint.textContent = fee > 0
          ? `Calculated fee for Class ${student.class}: ₹${fee}`
          : "Class fee not found in schedule. Enter manual amount.";
      }
    } else {
      amountInput.value = "";
      if (amountHint) amountHint.textContent = "Select a student to calculate monthly fee.";
    }
  }
}

async function handleRecordPaymentSubmit(e) {
  e.preventDefault();
  const submitBtn = document.getElementById("btn-save-payment");
  const studentId = document.getElementById("pay-student-select")?.value;
  const feeType = document.querySelector('input[name="fee_type"]:checked')?.value;
  const amount = parseFloat(document.getElementById("pay-amount-input")?.value);
  const paymentMethod = document.querySelector('input[name="payment_method"]:checked')?.value;
  const monthYear = document.getElementById("pay-month-input")?.value;
  const remarks = document.getElementById("pay-remarks-input")?.value?.trim() || "";

  if (!studentId) {
    toast.error("Please select a student.");
    return;
  }
  if (!amount || amount <= 0) {
    toast.error("Please enter a valid amount greater than 0.");
    return;
  }
  if (!paymentMethod) {
    toast.error("Please select Cash or UPI.");
    return;
  }
  if (feeType === FEE_TYPES.MONTHLY && !monthYear) {
    toast.error("Please select the fee month.");
    return;
  }

  const student = studentMap[studentId];
  const branch = student?.branch || admin.branch || "MAN";

  try {
    setButtonLoading(submitBtn, true);

    await recordPayment({
      studentId,
      feeType,
      amount,
      paymentMethod,
      monthYear: feeType === FEE_TYPES.MONTHLY ? monthYear : null,
      branch,
      remarks,
      recordedBy: admin.id
    });

    toast.success(`Fee payment of ₹${amount} recorded successfully.`);
    document.getElementById("record-payment-modal")?.classList.remove("active");
    await refreshPayments();
  } catch (err) {
    console.error("Error saving fee payment:", err);
    toast.error(err.message || "Failed to record payment.");
  } finally {
    setButtonLoading(submitBtn, false);
  }
}

async function handleDeletePaymentClick(e) {
  const btn = e.target.closest(".btn-delete-payment");
  if (!btn) return;

  const paymentId = btn.dataset.id;
  const studentName = btn.dataset.student;
  const amount = btn.dataset.amount;

  showConfirmModal({
    title: "Delete Payment Record",
    message: `Are you sure you want to delete the payment of ₹${amount} for ${studentName}? This action cannot be undone.`,
    confirmText: "Delete",
    confirmClass: "btn-danger",
    onConfirm: async () => {
      try {
        await deletePayment(paymentId);
        toast.success("Payment record deleted.");
        await refreshPayments();
      } catch (err) {
        console.error("Delete payment error:", err);
        toast.error("Failed to delete payment record.");
      }
    }
  });
}

function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

