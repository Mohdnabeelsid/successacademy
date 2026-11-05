import { requireAuth } from "../services/auth-service.js";
import { renderSidebar } from "../components/sidebar.js";
import { toast } from "../components/toast.js";
import {
  listStudents,
  getStudent,
  createStudentWithCredentials,
  updateStudent,
  deleteStudent,
  toggleLogin,
  resetStudentPassword,
  bulkImportStudents,
  excelTemplateRows
} from "../services/student-service.js";
import { getStudentLogs, LOG_STATUS, addStudyLog, calcStreak } from "../services/studylog-service.js";
import { getSubjectsForClass, getStudentEffectiveSubjects } from "../services/subject-service.js";
import { getISTWeekRange, getISTMonthRange, getISTTodayIso, formatLogDate } from "../utils/date-time.js";
import { showConfirmModal } from "../components/confirm-modal.js";
import { renderPagination } from "../components/pagination.js";
import { getExamMarksForStudent, listExams, getExam } from "../services/exam-service.js";
import { calculateGrade } from "../services/grading-service.js";
import { getExamTypeBadge, escapeHtml } from "../utils/exam-ui.js";
import { getStudentAttendance, getStudentAttendanceSummary, ATTENDANCE_STATUS } from "../services/attendance-service.js";
import { getStudentFeeStatus, formatMonthYear, FEE_TYPES, PAYMENT_METHODS } from "../services/fee-service.js";

let admin;
let allStudents = [];
let currentStudent = null;
let currentPage = 1;
const pageSize = 15;
let currentStudentMarks = [];
let currentStudentExamsMap = {};
let currentStudentAttendance = [];
let currentStudentAttendanceSummary = null;
let currentStudentFeeStatus = null;
let currentLogSubView = "weekly";

(async function init() {
  // 1. Safety timeout to guarantee loader never hangs indefinitely
  setTimeout(() => {
    const loader = document.getElementById("page-loader");
    if (loader && !loader.classList.contains("done")) {
      loader.classList.add("done");
    }
  }, 2000);

  // 2. Wire events upfront so all controls and modals are interactive immediately
  wireEvents();

  try {
    admin = await requireAuth("admin", "admin-login.html");
    renderSidebar("admin", "students", { name: admin.name || admin.email, sub: "Branch Admin" });
    await refreshList();
  } catch (err) {
    console.error("Student management initialization error:", err);
  } finally {
    document.getElementById("page-loader")?.classList.add("done");
  }
})();

async function refreshList(resetPage = false) {
  if (resetPage) {
    currentPage = 1;
  }
  const filters = {
    search: document.getElementById("search-input")?.value.trim() || "",
    branch: document.getElementById("filter-branch")?.value || "",
    class: document.getElementById("filter-class")?.value || "",
    includeDisabled: true  // Student Management must show disabled students so admins can re-enable them
  };
  allStudents = await listStudents(filters);

  // Clamp currentPage within valid bounds
  const totalPages = Math.max(1, Math.ceil(allStudents.length / pageSize));
  if (currentPage > totalPages) {
    currentPage = totalPages;
  }
  if (currentPage < 1) {
    currentPage = 1;
  }

  renderTable(allStudents);
}


function renderTable(students) {
  const body = document.getElementById("students-body");
  const paginationEl = document.getElementById("students-pagination");
  if (!students.length) {
    body.innerHTML = `<tr><td colspan="7"><div class="empty-state"><h4>No students found</h4>Add a student or adjust your filters.</div></td></tr>`;
    if (paginationEl) paginationEl.innerHTML = "";
    return;
  }

  const totalPages = Math.max(1, Math.ceil(students.length / pageSize));
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;
  const pagedStudents = students.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  body.innerHTML = pagedStudents
    .map(
      (s) => `
    <tr>
      <td>
        <div class="flex items-center gap-2">
          <div class="avatar" style="width:32px;height:32px;font-size:var(--fs-xs);">${(s.name || "?")[0]}</div>
          <span style="font-weight:600;">${s.name}</span>
        </div>
      </td>
      <td>${s.admissionNumber}</td>
      <td>${s.class}</td>
      <td>${s.branch}</td>
      <td>${s.phone || "—"}</td>
      <td>${s.loginDisabled ? '<span class="badge badge-danger">Disabled</span>' : '<span class="badge badge-success">Active</span>'}</td>
      <td>
        <div class="flex gap-2">
          <button type="button" class="btn btn-ghost btn-sm" data-edit="${s.id}">Edit</button>
          <button type="button" class="btn btn-ghost btn-sm" data-analytics="${s.id}" title="View Analytics" style="padding:0; display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; min-width:32px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          </button>
          <button type="button" class="btn btn-ghost btn-sm" data-reset="${s.id}">Reset PW</button>
          <button type="button" class="btn btn-ghost btn-sm" data-toggle="${s.id}" data-disabled="${s.loginDisabled ? "1" : "0"}">${s.loginDisabled ? "Enable" : "Disable"}</button>
          <button type="button" class="btn btn-ghost btn-sm" data-delete="${s.id}" style="color:var(--c-danger);">Delete</button>
        </div>
      </td>
    </tr>`
    )
    .join("");

  renderPagination({
    container: "students-pagination",
    totalItems: students.length,
    pageSize: pageSize,
    currentPage: currentPage,
    onPageChange: (newPage) => {
      currentPage = newPage;
      renderTable(students);
    }
  });
}

function wireEvents() {
  document.getElementById("search-input").addEventListener("input", debounce(() => refreshList(true), 300));
  document.getElementById("filter-branch").addEventListener("change", () => refreshList(true));
  document.getElementById("filter-class").addEventListener("change", () => refreshList(true));

  const modal = document.getElementById("student-modal");
  const form = document.getElementById("student-form");

  document.getElementById("add-student-btn").addEventListener("click", () => {
    form.reset();
    document.getElementById("student-id").value = "";
    document.getElementById("modal-title").textContent = "Add Student";
    modal.classList.add("active");
  });
  document.getElementById("close-student-modal").addEventListener("click", () => modal.classList.remove("active"));
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.remove("active"); });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("student-id").value;
    const data = {
      name: document.getElementById("s-name").value,
      admissionNumber: document.getElementById("s-admission").value,
      class: document.getElementById("s-class").value,
      branch: document.getElementById("s-branch").value,
      phone: document.getElementById("s-phone").value,
      parentName: document.getElementById("s-parent").value
    };
    const btn = document.getElementById("student-save-btn");
    btn.disabled = true;
    try {
      if (id) {
        await updateStudent(id, data);
        toast.success("Student updated.");
        modal.classList.remove("active");
        await refreshList(false);
      } else {
        const result = await createStudentWithCredentials(data);
        toast.success("Student created.");
        modal.classList.remove("active");
        showCredentials(result.admissionNumber, result.password);
        await refreshList(true);
      }
    } catch (err) {
      toast.error(err.message || "Could not save student.");
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById("students-body").addEventListener("click", async (e) => {
    const analyticsBtn = e.target.closest("[data-analytics]");
    if (analyticsBtn) {
      openStudentProfileModal(analyticsBtn.dataset.analytics);
      return;
    }

    const editId = e.target.dataset.edit;
    const resetId = e.target.dataset.reset;
    const toggleId = e.target.dataset.toggle;
    const deleteId = e.target.dataset.delete;

    if (editId) {
      const s = await getStudent(editId);
      document.getElementById("student-id").value = s.id;
      document.getElementById("s-name").value = s.name || "";
      document.getElementById("s-admission").value = s.admissionNumber || "";
      document.getElementById("s-class").value = s.class || "";
      document.getElementById("s-branch").value = s.branch || "MAN";
      document.getElementById("s-phone").value = s.phone || "";
      document.getElementById("s-parent").value = s.parentName || "";
      document.getElementById("modal-title").textContent = "Edit Student";
      modal.classList.add("active");
    }

    if (resetId) {
      const confirmed = await showConfirmModal({
        title: "Reset Student Password",
        message: "Generate a new password for this student? The student will need to use the new credentials.",
        confirmText: "Generate New Password",
        confirmVariant: "warning"
      });
      if (!confirmed) return;
      try {
        const newPw = await resetStudentPassword(resetId);
        const s = await getStudent(resetId);
        showCredentials(s.admissionNumber, newPw);
        toast.success("New password generated. Apply it via your backend reset job, then share below.");
      } catch (err) {
        toast.error(err.message || "Could not reset password.");
      }
    }

    if (toggleId) {
      const currentlyDisabled = e.target.dataset.disabled === "1";
      try {
        await toggleLogin(toggleId, !currentlyDisabled);
        toast.success(currentlyDisabled ? "Login enabled." : "Login disabled.");
        await refreshList(false);
      } catch (err) {
        toast.error("Could not update login status.");
      }
    }

    if (deleteId) {
      const confirmed = await showConfirmModal({
        title: "Delete Student Record",
        message: "Are you sure you want to delete this student record? All associated data will be removed and this action cannot be undone.",
        confirmText: "Delete Student",
        confirmVariant: "danger"
      });
      if (!confirmed) return;
      try {
        await deleteStudent(deleteId);
        toast.success("Student deleted.");
        await refreshList(false);
      } catch (err) {
        toast.error("Could not delete student.");
      }
    }
  });

  // Credentials modal
  document.getElementById("close-creds-modal").addEventListener("click", () => {
    document.getElementById("creds-modal").classList.remove("active");
  });

  // Profile modal event listeners
  const closeProfileModalBtn = document.getElementById("close-profile-modal");
  if (closeProfileModalBtn) {
    closeProfileModalBtn.addEventListener("click", () => {
      document.getElementById("profile-modal").classList.remove("active");
    });
  }

  const profileModal = document.getElementById("profile-modal");
  if (profileModal) {
    profileModal.addEventListener("click", (e) => {
      if (e.target === profileModal) profileModal.classList.remove("active");
    });
  }

  // Profile modal tab switcher listeners
  const tabOverview = document.getElementById("tab-pm-overview");
  const tabAttendance = document.getElementById("tab-pm-attendance");
  const tabFees = document.getElementById("tab-pm-fees");
  const tabExams = document.getElementById("tab-pm-exams");
  const tabLogs = document.getElementById("tab-pm-logs");
  const tabBulkAdd = document.getElementById("tab-pm-bulk-add");

  if (tabOverview) tabOverview.addEventListener("click", () => switchProfileTab("overview"));
  if (tabAttendance) tabAttendance.addEventListener("click", () => switchProfileTab("attendance"));
  if (tabFees) tabFees.addEventListener("click", () => switchProfileTab("fees"));
  if (tabExams) tabExams.addEventListener("click", () => switchProfileTab("exams"));
  if (tabLogs) tabLogs.addEventListener("click", () => switchProfileTab("logs"));
  if (tabBulkAdd) tabBulkAdd.addEventListener("click", () => switchProfileTab("bulk-add"));

  // Jump buttons from Overview snapshot tiles:
  document.getElementById("pm-jump-att-btn")?.addEventListener("click", () => switchProfileTab("attendance"));
  document.getElementById("pm-jump-fee-btn")?.addEventListener("click", () => switchProfileTab("fees"));
  document.getElementById("pm-jump-exam-tab-btn")?.addEventListener("click", () => switchProfileTab("exams"));
  document.getElementById("pm-jump-exam-tab-btn2")?.addEventListener("click", () => switchProfileTab("exams"));
  document.getElementById("pm-jump-logs-btn")?.addEventListener("click", () => switchProfileTab("logs"));

  // Study log sub-view switchers
  document.getElementById("btn-pm-log-weekly")?.addEventListener("click", () => switchLogSubView("weekly"));
  document.getElementById("btn-pm-log-monthly")?.addEventListener("click", () => switchLogSubView("monthly"));
  document.getElementById("btn-pm-log-subjects")?.addEventListener("click", () => switchLogSubView("subjects"));

  // Bulk add row button listener
  const bulkAddRowBtn = document.getElementById("pm-bulk-add-row-btn");
  if (bulkAddRowBtn) {
    bulkAddRowBtn.addEventListener("click", () => {
      createBulkAddRow();
    });
  }

  // Bulk add form submission
  const pmBulkAddForm = document.getElementById("pm-bulk-add-form");
  if (pmBulkAddForm) {
    pmBulkAddForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      
      const tbody = document.getElementById("pm-bulk-add-tbody");
      if (!tbody) return;
      
      const rows = tbody.querySelectorAll(".bulk-log-row");
      const logsToSave = [];
      
      for (const row of rows) {
        const date = row.querySelector(".bulk-date").value;
        const subject = row.querySelector(".bulk-subject").value;
        const startTime = row.querySelector(".bulk-start-time")?.value || "";
        const endTime = row.querySelector(".bulk-end-time")?.value || "";
        const duration = row.querySelector(".bulk-duration").value;
        const chapter = row.querySelector(".bulk-chapter").value.trim();
        const notes = row.querySelector(".bulk-notes").value.trim();
        
        if (date && subject && duration) {
          logsToSave.push({
            date,
            subject,
            durationMinutes: Number(duration),
            startTime,
            endTime,
            chapter,
            notes,
            status: LOG_STATUS.APPROVED
          });
        }
      }
      
      if (logsToSave.length === 0) {
        toast.error("Please add at least one complete log entry.");
        return;
      }
      
      const submitBtn = document.getElementById("pm-bulk-submit-btn");
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Saving...";
      }
      
      try {
        await Promise.all(
          logsToSave.map(log => addStudyLog(currentStudent.id, log))
        );
        
        toast.success(`Successfully saved ${logsToSave.length} logs.`);
        currentStudentLogs = await getStudentLogs(currentStudent.id, 500);
        tbody.innerHTML = "";
        switchProfileTab("logs");
      } catch (err) {
        console.error("Error saving bulk logs:", err);
        toast.error("Failed to save some log entries. Please try again.");
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Save All Logs";
        }
      }
    });
  }

  // Excel template download
  document.getElementById("download-template-btn").addEventListener("click", () => {
    const rows = excelTemplateRows();
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Students");
    XLSX.writeFile(wb, "student-import-template.xlsx");
  });

  // Results modal close handlers
  const resultsModal = document.getElementById("import-results-modal");
  const closeResultsModal = () => resultsModal?.classList.remove("active");
  document.getElementById("close-import-results-modal")?.addEventListener("click", closeResultsModal);
  document.getElementById("close-import-results-btn")?.addEventListener("click", closeResultsModal);
  if (resultsModal) {
    resultsModal.addEventListener("click", (e) => { if (e.target === resultsModal) closeResultsModal(); });
  }

  // Excel import — automatically starts import when file is picked
  const fileInput = document.getElementById("import-file");
  const importBtn = document.getElementById("import-btn");
  if (importBtn && fileInput) {
    importBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const progressModal = document.getElementById("import-progress-modal");
      const progressBar = document.getElementById("import-progress-bar");
      const progressPercent = document.getElementById("import-progress-percent");
      const progressStatus = document.getElementById("import-progress-status");

      try {
        if (progressStatus) progressStatus.textContent = "Reading Excel file...";
        if (progressBar) progressBar.style.width = "0%";
        if (progressPercent) progressPercent.textContent = "0%";
        if (progressModal) progressModal.classList.add("active");

        const arrayBuffer = await file.arrayBuffer();
        const data = new Uint8Array(arrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws);

        if (!rows || rows.length === 0) {
          if (progressModal) progressModal.classList.remove("active");
          toast.error("The uploaded Excel file appears to be empty.");
          return;
        }

        const result = await bulkImportStudents(rows, "MAN", (progress) => {
          if (progressBar) progressBar.style.width = `${progress.percent}%`;
          if (progressPercent) progressPercent.textContent = `${progress.percent}% (${progress.current}/${progress.total})`;
          if (progressStatus) progressStatus.textContent = `Processing student: ${progress.currentStudent}`;
        });

        // Hide progress modal
        if (progressModal) progressModal.classList.remove("active");

        // Display results summary report modal
        document.getElementById("res-total").textContent = result.total || rows.length;
        document.getElementById("res-success").textContent = result.success;
        document.getElementById("res-skipped").textContent = result.skipped;
        document.getElementById("res-failed").textContent = result.failed.length;

        const failuresTbody = document.getElementById("import-failures-tbody");
        const failuresSection = document.getElementById("import-failures-section");

        if (result.failed.length > 0) {
          if (failuresSection) failuresSection.style.display = "block";
          if (failuresTbody) {
            failuresTbody.innerHTML = result.failed
              .map(
                (f) => `
              <tr>
                <td><strong>${f.rowNum}</strong></td>
                <td>${f.admissionNumber || "—"}</td>
                <td>${f.name || "—"}</td>
                <td style="color:var(--c-danger); font-size:var(--fs-xs);">${f.error}</td>
              </tr>`
              )
              .join("");
          }
        } else {
          if (failuresSection) failuresSection.style.display = "none";
        }

        if (resultsModal) resultsModal.classList.add("active");
        await refreshList(false);
      } catch (err) {
        if (progressModal) progressModal.classList.remove("active");
        console.error("Excel import error:", err);
        toast.error("Import failed: " + (err.message || "Invalid file format. Check the file or download template."));
      } finally {
        fileInput.value = "";
      }
    });
  }
}

function showCredentials(admission, password) {
  document.getElementById("creds-admission").textContent = admission;
  document.getElementById("creds-password").textContent = password;
  document.getElementById("creds-modal").classList.add("active");
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// Student Profile Analytics Modal Functions
let currentStudentLogs = [];

async function openStudentProfileModal(studentId) {
  const modal = document.getElementById("profile-modal");
  if (!modal) return;
  
  // Show loader/placeholder immediately so there's no delay
  document.getElementById("pm-name").textContent = "Loading...";
  document.getElementById("pm-meta").textContent = "Please wait while we load all student module records...";
  document.getElementById("pm-avatar").textContent = "?";
  const profileTitleEl = document.getElementById("profile-modal-title");
  if (profileTitleEl) profileTitleEl.textContent = "Student Profile — Loading...";
  
  const tabAttBadge = document.getElementById("pm-tab-att-badge");
  const tabFeeBadge = document.getElementById("pm-tab-fee-badge");
  const tabExamBadge = document.getElementById("pm-tab-exam-badge");
  if (tabAttBadge) tabAttBadge.textContent = "...";
  if (tabFeeBadge) tabFeeBadge.textContent = "...";
  if (tabExamBadge) tabExamBadge.textContent = "...";
  
  // Open modal immediately so user sees loading state right away
  modal.classList.add("active");
  switchProfileTab("overview");
  
  try {
    const student = await getStudent(studentId);
    if (!student) {
      toast.error("Student not found.");
      return;
    }
    currentStudent = student;
    
    const initials = (student.name || "S")
      .split(" ")
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
    document.getElementById("pm-avatar").textContent = initials;
    document.getElementById("pm-name").textContent = student.name || "—";
    const modalTitleEl = document.getElementById("profile-modal-title");
    if (modalTitleEl) modalTitleEl.textContent = `${student.name || "Student"} — Full Profile`;
    
    // Fetch all modules in parallel: logs, marks, exams, attendance, attendance summary, fee status
    const [logs, marks, exams, attendance, attSummary, feeStatus] = await Promise.all([
      getStudentLogs(studentId, 500).catch(() => []),
      getExamMarksForStudent(studentId).catch(() => []),
      listExams({ class: student.class }).catch(() => []),
      getStudentAttendance(studentId).catch(() => []),
      getStudentAttendanceSummary(studentId).catch(() => null),
      getStudentFeeStatus(studentId, student.class).catch(() => null)
    ]);
    
    currentStudentLogs = logs || [];
    currentStudentMarks = marks || [];
    currentStudentAttendance = attendance || [];
    currentStudentFeeStatus = feeStatus || null;

    // Build or normalize attendance summary
    let presentCount = 0;
    let lateCount = 0;
    let absentCount = 0;
    currentStudentAttendance.forEach((r) => {
      if (r.status === ATTENDANCE_STATUS.PRESENT) presentCount++;
      else if (r.status === ATTENDANCE_STATUS.LATE) lateCount++;
      else if (r.status === ATTENDANCE_STATUS.ABSENT) absentCount++;
    });

    const totalSessions = attSummary?.totalSessions || currentStudentAttendance.length;
    const attended = presentCount + lateCount;
    const rawRate = totalSessions > 0 ? Number(((attended / totalSessions) * 100).toFixed(1)) : 0;
    const attendanceRate = attSummary?.attendanceRate !== undefined ? attSummary.attendanceRate : rawRate;

    currentStudentAttendanceSummary = {
      totalSessions,
      attended,
      present: presentCount,
      late: lateCount,
      absent: absentCount,
      attendanceRate
    };

    // Exam map & missing exams
    const examMap = Object.fromEntries((exams || []).map((e) => [e.id, e]));
    const missingExamIds = (marks || []).filter((m) => !examMap[m.examId]).map((m) => m.examId);
    if (missingExamIds.length > 0) {
      const extraExams = await Promise.all(missingExamIds.map((id) => getExam(id)));
      extraExams.filter(Boolean).forEach((e) => { examMap[e.id] = e; });
    }
    currentStudentExamsMap = examMap;

    // Update tab badges
    if (tabAttBadge) {
      tabAttBadge.textContent = `${attendanceRate}%`;
      tabAttBadge.style.background = attendanceRate >= 75 ? "var(--c-success)" : "var(--c-danger)";
    }
    if (tabFeeBadge) {
      const isPaid = feeStatus?.currentMonthPaid;
      tabFeeBadge.textContent = isPaid ? "Paid ✅" : "Due ⚠️";
      tabFeeBadge.style.background = isPaid ? "var(--c-success)" : "var(--c-warning)";
    }
    if (tabExamBadge) {
      tabExamBadge.textContent = currentStudentMarks.length;
    }

    // Top Header Meta with Interactive Quick Pills
    const metaEl = document.getElementById("pm-meta");
    if (metaEl) {
      metaEl.innerHTML = `
        <span>Admission No: <strong>${escapeHtml(student.admissionNumber || "—")}</strong></span>
        <span>·</span>
        <span>Class <strong>${escapeHtml(student.class || "—")}</strong></span>
        <span>·</span>
        <span>${escapeHtml(student.branch || "—")} Branch</span>
        <span>·</span>
        <span>${student.loginDisabled ? '<span class="badge badge-danger">Disabled</span>' : '<span class="badge badge-success">Active</span>'}</span>
        <button type="button" class="badge" id="pm-header-att-pill" style="cursor:pointer; border:none; padding:3px 10px; font-size:11px; font-weight:700; border-radius:12px; background:rgba(16,185,129,0.15); color:#059669;" title="View attendance">
          📅 ${attendanceRate}% Attendance
        </button>
        <button type="button" class="badge" id="pm-header-fee-pill" style="cursor:pointer; border:none; padding:3px 10px; font-size:11px; font-weight:700; border-radius:12px; background:${feeStatus?.currentMonthPaid ? "rgba(16,185,129,0.15); color:#059669;" : "rgba(239,68,68,0.15); color:#dc2626;"}" title="View fees">
          💰 Fees: ${feeStatus?.currentMonthPaid ? "Paid" : "Due"}
        </button>
        <button type="button" class="badge badge-primary" id="pm-header-exam-pill" style="cursor:pointer; border:none; padding:3px 10px; font-size:11px; font-weight:700; border-radius:12px;" title="View exam marks">
          📝 ${currentStudentMarks.length} Exam Mark${currentStudentMarks.length === 1 ? "" : "s"}
        </button>
      `;

      document.getElementById("pm-header-att-pill")?.addEventListener("click", () => switchProfileTab("attendance"));
      document.getElementById("pm-header-fee-pill")?.addEventListener("click", () => switchProfileTab("fees"));
      document.getElementById("pm-header-exam-pill")?.addEventListener("click", () => switchProfileTab("exams"));
    }
    
    // Reset bulk add form
    const tbody = document.getElementById("pm-bulk-add-tbody");
    if (tbody) tbody.innerHTML = "";
    
    // Refresh Overview tab with newly loaded data
    switchProfileTab("overview");
  } catch (err) {
    toast.error("Could not load student profile.");
    console.error(err);
  }
}

function switchProfileTab(tab) {
  // Set active tab buttons
  document.querySelectorAll("#profile-modal .tab-btn").forEach((btn) => btn.classList.remove("active"));
  document.getElementById(`tab-pm-${tab}`)?.classList.add("active");

  // Hide all tab contents
  document.querySelectorAll("#profile-modal .tab-content").forEach((el) => {
    el.style.display = "none";
    el.classList.remove("active");
  });
  
  // Show active tab content
  const activeContent = document.getElementById(`pm-content-${tab}`);
  if (activeContent) {
    activeContent.style.display = "block";
    activeContent.classList.add("active");
  }
  
  // Render tab specific data
  if (tab === "overview") {
    renderOverviewTab();
  } else if (tab === "attendance") {
    renderAttendanceTab();
  } else if (tab === "fees") {
    renderFeesTab();
  } else if (tab === "exams") {
    renderExamMarks();
  } else if (tab === "logs") {
    renderStudyLogsTab();
  } else if (tab === "bulk-add") {
    const tbody = document.getElementById("pm-bulk-add-tbody");
    if (tbody && tbody.children.length === 0) {
      initializeBulkAddForm();
    }
  }
}

function renderOverviewTab() {
  if (!currentStudent) return;
  const s = currentStudent;

  // Student details info card
  const admEl = document.getElementById("pm-info-admission");
  const clsEl = document.getElementById("pm-info-class");
  const brEl = document.getElementById("pm-info-branch");
  const phEl = document.getElementById("pm-info-phone");
  const prEl = document.getElementById("pm-info-parent");
  const emEl = document.getElementById("pm-info-email");
  const stEl = document.getElementById("pm-info-status");
  const subEl = document.getElementById("pm-info-subjects");

  if (admEl) admEl.textContent = s.admissionNumber || "—";
  if (clsEl) clsEl.textContent = `Class ${s.class || "—"}`;
  if (brEl) brEl.textContent = `${s.branch || "—"} Campus`;
  if (phEl) phEl.textContent = s.phone || "—";
  if (prEl) prEl.textContent = s.parentName || "—";
  if (emEl) emEl.textContent = s.email || "—";
  if (stEl) {
    stEl.innerHTML = s.loginDisabled
      ? '<span class="badge badge-danger">Disabled</span>'
      : '<span class="badge badge-success">Active</span>';
  }

  if (subEl) {
    const enrolled = getStudentEffectiveSubjects(s);
    subEl.innerHTML = enrolled.length
      ? enrolled.map((subj) => `<span class="badge" style="background:var(--surface-2); font-size:11px;">${escapeHtml(subj)}</span>`).join("")
      : '<span style="color:var(--c-text-muted);">No enrolled subjects</span>';
  }

  // 1. Attendance Snapshot
  const att = currentStudentAttendanceSummary || { attendanceRate: 0, attended: 0, totalSessions: 0, present: 0, late: 0, absent: 0 };
  const snapAttRate = document.getElementById("pm-snap-att-rate");
  const snapAttAttended = document.getElementById("pm-snap-att-attended");
  const snapAttDetails = document.getElementById("pm-snap-att-details");
  if (snapAttRate) {
    snapAttRate.textContent = `${att.attendanceRate}% Rate`;
    snapAttRate.className = att.attendanceRate >= 75 ? "badge badge-success" : "badge badge-danger";
  }
  if (snapAttAttended) snapAttAttended.textContent = `${att.attended} / ${att.totalSessions} Sessions`;
  if (snapAttDetails) snapAttDetails.textContent = `Present: ${att.present} · Late: ${att.late} · Absent: ${att.absent}`;

  // 2. Fees Snapshot
  const fee = currentStudentFeeStatus || {};
  const totalPaidAmt = (fee.allPayments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const snapFeeBadge = document.getElementById("pm-snap-fee-status-badge");
  const snapFeeMonth = document.getElementById("pm-snap-fee-month");
  const snapFeeDetails = document.getElementById("pm-snap-fee-details");

  if (snapFeeBadge) {
    snapFeeBadge.innerHTML = fee.currentMonthPaid
      ? '<span class="badge badge-success">Current Month Paid ✅</span>'
      : '<span class="badge badge-danger">Current Month Due ⚠️</span>';
  }
  if (snapFeeMonth) {
    snapFeeMonth.textContent = fee.currentMonthPaid
      ? `₹${(Number(fee.currentMonthPayment?.amount) || fee.expectedMonthlyFee || 0).toLocaleString("en-IN")}`
      : `₹${(fee.expectedMonthlyFee || 0).toLocaleString("en-IN")} Due`;
    snapFeeMonth.style.color = fee.currentMonthPaid ? "#059669" : "#dc2626";
  }
  if (snapFeeDetails) {
    const admStatus = fee.admissionPaid ? "Paid ✅" : "Pending ⏳";
    snapFeeDetails.textContent = `Admission: ${admStatus} · Total Paid: ₹${totalPaidAmt.toLocaleString("en-IN")}`;
  }

  // 3. Exams Snapshot
  const validMarks = currentStudentMarks.filter(
    (m) => !m.isAbsent && m.marksObtained !== null && m.marksObtained !== undefined
  );
  let passedCount = 0;
  let totalPct = 0;
  let highestDisplay = "—";
  let highestPct = -1;

  validMarks.forEach((m) => {
    const exam = currentStudentExamsMap[m.examId];
    const max = Number(m.maxMarks) || (exam ? Number(exam.maxMarks) : 100);
    const passing = exam ? Number(exam.passingMarks) : 35;
    const score = Number(m.marksObtained);
    const pct = (score / max) * 100;
    totalPct += pct;

    const res = calculateGrade(score, max, { passingMarks: passing });
    if (res.passed) passedCount++;

    if (pct > highestPct) {
      highestPct = pct;
      highestDisplay = `${score}/${max} (${res.percentageFormatted})`;
    }
  });

  const avgPct = validMarks.length > 0 ? (totalPct / validMarks.length).toFixed(1) : "—";
  const snapExamAvg = document.getElementById("pm-snap-exam-avg");
  const snapExamCount = document.getElementById("pm-snap-exam-count");
  const snapExamDetails = document.getElementById("pm-snap-exam-details");

  if (snapExamAvg) snapExamAvg.textContent = avgPct !== "—" ? `${avgPct}% Avg` : "No scores";
  if (snapExamCount) snapExamCount.textContent = `${validMarks.length} Exam${validMarks.length === 1 ? "" : "s"}`;
  if (snapExamDetails) snapExamDetails.textContent = `Passed: ${passedCount} / ${validMarks.length} · Top: ${highestDisplay}`;

  // 4. Study Logs Snapshot
  const totalMinutes = currentStudentLogs
    .filter((l) => l.status === LOG_STATUS.APPROVED)
    .reduce((sum, l) => sum + Number(l.durationMinutes || 0), 0);
  const totalHrs = (totalMinutes / 60).toFixed(1);
  const streak = calcStreak(currentStudentLogs);

  const { startIso: wStart, endIso: wEnd } = getWeeklyRange();
  const weekMins = currentStudentLogs
    .filter((l) => l.status === LOG_STATUS.APPROVED && l.date >= wStart && l.date <= wEnd)
    .reduce((sum, l) => sum + Number(l.durationMinutes || 0), 0);

  const { startIso: mStart, endIso: mEnd } = getMonthlyRange();
  const monthMins = currentStudentLogs
    .filter((l) => l.status === LOG_STATUS.APPROVED && l.date >= mStart && l.date <= mEnd)
    .reduce((sum, l) => sum + Number(l.durationMinutes || 0), 0);

  const snapStreak = document.getElementById("pm-snap-streak");
  const snapTotalHours = document.getElementById("pm-snap-total-hours");
  const snapLogDetails = document.getElementById("pm-snap-log-details");

  if (snapStreak) snapStreak.textContent = `🔥 ${streak} day${streak === 1 ? "" : "s"} streak`;
  if (snapTotalHours) snapTotalHours.textContent = `${totalHrs} hrs`;
  if (snapLogDetails) snapLogDetails.textContent = `This week: ${(weekMins / 60).toFixed(1)} hrs · This month: ${(monthMins / 60).toFixed(1)} hrs`;

  // 5. Render recent exam preview cards
  renderWeeklyExamPreview();
}

function renderAttendanceTab() {
  const att = currentStudentAttendanceSummary || { attendanceRate: 0, attended: 0, totalSessions: 0, present: 0, late: 0, absent: 0 };
  
  const rateEl = document.getElementById("pm-att-stat-rate");
  const totalEl = document.getElementById("pm-att-stat-total");
  const presentEl = document.getElementById("pm-att-stat-present");
  const lateEl = document.getElementById("pm-att-stat-late");
  const absentEl = document.getElementById("pm-att-stat-absent");
  const tbody = document.getElementById("pm-att-table-body");

  if (rateEl) {
    rateEl.textContent = `${att.attendanceRate}%`;
    rateEl.style.color = att.attendanceRate >= 75 ? "var(--c-success)" : "var(--c-danger)";
  }
  if (totalEl) totalEl.textContent = att.totalSessions;
  if (presentEl) presentEl.textContent = att.present;
  if (lateEl) lateEl.textContent = att.late;
  if (absentEl) absentEl.textContent = att.absent;

  if (!tbody) return;

  if (!currentStudentAttendance || currentStudentAttendance.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state">No attendance records found for this student.</div></td></tr>`;
    return;
  }

  tbody.innerHTML = currentStudentAttendance
    .map((r) => {
      const formattedDate = r.date ? formatLogDate(r.date) : "—";
      const statusBadge =
        r.status === ATTENDANCE_STATUS.PRESENT
          ? '<span class="badge badge-success">Present</span>'
          : r.status === ATTENDANCE_STATUS.LATE
          ? '<span class="badge badge-warning" style="background:#FFFBEB; color:#D97706; border:1px solid #FCD34D;">Late</span>'
          : '<span class="badge badge-danger">Absent</span>';

      return `
        <tr>
          <td style="white-space:nowrap; font-size:var(--fs-xs); font-weight:600;">${formattedDate}</td>
          <td>
            <div style="font-weight:600; font-size:var(--fs-xs);">${escapeHtml(r.title || "Class Session")}</div>
          </td>
          <td style="font-size:var(--fs-xs); color:var(--c-text-muted);">${escapeHtml(r.formattedTime || "—")}</td>
          <td>${statusBadge}</td>
          <td style="font-size:var(--fs-xs); color:var(--c-text-muted);">${escapeHtml(r.remarks || "—")}</td>
        </tr>
      `;
    })
    .join("");
}

function renderFeesTab() {
  const fee = currentStudentFeeStatus || {};
  const payments = fee.allPayments || [];
  const totalPaidAmt = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const admEl = document.getElementById("pm-fee-stat-admission");
  const admSubEl = document.getElementById("pm-fee-stat-admission-sub");
  const monthLbl = document.getElementById("pm-fee-stat-month-label");
  const monthEl = document.getElementById("pm-fee-stat-month");
  const monthSubEl = document.getElementById("pm-fee-stat-month-sub");
  const rateEl = document.getElementById("pm-fee-stat-rate");
  const rateSubEl = document.getElementById("pm-fee-stat-rate-sub");
  const totalEl = document.getElementById("pm-fee-stat-total");
  const totalCountEl = document.getElementById("pm-fee-stat-total-count");
  const tbody = document.getElementById("pm-fees-table-body");

  if (monthLbl && fee.currentMonthKey) {
    monthLbl.textContent = `${formatMonthYear(fee.currentMonthKey)} Fee`;
  }

  if (admEl) {
    admEl.innerHTML = fee.admissionPaid
      ? '<span class="badge badge-success">Paid ✅</span>'
      : '<span class="badge badge-warning">Pending ⏳</span>';
  }
  if (admSubEl) {
    admSubEl.textContent = fee.admissionPaid
      ? `Recorded on ${formatLogDate(fee.admissionPayment?.paymentDate)} via ${(fee.admissionPayment?.paymentMethod || "").toUpperCase()}`
      : "One-time ₹1,000 fee";
  }

  if (monthEl) {
    monthEl.innerHTML = fee.currentMonthPaid
      ? `<span class="badge badge-success">Paid ₹${(Number(fee.currentMonthPayment?.amount) || fee.expectedMonthlyFee).toLocaleString("en-IN")} ✅</span>`
      : `<span class="badge badge-danger">Due ₹${(fee.expectedMonthlyFee || 0).toLocaleString("en-IN")} ⚠️</span>`;
  }
  if (monthSubEl) {
    monthSubEl.textContent = fee.currentMonthPaid
      ? `Paid via ${(fee.currentMonthPayment?.paymentMethod || "").toUpperCase()} on ${formatLogDate(fee.currentMonthPayment?.paymentDate)}`
      : "Due on 5th of this month";
  }

  if (rateEl) rateEl.textContent = `₹${(fee.expectedMonthlyFee || 0).toLocaleString("en-IN")}`;
  if (rateSubEl) rateSubEl.textContent = `Rate for Class ${currentStudent?.class || "—"}`;

  if (totalEl) totalEl.textContent = `₹${totalPaidAmt.toLocaleString("en-IN")}`;
  if (totalCountEl) totalCountEl.textContent = `${payments.length} payment receipt${payments.length === 1 ? "" : "s"}`;

  if (!tbody) return;

  if (payments.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state">No payment receipts recorded for this student.</div></td></tr>`;
    return;
  }

  tbody.innerHTML = payments
    .map((p) => {
      const formattedDate = p.paymentDate ? formatLogDate(p.paymentDate) : "—";
      const isAdmission = p.feeType === FEE_TYPES.ADMISSION;
      const typeBadge = isAdmission
        ? '<span class="badge" style="background:rgba(245,158,11,0.15); color:#d97706; border:1px solid rgba(245,158,11,0.3);">Admission Fee</span>'
        : '<span class="badge" style="background:rgba(14,165,233,0.15); color:#0284c7; border:1px solid rgba(14,165,233,0.3);">Monthly Fee</span>';

      const period = isAdmission ? "One-time Admission" : formatMonthYear(p.monthYear);
      const isUpi = p.paymentMethod === PAYMENT_METHODS.UPI;
      const methodBadge = isUpi
        ? '<span class="badge" style="background:rgba(99,102,241,0.15); color:#4f46e5; border:1px solid rgba(99,102,241,0.3);">📱 UPI</span>'
        : '<span class="badge" style="background:rgba(16,185,129,0.15); color:#059669; border:1px solid rgba(16,185,129,0.3);">💵 Cash</span>';

      return `
        <tr>
          <td style="white-space:nowrap; font-size:var(--fs-xs); font-weight:600;">${formattedDate}</td>
          <td>${typeBadge}</td>
          <td style="font-size:var(--fs-xs);"><strong>${escapeHtml(period)}</strong></td>
          <td style="font-weight:700; font-size:var(--fs-sm);">₹${(Number(p.amount) || 0).toLocaleString("en-IN")}</td>
          <td>${methodBadge}</td>
          <td style="font-size:var(--fs-xs); color:var(--c-text-muted);">${escapeHtml(p.remarks || "—")}</td>
        </tr>
      `;
    })
    .join("");
}

function renderStudyLogsTab() {
  const totalMinutes = currentStudentLogs
    .filter((l) => l.status === LOG_STATUS.APPROVED)
    .reduce((sum, l) => sum + Number(l.durationMinutes || 0), 0);
  const totalHrs = (totalMinutes / 60).toFixed(1);
  const streak = calcStreak(currentStudentLogs);

  const totalHrsEl = document.getElementById("pm-log-total-hours");
  const streakEl = document.getElementById("pm-log-streak");
  if (totalHrsEl) totalHrsEl.textContent = `${totalHrs} hrs`;
  if (streakEl) streakEl.textContent = `🔥 ${streak} day${streak === 1 ? "" : "s"}`;

  renderWeeklyLogs();
  renderMonthlyLogs();
  renderSubjectAnalytics();
  switchLogSubView(currentLogSubView || "weekly");
}

function switchLogSubView(subview) {
  currentLogSubView = subview;
  document.querySelectorAll(".pm-log-view-btn").forEach((btn) => btn.classList.remove("active"));
  document.getElementById(`btn-pm-log-${subview}`)?.classList.add("active");

  const weeklyEl = document.getElementById("pm-subview-weekly");
  const monthlyEl = document.getElementById("pm-subview-monthly");
  const subjectsEl = document.getElementById("pm-subview-subjects");

  if (weeklyEl) weeklyEl.style.display = subview === "weekly" ? "block" : "none";
  if (monthlyEl) monthlyEl.style.display = subview === "monthly" ? "block" : "none";
  if (subjectsEl) subjectsEl.style.display = subview === "subjects" ? "block" : "none";
}

function getWeeklyRange() {
  return getISTWeekRange();
}

function getMonthlyRange() {
  return getISTMonthRange();
}

function renderWeeklyLogs() {
  const { startIso, endIso } = getWeeklyRange();
  
  // Filter logs inside current week range
  const weeklyLogs = currentStudentLogs.filter(
    (l) => l.date >= startIso && l.date <= endIso
  );
  
  // Calculate total approved hours for this week
  const approvedWeeklyMinutes = weeklyLogs
    .filter((l) => l.status === LOG_STATUS.APPROVED)
    .reduce((sum, l) => sum + Number(l.durationMinutes || 0), 0);
  
  document.getElementById("pm-weekly-hours").textContent = 
    `${(approvedWeeklyMinutes / 60).toFixed(1)} hrs`;
    
  // Render table
  const tbody = document.getElementById("pm-weekly-table-body");
  if (!weeklyLogs.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state">No logs recorded for this week (${startIso} to ${endIso})</div></td></tr>`;
    return;
  }
  
  tbody.innerHTML = weeklyLogs
    .map((l) => {
      const isLeave = Number(l.durationMinutes) === 0 || (l.subject && l.subject.includes("Leave"));
      const badge = isLeave
        ? '<span class="badge badge-warning" style="background:#FFFBEB; color:#D97706; border:1px solid #FCD34D;">Leave / No Study</span>'
        : l.status === LOG_STATUS.APPROVED
        ? '<span class="badge badge-success">Approved</span>'
        : l.status === LOG_STATUS.CORRECTION
        ? '<span class="badge badge-danger">Needs Correction</span>'
        : '<span class="badge badge-warning">Pending</span>';

      const subjDisplay = isLeave ? "⚠️ " + (l.chapter || "Inability Reported") : l.subject;
      const chapterDisplay = isLeave ? (l.notes || "—") : (l.chapter || "—");
          
      return `<tr>
        <td>${l.date}</td>
        <td>${l.day || ""}</td>
        <td>${subjDisplay}</td>
        <td>${chapterDisplay}</td>
        <td>${l.durationMinutes} min (${badge})</td>
      </tr>`;
    })
    .join("");
}

function renderMonthlyLogs() {
  const { startIso, endIso } = getMonthlyRange();
  
  // Filter logs inside current month range
  const monthlyLogs = currentStudentLogs.filter(
    (l) => l.date >= startIso && l.date <= endIso
  );
  
  // Calculate total approved hours for this month
  const approvedMonthlyMinutes = monthlyLogs
    .filter((l) => l.status === LOG_STATUS.APPROVED)
    .reduce((sum, l) => sum + Number(l.durationMinutes || 0), 0);
  
  document.getElementById("pm-monthly-hours").textContent = 
    `${(approvedMonthlyMinutes / 60).toFixed(1)} hrs`;
    
  // Render table
  const tbody = document.getElementById("pm-monthly-table-body");
  if (!monthlyLogs.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state">No logs recorded for this month</div></td></tr>`;
    return;
  }
  
  tbody.innerHTML = monthlyLogs
    .map((l) => {
      const isLeave = Number(l.durationMinutes) === 0 || (l.subject && l.subject.includes("Leave"));
      const badge = isLeave
        ? '<span class="badge badge-warning" style="background:#FFFBEB; color:#D97706; border:1px solid #FCD34D;">Leave / No Study</span>'
        : l.status === LOG_STATUS.APPROVED
        ? '<span class="badge badge-success">Approved</span>'
        : l.status === LOG_STATUS.CORRECTION
        ? '<span class="badge badge-danger">Needs Correction</span>'
        : '<span class="badge badge-warning">Pending</span>';

      const subjDisplay = isLeave ? "⚠️ " + (l.chapter || "Inability Reported") : l.subject;
      const chapterDisplay = isLeave ? (l.notes || "—") : (l.chapter || "—");

      return `<tr>
        <td>${l.date}</td>
        <td>${l.day || ""}</td>
        <td>${subjDisplay}</td>
        <td>${chapterDisplay}</td>
        <td>${l.durationMinutes} min</td>
        <td>${badge}</td>
      </tr>`;
    })
    .join("");
}

function renderSubjectAnalytics() {
  const bySubject = {};
  currentStudentLogs
    .filter((l) => l.status === LOG_STATUS.APPROVED)
    .forEach((l) => {
      bySubject[l.subject] = (bySubject[l.subject] || 0) + Number(l.durationMinutes || 0);
    });
    
  const maxMin = Math.max(1, ...Object.values(bySubject));
  const barsEl = document.getElementById("pm-subject-bars");
  const entries = Object.entries(bySubject).sort((a, b) => b[1] - a[1]);
  
  barsEl.innerHTML = entries.length
    ? entries
        .map(
          ([subj, min]) => `
      <div class="bar-row" style="display:flex; align-items:center; gap:12px; margin-bottom:10px;">
        <div class="lbl" style="width:120px; font-size:var(--fs-xs); color:var(--c-slate-700); flex-shrink:0;">${subj}</div>
        <div class="progress-track" style="flex:1; height:8px; background:var(--c-slate-100); border-radius:var(--r-full); overflow:hidden;">
          <div class="progress-fill" style="width:${(min / maxMin) * 100}%; height:100%; background:var(--c-primary); border-radius:var(--r-full);"></div>
        </div>
        <div class="val" style="width:56px; font-size:var(--fs-xs); color:var(--c-slate-500); text-align:right; flex-shrink:0;">${(min / 60).toFixed(1)}h</div>
      </div>`
        )
        .join("")
    : `<div class="empty-state">No approved study time recorded</div>`;
}



function createBulkAddRow(dateVal = "", subjectVal = "", startTimeVal = "", endTimeVal = "", durationVal = "", chapterVal = "", notesVal = "") {
  const tbody = document.getElementById("pm-bulk-add-tbody");
  if (!tbody) return;

  const todayIso = getISTTodayIso();
  const dateStr = dateVal || todayIso;

  const subjects = currentStudent ? getSubjectsForClass(currentStudent.class) : [];
  const subjectOptions = subjects
    .map(s => `<option value="${s}" ${s === subjectVal ? "selected" : ""}>${s}</option>`)
    .join("");

  const tr = document.createElement("tr");
  tr.className = "bulk-log-row";
  tr.innerHTML = `
    <td>
      <input type="date" class="bulk-date" value="${dateStr}" required>
    </td>
    <td>
      <select class="bulk-subject" required>
        <option value="">Select Subject</option>
        ${subjectOptions}
      </select>
    </td>
    <td>
      <input type="time" class="bulk-start-time" value="${startTimeVal}" required>
    </td>
    <td>
      <input type="time" class="bulk-end-time" value="${endTimeVal}" required>
    </td>
    <td>
      <input type="number" class="bulk-duration" min="1" value="${durationVal}" placeholder="min" readonly required>
    </td>
    <td>
      <input type="text" class="bulk-chapter" value="${chapterVal}" placeholder="e.g. Chapter 1">
    </td>
    <td>
      <input type="text" class="bulk-notes" value="${notesVal}" placeholder="Notes...">
    </td>
    <td style="text-align: center;">
      <button type="button" class="btn-icon bulk-remove-row-btn" style="width: 28px; height: 28px; color: var(--c-danger); background: transparent;">✕</button>
    </td>
  `;

  const startEl = tr.querySelector(".bulk-start-time");
  const endEl   = tr.querySelector(".bulk-end-time");
  const durationEl = tr.querySelector(".bulk-duration");

  function calcRowDuration() {
    const start = startEl.value; // "HH:MM"
    const end   = endEl.value;

    if (!start || !end) {
      durationEl.value = "";
      return;
    }

    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    let totalMins = (eh * 60 + em) - (sh * 60 + sm);

    if (totalMins <= 0) {
      durationEl.value = "";
      endEl.setCustomValidity("End time must be after start time.");
      endEl.style.borderColor = "var(--c-danger)";
    } else {
      durationEl.value = totalMins;
      endEl.setCustomValidity("");
      endEl.style.borderColor = "";
    }
  }

  startEl.addEventListener("change", calcRowDuration);
  endEl.addEventListener("change",   calcRowDuration);

  if (startTimeVal || endTimeVal) {
    calcRowDuration();
  }

  tr.querySelector(".bulk-remove-row-btn").addEventListener("click", () => {
    tr.remove();
    if (tbody.querySelectorAll(".bulk-log-row").length === 0) {
      createBulkAddRow();
    }
  });

  tbody.appendChild(tr);
}

function initializeBulkAddForm() {
  const tbody = document.getElementById("pm-bulk-add-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  for (let i = 0; i < 3; i++) {
    createBulkAddRow();
  }
}

function renderWeeklyExamPreview() {
  const container = document.getElementById("pm-weekly-exam-preview");
  if (!container) return;

  if (!currentStudentMarks || !currentStudentMarks.length) {
    container.innerHTML = `<div class="empty-state" style="padding:14px; font-size:var(--fs-xs);">No exam marks recorded yet for this student.</div>`;
    return;
  }

  // Sort by exam date descending
  const sorted = [...currentStudentMarks].sort((a, b) => {
    const examA = currentStudentExamsMap[a.examId];
    const examB = currentStudentExamsMap[b.examId];
    const dateA = examA?.examDate || a.createdAt || "";
    const dateB = examB?.examDate || b.createdAt || "";
    return dateB.localeCompare(dateA);
  });

  // Take top 4 most recent exams
  const recent = sorted.slice(0, 4);

  container.innerHTML = `
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:10px;">
      ${recent.map((m) => {
        const exam = currentStudentExamsMap[m.examId];
        const examTitle = exam ? exam.title : "Exam";
        const subject = m.subject || (exam ? exam.subject : "General");
        const max = Number(m.maxMarks) || (exam ? Number(exam.maxMarks) : 100);
        const passing = exam ? Number(exam.passingMarks) : 35;
        const examDate = exam?.examDate ? formatLogDate(exam.examDate) : "";

        if (m.isAbsent) {
          return `
            <div style="background:var(--surface-1); border:1px solid var(--c-border); border-radius:var(--r-md); padding:10px 12px;">
              <div class="flex items-center justify-between" style="margin-bottom:4px;">
                <span style="font-weight:700; font-size:var(--fs-xs); color:var(--c-dark);">${escapeHtml(subject)}</span>
                <span class="badge badge-warning" style="font-size:10px;">Absent</span>
              </div>
              <div style="font-size:11px; color:var(--c-slate-500);">${escapeHtml(examTitle)}</div>
              <div style="font-size:10px; color:var(--c-slate-400); margin-top:2px;">${examDate}</div>
            </div>
          `;
        }

        const score = Number(m.marksObtained);
        const res = calculateGrade(score, max, { passingMarks: passing });

        return `
          <div style="background:var(--surface-1); border:1px solid var(--c-border); border-radius:var(--r-md); padding:10px 12px;">
            <div class="flex items-center justify-between" style="margin-bottom:4px;">
              <span style="font-weight:700; font-size:var(--fs-xs); color:var(--c-dark);">${escapeHtml(subject)}</span>
              <span class="badge" style="background:${res.colorHex}18; color:${res.colorHex}; border:1px solid ${res.colorHex}44; font-weight:800; font-size:11px; padding:1px 6px;">
                ${res.grade}
              </span>
            </div>
            <div class="flex items-baseline justify-between">
              <span style="font-weight:800; font-size:14px; color:var(--c-dark);">
                ${score} <span style="font-weight:500; font-size:11px; color:var(--c-slate-500);">/ ${max}</span>
              </span>
              <span style="font-size:11px; font-weight:700; color:${res.passed ? 'var(--c-success)' : 'var(--c-danger)'};">
                ${res.percentageFormatted} (${res.passed ? 'Pass' : 'Fail'})
              </span>
            </div>
            <div style="font-size:10px; color:var(--c-slate-500); margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              ${escapeHtml(examTitle)} · ${examDate}
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderExamMarks() {
  const tbody = document.getElementById("pm-exams-table-body");
  if (!tbody) return;

  const countEl = document.getElementById("pm-exam-count");
  const avgEl = document.getElementById("pm-exam-avg");
  const passEl = document.getElementById("pm-exam-pass");
  const highestEl = document.getElementById("pm-exam-highest");

  if (!currentStudentMarks || !currentStudentMarks.length) {
    if (countEl) countEl.textContent = "0";
    if (avgEl) avgEl.textContent = "—";
    if (passEl) passEl.textContent = "0 / 0";
    if (highestEl) highestEl.textContent = "—";
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><h4>No exam marks recorded</h4>No examination results found for this student.</div></td></tr>`;
    return;
  }

  // Sort marks by exam date descending
  const sortedMarks = [...currentStudentMarks].sort((a, b) => {
    const examA = currentStudentExamsMap[a.examId];
    const examB = currentStudentExamsMap[b.examId];
    const dateA = examA?.examDate || a.createdAt || "";
    const dateB = examB?.examDate || b.createdAt || "";
    return dateB.localeCompare(dateA);
  });

  // Calculate statistics
  const validMarks = sortedMarks.filter(
    (m) => !m.isAbsent && m.marksObtained !== null && m.marksObtained !== undefined
  );
  let passedCount = 0;
  let totalPct = 0;
  let highestPct = -1;
  let highestDisplay = "—";

  validMarks.forEach((m) => {
    const exam = currentStudentExamsMap[m.examId];
    const max = Number(m.maxMarks) || (exam ? Number(exam.maxMarks) : 100);
    const passing = exam ? Number(exam.passingMarks) : 35;
    const score = Number(m.marksObtained);
    const pct = (score / max) * 100;
    totalPct += pct;

    const res = calculateGrade(score, max, { passingMarks: passing });
    if (res.passed) passedCount++;

    if (pct > highestPct) {
      highestPct = pct;
      highestDisplay = `${score}/${max} (${res.percentageFormatted})`;
    }
  });

  const avgPct = validMarks.length > 0 ? (totalPct / validMarks.length).toFixed(1) : "—";

  if (countEl) countEl.textContent = String(validMarks.length);
  if (avgEl) avgEl.textContent = avgPct !== "—" ? `${avgPct}%` : "—";
  if (passEl) passEl.textContent = `${passedCount} / ${validMarks.length}`;
  if (highestEl) highestEl.textContent = highestDisplay;

  tbody.innerHTML = sortedMarks
    .map((m) => {
      const exam = currentStudentExamsMap[m.examId];
      const examTitle = exam ? exam.title : "Exam Record";
      const examType = exam ? exam.examType : "Assessment";
      const examDate = exam?.examDate ? formatLogDate(exam.examDate) : (m.createdAt ? formatLogDate(m.createdAt) : "—");
      const subject = m.subject || (exam ? exam.subject : "General");
      const maxMarks = m.maxMarks || (exam ? exam.maxMarks : 100);
      const passingMarks = exam ? Number(exam.passingMarks) : 35;

      if (m.isAbsent) {
        return `
        <tr>
          <td>
            <div style="font-weight:700; color:var(--c-dark);">${escapeHtml(examTitle)}</div>
            <div style="margin-top:2px;">${getExamTypeBadge(examType)}</div>
          </td>
          <td><strong>${escapeHtml(subject)}</strong></td>
          <td>${examDate}</td>
          <td><span class="badge badge-warning" style="background:#FEF2F2; color:#DC2626; border:1px solid #FCA5A5;">Absent</span></td>
          <td><span class="badge badge-ghost">—</span></td>
          <td><span style="color:var(--c-danger); font-weight:700; font-size:11px;">ABSENT</span></td>
          <td><span class="badge badge-ghost" style="text-transform:capitalize; font-size:11px;">${escapeHtml(m.enteredBy || "—")}</span></td>
        </tr>`;
      }

      const score = Number(m.marksObtained);
      const res = calculateGrade(score, Number(maxMarks), { passingMarks });

      const statusBadge = res.passed
        ? '<span class="badge badge-success" style="font-size:11px; font-weight:700;">Pass ✓</span>'
        : '<span class="badge badge-danger" style="font-size:11px; font-weight:700;">Needs Focus</span>';

      return `
      <tr>
        <td>
          <div style="font-weight:700; color:var(--c-dark);">${escapeHtml(examTitle)}</div>
          <div style="margin-top:2px;">${getExamTypeBadge(examType)}</div>
        </td>
        <td>
          <span style="display:inline-flex; align-items:center; gap:4px; font-weight:600; font-size:var(--fs-xs); color:var(--c-slate-700); background:var(--surface-1); padding:2px 8px; border-radius:var(--r-sm); border:1px solid var(--c-border);">
            ${escapeHtml(subject)}
          </span>
        </td>
        <td>${examDate}</td>
        <td><strong>${score}</strong> / ${maxMarks} <span style="color:var(--c-slate-500); font-size:11px; margin-left:2px;">(${res.percentageFormatted})</span></td>
        <td>
          <span class="badge" style="background:${res.colorHex}18; color:${res.colorHex}; border:1px solid ${res.colorHex}44; font-weight:800; font-size:12px;">
            ${res.grade}
          </span>
        </td>
        <td>${statusBadge}</td>
        <td><span class="badge badge-ghost" style="text-transform:capitalize; font-size:11px;">${escapeHtml(m.enteredBy || "admin")}</span></td>
      </tr>`;
    })
    .join("");
}

