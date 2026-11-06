// ==========================================================================
// TIMETABLE MANAGEMENT PAGE CONTROLLER (ADMIN)
// Handles week grid view, table view, add/edit/delete timetable entries,
// class & branch filtering, and dynamic subject loading.
// ==========================================================================

import { requireAuth } from "../services/auth-service.js";
import { renderSidebar } from "../components/sidebar.js";
import { toast } from "../components/toast.js";
import { showConfirmModal } from "../components/confirm-modal.js";
import { renderPagination } from "../components/pagination.js";
import { wireTimePicker } from "../utils/time-picker.js";
import { setButtonLoading } from "../utils/ui-helpers.js";
import { getSubjectsForClass } from "../services/subject-service.js";
import {
  getISTTodayIso,
  addDaysToIso,
  dayOfWeek,
  formatLogDate,
  format12Hour,
  parseTimeToMinutes
} from "../utils/date-time.js";
import {
  listTimetableEntries,
  getWeekEntries,
  createTimetableEntry,
  updateTimetableEntry,
  deleteTimetableEntry,
  getTimetableEntry,
  formatEntryTime,
  SESSION_TYPES,
  SESSION_TYPE_ICONS,
  normalizeClass
} from "../services/timetable-service.js";

let currentAdmin = null;
let currentWeekStartDate = getISTTodayIso();
let activeView = "grid"; // "grid" | "table"
let allWeekEntries = [];
let groupedWeekEntries = {};
let currentSelectedSubjects = []; // Up to 3 subjects

// Pagination state for table view
let tableCurrentPage = 1;
const TABLE_PAGE_SIZE = 15;

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

  // Wire events upfront so all controls and modals are interactive immediately
  wireEvents();

  try {
    const user = await requireAuth("admin", "admin-login.html");
    currentAdmin = user;

    const branch = user.branch || "MAN";
    const isAll = branch === "ALL";

    renderSidebar("admin", "timetable", {
      name: user.name || "Administrator",
      sub: isAll ? "All Branches Admin" : `${branch} Branch Admin`
    });

    const metaLabel = document.getElementById("branch-meta-label");
    if (metaLabel) {
      metaLabel.textContent = isAll
        ? "Viewing across all branches (ALP & MAN)"
        : `Active Branch: ${branch === "ALP" ? "Alappuzha (ALP)" : "Mannancherry (MAN)"}`;
    }

    // Set default branch filter if single branch admin
    const branchFilter = document.getElementById("filter-branch");
    const entryBranch = document.getElementById("entry-branch");
    if (!isAll && branchFilter) {
      branchFilter.value = branch;
    }
    if (!isAll && entryBranch) {
      entryBranch.value = branch;
    }

    // Load week timetable data
    await loadWeekData();
  } catch (err) {
    console.error("Timetable page init error:", err);
    toast.error("Error loading timetable data.");
  } finally {
    const loader = document.getElementById("page-loader");
    if (loader) loader.classList.add("done");
  }
})();

function renderSubjectPicker(selectedClass) {
  const chipsContainer = document.getElementById("selected-subjects-chips");
  const availableContainer = document.getElementById("available-subjects-container");
  const countIndicator = document.getElementById("subject-count-indicator");
  if (!chipsContainer || !availableContainer) return;

  // Render selected chips (up to 3)
  if (currentSelectedSubjects.length === 0) {
    chipsContainer.innerHTML = `<span style="font-size:12px; color:var(--c-text-muted); font-style:italic;" id="no-subjects-placeholder">No subjects selected yet. Pick from below or add custom.</span>`;
  } else {
    chipsContainer.innerHTML = currentSelectedSubjects.map(sub => `
      <span class="badge" style="background:var(--c-primary); color:#fff; display:inline-flex; align-items:center; gap:5px; padding:3px 8px; border-radius:12px; font-size:11px;">
        ${escapeHtml(sub)}
        <button type="button" class="remove-sub-btn" data-sub="${escapeHtml(sub)}" style="background:none; border:none; color:#fff; cursor:pointer; font-weight:bold; padding:0; line-height:1; font-size:12px;">✕</button>
      </span>
    `).join("");
  }

  // Update count indicator
  if (countIndicator) {
    countIndicator.textContent = `${currentSelectedSubjects.length}/3 Selected`;
    countIndicator.style.color = currentSelectedSubjects.length === 3 ? "var(--c-warning)" : "var(--c-primary)";
  }

  // Render available subjects for the selected class
  if (!selectedClass) {
    availableContainer.innerHTML = `<span style="font-size:11px; color:var(--c-text-muted);">Select Class first to load curriculum subjects.</span>`;
    return;
  }

  const cleanCls = normalizeClass(selectedClass);
  const subjects = getSubjectsForClass(cleanCls);

  if (!subjects || subjects.length === 0) {
    availableContainer.innerHTML = `<span style="font-size:11px; color:var(--c-text-muted);">No curriculum subjects found for this class. You can type custom subjects below.</span>`;
    return;
  }

  availableContainer.innerHTML = subjects.map(sub => {
    const isSelected = currentSelectedSubjects.includes(sub);
    const bg = isSelected ? "var(--c-primary)" : "var(--c-surface)";
    const color = isSelected ? "#fff" : "var(--c-text)";
    const border = isSelected ? "var(--c-primary)" : "var(--c-border)";
    return `
      <button type="button" class="sub-pick-btn ${isSelected ? "selected" : ""}" data-sub="${escapeHtml(sub)}" style="padding:4px 9px; border-radius:12px; font-size:11px; font-weight:600; cursor:pointer; background:${bg}; color:${color}; border:1px solid ${border}; transition:all var(--dur-fast);">
        ${isSelected ? "✓ " : "+ "}${escapeHtml(sub)}
      </button>
    `;
  }).join("");

  // Wire buttons
  availableContainer.querySelectorAll(".sub-pick-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const sub = btn.getAttribute("data-sub");
      toggleSubjectSelection(sub);
    });
  });

  chipsContainer.querySelectorAll(".remove-sub-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const sub = btn.getAttribute("data-sub");
      removeSubjectSelection(sub);
    });
  });
}

function toggleSubjectSelection(sub) {
  if (!sub) return;
  const idx = currentSelectedSubjects.indexOf(sub);
  if (idx >= 0) {
    currentSelectedSubjects.splice(idx, 1);
  } else {
    if (currentSelectedSubjects.length >= 3) {
      toast.error("You can choose a maximum of 3 subjects.");
      return;
    }
    currentSelectedSubjects.push(sub);
  }
  const cls = document.getElementById("entry-class")?.value || "";
  renderSubjectPicker(cls);
}

function removeSubjectSelection(sub) {
  currentSelectedSubjects = currentSelectedSubjects.filter(s => s !== sub);
  const cls = document.getElementById("entry-class")?.value || "";
  renderSubjectPicker(cls);
}

function addCustomSubject() {
  const input = document.getElementById("custom-subject-input");
  const val = input ? input.value.trim() : "";
  if (!val) return;

  if (currentSelectedSubjects.includes(val)) {
    toast.error("Subject already added.");
    return;
  }

  if (currentSelectedSubjects.length >= 3) {
    toast.error("You can choose a maximum of 3 subjects.");
    return;
  }

  currentSelectedSubjects.push(val);
  if (input) input.value = "";
  const cls = document.getElementById("entry-class")?.value || "";
  renderSubjectPicker(cls);
}

async function loadWeekData() {
  const cls = document.getElementById("filter-class")?.value || "";
  const branch = document.getElementById("filter-branch")?.value || "";
  const type = document.getElementById("filter-type")?.value || "";

  // Update week range label (e.g. "Thu, 6 Nov – Wed, 12 Nov 2026")
  const startDayOfWeek = dayOfWeek(currentWeekStartDate);
  const endIso = addDaysToIso(currentWeekStartDate, 6);
  const endDayOfWeek = dayOfWeek(endIso);

  const rangeLabel = document.getElementById("week-range-label");
  if (rangeLabel) {
    rangeLabel.textContent = `${startDayOfWeek.slice(0, 3)}, ${formatLogDate(currentWeekStartDate)} – ${endDayOfWeek.slice(0, 3)}, ${formatLogDate(endIso)}`;
  }

  try {
    const { entries, grouped } = await getWeekEntries(cls, branch, currentWeekStartDate);

    // Apply session type client-side if selected
    let filteredEntries = entries;
    if (type) {
      filteredEntries = entries.filter(e => e.sessionType === type);
    }

    allWeekEntries = filteredEntries;
    
    // Group filtered
    const reGrouped = {};
    for (let i = 0; i < 7; i++) {
      const d = addDaysToIso(currentWeekStartDate, i);
      reGrouped[d] = [];
    }
    filteredEntries.forEach(e => {
      if (reGrouped[e.date]) {
        reGrouped[e.date].push(e);
      }
    });

    groupedWeekEntries = reGrouped;

    updateStats(filteredEntries);

    if (activeView === "grid") {
      renderWeekGrid(groupedWeekEntries);
    } else {
      renderTableView(allWeekEntries);
    }
  } catch (err) {
    console.error("Error loading week data:", err);
    toast.error("Failed to load timetable entries.");
    // Fallback: render empty 7-day grid so the page is still usable
    if (Object.keys(groupedWeekEntries).length === 0) {
      const fallbackGrouped = {};
      for (let i = 0; i < 7; i++) {
        const d = addDaysToIso(currentWeekStartDate, i);
        fallbackGrouped[d] = [];
      }
      groupedWeekEntries = fallbackGrouped;
      renderWeekGrid(fallbackGrouped);
    }
  }
}

function updateStats(entries = []) {
  const total = entries.length;
  const classCount = entries.filter(e => e.sessionType === "Class").length;
  const examCount = entries.filter(e => e.sessionType === "Exam").length;
  const eventCount = entries.filter(e => e.sessionType === "Event" || e.sessionType === "Other").length;

  const statTotal = document.getElementById("stat-total-sessions");
  const statClass = document.getElementById("stat-class-sessions");
  const statExam = document.getElementById("stat-exam-sessions");
  const statEvent = document.getElementById("stat-event-sessions");

  if (statTotal) statTotal.textContent = total;
  if (statClass) statClass.textContent = classCount;
  if (statExam) statExam.textContent = examCount;
  if (statEvent) statEvent.textContent = eventCount;
}

function renderWeekGrid(grouped) {
  const container = document.getElementById("week-grid-container");
  if (!container) return;

  const todayIso = getISTTodayIso();
  let html = "";

  for (let i = 0; i < 7; i++) {
    const dateStr = addDaysToIso(currentWeekStartDate, i);
    const dayName = dayOfWeek(dateStr);
    const isToday = dateStr === todayIso;
    const dayEntries = grouped[dateStr] || [];

    html += `
      <div class="day-column ${isToday ? "is-today" : ""}">
        <div class="day-header">
          <div>
            <div class="day-title">${dayName.slice(0, 3)}</div>
            <div class="day-date">${formatLogDate(dateStr)}</div>
          </div>
          ${isToday ? `<span class="day-badge-today">Today</span>` : ""}
        </div>
        <div class="day-entries">
    `;

    if (dayEntries.length === 0) {
      html += `
        <div class="empty-day">
          No sessions<br>scheduled
        </div>
      `;
    } else {
      dayEntries.forEach(entry => {
        const typeClass = `card-type-${(entry.sessionType || "class").toLowerCase()}`;
        const typeIcon = SESSION_TYPE_ICONS[entry.sessionType] || "📌";
        const timeDisplay = formatEntryTime(entry);

        html += `
          <div class="timetable-card ${typeClass}">
            <div class="tt-time">
              <span>${typeIcon}</span>
              <span>${escapeHtml(timeDisplay)}</span>
            </div>
            ${entry.subjects && entry.subjects.length > 0 ? `
              <div style="display:flex; flex-wrap:wrap; gap:3px; margin-top:2px;">
                ${entry.subjects.map(s => `<span class="badge" style="font-size:10px; font-weight:700; background:var(--surface-2); padding:1px 6px;">${escapeHtml(s)}</span>`).join("")}
              </div>
            ` : (entry.subject ? `<div class="tt-subject">${escapeHtml(entry.subject)}</div>` : "")}
            ${entry.title ? `<div class="tt-title">${escapeHtml(entry.title)}</div>` : ""}
            <div class="tt-meta-row">
              <span class="tt-pill primary">Cls ${escapeHtml(entry.class)}</span>
              <span class="tt-pill">${escapeHtml(entry.branch)}</span>
              ${entry.location ? `<span class="tt-pill" title="Location">📍 ${escapeHtml(entry.location)}</span>` : ""}
            </div>
            <div class="tt-card-actions">
              <button type="button" class="btn-icon edit-entry-btn" data-id="${entry.id}" title="Edit Entry" style="width:24px; height:24px;">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button type="button" class="btn-icon delete-entry-btn" data-id="${entry.id}" title="Delete Entry" style="width:24px; height:24px; color:var(--c-danger);">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
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
  wireCardActionButtons();
}

function renderTableView(entries = []) {
  const tbody = document.getElementById("timetable-table-body");
  const paginationEl = document.getElementById("timetable-pagination");
  if (!tbody) return;

  if (entries.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center; padding:32px; color:var(--c-text-muted);">
          No timetable entries found for this week.
        </td>
      </tr>
    `;
    if (paginationEl) paginationEl.innerHTML = "";
    return;
  }

  const total = entries.length;
  const totalPages = Math.ceil(total / TABLE_PAGE_SIZE);
  if (tableCurrentPage > totalPages) tableCurrentPage = totalPages;
  if (tableCurrentPage < 1) tableCurrentPage = 1;

  const startIdx = (tableCurrentPage - 1) * TABLE_PAGE_SIZE;
  const pageEntries = entries.slice(startIdx, startIdx + TABLE_PAGE_SIZE);

  let html = "";
  pageEntries.forEach(entry => {
    const icon = SESSION_TYPE_ICONS[entry.sessionType] || "📌";
    const day = dayOfWeek(entry.date);
    const dateFormatted = formatLogDate(entry.date);
    const timeFormatted = formatEntryTime(entry);

    html += `
      <tr>
        <td>
          <strong>${escapeHtml(dateFormatted)}</strong>
          <div style="font-size:11px; color:var(--c-text-muted);">${escapeHtml(day)}</div>
        </td>
        <td>
          <strong>${escapeHtml(timeFormatted)}</strong>
        </td>
        <td>
          <span class="badge" style="background:var(--surface-2); font-weight:700;">
            ${icon} ${escapeHtml(entry.sessionType)}
          </span>
        </td>
        <td>
          <span style="font-weight:700;">Class ${escapeHtml(entry.class)}</span>
          <span class="badge" style="font-size:10px; margin-left:4px;">${escapeHtml(entry.branch)}</span>
        </td>
        <td>
          ${entry.subjects && entry.subjects.length > 0 ? `
            <div style="display:flex; flex-wrap:wrap; gap:3px;">
              ${entry.subjects.map(s => `<span class="badge" style="font-size:11px; font-weight:700; background:var(--surface-2); padding:1px 6px;">${escapeHtml(s)}</span>`).join("")}
            </div>
          ` : `<strong>${escapeHtml(entry.subject || "—")}</strong>`}
          ${entry.title ? `<div style="font-size:11px; color:var(--c-text-muted); margin-top:2px;">${escapeHtml(entry.title)}</div>` : ""}
        </td>
        <td>${escapeHtml(entry.location || "—")}</td>
        <td style="text-align:right;">
          <div style="display:inline-flex; gap:6px;">
            <button type="button" class="btn btn-ghost btn-sm edit-entry-btn" data-id="${entry.id}">
              Edit
            </button>
            <button type="button" class="btn btn-ghost btn-sm delete-entry-btn" data-id="${entry.id}" style="color:var(--c-danger);">
              Delete
            </button>
          </div>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  if (paginationEl) {
    renderPagination({
      container: paginationEl,
      totalItems: total,
      pageSize: TABLE_PAGE_SIZE,
      currentPage: tableCurrentPage,
      onPageChange: (newPage) => {
        tableCurrentPage = newPage;
        renderTableView(allWeekEntries);
      }
    });
  }

  wireCardActionButtons();
}

function wireCardActionButtons() {
  document.querySelectorAll(".edit-entry-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      openEditModal(id);
    });
  });

  document.querySelectorAll(".delete-entry-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      handleDeleteEntry(id);
    });
  });
}

function openAddModal(defaultDate) {
  const modal = document.getElementById("timetable-entry-modal");
  const form = document.getElementById("timetable-entry-form");
  const title = document.getElementById("modal-entry-title");
  if (!modal || !form) return;

  form.reset();
  document.getElementById("entry-id").value = "";
  if (title) title.textContent = "Add Timetable Entry";

  currentSelectedSubjects = [];

  const todayIso = getISTTodayIso();
  const dateInput = document.getElementById("entry-date");
  if (dateInput) {
    dateInput.value = defaultDate || todayIso;
    // Set min to today and max to today + 7 days as per plan
    dateInput.min = todayIso;
    dateInput.max = addDaysToIso(todayIso, 7);
  }

  if (currentAdmin && currentAdmin.branch !== "ALL") {
    document.getElementById("entry-branch").value = currentAdmin.branch;
  }

  const defaultCls = document.getElementById("entry-class")?.value || "";
  renderSubjectPicker(defaultCls);
  document.getElementById("entry-duration-display").textContent = "—";

  modal.classList.add("active");
}

async function openEditModal(id) {
  const modal = document.getElementById("timetable-entry-modal");
  const title = document.getElementById("modal-entry-title");
  if (!modal) return;

  try {
    const entry = await getTimetableEntry(id);
    if (!entry) {
      toast.error("Timetable entry not found.");
      return;
    }

    if (title) title.textContent = "Edit Timetable Entry";
    document.getElementById("entry-id").value = entry.id;

    const dateInput = document.getElementById("entry-date");
    if (dateInput) {
      dateInput.value = entry.date || "";
      // When editing existing entry, remove min limit so past/today entries can be viewed
      dateInput.removeAttribute("min");
      dateInput.removeAttribute("max");
    }

    document.getElementById("entry-session-type").value = entry.sessionType || "Class";
    document.getElementById("entry-class").value = normalizeClass(entry.class);
    document.getElementById("entry-branch").value = entry.branch || "MAN";

    // Set selected subjects (up to 3)
    if (entry.subjects && Array.isArray(entry.subjects) && entry.subjects.length > 0) {
      currentSelectedSubjects = [...entry.subjects];
    } else if (entry.subject) {
      currentSelectedSubjects = entry.subject.split(",").map(s => s.trim()).filter(Boolean);
    } else {
      currentSelectedSubjects = [];
    }
    renderSubjectPicker(entry.class);

    document.getElementById("entry-title").value = entry.title || "";
    document.getElementById("entry-start-time").value = entry.startTime || "";
    document.getElementById("entry-end-time").value = entry.endTime || "";

    document.getElementById("entry-location").value = entry.location || "";
    document.getElementById("entry-description").value = entry.description || "";

    // Trigger duration update
    const evt = new Event("input");
    document.getElementById("entry-start-time")?.dispatchEvent(evt);

    modal.classList.add("active");
  } catch (err) {
    console.error("Error opening edit modal:", err);
    toast.error("Could not load entry details.");
  }
}

async function handleSaveEntry(e) {
  e.preventDefault();
  const saveBtn = document.getElementById("save-entry-btn");
  setButtonLoading(saveBtn, true, "Saving…");

  try {
    const id = document.getElementById("entry-id").value;
    const date = document.getElementById("entry-date").value;
    const sessionType = document.getElementById("entry-session-type").value;
    const cls = document.getElementById("entry-class").value;
    const branch = document.getElementById("entry-branch").value;
    const title = document.getElementById("entry-title").value.trim();
    const startTime = document.getElementById("entry-start-time").value;
    const endTime = document.getElementById("entry-end-time").value;
    const location = document.getElementById("entry-location").value.trim();
    const description = document.getElementById("entry-description").value.trim();

    if (currentSelectedSubjects.length > 3) {
      toast.error("You can choose a maximum of 3 subjects.");
      setButtonLoading(saveBtn, false, "Save Entry");
      return;
    }

    const payload = {
      date,
      sessionType,
      class: cls,
      branch,
      subjects: currentSelectedSubjects,
      subject: currentSelectedSubjects.join(", "),
      title,
      startTime,
      endTime,
      location,
      description,
      createdBy: currentAdmin ? currentAdmin.id : null
    };

    if (id) {
      await updateTimetableEntry(id, payload);
      toast.success("Timetable entry updated successfully!");
    } else {
      await createTimetableEntry(payload);
      toast.success("Timetable entry added successfully!");
    }

    document.getElementById("timetable-entry-modal")?.classList.remove("active");
    await loadWeekData();
  } catch (err) {
    console.error("Save timetable entry error:", err);
    toast.error(err.message || "Failed to save timetable entry.");
  } finally {
    setButtonLoading(saveBtn, false, "Save Entry");
  }
}

async function handleDeleteEntry(id) {
  const confirmed = await showConfirmModal({
    title: "Delete Timetable Entry",
    message: "Are you sure you want to delete this scheduled session? This action cannot be undone.",
    confirmText: "Delete Entry",
    confirmVariant: "danger"
  });

  if (!confirmed) return;

  try {
    await deleteTimetableEntry(id);
    toast.success("Timetable entry deleted.");
    await loadWeekData();
  } catch (err) {
    console.error("Delete entry error:", err);
    toast.error("Failed to delete entry.");
  }
}

function wireEvents() {
  wireTimePicker({
    startId: "entry-start-time",
    endId: "entry-end-time",
    displayId: "entry-duration-display",
    hiddenId: "entry-duration"
  });

  // Add modal open
  document.getElementById("open-add-entry-btn")?.addEventListener("click", () => openAddModal());

  // Modal close
  const modal = document.getElementById("timetable-entry-modal");
  document.getElementById("close-entry-modal-btn")?.addEventListener("click", () => modal?.classList.remove("active"));
  document.getElementById("cancel-entry-btn")?.addEventListener("click", () => modal?.classList.remove("active"));
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.remove("active");
  });

  // Modal form submit
  document.getElementById("timetable-entry-form")?.addEventListener("submit", handleSaveEntry);

  // Dynamic subjects when class changes in modal
  document.getElementById("entry-class")?.addEventListener("change", (e) => {
    renderSubjectPicker(e.target.value);
  });

  // Custom subject input
  document.getElementById("add-custom-subject-btn")?.addEventListener("click", () => addCustomSubject());
  document.getElementById("custom-subject-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addCustomSubject();
    }
  });

  // Week navigation
  document.getElementById("prev-week-btn")?.addEventListener("click", async () => {
    currentWeekStartDate = addDaysToIso(currentWeekStartDate, -7);
    await loadWeekData();
  });

  document.getElementById("next-week-btn")?.addEventListener("click", async () => {
    currentWeekStartDate = addDaysToIso(currentWeekStartDate, 7);
    await loadWeekData();
  });

  document.getElementById("today-btn")?.addEventListener("click", async () => {
    currentWeekStartDate = getISTTodayIso();
    await loadWeekData();
  });

  // Filter changes
  document.getElementById("filter-class")?.addEventListener("change", () => loadWeekData());
  document.getElementById("filter-branch")?.addEventListener("change", () => loadWeekData());
  document.getElementById("filter-type")?.addEventListener("change", () => loadWeekData());

  // View toggle
  const gridToggleBtn = document.getElementById("toggle-view-grid");
  const tableToggleBtn = document.getElementById("toggle-view-table");
  const gridView = document.getElementById("view-week-grid");
  const tableView = document.getElementById("view-table-list");

  gridToggleBtn?.addEventListener("click", () => {
    activeView = "grid";
    gridToggleBtn.classList.add("active");
    tableToggleBtn?.classList.remove("active");
    if (gridView) gridView.style.display = "block";
    if (tableView) tableView.style.display = "none";
    renderWeekGrid(groupedWeekEntries);
  });

  tableToggleBtn?.addEventListener("click", () => {
    activeView = "table";
    tableToggleBtn.classList.add("active");
    gridToggleBtn?.classList.remove("active");
    if (gridView) gridView.style.display = "none";
    if (tableView) tableView.style.display = "block";
    renderTableView(allWeekEntries);
  });
}

