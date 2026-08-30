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
import { getStudentLogs, LOG_STATUS, addStudyLog } from "../services/studylog-service.js";

let admin;
let allStudents = [];
let currentStudent = null;

(async function init() {
  admin = await requireAuth("admin", "admin-login.html");
  renderSidebar("admin", "students", { name: admin.name || admin.email, sub: "Branch Admin" });

  await refreshList();
  document.getElementById("page-loader")?.classList.add("done");
  wireEvents();
})();

async function refreshList() {
  const filters = {
    search: document.getElementById("search-input")?.value.trim() || "",
    branch: document.getElementById("filter-branch")?.value || "",
    class: document.getElementById("filter-class")?.value || ""
  };
  allStudents = await listStudents(filters);
  renderTable(allStudents);
}

function renderTable(students) {
  const body = document.getElementById("students-body");
  if (!students.length) {
    body.innerHTML = `<tr><td colspan="7"><div class="empty-state"><h4>No students found</h4>Add a student or adjust your filters.</div></td></tr>`;
    return;
  }
  body.innerHTML = students
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
          <button class="btn btn-ghost btn-sm" data-edit="${s.id}">Edit</button>
          <button class="btn btn-ghost btn-sm" data-analytics="${s.id}" title="View Analytics" style="padding:0; display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; min-width:32px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          </button>
          <button class="btn btn-ghost btn-sm" data-reset="${s.id}">Reset PW</button>
          <button class="btn btn-ghost btn-sm" data-toggle="${s.id}" data-disabled="${s.loginDisabled ? "1" : "0"}">${s.loginDisabled ? "Enable" : "Disable"}</button>
          <button class="btn btn-ghost btn-sm" data-delete="${s.id}" style="color:var(--c-danger);">Delete</button>
        </div>
      </td>
    </tr>`
    )
    .join("");
}

function wireEvents() {
  document.getElementById("search-input").addEventListener("input", debounce(refreshList, 300));
  document.getElementById("filter-branch").addEventListener("change", refreshList);
  document.getElementById("filter-class").addEventListener("change", refreshList);

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
      } else {
        const result = await createStudentWithCredentials(data);
        toast.success("Student created.");
        modal.classList.remove("active");
        showCredentials(result.admissionNumber, result.password);
      }
      await refreshList();
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
      if (!confirm("Generate a new password for this student?")) return;
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
        await refreshList();
      } catch (err) {
        toast.error("Could not update login status.");
      }
    }

    if (deleteId) {
      if (!confirm("Delete this student record? This cannot be undone.")) return;
      try {
        await deleteStudent(deleteId);
        toast.success("Student deleted.");
        await refreshList();
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
  const tabWeekly = document.getElementById("tab-pm-weekly");
  const tabMonthly = document.getElementById("tab-pm-monthly");
  const tabSubjects = document.getElementById("tab-pm-subjects");
  const tabBulkAdd = document.getElementById("tab-pm-bulk-add");

  if (tabWeekly) tabWeekly.addEventListener("click", () => switchProfileTab("weekly"));
  if (tabMonthly) tabMonthly.addEventListener("click", () => switchProfileTab("monthly"));
  if (tabSubjects) tabSubjects.addEventListener("click", () => switchProfileTab("subjects"));
  if (tabBulkAdd) tabBulkAdd.addEventListener("click", () => switchProfileTab("bulk-add"));

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
        const duration = row.querySelector(".bulk-duration").value;
        const chapter = row.querySelector(".bulk-chapter").value.trim();
        const notes = row.querySelector(".bulk-notes").value.trim();
        
        if (date && subject && duration) {
          logsToSave.push({
            date,
            subject,
            durationMinutes: Number(duration),
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
        switchProfileTab("weekly");
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

  // Excel import
  const fileInput = document.getElementById("import-file");
  const importBtn = document.getElementById("import-btn");
  if (importBtn && fileInput) {
    importBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const arrayBuffer = await file.arrayBuffer();
        const data = new Uint8Array(arrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws);

        if (!rows || rows.length === 0) {
          toast.error("The uploaded Excel file appears to be empty.");
          return;
        }

        toast.info(`Importing ${rows.length} students…`);
        const result = await bulkImportStudents(rows, "MAN");

        if (result.failed.length > 0) {
          console.error("Bulk import failed rows:", result.failed);
          const firstErr = result.failed[0].error;
          if (result.success > 0) {
            toast.warning(`Imported ${result.success} students. ${result.failed.length} failed. (${firstErr})`);
          } else {
            toast.error(`Import failed: ${firstErr}`);
          }
        } else {
          toast.success(`Successfully imported all ${result.success} students!`);
        }
        await refreshList();
      } catch (err) {
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
  
  // Show loader/placeholder
  document.getElementById("pm-name").textContent = "Loading...";
  document.getElementById("pm-meta").textContent = "Please wait while we load student profile data.";
  document.getElementById("pm-avatar").textContent = "?";
  
  try {
    // Get student info
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
    document.getElementById("pm-meta").textContent =
      `Admission No: ${student.admissionNumber || "—"} · Class ${student.class || "—"} · ${student.branch || "—"} Branch`;
    
    // Get study logs
    currentStudentLogs = await getStudentLogs(studentId, 500);
    
    // Reset bulk add form
    const tbody = document.getElementById("pm-bulk-add-tbody");
    if (tbody) tbody.innerHTML = "";
    
    // Default to weekly tab
    switchProfileTab("weekly");
    
    // Show the modal
    modal.classList.add("active");
  } catch (err) {
    toast.error("Could not load student profile.");
    console.error(err);
  }
}

function switchProfileTab(tab) {
  // Set active tab buttons
  document.querySelectorAll("#profile-modal .tab-btn").forEach((btn) => btn.classList.remove("active"));
  document.getElementById(`tab-pm-${tab}`).classList.add("active");

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
  if (tab === "weekly") {
    renderWeeklyLogs();
  } else if (tab === "monthly") {
    renderMonthlyLogs();
  } else if (tab === "subjects") {
    renderSubjectAnalytics();
  } else if (tab === "bulk-add") {
    const tbody = document.getElementById("pm-bulk-add-tbody");
    if (tbody && tbody.children.length === 0) {
      initializeBulkAddForm();
    }
  }
}

function getWeeklyRange() {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay()); // Sunday
  const end = new Date(start);
  end.setDate(start.getDate() + 6); // Saturday
  
  return {
    startIso: start.toISOString().slice(0, 10),
    endIso: end.toISOString().slice(0, 10)
  };
}

function getMonthlyRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0); // Last day of month
  
  return {
    startIso: start.toISOString().slice(0, 10),
    endIso: end.toISOString().slice(0, 10)
  };
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
      const badge =
        l.status === LOG_STATUS.APPROVED
          ? '<span class="badge badge-success">Approved</span>'
          : l.status === LOG_STATUS.CORRECTION
          ? '<span class="badge badge-danger">Needs Correction</span>'
          : '<span class="badge badge-warning">Pending</span>';
          
      return `<tr>
        <td>${l.date}</td>
        <td>${l.day || ""}</td>
        <td>${l.subject}</td>
        <td>${l.chapter || "—"}</td>
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
      const badge =
        l.status === LOG_STATUS.APPROVED
          ? '<span class="badge badge-success">Approved</span>'
          : l.status === LOG_STATUS.CORRECTION
          ? '<span class="badge badge-danger">Needs Correction</span>'
          : '<span class="badge badge-warning">Pending</span>';
          
      return `<tr>
        <td>${l.date}</td>
        <td>${l.day || ""}</td>
        <td>${l.subject}</td>
        <td>${l.chapter || "—"}</td>
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

function getSubjectsForClass(studentClass) {
  const cls = Number(studentClass);
  const common = ["English", "Maths", "Malayalam", "Hindi"];
  let extra = [];
  if (cls >= 5 && cls <= 8) {
    extra = ["Basic Science", "Social Science", "Computer", "Other"];
  } else if (cls >= 9 && cls <= 10) {
    extra = ["Physics", "Chemistry", "Biology", "History", "Geography", "Computer", "Other"];
  } else if (cls >= 11 && cls <= 12) {
    extra = ["Physics", "Chemistry", "Biology", "Computer Science", "Economics", "History", "Other"];
  } else {
    extra = ["Basic Science", "Social Science", "Computer", "Other"];
  }
  return [...common, ...extra];
}

function createBulkAddRow(dateVal = "", subjectVal = "", startTimeVal = "", endTimeVal = "", durationVal = "", chapterVal = "", notesVal = "") {
  const tbody = document.getElementById("pm-bulk-add-tbody");
  if (!tbody) return;

  const todayIso = new Date().toISOString().slice(0, 10);
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
