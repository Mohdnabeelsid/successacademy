import { requireAuth } from "../services/auth-service.js";
import { renderSidebar } from "../components/sidebar.js";
import { toast } from "../components/toast.js";
import {
  addStudyLog,
  updateStudyLog,
  getStudentLogs,
  deleteLog,
  calcStreak,
  calcWeeklyHours,
  calcMonthlyHours,
  calcTotalHours
} from "../services/studylog-service.js";
import {
  formatISTFullDate,
  getISTTodayIso,
  format12Hour,
  formatISTTime,
  formatLogDate,
  formatFullTimestamp,
  dayOfWeek
} from "../utils/date-time.js";
import { getStudent } from "../services/student-service.js";
import { getStudentEffectiveSubjects } from "../services/subject-service.js";
import { escapeHtml } from "../utils/exam-ui.js";
import { wireTimePicker } from "../utils/time-picker.js";
import { showConfirmModal } from "../components/confirm-modal.js";
import { renderPagination } from "../components/pagination.js";
import { setButtonLoading } from "../utils/ui-helpers.js";

let student;
let allLogs = [];
let activeTab = "All"; // "All" | "Study" | "Leave"
let enrolledSubjects = [];
let currentPage = 1;
const pageSize = 15;
let editingLogId = null;

(async function init() {
  try {
    const authStudent = await requireAuth("student", "student-login.html");
    const dbStudent = await getStudent(authStudent.id);
    student = dbStudent || authStudent;

    renderSidebar("student", "logs", {
      name: student.name,
      sub: `Class ${student.class || "-"} · ${student.branch || ""}`
    });

    const metaLabel = document.getElementById("student-meta-label");
    if (metaLabel) {
      metaLabel.textContent = `Class ${student.class || "—"} (${student.branch || "—"} Branch) · ${formatISTFullDate()}`;
    }

    document.getElementById("log-date").value = getISTTodayIso();
    document.getElementById("leave-date").value = getISTTodayIso();

    // Populate subject choices
    enrolledSubjects = getStudentEffectiveSubjects(student);
    populateSubjectDropdowns(enrolledSubjects);

    await refreshData();
    wireEvents();
  } catch (err) {
    console.error("Student study logs init error:", err);
    toast.error("Error loading study logs data.");
  } finally {
    const loader = document.getElementById("page-loader");
    if (loader) loader.classList.add("done");
  }
})();

function populateSubjectDropdowns(subjects) {
  const modalSubjectSelect = document.getElementById("log-subject");
  const filterSubjectSelect = document.getElementById("filter-subject");

  if (modalSubjectSelect) {
    modalSubjectSelect.innerHTML = '<option value="">Select subject</option>';
    subjects.forEach((subj) => {
      const opt = document.createElement("option");
      opt.value = subj;
      opt.textContent = subj;
      modalSubjectSelect.appendChild(opt);
    });
  }

  if (filterSubjectSelect) {
    filterSubjectSelect.innerHTML = '<option value="">All Subjects</option>';
    subjects.forEach((subj) => {
      const opt = document.createElement("option");
      opt.value = subj;
      opt.textContent = subj;
      filterSubjectSelect.appendChild(opt);
    });
  }
}

async function refreshData() {
  allLogs = await getStudentLogs(student.id);

  // Update Summary Stat Cards
  document.getElementById("stat-streak").textContent = `${calcStreak(allLogs)} 🔥`;
  document.getElementById("stat-weekly").textContent = `${calcWeeklyHours(allLogs)} hrs`;
  document.getElementById("stat-monthly").textContent = `${calcMonthlyHours(allLogs)} hrs`;
  document.getElementById("stat-total").textContent = `${calcTotalHours(allLogs)} hrs`;

  // Update tab counts
  const studyCount = allLogs.filter((l) => Number(l.durationMinutes) > 0 && !(l.subject && l.subject.includes("Leave"))).length;
  const leaveCount = allLogs.filter((l) => Number(l.durationMinutes) === 0 || (l.subject && l.subject.includes("Leave"))).length;

  document.getElementById("count-all").textContent = allLogs.length;
  document.getElementById("count-study").textContent = studyCount;
  document.getElementById("count-leave").textContent = leaveCount;

  render();
}

function getLogTimeRange(log) {
  if (log.startTime && log.endTime) {
    const s = format12Hour(log.startTime);
    const e = format12Hour(log.endTime);
    return {
      start: s,
      end: e,
      rangeStr: `${s} – ${e}`
    };
  }

  if (log.createdAt) {
    try {
      const endD = new Date(log.createdAt);
      if (!isNaN(endD.getTime())) {
        const duration = Number(log.durationMinutes || 0);
        if (duration > 0) {
          const startD = new Date(endD.getTime() - duration * 60000);
          const startStr = formatISTTime(startD);
          const endStr = formatISTTime(endD);
          return {
            start: startStr,
            end: endStr,
            rangeStr: `${startStr} – ${endStr}`
          };
        } else {
          const timeStr = formatISTTime(endD);
          return {
            start: timeStr,
            end: timeStr,
            rangeStr: timeStr
          };
        }
      }
    } catch (e) {}
  }

  return {
    start: "—",
    end: "—",
    rangeStr: "—"
  };
}

function getFilteredLogs() {
  const searchTerm = (document.getElementById("search-input")?.value || "").toLowerCase().trim();
  const subjectFilter = document.getElementById("filter-subject")?.value || "";
  const dateFilter = document.getElementById("filter-date")?.value || "";

  return allLogs.filter((l) => {
    const isLeave = Number(l.durationMinutes) === 0 || (l.subject && l.subject.includes("Leave"));

    // Tab filtering
    if (activeTab === "Study" && isLeave) return false;
    if (activeTab === "Leave" && !isLeave) return false;

    // Subject filtering
    if (subjectFilter && l.subject !== subjectFilter) return false;

    // Date filtering
    if (dateFilter && l.date !== dateFilter) return false;

    // Search query
    if (searchTerm) {
      const matchSubject = (l.subject || "").toLowerCase().includes(searchTerm);
      const matchChapter = (l.chapter || "").toLowerCase().includes(searchTerm);
      const matchNotes = (l.notes || "").toLowerCase().includes(searchTerm);
      const matchDate = (l.date || "").includes(searchTerm);
      if (!matchSubject && !matchChapter && !matchNotes && !matchDate) return false;
    }

    return true;
  });
}

function render() {
  const filtered = getFilteredLogs();
  const body = document.getElementById("logs-body");

  // Show or hide clear filters button
  const hasActiveFilters =
    Boolean(document.getElementById("search-input")?.value.trim()) ||
    Boolean(document.getElementById("filter-subject")?.value) ||
    Boolean(document.getElementById("filter-date")?.value);

  const clearBtn = document.getElementById("clear-filters-btn");
  if (clearBtn) {
    clearBtn.style.display = hasActiveFilters ? "inline-flex" : "none";
  }

  if (!filtered.length) {
    body.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state">
            <h4>No study logs found</h4>
            <p style="margin-top:4px; font-size:var(--fs-xs); color:var(--c-slate-500);">
              ${hasActiveFilters ? "Try resetting your search or filter options." : "Submit your first study log session to track your learning progress."}
            </p>
          </div>
        </td>
      </tr>
    `;
    const paginationEl = document.getElementById("logs-pagination");
    if (paginationEl) paginationEl.innerHTML = "";
    return;
  }

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  if (currentPage > totalPages) currentPage = totalPages;
  const pagedLogs = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  body.innerHTML = pagedLogs
    .map((l) => {
      const isLeave = Number(l.durationMinutes) === 0 || (l.subject && l.subject.includes("Leave"));

      const typeBadge = isLeave
        ? '<span class="badge badge-warning" style="background:#FFFBEB; color:#D97706; border:1px solid #FCD34D;">⚠️ Leave / No Study</span>'
        : '<span class="badge badge-success">✓ Logged</span>';

      const subjectDisplay = isLeave ? `⚠️ ${escapeHtml(l.chapter || "Inability Reported")}` : escapeHtml(l.subject);
      const chapterNotes = isLeave ? (l.notes || "—") : (l.chapter || l.notes || "—");
      const durationDisplay = isLeave ? "—" : `${l.durationMinutes} min`;
      const timeInfo = getLogTimeRange(l);
      const logDay = l.day || dayOfWeek(l.date);

      return `<tr>
        <td>
          <div style="font-weight:600; color:var(--c-dark);">${formatLogDate(l.date)}</div>
          <div style="font-size:var(--fs-xs); color:var(--c-slate-500);">${logDay}</div>
        </td>
        <td>
          <span style="display:inline-flex; align-items:center; gap:4px; font-size:var(--fs-xs); font-weight:500; color:var(--c-slate-700); background:var(--surface-1); padding:3px 8px; border-radius:var(--r-sm); border:1px solid var(--c-border); white-space:nowrap;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:0.6;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            ${timeInfo.rangeStr}
          </span>
        </td>
        <td style="font-weight:600;">${subjectDisplay}</td>
        <td style="max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(chapterNotes)}">
          ${escapeHtml(chapterNotes)}
        </td>
        <td style="font-weight:600; color:${isLeave ? 'var(--c-slate-500)' : 'var(--c-primary)'};">${durationDisplay}</td>
        <td>${typeBadge}</td>
        <td style="text-align:right;">
          <div class="flex items-center justify-end gap-1">
            <button class="btn btn-ghost btn-sm" data-view="${l.id}" title="View Log Details" style="padding:0; display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; min-width:32px; color:var(--c-primary); border-color:rgba(15,161,93,0.3);">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </button>
            ${!isLeave ? `<button class="btn btn-ghost btn-sm" data-edit="${l.id}" title="Edit Log" style="color:var(--c-secondary); padding:6px 10px; font-weight:600;">Edit</button>` : ""}
            <button class="btn btn-ghost btn-sm" data-delete="${l.id}" title="Delete Log" style="color:var(--c-danger); padding:6px 10px;">Delete</button>
          </div>
        </td>
      </tr>`;
    })
    .join("");

  renderPagination({
    container: "logs-pagination",
    totalItems: filtered.length,
    pageSize: pageSize,
    currentPage: currentPage,
    onPageChange: (newPage) => {
      currentPage = newPage;
      render();
    }
  });
}

function openViewLogModal(logId) {
  const log = allLogs.find((l) => l.id === logId);
  if (!log) return;
  const isLeave = Number(log.durationMinutes) === 0 || (log.subject && log.subject.includes("Leave"));

  const modal = document.getElementById("view-log-modal");
  const content = document.getElementById("view-modal-content");
  const icon = document.getElementById("view-modal-icon");
  const title = document.getElementById("view-modal-title");

  if (isLeave) {
    icon.style.background = "#FFFBEB";
    icon.style.color = "#D97706";
    icon.innerHTML = `<span style="font-size:18px;">⚠️</span>`;
    title.textContent = "Inability / Leave Report Details";
  } else {
    icon.style.background = "rgba(15,161,93,0.12)";
    icon.style.color = "var(--c-primary)";
    icon.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
    title.textContent = "Study Log Details";
  }

  const durationHrs = Math.floor(Number(log.durationMinutes || 0) / 60);
  const durationMins = Number(log.durationMinutes || 0) % 60;
  const durationLabel = Number(log.durationMinutes || 0) > 0
    ? (durationHrs > 0 ? `${durationHrs}h ${durationMins > 0 ? durationMins + "m" : ""}`.trim() : `${durationMins} minutes`)
    : "0 minutes (Leave / Inability)";

  const submissionTime = formatFullTimestamp(log.createdAt);
  const timeInfo = getLogTimeRange(log);

  content.innerHTML = `
    <div style="background:var(--surface-1); border-radius:var(--r-md); padding:14px 16px; margin-bottom:var(--sp-4); display:flex; align-items:center; justify-content:space-between; gap:12px; border:1px solid var(--c-border);">
      <div>
        <div style="font-weight:700; font-size:var(--fs-sm); color:var(--c-dark);">${escapeHtml(student?.name || "Student")}</div>
        <div style="font-size:var(--fs-xs); color:var(--c-slate-500); margin-top:2px;">
          Class ${escapeHtml(student?.class || "—")} · ${escapeHtml(student?.branch || "—")} Branch
        </div>
      </div>
      ${isLeave
        ? '<span class="badge badge-warning" style="background:#FFFBEB; color:#D97706; border:1px solid #FCD34D;">⚠️ Leave / No Study</span>'
        : '<span class="badge badge-success">✓ Study Log</span>'}
    </div>

    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:var(--sp-4);">
      <div style="background:var(--surface-0); border:1px solid var(--c-border); border-radius:var(--r-md); padding:12px;">
        <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:var(--c-slate-500); font-weight:600;">Date & Day</div>
        <div style="font-size:var(--fs-sm); font-weight:600; margin-top:4px; color:var(--c-dark);">
          ${formatLogDate(log.date)}
          <span style="font-weight:400; color:var(--c-slate-500); font-size:var(--fs-xs);">(${escapeHtml(log.day || dayOfWeek(log.date))})</span>
        </div>
      </div>

      <div style="background:var(--surface-0); border:1px solid var(--c-border); border-radius:var(--r-md); padding:12px;">
        <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:var(--c-slate-500); font-weight:600;">
          ${isLeave ? "Recorded Time" : "Study Time (IST)"}
        </div>
        <div style="font-size:var(--fs-sm); font-weight:700; margin-top:4px; color:var(--c-dark); display:flex; align-items:center; gap:6px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--c-primary); flex-shrink:0;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          <span>${timeInfo.rangeStr}</span>
        </div>
        ${!isLeave && timeInfo.start !== timeInfo.end ? `
        <div style="font-size:11px; color:var(--c-slate-500); margin-top:4px; display:flex; gap:8px;">
          <span><span style="color:var(--c-slate-400);">From:</span> <strong>${timeInfo.start}</strong></span>
          <span>•</span>
          <span><span style="color:var(--c-slate-400);">To:</span> <strong>${timeInfo.end}</strong></span>
        </div>
        ` : ""}
      </div>

      <div style="background:var(--surface-0); border:1px solid var(--c-border); border-radius:var(--r-md); padding:12px;">
        <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:var(--c-slate-500); font-weight:600;">${isLeave ? "Category" : "Subject"}</div>
        <div style="font-size:var(--fs-sm); font-weight:600; margin-top:4px; color:var(--c-dark);">
          ${escapeHtml(log.subject || "—")}
        </div>
      </div>

      <div style="background:var(--surface-0); border:1px solid var(--c-border); border-radius:var(--r-md); padding:12px;">
        <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:var(--c-slate-500); font-weight:600;">${isLeave ? "Reason" : "Duration"}</div>
        <div style="font-size:var(--fs-sm); font-weight:600; margin-top:4px; color:${isLeave ? 'var(--c-warning)' : 'var(--c-primary)'};">
          ${isLeave ? escapeHtml(log.chapter || "Inability Reported") : `${log.durationMinutes} min (${durationLabel})`}
        </div>
      </div>
    </div>

    ${!isLeave && log.chapter ? `
    <div style="background:var(--surface-0); border:1px solid var(--c-border); border-radius:var(--r-md); padding:12px; margin-bottom:var(--sp-4);">
      <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:var(--c-slate-500); font-weight:600; margin-bottom:4px;">Chapter / Topic Covered</div>
      <div style="font-size:var(--fs-sm); font-weight:600; color:var(--c-dark);">${escapeHtml(log.chapter)}</div>
    </div>
    ` : ""}

    <div style="background:var(--surface-0); border:1px solid var(--c-border); border-radius:var(--r-md); padding:14px; margin-bottom:var(--sp-4);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:var(--c-slate-500); font-weight:600;">
          ${isLeave ? "Detailed Reason / Explanation" : "Your Notes & Remarks"}
        </div>
      </div>
      <div style="background:var(--surface-1); border:1px solid var(--c-border); border-radius:var(--r-sm); padding:12px 14px; font-size:var(--fs-sm); line-height:1.6; color:var(--c-dark); white-space:pre-wrap; max-height:160px; overflow-y:auto; word-break:break-word;">${log.notes ? escapeHtml(log.notes) : `<span style="color:var(--c-slate-400); font-style:italic;">No additional notes recorded.</span>`}</div>
    </div>

    <div style="font-size:11px; color:var(--c-slate-400); margin-bottom:var(--sp-4); text-align:right;">
      Submitted on: ${submissionTime}
    </div>

    <div class="flex justify-between items-center" style="padding-top:var(--sp-3); border-top:1px solid var(--c-border);">
      <div class="flex gap-2">
        <button type="button" class="btn btn-ghost btn-sm" id="view-modal-close-btn">Close</button>
        ${!isLeave ? `<button type="button" class="btn btn-secondary btn-sm" data-modal-edit="${log.id}">✏️ Edit Log</button>` : ""}
      </div>
      <button type="button" class="btn btn-ghost btn-sm" data-modal-delete="${log.id}" style="color:var(--c-danger); border-color:rgba(239,68,68,0.3);">
        🗑 Delete Log Entry
      </button>
    </div>
  `;

  document.getElementById("view-modal-close-btn")?.addEventListener("click", () => {
    modal.classList.remove("active");
  });

  const modalEditBtn = content.querySelector("[data-modal-edit]");
  if (modalEditBtn) {
    modalEditBtn.addEventListener("click", () => {
      modal.classList.remove("active");
      openEditLogModal(modalEditBtn.dataset.modalEdit);
    });
  }

  const modalDeleteBtn = content.querySelector("[data-modal-delete]");
  if (modalDeleteBtn) {
    modalDeleteBtn.addEventListener("click", async () => {
      const deleteId = modalDeleteBtn.dataset.modalDelete;
      const confirmed = await showConfirmModal({
        title: "Delete Study Log",
        message: "Are you sure you want to delete this study log entry? This cannot be undone.",
        confirmText: "Delete Entry",
        confirmVariant: "danger"
      });
      if (!confirmed) return;
      try {
        await deleteLog(deleteId);
        modal.classList.remove("active");
        toast.success("Log entry deleted successfully.");
        await refreshData();
      } catch (err) {
        toast.error(err.message || "Failed to delete log entry.");
      }
    });
  }

  modal.classList.add("active");
}

function wireEvents() {
  // Shared time picker calculation
  wireTimePicker({
    startId: "log-start-time",
    endId: "log-end-time",
    displayId: "log-duration-display",
    hiddenId: "log-duration"
  });

  // Tab buttons
  document.querySelectorAll(".tabs .tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tabs .tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeTab = btn.dataset.filter;
      currentPage = 1;
      render();
    });
  });

  // Filter inputs
  const onFilterChange = () => {
    currentPage = 1;
    render();
  };
  document.getElementById("search-input")?.addEventListener("input", onFilterChange);
  document.getElementById("filter-subject")?.addEventListener("change", onFilterChange);
  document.getElementById("filter-date")?.addEventListener("change", onFilterChange);

  document.getElementById("clear-filters-btn")?.addEventListener("click", () => {
    const searchInput = document.getElementById("search-input");
    const subjSelect = document.getElementById("filter-subject");
    const dateInput = document.getElementById("filter-date");
    if (searchInput) searchInput.value = "";
    if (subjSelect) subjSelect.value = "";
    if (dateInput) dateInput.value = "";
    currentPage = 1;
    render();
  });

  // Modals wiring
  const logModal = document.getElementById("log-modal");
  const openLogBtn = document.getElementById("open-log-modal");
  const closeLogBtn = document.getElementById("close-log-modal");

  if (openLogBtn && logModal) {
    openLogBtn.addEventListener("click", () => {
      editingLogId = null;
      document.getElementById("log-form")?.reset();
      const titleEl = document.getElementById("log-modal-title");
      const submitBtn = document.getElementById("log-submit-btn");
      if (titleEl) titleEl.textContent = "Add Study Log";
      if (submitBtn) submitBtn.textContent = "Submit Study Log";
      document.getElementById("log-date").value = getISTTodayIso();
      const display = document.getElementById("log-duration-display");
      if (display) {
        display.textContent = "Duration will appear here after selecting times.";
        display.style.color = "var(--c-slate-500)";
      }
      logModal.classList.add("active");
    });
    closeLogBtn?.addEventListener("click", () => logModal.classList.remove("active"));
    logModal.addEventListener("click", (e) => {
      if (e.target === logModal) logModal.classList.remove("active");
    });
  }

  // Leave Modal wiring
  const leaveModal = document.getElementById("leave-modal");
  const openLeaveBtn = document.getElementById("open-leave-modal");
  const closeLeaveBtn = document.getElementById("close-leave-modal");

  if (openLeaveBtn && leaveModal) {
    openLeaveBtn.addEventListener("click", () => {
      document.getElementById("leave-date").value = getISTTodayIso();
      leaveModal.classList.add("active");
    });
    closeLeaveBtn?.addEventListener("click", () => leaveModal.classList.remove("active"));
    leaveModal.addEventListener("click", (e) => {
      if (e.target === leaveModal) leaveModal.classList.remove("active");
    });
  }

  // View Modal close
  const viewModal = document.getElementById("view-log-modal");
  const closeViewBtn = document.getElementById("close-view-log-modal");
  if (viewModal && closeViewBtn) {
    closeViewBtn.addEventListener("click", () => viewModal.classList.remove("active"));
    viewModal.addEventListener("click", (e) => {
      if (e.target === viewModal) viewModal.classList.remove("active");
    });
  }

  // Escape key closes active modals
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.querySelectorAll(".modal-overlay.active").forEach((m) => m.classList.remove("active"));
    }
  });

  // Table action clicks (View, Edit & Delete)
  document.getElementById("logs-body")?.addEventListener("click", async (e) => {
    const viewBtn = e.target.closest("[data-view]");
    if (viewBtn) {
      openViewLogModal(viewBtn.dataset.view);
      return;
    }

    const editBtn = e.target.closest("[data-edit]");
    if (editBtn) {
      openEditLogModal(editBtn.dataset.edit);
      return;
    }

    const deleteBtn = e.target.closest("[data-delete]");
    if (deleteBtn) {
      const deleteId = deleteBtn.dataset.delete;
      const confirmed = await showConfirmModal({
        title: "Delete Study Log",
        message: "Are you sure you want to delete this study log entry? This cannot be undone.",
        confirmText: "Delete Entry",
        confirmVariant: "danger"
      });
      if (!confirmed) return;
      try {
        await deleteLog(deleteId);
        toast.success("Log entry deleted successfully.");
        await refreshData();
      } catch (err) {
        toast.error(err.message || "Failed to delete log entry.");
      }
    }
  });

  // Submit Add / Edit Study Log
  const logForm = document.getElementById("log-form");
  if (logForm) {
    logForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = document.getElementById("log-submit-btn");
      const durationVal = document.getElementById("log-duration").value;
      if (!durationVal || Number(durationVal) <= 0) {
        toast.error("Please select a valid start and end time.");
        return;
      }
      setButtonLoading(btn, true, editingLogId ? "Saving..." : "Submitting...");
      try {
        const startTimeVal = document.getElementById("log-start-time")?.value || "";
        const endTimeVal = document.getElementById("log-end-time")?.value || "";

        if (editingLogId) {
          await updateStudyLog(editingLogId, {
            date: document.getElementById("log-date").value,
            subject: document.getElementById("log-subject").value,
            durationMinutes: durationVal,
            startTime: startTimeVal,
            endTime: endTimeVal,
            chapter: document.getElementById("log-chapter").value,
            notes: document.getElementById("log-notes").value
          });
          toast.success("Study log updated successfully!");
        } else {
          await addStudyLog(student.id, {
            date: document.getElementById("log-date").value,
            subject: document.getElementById("log-subject").value,
            durationMinutes: durationVal,
            startTime: startTimeVal,
            endTime: endTimeVal,
            chapter: document.getElementById("log-chapter").value,
            notes: document.getElementById("log-notes").value
          });
          toast.success("Study log recorded successfully!");
        }

        editingLogId = null;
        logModal.classList.remove("active");
        logForm.reset();
        document.getElementById("log-date").value = getISTTodayIso();
        const display = document.getElementById("log-duration-display");
        if (display) {
          display.textContent = "Duration will appear here after selecting times.";
          display.style.color = "var(--c-slate-500)";
        }
        await refreshData();
      } catch (err) {
        toast.error(err.message || "Could not submit study log.");
      } finally {
        setButtonLoading(btn, false);
      }
    });
  }

  // Submit Leave / Inability Report
  const leaveForm = document.getElementById("leave-form");
  if (leaveForm) {
    leaveForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = document.getElementById("leave-submit-btn");
      btn.disabled = true;
      try {
        await addStudyLog(student.id, {
          date: document.getElementById("leave-date").value,
          subject: "⚠️ Inability to Study / Leave",
          durationMinutes: 0,
          chapter: document.getElementById("leave-reason").value,
          notes: document.getElementById("leave-notes").value
        });

        toast.success("Inability to study reported successfully.");
        leaveModal.classList.remove("active");
        leaveForm.reset();
        document.getElementById("leave-date").value = getISTTodayIso();
        await refreshData();
      } catch (err) {
        toast.error(err.message || "Could not submit inability report.");
      } finally {
        btn.disabled = false;
      }
    });
  }
}
