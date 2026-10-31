// ==========================================================================
// STUDENT ATTENDANCE CONTROLLER
// Read-only attendance viewing, session history, and metrics calculation.
// ==========================================================================

import { requireAuth } from "../services/auth-service.js";
import { renderSidebar } from "../components/sidebar.js";
import { escapeHtml } from "../utils/exam-ui.js";
import {
  formatLogDate,
  format12Hour,
  getISTTodayIso,
  addDaysToIso,
  getISTMonthRange
} from "../utils/date-time.js";
import {
  getStudentAttendance,
  listAttendanceSessions,
  ATTENDANCE_STATUS,
  calcAttendancePercentage
} from "../services/attendance-service.js";

let currentStudent = null;
let allRecords = [];
let allSessions = [];

(async function init() {
  try {
    currentStudent = await requireAuth("student", "student-login.html");
    renderSidebar("student", "attendance", {
      name: currentStudent.name || currentStudent.admissionNumber,
      sub: "Student"
    });

    // Populate topbar metadata
    const branchName = currentStudent.branch === "ALP" ? "Alappuzha Campus" : "Mannancherry Campus";
    document.getElementById("student-meta-label").textContent =
      `Class ${escapeHtml(currentStudent.class)} • ${escapeHtml(branchName)} • Adm: ${escapeHtml(currentStudent.admissionNumber)}`;

    wireFilterEvents();
    await loadStudentAttendance();
  } catch (err) {
    console.error("Student attendance initialization error:", err);
  } finally {
    const loader = document.getElementById("page-loader");
    if (loader) loader.classList.add("done");
  }
})();

function wireFilterEvents() {
  document.getElementById("filter-status-select").addEventListener("change", applyFilters);
  document.getElementById("filter-time-range").addEventListener("change", applyFilters);
}

async function loadStudentAttendance() {
  try {
    const [records, sessions] = await Promise.all([
      getStudentAttendance(currentStudent.id),
      listAttendanceSessions({
        class: currentStudent.class,
        branch: currentStudent.branch
      })
    ]);
    allRecords = records || [];
    allSessions = sessions || [];
    applyFilters();
  } catch (err) {
    console.error("Error loading student attendance:", err);
    document.getElementById("student-attendance-body").innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state">
            <h4>Unable to load attendance</h4>
            <p style="font-size:var(--fs-xs); color:var(--c-text-muted);">Please check your network connection or try again later.</p>
          </div>
        </td>
      </tr>
    `;
  }
}

function computeOverallStats(records, totalSessionsHeld = 0) {
  let present = 0;
  let late = 0;
  let absent = 0;

  records.forEach((r) => {
    if (r.status === ATTENDANCE_STATUS.PRESENT) present++;
    else if (r.status === ATTENDANCE_STATUS.LATE) late++;
    else if (r.status === ATTENDANCE_STATUS.ABSENT) absent++;
  });

  const total = totalSessionsHeld > 0 ? totalSessionsHeld : records.length;
  const attended = present + late;
  const unmarked = Math.max(0, total - (present + late + absent));
  const percentage = total > 0 ? calcAttendancePercentage(present, late, total) : 0;

  document.getElementById("stat-student-total").textContent = total;
  document.getElementById("stat-student-present").textContent = present;
  document.getElementById("stat-student-late").textContent = late;
  document.getElementById("stat-student-absent").textContent = absent;
  const unmarkedEl = document.getElementById("stat-student-unmarked");
  if (unmarkedEl) unmarkedEl.textContent = unmarked;

  const pctEl = document.getElementById("stat-student-pct");
  const pctSubEl = document.getElementById("stat-student-pct-sub");

  if (total === 0) {
    pctEl.textContent = "—";
    pctSubEl.textContent = "No sessions recorded";
    pctSubEl.style.color = "var(--c-text-muted)";
    pctEl.style.color = "var(--c-text)";
  } else {
    pctEl.textContent = `${percentage}%`;
    const unmarkedNote = unmarked > 0 ? ` (${unmarked} unmarked)` : "";
    if (percentage >= 85) {
      pctSubEl.textContent = `✓ ${attended}/${total} sessions (Excellent)${unmarkedNote}`;
      pctSubEl.style.color = "var(--c-success)";
      pctEl.style.color = "var(--c-success)";
    } else if (percentage >= 75) {
      pctSubEl.textContent = `⚠️ ${attended}/${total} sessions (Satisfactory)${unmarkedNote}`;
      pctSubEl.style.color = "var(--c-warning)";
      pctEl.style.color = "var(--c-warning)";
    } else {
      pctSubEl.textContent = `❗ ${attended}/${total} sessions (Low Attendance)${unmarkedNote}`;
      pctSubEl.style.color = "var(--c-danger)";
      pctEl.style.color = "var(--c-danger)";
    }
  }
}

function applyFilters() {
  const statusFilter = document.getElementById("filter-status-select").value;
  const rangeFilter = document.getElementById("filter-time-range").value;

  const today = getISTTodayIso();
  let startIso = null;
  let endIso = null;

  if (rangeFilter === "30days") {
    startIso = addDaysToIso(today, -30);
  } else if (rangeFilter === "thisMonth") {
    const range = getISTMonthRange();
    startIso = range.startIso;
    endIso = range.endIso;
  }

  // Filter sessions in selected range for accurate denominator
  let sessionsInRange = allSessions;
  if (startIso) sessionsInRange = sessionsInRange.filter((s) => s.date >= startIso);
  if (endIso) sessionsInRange = sessionsInRange.filter((s) => s.date <= endIso);

  // Filter records in selected range
  let recordsInRange = allRecords;
  if (startIso) recordsInRange = recordsInRange.filter((r) => r.date >= startIso);
  if (endIso) recordsInRange = recordsInRange.filter((r) => r.date <= endIso);

  // Synchronize top stat cards with selected date range and total sessions held
  computeOverallStats(recordsInRange, sessionsInRange.length);

  // Filter displayed table rows by chosen status
  let displayed = [...recordsInRange];
  if (statusFilter) {
    displayed = displayed.filter((r) => r.status === statusFilter);
  }

  renderAttendanceTable(displayed);
}

function renderAttendanceTable(records) {
  const tbody = document.getElementById("student-attendance-body");

  if (!records || records.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="empty-state" style="padding:var(--sp-6);">
            <h4>No attendance records found</h4>
            <p style="color:var(--c-text-muted); font-size:var(--fs-xs); margin-top:4px;">
              No sessions match your selected filter criteria.
            </p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = records
    .map((r, index) => {
      let badgeHtml = "";
      if (r.status === ATTENDANCE_STATUS.PRESENT) {
        badgeHtml = `<span class="badge badge-success">✓ Present</span>`;
      } else if (r.status === ATTENDANCE_STATUS.LATE) {
        badgeHtml = `<span class="badge badge-warning">⏰ Late</span>`;
      } else if (r.status === ATTENDANCE_STATUS.ABSENT) {
        badgeHtml = `<span class="badge badge-danger">✕ Absent</span>`;
      } else {
        badgeHtml = `<span class="badge badge-ghost">—</span>`;
      }

      const formattedDate = formatLogDate(r.date);
      const formattedTime = r.startTime ? format12Hour(r.startTime) : "—";
      const remarksText = r.remarks ? escapeHtml(r.remarks) : "—";

      return `
        <tr>
          <td style="color:var(--c-text-muted); font-size:var(--fs-xs);">${index + 1}</td>
          <td style="font-weight:600; white-space:nowrap;">${escapeHtml(formattedDate)}</td>
          <td style="color:var(--c-text-secondary); font-size:var(--fs-xs); white-space:nowrap;">
            ${escapeHtml(formattedTime)}
          </td>
          <td>
            <div style="font-weight:600; font-size:var(--fs-sm);">${escapeHtml(r.title || "Class Session")}</div>
            <div style="font-size:var(--fs-2xs); color:var(--c-text-muted);">Class ${escapeHtml(r.class)}</div>
          </td>
          <td>${badgeHtml}</td>
          <td style="font-size:var(--fs-xs); color:var(--c-text-muted);">${remarksText}</td>
        </tr>
      `;
    })
    .join("");
}
