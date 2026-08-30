import { requireAuth } from "../services/auth-service.js";
import { renderSidebar } from "../components/sidebar.js";
import { toast } from "../components/toast.js";
import { getAllLogs, updateLogStatus, LOG_STATUS, addStudyLog } from "../services/studylog-service.js";
import { listStudents } from "../services/student-service.js";
import { getSubjectsForClass } from "../services/subject-service.js";

let admin, allLogs = [], studentMap = {}, activeStatus = "Pending";

(async function init() {
  admin = await requireAuth("admin", "admin-login.html");
  renderSidebar("admin", "logs", { name: admin.name || admin.email, sub: "Branch Admin" });

  const [logs, students] = await Promise.all([getAllLogs(), listStudents()]);
  allLogs = logs;
  studentMap = Object.fromEntries(students.map((s) => [s.id, s]));

  // Populate student select for admin log creation modal
  const studentSelect = document.getElementById("admin-log-student");
  if (studentSelect) {
    studentSelect.innerHTML = '<option value="">Select student</option>' +
      students
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
        .map((s) => `<option value="${s.id}">${s.name} (${s.admissionNumber})</option>`)
        .join("");
  }

  render();
  document.getElementById("page-loader").classList.add("done");
  wireEvents();
})();

function render() {
  const filtered = activeStatus === "All" ? allLogs : allLogs.filter((l) => l.status === activeStatus);
  const body = document.getElementById("logs-body");

  if (!filtered.length) {
    body.innerHTML = `<tr><td colspan="7"><div class="empty-state"><h4>Nothing here</h4>No logs in this category.</div></td></tr>`;
    return;
  }

  body.innerHTML = filtered
    .map((l) => {
      const s = studentMap[l.studentId];
      const badge =
        l.status === LOG_STATUS.APPROVED
          ? '<span class="badge badge-success">Approved</span>'
          : l.status === LOG_STATUS.CORRECTION
          ? '<span class="badge badge-danger">Needs Correction</span>'
          : '<span class="badge badge-warning">Pending</span>';

      const actions =
        l.status === LOG_STATUS.PENDING
          ? `<div class="flex gap-2">
              <button class="btn btn-primary btn-sm" data-approve="${l.id}">Approve</button>
              <button class="btn btn-ghost btn-sm" data-correct="${l.id}">Request Correction</button>
              <button class="btn btn-ghost btn-sm" data-reject="${l.id}" style="color:var(--c-danger);">Reject</button>
            </div>`
          : `<span style="font-size:var(--fs-xs);color:var(--c-slate-500);">${l.adminComment || "—"}</span>`;

      return `<tr>
        <td>${s ? s.name : "Unknown"}</td>
        <td>${l.date}</td>
        <td>${l.subject}</td>
        <td>${l.chapter || "—"}</td>
        <td>${l.durationMinutes} min</td>
        <td>${badge}</td>
        <td>${actions}</td>
      </tr>`;
    })
    .join("");
}

function wireEvents() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeStatus = btn.dataset.status;
      render();
    });
  });

  document.getElementById("logs-body").addEventListener("click", async (e) => {
    const approveId = e.target.dataset.approve;
    const correctId = e.target.dataset.correct;
    const rejectId = e.target.dataset.reject;

    if (approveId) {
      await updateLogStatus(approveId, LOG_STATUS.APPROVED);
      updateLocal(approveId, LOG_STATUS.APPROVED);
      toast.success("Log approved.");
      render();
    }
    if (rejectId) {
      if (!confirm("Reject this log entry? It will be marked Needs Correction.")) return;
      await updateLogStatus(rejectId, LOG_STATUS.CORRECTION, "Rejected by admin.");
      updateLocal(rejectId, LOG_STATUS.CORRECTION, "Rejected by admin.");
      toast.success("Log rejected.");
      render();
    }
    if (correctId) {
      document.getElementById("comment-log-id").value = correctId;
      document.getElementById("comment-modal").classList.add("active");
    }
  });

  document.getElementById("close-comment-modal").addEventListener("click", () => {
    document.getElementById("comment-modal").classList.remove("active");
  });

  document.getElementById("comment-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("comment-log-id").value;
    const comment = document.getElementById("comment-text").value;
    await updateLogStatus(id, LOG_STATUS.CORRECTION, comment);
    updateLocal(id, LOG_STATUS.CORRECTION, comment);
    toast.success("Correction requested.");
    document.getElementById("comment-modal").classList.remove("active");
    document.getElementById("comment-form").reset();
    render();
  });

  // Admin Log Modal Event Listeners
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
      document.getElementById("admin-log-date").value = new Date().toISOString().slice(0, 10);
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

  const closeAdminLogModalBtn = document.getElementById("close-admin-log-modal");
  if (closeAdminLogModalBtn) {
    closeAdminLogModalBtn.addEventListener("click", () => {
      adminModal.classList.remove("active");
    });
  }

  if (adminModal) {
    adminModal.addEventListener("click", (e) => {
      if (e.target === adminModal) adminModal.classList.remove("active");
    });
  }

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
      
      const studentId = studentSelect.value;
      const logData = {
        date: document.getElementById("admin-log-date").value,
        subject: document.getElementById("admin-log-subject").value,
        durationMinutes: durationVal,
        chapter: document.getElementById("admin-log-chapter").value,
        notes: document.getElementById("admin-log-notes").value,
        status: document.getElementById("admin-log-status").value,
        adminComment: ""
      };

      try {
        await addStudyLog(studentId, logData);
        toast.success("Study log entry added.");
        adminModal.classList.remove("active");
        adminForm.reset();
        
        // Refresh logs list
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

  wireAdminTimePicker();
}

function updateLocal(id, status, comment = "") {
  const log = allLogs.find((l) => l.id === id);
  if (log) {
    log.status = status;
    log.adminComment = comment;
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

function wireAdminTimePicker() {
  const startEl = document.getElementById("admin-log-start-time");
  const endEl   = document.getElementById("admin-log-end-time");
  const display = document.getElementById("admin-log-duration-display");
  const hidden  = document.getElementById("admin-log-duration");

  if (!startEl || !endEl) return;

  function calcDuration() {
    const start = startEl.value;   // "HH:MM"
    const end   = endEl.value;

    if (!start || !end) {
      hidden.value = "";
      display.textContent = "Duration will appear here after selecting times.";
      display.style.color = "var(--c-slate-500)";
      display.style.fontWeight = "400";
      return;
    }

    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    let totalMins = (eh * 60 + em) - (sh * 60 + sm);

    if (totalMins <= 0) {
      hidden.value = "";
      display.textContent = "⚠ End time must be after start time.";
      display.style.color = "var(--c-danger)";
      display.style.fontWeight = "600";
      return;
    }

    hidden.value = String(totalMins);
    const hrs  = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    const label = hrs > 0
      ? `${hrs}h ${mins > 0 ? mins + "m" : ""}`.trim()
      : `${mins} minutes`;
    display.textContent = `✓ Study duration: ${label}`;
    display.style.color = "var(--c-primary)";
    display.style.fontWeight = "600";
  }

  startEl.addEventListener("change", calcDuration);
  endEl.addEventListener("change",   calcDuration);
}
