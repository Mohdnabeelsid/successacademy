// ==========================================================================
// STUDENT FEES PAGE CONTROLLER
// Displays student's fee payment records, admission & monthly status,
// and shows overdue alert after the 5th of each month if unpaid.
// ==========================================================================

import { requireAuth } from "../services/auth-service.js";
import { getStudent } from "../services/student-service.js";
import { renderSidebar } from "../components/sidebar.js";
import { toast } from "../components/toast.js";
import { formatLogDate } from "../utils/date-time.js";
import {
  getStudentFeeStatus,
  formatMonthYear,
  FEE_TYPES,
  PAYMENT_METHODS
} from "../services/fee-service.js";

let student = null;

(async function init() {
  // Safety timeout to guarantee loader never hangs indefinitely
  setTimeout(() => {
    const loader = document.getElementById("page-loader");
    if (loader && !loader.classList.contains("done")) {
      loader.classList.add("done");
    }
  }, 2500);

  try {
    const authStudent = await requireAuth("student", "student-login.html");
    const dbStudent = await getStudent(authStudent.id);
    student = dbStudent || authStudent;

    renderSidebar("student", "fees", {
      name: student.name,
      sub: `Class ${student.class || "-"} · ${student.branch || ""}`
    });

    const metaLabel = document.getElementById("student-meta-label");
    if (metaLabel) {
      metaLabel.textContent = `Class ${student.class || "-"} · ${student.branch || "-"} Branch · Adm No: ${student.admissionNumber || "-"}`;
    }

    await loadFeeDetails();
  } catch (err) {
    console.error("Student fees initialization error:", err);
    toast.error("Could not load fee records.");
  } finally {
    const loader = document.getElementById("page-loader");
    if (loader) loader.classList.add("done");
  }
})();

async function loadFeeDetails() {
  try {
    const status = await getStudentFeeStatus(student.id, student.class);

    renderAlertBanner(status);
    renderStatusCards(status);
    renderPaymentsTable(status.allPayments);
  } catch (err) {
    console.error("Error loading student fee details:", err);
    toast.error("Failed to fetch payment details.");
  }
}

function renderAlertBanner(status) {
  const container = document.getElementById("due-alert-container");
  if (!container) return;

  if (status.shouldAlert) {
    container.style.display = "block";
    const monthFormatted = formatMonthYear(status.currentMonthKey);
    const amountFormatted = `₹${status.expectedMonthlyFee.toLocaleString("en-IN")}`;

    const msgEl = document.getElementById("alert-message-text");
    if (msgEl) {
      msgEl.innerHTML = `Your monthly tuition fee of <strong>${amountFormatted}</strong> for <strong>${monthFormatted}</strong> has not been recorded yet. Please settle your fee at the academy office via Cash or UPI at your earliest convenience.`;
    }

    const badgeEl = document.getElementById("alert-days-overdue");
    if (badgeEl) {
      const days = status.daysPastDue;
      badgeEl.textContent = `${days} day${days === 1 ? "" : "s"} past due (due on 5th)`;
    }
  } else {
    container.style.display = "none";
  }
}

function renderStatusCards(status) {
  const monthFormatted = formatMonthYear(status.currentMonthKey);

  // Admission Fee
  const admStatusEl = document.getElementById("card-admission-status");
  const admDetailEl = document.getElementById("card-admission-detail");
  if (admStatusEl) {
    if (status.admissionPaid) {
      admStatusEl.innerHTML = `<span class="status-pill-paid">✅ Paid ₹1,000</span>`;
      const dateStr = status.admissionPayment?.paymentDate
        ? formatLogDate(status.admissionPayment.paymentDate)
        : "";
      const methodStr = (status.admissionPayment?.paymentMethod || "").toUpperCase();
      if (admDetailEl) admDetailEl.textContent = `Recorded on ${dateStr} via ${methodStr}`;
    } else {
      admStatusEl.innerHTML = `<span class="status-pill-due">⏳ Pending ₹1,000</span>`;
      if (admDetailEl) admDetailEl.textContent = "One-time admission fee";
    }
  }

  // Current Month Fee
  const monthLabelEl = document.getElementById("card-current-month-label");
  if (monthLabelEl) monthLabelEl.textContent = `${monthFormatted} Fee`;

  const monthStatusEl = document.getElementById("card-current-month-status");
  const monthDetailEl = document.getElementById("card-current-month-detail");
  if (monthStatusEl) {
    if (status.currentMonthPaid) {
      const amt = (Number(status.currentMonthPayment.amount) || status.expectedMonthlyFee).toLocaleString("en-IN");
      monthStatusEl.innerHTML = `<span class="status-pill-paid">✅ Paid ₹${amt}</span>`;
      const dateStr = status.currentMonthPayment?.paymentDate
        ? formatLogDate(status.currentMonthPayment.paymentDate)
        : "";
      const methodStr = (status.currentMonthPayment?.paymentMethod || "").toUpperCase();
      if (monthDetailEl) monthDetailEl.textContent = `Paid on ${dateStr} via ${methodStr}`;
    } else {
      const amt = status.expectedMonthlyFee.toLocaleString("en-IN");
      monthStatusEl.innerHTML = `<span class="status-pill-due">⚠️ Due ₹${amt}</span>`;
      if (monthDetailEl) monthDetailEl.textContent = "Payable by the 5th of this month";
    }
  }

  // Monthly Rate
  const rateEl = document.getElementById("card-fee-rate");
  const rateSubEl = document.getElementById("card-fee-rate-sub");
  if (rateEl) {
    rateEl.textContent = `₹${status.expectedMonthlyFee.toLocaleString("en-IN")}`;
  }
  if (rateSubEl) {
    rateSubEl.textContent = `Monthly fee for Class ${student.class || "—"}`;
  }

  // Total Paid
  const totalPaid = status.allPayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
  const totalEl = document.getElementById("card-total-paid");
  const totalCountEl = document.getElementById("card-total-count");
  if (totalEl) totalEl.textContent = `₹${totalPaid.toLocaleString("en-IN")}`;
  if (totalCountEl) {
    totalCountEl.textContent = `${status.allPayments.length} recorded receipt${status.allPayments.length === 1 ? "" : "s"}`;
  }
}

function renderPaymentsTable(payments = []) {
  const tbody = document.getElementById("student-fees-tbody");
  const countBadge = document.getElementById("payment-count-badge");
  if (!tbody) return;

  if (countBadge) countBadge.textContent = payments.length;

  if (!payments || payments.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 48px; color: var(--c-text-muted);">
          <div style="font-size: 28px; margin-bottom: 8px;">🧾</div>
          <div style="font-weight: 600; font-size: var(--fs-sm);">No payment receipts recorded yet</div>
          <div style="font-size: var(--fs-xs); margin-top: 4px;">Receipts recorded by the office will appear here.</div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = payments
    .map((p) => {
      const formattedDate = p.paymentDate ? formatLogDate(p.paymentDate) : "—";
      const isAdmission = p.feeType === FEE_TYPES.ADMISSION;
      const typeBadge = isAdmission
        ? `<span class="badge" style="background:rgba(245,158,11,0.15); color:#d97706; border:1px solid rgba(245,158,11,0.3);">Admission Fee</span>`
        : `<span class="badge" style="background:rgba(14,165,233,0.15); color:#0284c7; border:1px solid rgba(14,165,233,0.3);">Monthly Fee</span>`;

      const periodText = isAdmission
        ? `<span style="color:var(--c-text-muted); font-size:var(--fs-xs);">One-time Admission</span>`
        : `<strong>${formatMonthYear(p.monthYear)}</strong>`;

      const isUpi = p.paymentMethod === PAYMENT_METHODS.UPI;
      const methodBadge = isUpi
        ? `<span class="method-badge method-badge-upi">📱 UPI</span>`
        : `<span class="method-badge method-badge-cash">💵 Cash</span>`;

      const amountFormatted = `₹${(Number(p.amount) || 0).toLocaleString("en-IN")}`;
      const remarks = p.remarks ? escapeHtml(p.remarks) : `<span style="color:var(--c-text-muted);">—</span>`;

      return `
        <tr>
          <td style="white-space: nowrap; font-weight: 600; font-size: var(--fs-xs);">
            ${formattedDate}
          </td>
          <td>${typeBadge}</td>
          <td>${periodText}</td>
          <td style="font-weight: 700; color: var(--c-text); font-size: var(--fs-sm);">
            ${amountFormatted}
          </td>
          <td>${methodBadge}</td>
          <td style="font-size: var(--fs-xs); color: var(--c-text-muted);">
            ${remarks}
          </td>
        </tr>
      `;
    })
    .join("");
}

function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

