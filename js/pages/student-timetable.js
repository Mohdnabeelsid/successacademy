// ==========================================================================
// STUDENT TIMETABLE PAGE CONTROLLER
// Displays student's week timetable based on their enrolled class & branch,
// plus time-proximity alerts for sessions occurring within 2 days.
// ==========================================================================

import { requireAuth } from "../services/auth-service.js";
import { getStudent } from "../services/student-service.js";
import { renderSidebar } from "../components/sidebar.js";
import { toast } from "../components/toast.js";
import {
  getISTTodayIso,
  addDaysToIso,
  dayOfWeek,
  formatLogDate,
  format12Hour
} from "../utils/date-time.js";
import {
  getStudentTimetable,
  getUpcomingAlerts,
  formatEntryTime,
  SESSION_TYPE_ICONS,
  SESSION_TYPES
} from "../services/timetable-service.js";

let student = null;
let currentWeekStartDate = getISTTodayIso();

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

(async function init() {
  setTimeout(() => {
    const loader = document.getElementById("page-loader");
    if (loader && !loader.classList.contains("done")) {
      loader.classList.add("done");
    }
  }, 2000);

  // Wire events upfront
  wireEvents();

  try {
    const authStudent = await requireAuth("student", "student-login.html");
    const dbStudent = await getStudent(authStudent.id);
    student = dbStudent || authStudent;

    renderSidebar("student", "timetable", {
      name: student.name,
      sub: `Class ${student.class || "-"} · ${student.branch || ""}`
    });

    const metaLabel = document.getElementById("student-meta-label");
    if (metaLabel) {
      metaLabel.textContent = `Class ${student.class || "—"} · ${student.branch || "—"} Branch · Academic Schedule`;
    }

    await Promise.allSettled([
      loadAlerts(),
      loadTimetable()
    ]);
  } catch (err) {
    console.error("Student timetable init error:", err);
    toast.error("Error loading timetable.");
  } finally {
    const loader = document.getElementById("page-loader");
    if (loader) loader.classList.add("done");
  }
})();

async function loadAlerts() {
  if (!student) return;
  try {
    const { alerts, unreadCount } = await getUpcomingAlerts(student.class, student.branch);
    const banner = document.getElementById("timetable-alerts-banner");
    const container = document.getElementById("alerts-items-container");
    const countBadge = document.getElementById("alerts-count-badge");
    const summaryText = document.getElementById("alerts-summary-text");

    if (!banner || !container) return;

    if (alerts.length === 0) {
      banner.style.display = "none";
      return;
    }

    banner.style.display = "flex";
    if (countBadge) countBadge.textContent = `${unreadCount} Alert${unreadCount > 1 ? "s" : ""}`;

    const todayCount = alerts.filter(a => a.priority.level === 1).length;
    const tomorrowCount = alerts.filter(a => a.priority.level === 2).length;
    const nextDaysCount = alerts.filter(a => a.priority.level === 3).length;

    let summaryParts = [];
    if (todayCount > 0) summaryParts.push(`${todayCount} today`);
    if (tomorrowCount > 0) summaryParts.push(`${tomorrowCount} tomorrow`);
    if (nextDaysCount > 0) summaryParts.push(`${nextDaysCount} in 2 days`);
    if (summaryText) {
      summaryText.textContent = `Sessions ahead: ${summaryParts.join(", ")}. Prioritize your preparation!`;
    }

    let itemsHtml = "";
    alerts.forEach(entry => {
      const p = entry.priority;
      const icon = SESSION_TYPE_ICONS[entry.sessionType] || "📌";
      const timeStr = formatEntryTime(entry);

      itemsHtml += `
        <div class="alert-item-card">
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="priority-badge priority-level-${p.level}">
              ${p.label}
            </span>
            <span style="font-weight:700; font-size:13px;">${icon} ${escapeHtml(entry.subject || entry.title || "Session")}</span>
            ${entry.title && entry.subject ? `<span style="font-size:12px; color:var(--c-text-muted);">(${escapeHtml(entry.title)})</span>` : ""}
          </div>
          <div style="display:flex; align-items:center; gap:8px; font-size:12px;">
            <strong>${escapeHtml(timeStr)}</strong>
            ${entry.location ? `<span style="color:var(--c-text-muted);">· 📍 ${escapeHtml(entry.location)}</span>` : ""}
          </div>
        </div>
      `;
    });

    container.innerHTML = itemsHtml;
  } catch (err) {
    console.warn("Could not load timetable alerts:", err);
  }
}

async function loadTimetable() {
  if (!student) return;

  const startDayOfWeek = dayOfWeek(currentWeekStartDate);
  const endIso = addDaysToIso(currentWeekStartDate, 6);
  const endDayOfWeek = dayOfWeek(endIso);

  const rangeLabel = document.getElementById("student-week-label");
  if (rangeLabel) {
    rangeLabel.textContent = `${startDayOfWeek.slice(0, 3)}, ${formatLogDate(currentWeekStartDate)} – ${endDayOfWeek.slice(0, 3)}, ${formatLogDate(endIso)}`;
  }

  try {
    const { entries, grouped } = await getStudentTimetable(student.class, student.branch, currentWeekStartDate);

    const countBadge = document.getElementById("session-count-badge");
    if (countBadge) {
      countBadge.textContent = `${entries.length} Session${entries.length === 1 ? "" : "s"} This Week`;
    }

    renderStudentWeekGrid(grouped);
  } catch (err) {
    console.error("Error loading student timetable:", err);
    toast.error("Failed to load your timetable schedule.");
    const fallbackGrouped = {};
    for (let i = 0; i < 7; i++) {
      const d = addDaysToIso(currentWeekStartDate, i);
      fallbackGrouped[d] = [];
    }
    renderStudentWeekGrid(fallbackGrouped);
  }
}

function renderStudentWeekGrid(grouped) {
  const container = document.getElementById("student-week-grid");
  if (!container) return;

  const todayIso = getISTTodayIso();
  let html = "";

  for (let i = 0; i < 7; i++) {
    const dateStr = addDaysToIso(currentWeekStartDate, i);
    const dayName = dayOfWeek(dateStr);
    const isToday = dateStr === todayIso;
    const dayEntries = grouped[dateStr] || [];

    html += `
      <div class="student-day-col ${isToday ? "is-today" : ""}">
        <div class="student-day-header">
          <div>
            <div style="font-size:var(--fs-xs); font-weight:700;">${dayName.slice(0, 3)}</div>
            <div style="font-size:11px; color:var(--c-text-muted);">${formatLogDate(dateStr)}</div>
          </div>
          ${isToday ? `<span style="background:var(--c-primary); color:#fff; font-size:9px; font-weight:800; padding:1px 5px; border-radius:4px; text-transform:uppercase;">TODAY</span>` : ""}
        </div>
        <div style="padding:8px; display:flex; flex-direction:column; gap:8px; flex:1;">
    `;

    if (dayEntries.length === 0) {
      html += `
        <div class="empty-day-student">
          No classes or exams scheduled
        </div>
      `;
    } else {
      dayEntries.forEach(entry => {
        const typeClass = `card-type-${(entry.sessionType || "class").toLowerCase()}`;
        const icon = SESSION_TYPE_ICONS[entry.sessionType] || "📌";
        const timeFormatted = formatEntryTime(entry);

        html += `
          <div class="st-card ${typeClass}">
            <div class="st-time">
              <span>${icon}</span>
              <span>${escapeHtml(timeFormatted)}</span>
            </div>
            ${entry.subjects && entry.subjects.length > 0 ? `
              <div style="display:flex; flex-wrap:wrap; gap:4px; margin:2px 0;">
                ${entry.subjects.map(s => `<span class="badge" style="font-size:11px; font-weight:700; background:var(--surface-2); padding:2px 7px;">${escapeHtml(s)}</span>`).join("")}
              </div>
            ` : `<div class="st-subject">${escapeHtml(entry.subject || entry.title || "Session")}</div>`}
            ${entry.title ? `<div class="st-title">${escapeHtml(entry.title)}</div>` : ""}
            
            <div class="st-details">
              ${entry.location ? `<div>📍 Venue: <strong>${escapeHtml(entry.location)}</strong></div>` : ""}
              ${entry.description ? `<div style="font-style:italic; margin-top:2px; color:var(--c-text);">"${escapeHtml(entry.description)}"</div>` : ""}
            </div>
          </div>
        `;
      });
    }

    html += `
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}

function wireEvents() {
  document.getElementById("prev-week-btn")?.addEventListener("click", async () => {
    currentWeekStartDate = addDaysToIso(currentWeekStartDate, -7);
    await loadTimetable();
  });

  document.getElementById("next-week-btn")?.addEventListener("click", async () => {
    currentWeekStartDate = addDaysToIso(currentWeekStartDate, 7);
    await loadTimetable();
  });

  document.getElementById("today-btn")?.addEventListener("click", async () => {
    currentWeekStartDate = getISTTodayIso();
    await loadTimetable();
  });
}

