import { requireAuth } from "../services/auth-service.js";
import { renderSidebar } from "../components/sidebar.js";
import { listStudents } from "../services/student-service.js";
import { getStudentLogs } from "../services/studylog-service.js";
import {
  buildLeaderboard,
  toCSV,
  downloadCSV,
  downloadExcel,
  generateWhatsAppAttendanceLink
} from "../services/report-service.js";
import { getAttendanceReport } from "../services/attendance-service.js";
import { getAcademicYearRange } from "../utils/date-time.js";
import { escapeHtml } from "../utils/exam-ui.js";

let currentLeaderboardRows = [];
let currentAttendanceRows = [];
let currentAttendanceTotalSessions = 0;
let currentTab = "leaderboard";
let currentAdmin = null;

(async function init() {
  currentAdmin = await requireAuth("admin", "admin-login.html");
  const isAllBranch = !currentAdmin.branch || currentAdmin.branch === "ALL";
  const subTitle = isAllBranch ? "Admin (All Branches)" : `${currentAdmin.branch} Branch Admin`;
  renderSidebar("admin", "reports", { name: currentAdmin.name || currentAdmin.email, sub: subTitle });

  // Lock branch filters if restricted to a specific branch
  if (!isAllBranch) {
    const filterBranch = document.getElementById("filter-branch");
    if (filterBranch) {
      filterBranch.value = currentAdmin.branch;
      filterBranch.disabled = true;
    }
    const attFilterBranch = document.getElementById("att-filter-branch");
    if (attFilterBranch) {
      attFilterBranch.value = currentAdmin.branch;
      attFilterBranch.disabled = true;
    }
  }

  // Set default academic year date range
  const acadRange = getAcademicYearRange();
  const startDateInput = document.getElementById("att-start-date");
  const endDateInput = document.getElementById("att-end-date");
  if (startDateInput && !startDateInput.value) {
    startDateInput.value = acadRange.startIso;
  }
  if (endDateInput && !endDateInput.value) {
    endDateInput.value = acadRange.endIso;
  }

  try {
    await refreshLeaderboard();
  } catch (err) {
    console.error("Reports refresh error:", err);
  } finally {
    document.getElementById("page-loader")?.classList.add("done");
  }

  wireEvents();
})();

async function refreshLeaderboard() {
  const branchEl = document.getElementById("filter-branch");
  const clsEl = document.getElementById("filter-class");
  const rankByEl = document.getElementById("rank-by");

  const branch = branchEl ? branchEl.value : "";
  const cls = clsEl ? clsEl.value : "";
  const rankBy = rankByEl ? rankByEl.value : "streak";

  let students = await listStudents({ branch, class: cls });

  const logsByStudentId = {};
  await Promise.all(
    students.map(async (s) => {
      logsByStudentId[s.id] = await getStudentLogs(s.id, 500);
    })
  );

  currentLeaderboardRows = buildLeaderboard(students, logsByStudentId, rankBy);
  renderLeaderboardTable(currentLeaderboardRows);
}

function renderLeaderboardTable(rows) {
  const body = document.getElementById("leaderboard-body");
  if (!body) return;
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="8"><div class="empty-state">No students match these filters.</div></td></tr>`;
    return;
  }
  body.innerHTML = rows
    .map(
      (r) => `<tr>
      <td><strong>#${r.rank}</strong></td>
      <td>${escapeHtml(r.name)}</td>
      <td>${escapeHtml(r.admissionNumber)}</td>
      <td>Class ${escapeHtml(r.class)}</td>
      <td>${escapeHtml(r.branch)}</td>
      <td><span class="badge badge-success">${r.streak} days</span></td>
      <td>${r.hours} hrs</td>
      <td>${r.activeCount}</td>
    </tr>`
    )
    .join("");
}

async function refreshAttendance() {
  const body = document.getElementById("attendance-report-body");
  if (body) {
    body.innerHTML = `<tr><td colspan="12"><div class="empty-state">Loading attendance data…</div></td></tr>`;
  }

  const branchEl = document.getElementById("att-filter-branch");
  const clsEl = document.getElementById("att-filter-class");
  const startDateEl = document.getElementById("att-start-date");
  const endDateEl = document.getElementById("att-end-date");

  const branch = branchEl ? branchEl.value : "";
  const cls = clsEl ? clsEl.value : "";
  const startDate = startDateEl ? startDateEl.value : "";
  const endDate = endDateEl ? endDateEl.value : "";

  try {
    const reportData = await getAttendanceReport({
      branch,
      class: cls,
      startDate,
      endDate
    });

    currentAttendanceRows = reportData.rows || [];
    currentAttendanceTotalSessions = reportData.totalSessions || 0;

    renderAttendanceView();
  } catch (err) {
    console.error("Attendance report fetch error:", err);
    if (body) {
      body.innerHTML = `<tr><td colspan="12"><div class="empty-state" style="color:var(--c-danger);">Error loading attendance report: ${escapeHtml(err.message)}</div></td></tr>`;
    }
  }
}

function renderAttendanceView() {
  const thresholdInput = document.getElementById("att-threshold");
  const threshold = parseFloat(thresholdInput?.value) || 75;
  const onlyLow = document.getElementById("att-only-low")?.checked || false;

  const totalStudents = currentAttendanceRows.length;
  const belowThresholdCount = currentAttendanceRows.filter(
    (r) => r.attendancePercentage < threshold
  ).length;

  const avgAttendance =
    totalStudents > 0
      ? (
          currentAttendanceRows.reduce((sum, r) => sum + r.attendancePercentage, 0) /
          totalStudents
        ).toFixed(1)
      : "0";

  // Update stat cards
  const statStudents = document.getElementById("att-stat-students");
  const statSessions = document.getElementById("att-stat-sessions");
  const statAvg = document.getElementById("att-stat-avg");
  const statLow = document.getElementById("att-stat-low");

  if (statStudents) statStudents.textContent = String(totalStudents);
  if (statSessions) statSessions.textContent = String(currentAttendanceTotalSessions);
  if (statAvg) statAvg.textContent = `${avgAttendance}%`;
  if (statLow) statLow.textContent = String(belowThresholdCount);

  // Filter rows if "Only < threshold" is checked
  const displayedRows = onlyLow
    ? currentAttendanceRows.filter((r) => r.attendancePercentage < threshold)
    : currentAttendanceRows;

  const body = document.getElementById("attendance-report-body");
  if (!body) return;

  if (displayedRows.length === 0) {
    body.innerHTML = `<tr><td colspan="12"><div class="empty-state">No students match these attendance criteria.</div></td></tr>`;
    return;
  }

  body.innerHTML = displayedRows
    .map((r) => {
      const isLow = r.attendancePercentage < threshold;
      const rowBg = isLow ? "background-color: rgba(239, 68, 68, 0.05);" : "";
      const badgeClass = isLow ? "badge badge-danger" : "badge badge-success";

      let actionHtml = `<span style="font-size:var(--fs-2xs); color:var(--c-text-muted);">Normal</span>`;
      if (isLow) {
        const waLink = generateWhatsAppAttendanceLink(r);
        if (waLink) {
          actionHtml = `<a href="${escapeHtml(waLink)}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm" style="color:var(--c-success, #16a34a); padding:3px 8px; font-size:var(--fs-xs); display:inline-flex; align-items:center; gap:4px;" title="Send WhatsApp alert to parent">
            💬 Alert
          </a>`;
        } else {
          actionHtml = `<span class="badge badge-neutral" style="font-size:var(--fs-2xs);">No Phone</span>`;
        }
      }

      return `<tr style="${rowBg}">
        <td><strong>${escapeHtml(r.admissionNumber || "—")}</strong></td>
        <td>
          <div style="font-weight:600;">${escapeHtml(r.name)}</div>
          ${r.parentName ? `<div style="font-size:var(--fs-2xs); color:var(--c-text-muted);">Parent: ${escapeHtml(r.parentName)}</div>` : ""}
        </td>
        <td>Class ${escapeHtml(r.class)}</td>
        <td>${escapeHtml(r.branch)}</td>
        <td style="text-align:right;">${r.totalSessions}</td>
        <td style="text-align:right;">${r.present}</td>
        <td style="text-align:right;">${r.late}</td>
        <td style="text-align:right;">${r.absent}</td>
        <td style="text-align:right;">${r.unmarked}</td>
        <td style="text-align:right;"><strong>${r.attended}</strong></td>
        <td style="text-align:right;"><span class="${badgeClass}">${r.attendancePercentage}%</span></td>
        <td style="text-align:center;">${actionHtml}</td>
      </tr>`;
    })
    .join("");
}

function exportAttendanceCSV() {
  const columns = [
    { key: "admissionNumber", label: "Admission Number" },
    { key: "name", label: "Student Name" },
    { key: "class", label: "Class" },
    { key: "branch", label: "Branch" },
    { key: "phone", label: "Phone" },
    { key: "parentName", label: "Parent Name" },
    { key: "totalSessions", label: "Total Sessions" },
    { key: "present", label: "Present" },
    { key: "late", label: "Late" },
    { key: "absent", label: "Absent" },
    { key: "unmarked", label: "Unmarked" },
    { key: "attended", label: "Attended" },
    { key: "attendancePercentage", label: "Attendance %" }
  ];
  const csv = toCSV(currentAttendanceRows, columns);
  downloadCSV("success-academy-attendance-report.csv", csv);
}

function exportAttendanceExcel() {
  downloadExcel("success-academy-attendance-report.xlsx", currentAttendanceRows, "Attendance Report");
}

function exportLeaderboardCSV() {
  const csv = toCSV(currentLeaderboardRows, [
    { key: "rank", label: "Rank" },
    { key: "name", label: "Name" },
    { key: "admissionNumber", label: "Admission Number" },
    { key: "class", label: "Class" },
    { key: "branch", label: "Branch" },
    { key: "streak", label: "Streak (days)" },
    { key: "hours", label: "Total Hours" },
    { key: "activeCount", label: "Logs Approved" }
  ]);
  downloadCSV("success-academy-leaderboard.csv", csv);
}

function exportLeaderboardExcel() {
  downloadExcel("success-academy-leaderboard.xlsx", currentLeaderboardRows, "Leaderboard");
}

function wireEvents() {
  // Tab Switching
  const tabLeaderboardBtn = document.getElementById("tab-leaderboard-btn");
  const tabAttendanceBtn = document.getElementById("tab-attendance-btn");
  const paneLeaderboard = document.getElementById("pane-leaderboard");
  const paneAttendance = document.getElementById("pane-attendance");

  function switchTab(tab) {
    currentTab = tab;
    if (tab === "leaderboard") {
      tabLeaderboardBtn?.classList.add("active");
      tabLeaderboardBtn?.setAttribute("aria-selected", "true");
      tabAttendanceBtn?.classList.remove("active");
      tabAttendanceBtn?.setAttribute("aria-selected", "false");
      if (paneLeaderboard) paneLeaderboard.style.display = "";
      if (paneAttendance) paneAttendance.style.display = "none";
    } else {
      tabAttendanceBtn?.classList.add("active");
      tabAttendanceBtn?.setAttribute("aria-selected", "true");
      tabLeaderboardBtn?.classList.remove("active");
      tabLeaderboardBtn?.setAttribute("aria-selected", "false");
      if (paneAttendance) paneAttendance.style.display = "";
      if (paneLeaderboard) paneLeaderboard.style.display = "none";

      if (currentAttendanceRows.length === 0) {
        refreshAttendance();
      }
    }
  }

  tabLeaderboardBtn?.addEventListener("click", () => switchTab("leaderboard"));
  tabAttendanceBtn?.addEventListener("click", () => switchTab("attendance"));

  // Leaderboard filters
  ["filter-branch", "filter-class", "rank-by"].forEach((id) =>
    document.getElementById(id)?.addEventListener("change", refreshLeaderboard)
  );

  // Attendance filters
  ["att-filter-branch", "att-filter-class", "att-start-date", "att-end-date"].forEach((id) =>
    document.getElementById(id)?.addEventListener("change", refreshAttendance)
  );

  document.getElementById("att-threshold")?.addEventListener("input", renderAttendanceView);
  document.getElementById("att-only-low")?.addEventListener("change", renderAttendanceView);

  // Topbar exports (active tab aware)
  document.getElementById("export-csv-btn")?.addEventListener("click", () => {
    if (currentTab === "leaderboard") exportLeaderboardCSV();
    else exportAttendanceCSV();
  });

  document.getElementById("export-excel-btn")?.addEventListener("click", () => {
    if (currentTab === "leaderboard") exportLeaderboardExcel();
    else exportAttendanceExcel();
  });

  // Dedicated Attendance exports
  document.getElementById("export-att-csv-btn")?.addEventListener("click", exportAttendanceCSV);
  document.getElementById("export-att-excel-btn")?.addEventListener("click", exportAttendanceExcel);
}
