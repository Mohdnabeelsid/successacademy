import { requireAuth } from "../services/auth-service.js";
import { renderSidebar } from "../components/sidebar.js";
import { toast } from "../components/toast.js";
// Fix #6: LOG_STATUS removed — approval workflow was removed; status no longer used for filtering
import { getAllLogs, deleteLog, addStudyLog } from "../services/studylog-service.js";
import { listStudents } from "../services/student-service.js";
import { getSubjectsForClass } from "../services/subject-service.js";
import {
  format12Hour,
  formatISTTime,
  formatLogDate,
  formatISTTimestamp,
  getISTTodayIso,
  dayOfWeek
} from "../utils/date-time.js";
// Fix #8: import shared escapeHtml instead of duplicating it
import { escapeHtml } from "../utils/exam-ui.js";
// Fix #7: import shared wireTimePicker instead of duplicating it
import { wireTimePicker } from "../utils/time-picker.js";
import { showConfirmModal } from "../components/confirm-modal.js";
import { renderPagination } from "../components/pagination.js";

let admin, allLogs = [], studentMap = {}, activeFilter = "All";
let currentPage = 1;
const pageSize = 20;

// Fix #10: init() now has try/catch/finally so network errors don't hang the page-loader spinner
(async function init() {
  try {
    admin = await requireAuth("admin", "admin-login.html");
    renderSidebar("admin", "logs", { name: admin.name || admin.email, sub: "Branch Admin" });

    const [logs, students] = await Promise.all([getAllLogs(), listStudents()]);
    allLogs = logs;
    studentMap = Object.fromEntries(students.map((s) => [s.id, s]));

    // Populate student selects for admin modals
    const studentSelect = document.getElementById("admin-log-student");
    const leaveStudentSelect = document.getElementById("admin-leave-student");
    const studentOpts = '<option value="">Select student</option>' +
      students
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
        .map((s) => `<option value="${s.id}">${escapeHtml(s.name)} (${escapeHtml(s.admissionNumber)})</option>`)
        .join("");

    if (studentSelect) studentSelect.innerHTML = studentOpts;
    if (leaveStudentSelect) leaveStudentSelect.innerHTML = studentOpts;

    render();
    wireEvents();
  } catch (err) {
    console.error("Study log management init error:", err);
    toast.error("Failed to load study logs. Please refresh the page.");
  } finally {
    // Always hide the loader, even on error, so the page doesn't spin forever
    document.getElementById("page-loader")?.classList.add("done");
  }
})();

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

// Fix #8: escapeHtml removed — now imported from ../utils/exam-ui.js

// Fix #6: render() filter logic documented clearly.
// activeFilter is "All" (show everything) or "Leave" (show only leave/no-study entries).
function render() {
  const filtered = activeFilter === "All"
    ? allLogs
    : allLogs.filter((l) => Number(l.durationMinutes) === 0 || (l.subject && l.subject.includes("Leave")));

  const body = document.getElementById("logs-body");

  if (!filtered.length) {
    body.innerHTML = `<tr><td colspan="8"><div class="empty-state"><h4>Nothing here</h4>No logs found.</div></td></tr>`;
    const paginationEl = document.getElementById("logs-pagination");
    if (paginationEl) paginationEl.innerHTML = "";
    return;
  }

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  if (currentPage > totalPages) currentPage = totalPages;
  const pagedLogs = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  body.innerHTML = pagedLogs
    .map((l) => {
      const s = studentMap[l.studentId];
      const isLeave = Number(l.durationMinutes) === 0 || (l.subject && l.subject.includes("Leave"));

      const typeBadge = isLeave
        ? '<span class="badge badge-warning" style="background:#FFFBEB; color:#D97706; border:1px solid #FCD34D;">⚠️ Leave / No Study</span>'
        : '<span class="badge badge-success">✓ Logged</span>';

      const subject = isLeave ? `⚠️ ${l.chapter || "Inability Reported"}` : l.subject;
      const chapterNotes = isLeave ? (l.notes || "—") : (l.chapter || "—");
      const duration = isLeave ? "—" : `${l.durationMinutes} min`;
      const timeInfo = getLogTimeRange(l);

      const actions = `
        <div class="flex items-center justify-end gap-1">
          <button class="btn btn-ghost btn-sm" data-view="${l.id}" title="View Student Input" style="padding:0; display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; min-width:32px; color:var(--c-primary); border-color:rgba(15,161,93,0.3);">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          </button>
          <button class="btn btn-ghost btn-sm" data-delete="${l.id}" title="Delete Log" style="color:var(--c-danger); padding:6px 10px;">Delete</button>
        </div>
      `;

      return `<tr>
        <td>
          <div style="font-weight:600;">${s ? escapeHtml(s.name) : "Unknown"}</div>
          <div style="font-size:var(--fs-xs);color:var(--c-slate-500);">${s ? `${s.admissionNumber || ""} · Cl. ${s.class || ""}` : ""}</div>
        </td>
        <td>${l.date}</td>
        <td>
          <span style="display:inline-flex;align-items:center;gap:4px;font-size:var(--fs-xs);font-weight:500;color:var(--c-slate-700);background:var(--surface-1);padding:3px 8px;border-radius:var(--r-sm);border:1px solid var(--c-border);white-space:nowrap;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:0.6;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            ${timeInfo.rangeStr}
          </span>
        </td>
        <td>${escapeHtml(subject)}</td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(chapterNotes)}">${escapeHtml(chapterNotes)}</td>
        <td>${duration}</td>
        <td>${typeBadge}</td>
        <td style="text-align:right;">${actions}</td>
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
  const s = studentMap[log.studentId];
  const isLeave = Number(log.durationMinutes) === 0 || (log.subject && log.subject.includes("Leave"));

  const modal = document.getElementById("view-log-modal");
  const content = document.getElementById("view-modal-content");
  const icon = document.getElementById("view-modal-icon");
  const title = document.getElementById("view-modal-title");

  if (isLeave) {
    icon.style.background = "#FFFBEB";
    icon.style.color = "#D97706";
    icon.innerHTML = `<span style="font-size:18px;">⚠️</span>`;
    title.textContent = "Student Inability / Leave Report";
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

  const initial = (s?.name || "?").charAt(0).toUpperCase();
  const submissionTime = formatFullTimestamp(log.createdAt);
  const timeInfo = getLogTimeRange(log);

  content.innerHTML = `
    <div style="background:var(--surface-1); border-radius:var(--r-md); padding:14px 16px; margin-bottom:var(--sp-4); display:flex; align-items:center; justify-content:space-between; gap:12px; border:1px solid var(--c-border);">
      <div class="flex items-center gap-3">
        <div class="avatar" style="width:42px; height:42px; font-size:var(--fs-sm); font-weight:700;">${initial}</div>
        <div>
          <div style="font-weight:700; font-size:var(--fs-sm); color:var(--c-dark);">${s ? escapeHtml(s.name) : "Unknown Student"}</div>
          <div style="font-size:var(--fs-xs); color:var(--c-slate-500); margin-top:2px;">
            ${s?.admissionNumber ? `<span style="font-weight:600; color:var(--c-slate-700);">${escapeHtml(s.admissionNumber)}</span> · ` : ""}Class ${escapeHtml(s?.class || "—")} · ${escapeHtml(s?.branch || "—")}
          </div>
        </div>
      </div>
      ${isLeave
        ? '<span class="badge badge-warning" style="background:#FFFBEB; color:#D97706; border:1px solid #FCD34D;">⚠️ Leave</span>'
        : '<span class="badge badge-success">✓ Study Log</span>'}
    </div>

    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:var(--sp-4);">
      <div style="background:var(--surface-0); border:1px solid var(--c-border); border-radius:var(--r-md); padding:12px;">
        <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:var(--c-slate-500); font-weight:600;">Log Date & Day</div>
        <div style="font-size:var(--fs-sm); font-weight:600; margin-top:4px; color:var(--c-dark);">
          ${formatLogDate(log.date)}
          <span style="font-weight:400; color:var(--c-slate-500); font-size:var(--fs-xs);">(${escapeHtml(log.day || dayOfWeek(log.date))})</span>
        </div>
      </div>

      <div style="background:var(--surface-0); border:1px solid var(--c-border); border-radius:var(--r-md); padding:12px;">
        <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:var(--c-slate-500); font-weight:600;">
          ${isLeave ? "Recorded Time" : "Study Time (Start & End)"}
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
          ${isLeave ? "Student's Detailed Reason / Explanation" : "Student's Notes & Comments"}
        </div>
        <span style="font-size:11px; color:var(--c-slate-400);">What student input</span>
      </div>
      <div style="background:var(--surface-1); border:1px solid var(--c-border); border-radius:var(--r-sm); padding:12px 14px; font-size:var(--fs-sm); line-height:1.6; color:var(--c-dark); white-space:pre-wrap; max-height:160px; overflow-y:auto; word-break:break-word;">${log.notes ? escapeHtml(log.notes) : `<span style="color:var(--c-slate-400); font-style:italic;">No additional notes submitted by the student.</span>`}</div>
    </div>

    <div style="font-size:11px; color:var(--c-slate-400); margin-bottom:var(--sp-4); text-align:right;">
      Submitted on: ${submissionTime}
    </div>

    <div class="flex justify-between items-center" style="padding-top:var(--sp-3); border-top:1px solid var(--c-border);">
      <button type="button" class="btn btn-ghost btn-sm" id="view-modal-close-btn">Close</button>
      <button type="button" class="btn btn-ghost btn-sm" data-modal-delete="${log.id}" style="color:var(--c-danger); border-color:rgba(239,68,68,0.3);">
        🗑 Delete Log Entry
      </button>
    </div>
  `;

  // Wire inside-modal events
  document.getElementById("view-modal-close-btn")?.addEventListener("click", () => {
    modal.classList.remove("active");
  });

  const modalDeleteBtn = content.querySelector("[data-modal-delete]");
  if (modalDeleteBtn) {
    modalDeleteBtn.addEventListener("click", async () => {
      const deleteId = modalDeleteBtn.dataset.modalDelete;
      const confirmed = await showConfirmModal({
        title: "Delete Log Entry",
        message: "Are you sure you want to permanently delete this log entry? This cannot be undone.",
        confirmText: "Delete Log",
        confirmVariant: "danger"
      });
      if (!confirmed) return;
      try {
        await deleteLog(deleteId);
        allLogs = allLogs.filter((l) => l.id !== deleteId);
        modal.classList.remove("active");
        toast.success("Log entry deleted.");
        render();
      } catch (err) {
        toast.error(err.message || "Failed to delete log entry.");
      }
    });
  }

  modal.classList.add("active");
}

function wireEvents() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeFilter = btn.dataset.status;
      currentPage = 1;
      render();
    });
  });

  // Table body click delegation for View and Delete
  document.getElementById("logs-body").addEventListener("click", async (e) => {
    const viewBtn = e.target.closest("[data-view]");
    if (viewBtn) {
      const logId = viewBtn.dataset.view;
      openViewLogModal(logId);
      return;
    }

    const deleteBtn = e.target.closest("[data-delete]");
    if (deleteBtn) {
      const deleteId = deleteBtn.dataset.delete;
      const confirmed = await showConfirmModal({
        title: "Delete Log Entry",
        message: "Are you sure you want to permanently delete this log entry? This cannot be undone.",
        confirmText: "Delete Log",
        confirmVariant: "danger"
      });
      if (!confirmed) return;
      try {
        await deleteLog(deleteId);
        allLogs = allLogs.filter((l) => l.id !== deleteId);
        toast.success("Log entry deleted.");
        render();
      } catch (err) {
        toast.error(err.message || "Failed to delete log entry.");
      }
    }
  });

  // View Log Modal controls
  const viewModal = document.getElementById("view-log-modal");
  const closeViewBtn = document.getElementById("close-view-log-modal");
  if (closeViewBtn && viewModal) {
    closeViewBtn.addEventListener("click", () => viewModal.classList.remove("active"));
    viewModal.addEventListener("click", (e) => {
      if (e.target === viewModal) viewModal.classList.remove("active");
    });
  }

  // Close modals on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.querySelectorAll(".modal-overlay.active").forEach((m) => m.classList.remove("active"));
    }
  });

  // Admin Log Modal
  const studentSelect = document.getElementById("admin-log-student");
  const adminModal = document.getElementById("admin-log-modal");
  const adminForm = document.getElementById("admin-log-form");

  if (studentSelect) {
    studentSelect.addEventListener("change", (e) => {
      const studentId = e.target.value;
      const subjectSelect = document.getElementById("admin-log-subject");
      if (!studentId) {
        subjectSelect.disabled = true;
        subjectSelect.innerHTML = '<option value="">Select student first</option>';
        return;
      }
      const student = studentMap[studentId];
      if (student) {
        subjectSelect.disabled = false;
        populateAdminSubjects(student.class);
      }
    });
  }

  const addLogBtn = document.getElementById("add-log-btn");
  if (addLogBtn) {
    addLogBtn.addEventListener("click", () => {
      adminForm.reset();
      document.getElementById("admin-log-date").value = getISTTodayIso();
      const subjectSelect = document.getElementById("admin-log-subject");
      if (subjectSelect) {
        subjectSelect.disabled = true;
        subjectSelect.innerHTML = '<option value="">Select student first</option>';
      }
      const display = document.getElementById("admin-log-duration-display");
      if (display) {
        display.textContent = "Duration will appear here after selecting times.";
        display.style.color = "var(--c-slate-500)";
        display.style.fontWeight = "400";
      }
      const hidden = document.getElementById("admin-log-duration");
      if (hidden) hidden.value = "";
      adminModal.classList.add("active");
    });
  }

  document.getElementById("close-admin-log-modal")?.addEventListener("click", () => {
    adminModal.classList.remove("active");
  });

  adminModal?.addEventListener("click", (e) => {
    if (e.target === adminModal) adminModal.classList.remove("active");
  });

  if (adminForm) {
    adminForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = document.getElementById("admin-log-save-btn");
      const durationVal = document.getElementById("admin-log-duration").value;
      if (!durationVal || Number(durationVal) <= 0) {
        toast.error("Please select a valid start and end time.");
        return;
      }
      if (btn) btn.disabled = true;

      const startTimeVal = document.getElementById("admin-log-start-time")?.value || "";
      const endTimeVal   = document.getElementById("admin-log-end-time")?.value || "";

      const studentId = studentSelect.value;
      const logData = {
        date: document.getElementById("admin-log-date").value,
        subject: document.getElementById("admin-log-subject").value,
        durationMinutes: durationVal,
        startTime: startTimeVal,
        endTime: endTimeVal,
        chapter: document.getElementById("admin-log-chapter").value,
        notes: document.getElementById("admin-log-notes").value
      };

      try {
        await addStudyLog(studentId, logData);
        toast.success("Study log entry added.");
        adminModal.classList.remove("active");
        adminForm.reset();
        const logs = await getAllLogs();
        allLogs = logs;
        render();
      } catch (err) {
        toast.error(err.message || "Could not add study log.");
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }

  // Fix #7: use shared wireTimePicker with admin log modal's element IDs
  wireTimePicker({
    startId:   "admin-log-start-time",
    endId:     "admin-log-end-time",
    displayId: "admin-log-duration-display",
    hiddenId:  "admin-log-duration"
  });

  // Admin leave modal wiring
  const adminLeaveModal = document.getElementById("admin-leave-modal");
  const adminOpenLeaveBtn = document.getElementById("admin-open-leave-btn");
  const closeAdminLeaveModal = document.getElementById("close-admin-leave-modal");
  if (adminOpenLeaveBtn && adminLeaveModal) {
    document.getElementById("admin-leave-date").value = getISTTodayIso();
    adminOpenLeaveBtn.addEventListener("click", () => adminLeaveModal.classList.add("active"));
    closeAdminLeaveModal?.addEventListener("click", () => adminLeaveModal.classList.remove("active"));
    adminLeaveModal.addEventListener("click", (e) => { if (e.target === adminLeaveModal) adminLeaveModal.classList.remove("active"); });

    document.getElementById("admin-leave-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector("button[type=submit]");
      const studentId = document.getElementById("admin-leave-student").value;
      if (!studentId) {
        toast.error("Please select a student.");
        return;
      }
      btn.disabled = true;
      try {
        await addStudyLog(studentId, {
          date: document.getElementById("admin-leave-date").value,
          subject: "⚠️ Inability to Study / Leave",
          durationMinutes: 0,
          chapter: document.getElementById("admin-leave-reason").value,
          notes: document.getElementById("admin-leave-notes").value
        });
        toast.success("Student inability report recorded.");
        adminLeaveModal.classList.remove("active");
        e.target.reset();
        document.getElementById("admin-leave-date").value = getISTTodayIso();
        const logs = await getAllLogs();
        allLogs = logs;
        render();
      } catch (err) {
        toast.error(err.message || "Could not record leave report.");
      } finally {
        btn.disabled = false;
      }
    });
  }
}

function populateAdminSubjects(studentClass) {
  const select = document.getElementById("admin-log-subject");
  if (!select) return;
  select.innerHTML = '<option value="">Select subject</option>';
  const subjects = getSubjectsForClass(studentClass);
  subjects.forEach((subj) => {
    const opt = document.createElement("option");
    opt.value = subj;
    opt.textContent = subj;
    select.appendChild(opt);
  });
}

// Fix #7: wireAdminTimePicker removed — replaced with shared wireTimePicker from ../utils/time-picker.js
// Called in wireEvents() below with the correct element IDs for the admin log modal.

