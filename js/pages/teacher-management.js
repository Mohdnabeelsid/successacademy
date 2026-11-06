// ==========================================================================
// TEACHER MANAGEMENT & CLASS DIARY PAGE CONTROLLER (ADMIN)
// ==========================================================================

import { requireAuth } from "../services/auth-service.js";
import { renderSidebar } from "../components/sidebar.js";
import { toast } from "../components/toast.js";
import { showConfirmModal } from "../components/confirm-modal.js";
import { renderPagination } from "../components/pagination.js";
import { getISTTodayIso, formatLogDate } from "../utils/date-time.js";
import { getSubjectsForClass } from "../services/subject-service.js";
import {
  listTeachers,
  getTeacher,
  createTeacher,
  updateTeacher,
  deleteTeacher,
  toggleTeacherStatus,
  listClassLogs,
  getClassLog,
  createClassLog,
  updateClassLog,
  deleteClassLog,
  calculateDurationMinutes,
  formatDurationDisplay,
  getTeacherAnalytics,
  getClassLogsOverviewStats,
  exportClassLogsToCSV,
  TEACHER_STATUS
} from "../services/teacher-service.js";
import { downloadCSV } from "../services/report-service.js";

let admin = null;
let allTeachers = [];
let allClassLogs = [];

let activeTab = "teachers"; // "teachers" or "logs"
let teachersPage = 1;
let logsPage = 1;
const PAGE_SIZE = 15;

(async function init() {
  // 1. Safety timeout to guarantee loader never hangs indefinitely
  setTimeout(() => {
    const loader = document.getElementById("page-loader");
    if (loader && !loader.classList.contains("done")) {
      loader.classList.add("done");
    }
  }, 2500);

  // 2. Wire events upfront so all controls and modals are interactive immediately
  wireEvents();

  try {
    admin = await requireAuth("admin", "admin-login.html");
    const adminBranch = admin.branch || "ALL";
    const subLabel = adminBranch === "ALL" ? "All-Branch Admin" : `${adminBranch} Branch Admin`;

    renderSidebar("admin", "teachers", {
      name: admin.name || admin.email,
      sub: subLabel
    });

    const metaLabel = document.getElementById("branch-meta-label");
    if (metaLabel) {
      metaLabel.textContent = adminBranch === "ALL"
        ? "All Campuses · Teachers & Daily Class Diary"
        : `${adminBranch} Campus · Teachers & Daily Class Diary`;
    }

    // Load both datasets in parallel
    await Promise.all([
      loadTeachers(true),
      loadClassLogs(true)
    ]);
  } catch (err) {
    console.error("Teacher management initialization error:", err);
    toast.error("Could not load teachers data.");
  } finally {
    document.getElementById("page-loader")?.classList.add("done");
  }
})();

// ==========================================================================
// DATA LOADING & RENDERING — TEACHERS
// ==========================================================================

async function loadTeachers(resetPage = false) {
  if (resetPage) teachersPage = 1;

  const filters = {
    branch: document.getElementById("teacher-filter-branch")?.value || "",
    status: document.getElementById("teacher-filter-status")?.value || "",
    search: document.getElementById("teacher-search-input")?.value.trim() || ""
  };

  try {
    allTeachers = await listTeachers(filters);
    renderTeachersStats(allTeachers);
    renderTeachersTable(allTeachers);
    populateTeacherDropdownInLogModal(allTeachers);
  } catch (err) {
    console.error("Error loading teachers:", err);
    toast.error("Failed to load teachers list.");
  }
}

function renderTeachersStats(teachers) {
  const total = teachers.length;
  const active = teachers.filter((t) => t.status === TEACHER_STATUS.ACTIVE).length;
  const alp = teachers.filter((t) => t.branch === "ALP" || t.branch === "ALL").length;
  const man = teachers.filter((t) => t.branch === "MAN" || t.branch === "ALL").length;

  document.getElementById("stat-total-teachers").textContent = total;
  document.getElementById("stat-active-teachers").textContent = active;
  document.getElementById("stat-alp-teachers").textContent = alp;
  document.getElementById("stat-man-teachers").textContent = man;

  const badge = document.getElementById("teachers-count-badge");
  if (badge) badge.textContent = total;
}

function renderTeachersTable(teachers) {
  const tbody = document.getElementById("teachers-table-body");
  const paginationEl = document.getElementById("teachers-pagination");

  if (!tbody) return;

  if (!teachers.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><h4>No teachers found</h4>Add a teacher or adjust your search filters.</div></td></tr>`;
    if (paginationEl) paginationEl.innerHTML = "";
    return;
  }

  const totalPages = Math.max(1, Math.ceil(teachers.length / PAGE_SIZE));
  if (teachersPage > totalPages) teachersPage = totalPages;
  if (teachersPage < 1) teachersPage = 1;

  const paged = teachers.slice((teachersPage - 1) * PAGE_SIZE, teachersPage * PAGE_SIZE);

  tbody.innerHTML = paged
    .map((t) => {
      const initials = (t.name || "T")
        .split(" ")
        .map((w) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase();

      const subjects = Array.isArray(t.subjects) && t.subjects.length
        ? t.subjects.map((s) => `<span class="badge-tag">${escapeHtml(s)}</span>`).join("")
        : '<span style="color:var(--c-text-muted); font-size:11px;">—</span>';

      const classes = Array.isArray(t.classes) && t.classes.length
        ? t.classes.map((c) => `<span class="badge-tag" style="background:var(--c-primary-soft); color:var(--c-primary);">${escapeHtml(c)}</span>`).join("")
        : '<span style="color:var(--c-text-muted); font-size:11px;">—</span>';

      const statusBadge = t.status === TEACHER_STATUS.ACTIVE
        ? '<span class="badge badge-success">Active</span>'
        : '<span class="badge badge-danger">Inactive</span>';

      return `
        <tr>
          <td>
            <div class="flex items-center gap-2">
              <div class="avatar" style="width:34px; height:34px; font-size:12px; font-weight:700;">${initials}</div>
              <div>
                <strong style="color:var(--c-text); font-size:var(--fs-sm);">${escapeHtml(t.name)}</strong>
                ${t.notes ? `<div style="font-size:11px; color:var(--c-text-muted); max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(t.notes)}">${escapeHtml(t.notes)}</div>` : ""}
              </div>
            </div>
          </td>
          <td>
            <div style="font-size:var(--fs-xs);">${escapeHtml(t.phone || "—")}</div>
            ${t.email ? `<div style="font-size:11px; color:var(--c-text-muted);">${escapeHtml(t.email)}</div>` : ""}
          </td>
          <td>
            <span class="badge" style="font-weight:700;">${escapeHtml(t.branch || "MAN")}</span>
          </td>
          <td><div style="max-width:260px;">${subjects}</div></td>
          <td><div style="max-width:200px;">${classes}</div></td>
          <td>${statusBadge}</td>
          <td style="text-align:right;">
            <div class="flex items-center justify-end gap-1">
              <button type="button" class="btn btn-ghost btn-sm" data-view-teacher="${t.id}" title="View Teaching Profile & History" style="padding:0; width:30px; height:30px; min-width:30px; display:inline-flex; align-items:center; justify-content:center;">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
              </button>
              <button type="button" class="btn btn-ghost btn-sm" data-edit-teacher="${t.id}" title="Edit Teacher">Edit</button>
              <button type="button" class="btn btn-ghost btn-sm" data-toggle-teacher="${t.id}" data-status="${t.status}" title="Toggle Active Status">
                ${t.status === TEACHER_STATUS.ACTIVE ? "Disable" : "Enable"}
              </button>
              <button type="button" class="btn btn-ghost btn-sm" data-delete-teacher="${t.id}" style="color:var(--c-danger);" title="Delete Teacher">✕</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  renderPagination({
    container: "teachers-pagination",
    totalItems: teachers.length,
    pageSize: PAGE_SIZE,
    currentPage: teachersPage,
    onPageChange: (newPage) => {
      teachersPage = newPage;
      renderTeachersTable(teachers);
    }
  });
}

function populateTeacherDropdownInLogModal(teachers) {
  const select = document.getElementById("log-teacher-select");
  if (!select) return;

  const currentVal = select.value;
  const activeTeachers = teachers.filter((t) => t.status === TEACHER_STATUS.ACTIVE);

  select.innerHTML = '<option value="">-- Select from Teacher Master --</option>' +
    activeTeachers
      .map((t) => `<option value="${t.id}" data-name="${escapeHtml(t.name)}" data-branch="${t.branch}">${escapeHtml(t.name)} (${t.branch})</option>`)
      .join("");

  if (currentVal) select.value = currentVal;
}

// ==========================================================================
// DATA LOADING & RENDERING — CLASS LOGS (DIARY)
// ==========================================================================

async function loadClassLogs(resetPage = false) {
  if (resetPage) logsPage = 1;

  const filters = {
    date: document.getElementById("log-filter-date")?.value || "",
    class: document.getElementById("log-filter-class")?.value || "",
    branch: document.getElementById("log-filter-branch")?.value || "",
    teacherName: document.getElementById("log-search-teacher")?.value.trim() || ""
  };

  try {
    allClassLogs = await listClassLogs(filters);
    renderClassLogsStats(allClassLogs);
    renderClassLogsTable(allClassLogs);
  } catch (err) {
    console.error("Error loading class logs:", err);
    toast.error("Failed to load class logs.");
  }
}

function renderClassLogsStats(logs) {
  const stats = getClassLogsOverviewStats(logs);

  document.getElementById("stat-log-today-count").textContent = stats.todaySessions;
  document.getElementById("stat-log-today-hours").textContent = `${stats.todayHours} hrs taught today`;
  document.getElementById("stat-log-today-teachers").textContent = stats.activeTeachersToday;
  document.getElementById("stat-log-today-classes").textContent = stats.classesCoveredToday;
  document.getElementById("stat-log-total-count").textContent = stats.totalSessions;
  document.getElementById("stat-log-total-hours").textContent = `${stats.totalHours} total hrs`;

  const badge = document.getElementById("logs-count-badge");
  if (badge) badge.textContent = logs.length;
}

function renderClassLogsTable(logs) {
  const tbody = document.getElementById("logs-table-body");
  const paginationEl = document.getElementById("logs-pagination");

  if (!tbody) return;

  if (!logs.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><h4>No class diary logs recorded</h4>Click "+ Record Class Log" to add a teaching entry.</div></td></tr>`;
    if (paginationEl) paginationEl.innerHTML = "";
    return;
  }

  const totalPages = Math.max(1, Math.ceil(logs.length / PAGE_SIZE));
  if (logsPage > totalPages) logsPage = totalPages;
  if (logsPage < 1) logsPage = 1;

  const paged = logs.slice((logsPage - 1) * PAGE_SIZE, logsPage * PAGE_SIZE);

  tbody.innerHTML = paged
    .map((l) => {
      const formattedDate = l.date ? formatLogDate(l.date) : "—";
      const timeDisplay = l.startTime
        ? (l.endTime ? `${l.startTime} – ${l.endTime}` : l.startTime)
        : "—";
      const durationPill = Number(l.durationMinutes) > 0
        ? `<span class="duration-pill">${formatDurationDisplay(l.durationMinutes)}</span>`
        : "";

      return `
        <tr>
          <td style="white-space:nowrap; font-weight:600; font-size:var(--fs-xs);">${formattedDate}</td>
          <td>
            <div class="time-badge">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              ${escapeHtml(timeDisplay)}
            </div>
            ${durationPill ? `<div style="margin-top:2px;">${durationPill}</div>` : ""}
          </td>
          <td>
            <strong style="color:var(--c-text); font-size:var(--fs-xs);">${escapeHtml(l.teacherName || "—")}</strong>
          </td>
          <td>
            <span class="badge" style="font-weight:700;">Std ${escapeHtml(l.class)}</span>
          </td>
          <td>
            <span class="badge badge-primary" style="font-size:11px;">${escapeHtml(l.subject)}</span>
          </td>
          <td>
            <div style="font-size:var(--fs-xs); font-weight:600; color:var(--c-dark);">${escapeHtml(l.topic || "—")}</div>
            ${l.notes ? `<div style="font-size:11px; color:var(--c-text-muted); margin-top:2px;" title="${escapeHtml(l.notes)}">${escapeHtml(l.notes)}</div>` : ""}
          </td>
          <td>
            <span class="badge">${escapeHtml(l.branch || "MAN")}</span>
          </td>
          <td style="text-align:right;">
            <div class="flex items-center justify-end gap-1">
              <button type="button" class="btn btn-ghost btn-sm" data-edit-log="${l.id}" title="Edit Log">Edit</button>
              <button type="button" class="btn btn-ghost btn-sm" data-delete-log="${l.id}" style="color:var(--c-danger);" title="Delete Log">✕</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  renderPagination({
    container: "logs-pagination",
    totalItems: logs.length,
    pageSize: PAGE_SIZE,
    currentPage: logsPage,
    onPageChange: (newPage) => {
      logsPage = newPage;
      renderClassLogsTable(logs);
    }
  });
}

// ==========================================================================
// EVENT WIRING
// ==========================================================================

function wireEvents() {
  // 1. Navigation Tab Switching
  const tabTeachersBtn = document.getElementById("tab-btn-teachers");
  const tabLogsBtn = document.getElementById("tab-btn-logs");
  const paneTeachers = document.getElementById("pane-teachers");
  const paneLogs = document.getElementById("pane-logs");

  function switchTab(tab) {
    activeTab = tab;
    if (tab === "teachers") {
      tabTeachersBtn?.classList.add("active");
      tabLogsBtn?.classList.remove("active");
      paneTeachers?.classList.add("active");
      paneLogs?.classList.remove("active");
    } else {
      tabLogsBtn?.classList.add("active");
      tabTeachersBtn?.classList.remove("active");
      paneLogs?.classList.add("active");
      paneTeachers?.classList.remove("active");
    }
  }

  tabTeachersBtn?.addEventListener("click", () => switchTab("teachers"));
  tabLogsBtn?.addEventListener("click", () => switchTab("logs"));

  // 2. Teacher Filter Events
  document.getElementById("teacher-search-input")?.addEventListener("input", debounce(() => loadTeachers(true), 300));
  document.getElementById("teacher-filter-branch")?.addEventListener("change", () => loadTeachers(true));
  document.getElementById("teacher-filter-status")?.addEventListener("change", () => loadTeachers(true));

  // 3. Class Log Filter Events
  document.getElementById("log-filter-date")?.addEventListener("change", () => loadClassLogs(true));
  document.getElementById("log-filter-class")?.addEventListener("change", () => loadClassLogs(true));
  document.getElementById("log-filter-branch")?.addEventListener("change", () => loadClassLogs(true));
  document.getElementById("log-search-teacher")?.addEventListener("input", debounce(() => loadClassLogs(true), 300));

  document.getElementById("log-filter-reset-btn")?.addEventListener("click", () => {
    const d = document.getElementById("log-filter-date");
    const c = document.getElementById("log-filter-class");
    const b = document.getElementById("log-filter-branch");
    const s = document.getElementById("log-search-teacher");
    if (d) d.value = "";
    if (c) c.value = "";
    if (b) b.value = "";
    if (s) s.value = "";
    loadClassLogs(true);
  });

  // 4. Add Teacher Modal
  const teacherModal = document.getElementById("teacher-modal");
  const teacherForm = document.getElementById("teacher-form");

  document.getElementById("open-add-teacher-btn")?.addEventListener("click", () => {
    teacherForm?.reset();
    document.getElementById("t-id").value = "";
    document.getElementById("teacher-modal-title").textContent = "Add Teacher";
    teacherModal?.classList.add("active");
  });

  document.getElementById("close-teacher-modal")?.addEventListener("click", () => {
    teacherModal?.classList.remove("active");
  });
  document.getElementById("cancel-teacher-modal")?.addEventListener("click", () => {
    teacherModal?.classList.remove("active");
  });

  if (teacherModal) {
    teacherModal.addEventListener("click", (e) => {
      if (e.target === teacherModal) teacherModal.classList.remove("active");
    });
  }

  // Teacher Form Submit
  teacherForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("t-id").value;
    const name = document.getElementById("t-name").value.trim();
    const phone = document.getElementById("t-phone").value.trim();
    const email = document.getElementById("t-email").value.trim();
    const branch = document.getElementById("t-branch").value;
    const status = document.getElementById("t-status").value;

    const rawSubjects = document.getElementById("t-subjects").value;
    const subjects = rawSubjects
      ? rawSubjects.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    const rawClasses = document.getElementById("t-classes").value;
    const classes = rawClasses
      ? rawClasses.split(",").map((c) => c.trim()).filter(Boolean)
      : [];

    const notes = document.getElementById("t-notes").value.trim();

    const saveBtn = document.getElementById("save-teacher-btn");
    if (saveBtn) saveBtn.disabled = true;

    try {
      if (id) {
        await updateTeacher(id, { name, phone, email, branch, status, subjects, classes, notes });
        toast.success("Teacher updated successfully.");
      } else {
        await createTeacher({ name, phone, email, branch, status, subjects, classes, notes });
        toast.success("Teacher added successfully.");
      }
      teacherModal?.classList.remove("active");
      await loadTeachers(false);
    } catch (err) {
      toast.error(err.message || "Failed to save teacher.");
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  });

  // 5. Teachers Table Actions Click (Edit, Toggle, Delete, View Profile)
  document.getElementById("teachers-table-body")?.addEventListener("click", async (e) => {
    const viewBtn = e.target.closest("[data-view-teacher]");
    const editBtn = e.target.closest("[data-edit-teacher]");
    const toggleBtn = e.target.closest("[data-toggle-teacher]");
    const deleteBtn = e.target.closest("[data-delete-teacher]");

    if (viewBtn) {
      openTeacherProfileModal(viewBtn.dataset.viewTeacher);
      return;
    }

    if (editBtn) {
      const id = editBtn.dataset.editTeacher;
      try {
        const t = await getTeacher(id);
        document.getElementById("t-id").value = t.id;
        document.getElementById("t-name").value = t.name || "";
        document.getElementById("t-phone").value = t.phone || "";
        document.getElementById("t-email").value = t.email || "";
        document.getElementById("t-branch").value = t.branch || "MAN";
        document.getElementById("t-status").value = t.status || "Active";
        document.getElementById("t-subjects").value = Array.isArray(t.subjects) ? t.subjects.join(", ") : "";
        document.getElementById("t-classes").value = Array.isArray(t.classes) ? t.classes.join(", ") : "";
        document.getElementById("t-notes").value = t.notes || "";
        document.getElementById("teacher-modal-title").textContent = "Edit Teacher";
        teacherModal?.classList.add("active");
      } catch (err) {
        toast.error("Could not load teacher details.");
      }
      return;
    }

    if (toggleBtn) {
      const id = toggleBtn.dataset.toggleTeacher;
      const current = toggleBtn.dataset.status;
      try {
        const next = await toggleTeacherStatus(id, current);
        toast.success(`Teacher marked as ${next}.`);
        await loadTeachers(false);
      } catch (err) {
        toast.error("Could not update status.");
      }
      return;
    }

    if (deleteBtn) {
      const id = deleteBtn.dataset.deleteTeacher;
      const confirmed = await showConfirmModal({
        title: "Delete Teacher Record",
        message: "Are you sure you want to delete this teacher? Their teaching logs will remain preserved in the diary.",
        confirmText: "Delete",
        confirmVariant: "danger"
      });
      if (!confirmed) return;

      try {
        await deleteTeacher(id);
        toast.success("Teacher deleted.");
        await loadTeachers(false);
      } catch (err) {
        toast.error("Could not delete teacher.");
      }
    }
  });

  // 6. Record Class Log Modal
  const logModal = document.getElementById("log-modal");
  const logForm = document.getElementById("log-form");

  document.getElementById("open-new-log-btn")?.addEventListener("click", () => {
    logForm?.reset();
    document.getElementById("log-id").value = "";
    document.getElementById("log-date").value = getISTTodayIso();
    document.getElementById("log-duration-preview").textContent = "0 mins";
    document.getElementById("log-modal-title").textContent = "Record Class Log";
    updateSubjectDropdown("");
    logModal?.classList.add("active");
  });

  document.getElementById("close-log-modal")?.addEventListener("click", () => {
    logModal?.classList.remove("active");
  });
  document.getElementById("cancel-log-modal")?.addEventListener("click", () => {
    logModal?.classList.remove("active");
  });

  if (logModal) {
    logModal.addEventListener("click", (e) => {
      if (e.target === logModal) logModal.classList.remove("active");
    });
  }

  // Live Duration Calculator
  const startTimeInput = document.getElementById("log-start-time");
  const endTimeInput = document.getElementById("log-end-time");
  const durationPreview = document.getElementById("log-duration-preview");

  function refreshDurationPreview() {
    const s = startTimeInput?.value;
    const e = endTimeInput?.value;
    const mins = calculateDurationMinutes(s, e);
    if (durationPreview) {
      durationPreview.textContent = formatDurationDisplay(mins);
    }
  }

  startTimeInput?.addEventListener("change", refreshDurationPreview);
  endTimeInput?.addEventListener("change", refreshDurationPreview);

  // Dynamic Subject population when Class changes
  const logClassSelect = document.getElementById("log-class");
  logClassSelect?.addEventListener("change", (e) => {
    updateSubjectDropdown(e.target.value);
  });

  function updateSubjectDropdown(selectedClass, preselectedSubject = "") {
    const subjectSelect = document.getElementById("log-subject");
    if (!subjectSelect) return;

    if (!selectedClass) {
      subjectSelect.innerHTML = '<option value="">Select Class First</option>';
      return;
    }

    const subjects = getSubjectsForClass(selectedClass);
    if (!subjects.length) {
      subjectSelect.innerHTML = '<option value="">No subjects found</option>';
      return;
    }

    subjectSelect.innerHTML = '<option value="">Select Subject</option>' +
      subjects
        .map((s) => `<option value="${escapeHtml(s)}" ${s === preselectedSubject ? "selected" : ""}>${escapeHtml(s)}</option>`)
        .join("");
  }

  // Teacher select dropdown change auto-populates custom input or branch
  const teacherSelect = document.getElementById("log-teacher-select");
  const teacherCustomInput = document.getElementById("log-teacher-custom");
  teacherSelect?.addEventListener("change", (e) => {
    const opt = e.target.selectedOptions?.[0];
    if (opt && opt.value) {
      const teacherName = opt.dataset.name;
      const teacherBranch = opt.dataset.branch;
      if (teacherCustomInput) teacherCustomInput.value = teacherName || "";
      if (teacherBranch && teacherBranch !== "ALL") {
        const bSelect = document.getElementById("log-branch");
        if (bSelect) bSelect.value = teacherBranch;
      }
    }
  });

  // Class Log Form Submit
  logForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("log-id").value;
    const date = document.getElementById("log-date").value || getISTTodayIso();
    const branch = document.getElementById("log-branch").value;
    const teacherId = teacherSelect?.value || null;
    const teacherName = (teacherCustomInput?.value || "").trim() ||
      teacherSelect?.selectedOptions?.[0]?.dataset?.name || "";

    if (!teacherName) {
      toast.error("Please select or enter the teacher's name.");
      return;
    }

    const startTime = startTimeInput?.value || "";
    const endTime = endTimeInput?.value || "";
    const cls = logClassSelect?.value;
    const subject = document.getElementById("log-subject")?.value;
    const topic = document.getElementById("log-topic")?.value.trim() || "";
    const notes = document.getElementById("log-notes")?.value.trim() || "";

    const saveBtn = document.getElementById("save-log-btn");
    if (saveBtn) saveBtn.disabled = true;

    try {
      const payload = {
        teacherId,
        teacherName,
        date,
        branch,
        startTime,
        endTime,
        class: cls,
        subject,
        topic,
        notes,
        createdBy: admin?.id || null
      };

      if (id) {
        await updateClassLog(id, payload);
        toast.success("Class log updated.");
      } else {
        await createClassLog(payload);
        toast.success("Class log recorded in diary.");
      }

      logModal?.classList.remove("active");
      await loadClassLogs(false);
    } catch (err) {
      toast.error(err.message || "Failed to save class log.");
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  });

  // 7. Class Logs Table Actions (Edit, Delete)
  document.getElementById("logs-table-body")?.addEventListener("click", async (e) => {
    const editBtn = e.target.closest("[data-edit-log]");
    const deleteBtn = e.target.closest("[data-delete-log]");

    if (editBtn) {
      const id = editBtn.dataset.editLog;
      try {
        const l = await getClassLog(id);
        document.getElementById("log-id").value = l.id;
        document.getElementById("log-date").value = l.date;
        document.getElementById("log-branch").value = l.branch || "MAN";
        if (teacherSelect) teacherSelect.value = l.teacherId || "";
        if (teacherCustomInput) teacherCustomInput.value = l.teacherName || "";
        if (startTimeInput) startTimeInput.value = l.startTime || "";
        if (endTimeInput) endTimeInput.value = l.endTime || "";
        refreshDurationPreview();

        if (logClassSelect) logClassSelect.value = l.class || "";
        updateSubjectDropdown(l.class, l.subject);

        document.getElementById("log-topic").value = l.topic || "";
        document.getElementById("log-notes").value = l.notes || "";
        document.getElementById("log-modal-title").textContent = "Edit Class Log";
        logModal?.classList.add("active");
      } catch (err) {
        toast.error("Could not load log record.");
      }
      return;
    }

    if (deleteBtn) {
      const id = deleteBtn.dataset.deleteLog;
      const confirmed = await showConfirmModal({
        title: "Delete Class Log Entry",
        message: "Are you sure you want to remove this teaching session log from the diary?",
        confirmText: "Delete",
        confirmVariant: "danger"
      });
      if (!confirmed) return;

      try {
        await deleteClassLog(id);
        toast.success("Class log deleted.");
        await loadClassLogs(false);
      } catch (err) {
        toast.error("Could not delete log.");
      }
    }
  });

  // 8. Teacher Profile Detail Modal Close
  const profileModal = document.getElementById("teacher-profile-modal");
  document.getElementById("close-tpm-modal")?.addEventListener("click", () => {
    profileModal?.classList.remove("active");
  });
  if (profileModal) {
    profileModal.addEventListener("click", (e) => {
      if (e.target === profileModal) profileModal.classList.remove("active");
    });
  }

  // 9. CSV Export Button
  document.getElementById("export-logs-csv-btn")?.addEventListener("click", () => {
    if (!allClassLogs.length) {
      toast.error("No class logs to export.");
      return;
    }
    const csv = exportClassLogsToCSV(allClassLogs);
    const today = getISTTodayIso();
    downloadCSV(`class-diary-logs-${today}.csv`, csv);
    toast.success("Class diary exported to CSV.");
  });
}

// ==========================================================================
// TEACHER PROFILE DETAIL MODAL (EYE BUTTON)
// ==========================================================================

async function openTeacherProfileModal(teacherId) {
  const modal = document.getElementById("teacher-profile-modal");
  if (!modal) return;

  // Show placeholder
  document.getElementById("tpm-name").textContent = "Loading...";
  document.getElementById("tpm-meta").textContent = "Please wait...";
  document.getElementById("tpm-avatar").textContent = "?";
  modal.classList.add("active");

  try {
    const teacher = await getTeacher(teacherId);
    if (!teacher) {
      toast.error("Teacher not found.");
      modal.classList.remove("active");
      return;
    }

    const initials = (teacher.name || "T")
      .split(" ")
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();

    document.getElementById("tpm-avatar").textContent = initials;
    document.getElementById("tpm-name").textContent = teacher.name;
    document.getElementById("tpm-title").textContent = `${teacher.name} — Teaching Profile`;

    const statusPill = teacher.status === TEACHER_STATUS.ACTIVE
      ? '<span class="badge badge-success">Active</span>'
      : '<span class="badge badge-danger">Inactive</span>';

    document.getElementById("tpm-meta").innerHTML = `
      <span>Campus: <strong>${escapeHtml(teacher.branch || "MAN")}</strong></span>
      <span>·</span>
      <span>Phone: <strong>${escapeHtml(teacher.phone || "—")}</strong></span>
      <span>·</span>
      <span>Email: <strong>${escapeHtml(teacher.email || "—")}</strong></span>
      <span>·</span>
      ${statusPill}
    `;

    // Subjects and Classes badges
    const subContainer = document.getElementById("tpm-subjects-list");
    if (subContainer) {
      subContainer.innerHTML = Array.isArray(teacher.subjects) && teacher.subjects.length
        ? teacher.subjects.map((s) => `<span class="badge badge-primary">${escapeHtml(s)}</span>`).join("")
        : '<span style="color:var(--c-text-muted);">None assigned</span>';
    }

    const clsContainer = document.getElementById("tpm-classes-list");
    if (clsContainer) {
      clsContainer.innerHTML = Array.isArray(teacher.classes) && teacher.classes.length
        ? teacher.classes.map((c) => `<span class="badge" style="background:var(--surface-2); font-weight:700;">Std ${escapeHtml(c)}</span>`).join("")
        : '<span style="color:var(--c-text-muted);">None assigned</span>';
    }

    // Fetch this teacher's teaching logs
    const teacherLogs = await listClassLogs({ teacherId });
    const analytics = getTeacherAnalytics(teacherId, teacherLogs);

    document.getElementById("tpm-stat-sessions").textContent = analytics.totalSessions;
    document.getElementById("tpm-stat-hours").textContent = `${analytics.totalHours} hrs`;
    document.getElementById("tpm-stat-subject").textContent = analytics.topSubject;
    document.getElementById("tpm-stat-class").textContent = analytics.topClass ? `Std ${analytics.topClass}` : "—";
    document.getElementById("tpm-history-count").textContent = `${teacherLogs.length} session${teacherLogs.length === 1 ? "" : "s"} recorded`;

    // Render history table
    const tbody = document.getElementById("tpm-history-body");
    if (tbody) {
      if (!teacherLogs.length) {
        tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state">No teaching sessions recorded in the diary for this teacher yet.</div></td></tr>`;
      } else {
        tbody.innerHTML = teacherLogs
          .map((l) => {
            const timeDisplay = l.startTime
              ? (l.endTime ? `${l.startTime} – ${l.endTime}` : l.startTime)
              : "—";
            const durationPill = Number(l.durationMinutes) > 0
              ? `<span class="duration-pill">${formatDurationDisplay(l.durationMinutes)}</span>`
              : "";

            return `
              <tr>
                <td style="white-space:nowrap; font-size:var(--fs-xs); font-weight:600;">${formatLogDate(l.date)}</td>
                <td>
                  <div style="font-size:var(--fs-xs);">${escapeHtml(timeDisplay)}</div>
                  ${durationPill ? `<div style="margin-top:2px;">${durationPill}</div>` : ""}
                </td>
                <td><span class="badge">Std ${escapeHtml(l.class)}</span></td>
                <td><span class="badge badge-primary">${escapeHtml(l.subject)}</span></td>
                <td style="font-size:var(--fs-xs);">${escapeHtml(l.topic || "—")}</td>
                <td><span class="badge">${escapeHtml(l.branch)}</span></td>
              </tr>
            `;
          })
          .join("");
      }
    }
  } catch (err) {
    console.error("Error opening teacher profile:", err);
    toast.error("Could not load teacher profile.");
  }
}

// ==========================================================================
// UTILITY FUNCTIONS
// ==========================================================================

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

