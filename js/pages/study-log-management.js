import { requireAuth } from "../services/auth-service.js";
import { renderSidebar } from "../components/sidebar.js";
import { toast } from "../components/toast.js";
import { getAllLogs, deleteLog, LOG_STATUS, addStudyLog } from "../services/studylog-service.js";
import { listStudents } from "../services/student-service.js";
import { getSubjectsForClass } from "../services/subject-service.js";

let admin, allLogs = [], studentMap = {}, activeFilter = "All";

(async function init() {
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
      .map((s) => `<option value="${s.id}">${s.name} (${s.admissionNumber})</option>`)
      .join("");

  if (studentSelect) studentSelect.innerHTML = studentOpts;
  if (leaveStudentSelect) leaveStudentSelect.innerHTML = studentOpts;

  render();
  document.getElementById("page-loader").classList.add("done");
  wireEvents();
})();

function render() {
  const filtered = activeFilter === "All"
    ? allLogs
    : allLogs.filter((l) => Number(l.durationMinutes) === 0 || (l.subject && l.subject.includes("Leave")));

  const body = document.getElementById("logs-body");

  if (!filtered.length) {
    body.innerHTML = `<tr><td colspan="7"><div class="empty-state"><h4>Nothing here</h4>No logs found.</div></td></tr>`;
    return;
  }

  body.innerHTML = filtered
    .map((l) => {
      const s = studentMap[l.studentId];
      const isLeave = Number(l.durationMinutes) === 0 || (l.subject && l.subject.includes("Leave"));

      const typeBadge = isLeave
        ? '<span class="badge badge-warning" style="background:#FFFBEB; color:#D97706; border:1px solid #FCD34D;">⚠️ Leave / No Study</span>'
        : '<span class="badge badge-success">✓ Logged</span>';

      const subject = isLeave ? `⚠️ ${l.chapter || "Inability Reported"}` : l.subject;
      const chapterNotes = isLeave ? (l.notes || "—") : (l.chapter || "—");
      const duration = isLeave ? "—" : `${l.durationMinutes} min`;

      const actions = `<button class="btn btn-ghost btn-sm" data-delete="${l.id}" style="color:var(--c-danger);">Delete</button>`;

      return `<tr>
        <td>${s ? s.name : "Unknown"}</td>
        <td>${l.date}</td>
        <td>${subject}</td>
        <td>${chapterNotes}</td>
        <td>${duration}</td>
        <td>${typeBadge}</td>
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
      activeFilter = btn.dataset.status;
      render();
    });
  });

  document.getElementById("logs-body").addEventListener("click", async (e) => {
    const deleteId = e.target.dataset.delete;
    if (deleteId) {
      if (!confirm("Delete this log entry permanently?")) return;
      await deleteLog(deleteId);
      allLogs = allLogs.filter((l) => l.id !== deleteId);
      toast.success("Log entry deleted.");
      render();
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

      const studentId = studentSelect.value;
      const logData = {
        date: document.getElementById("admin-log-date").value,
        subject: document.getElementById("admin-log-subject").value,
        durationMinutes: durationVal,
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

  wireAdminTimePicker();

  // Admin leave modal wiring
  const adminLeaveModal = document.getElementById("admin-leave-modal");
  const adminOpenLeaveBtn = document.getElementById("admin-open-leave-btn");
  const closeAdminLeaveModal = document.getElementById("close-admin-leave-modal");
  if (adminOpenLeaveBtn && adminLeaveModal) {
    document.getElementById("admin-leave-date").value = new Date().toISOString().slice(0, 10);
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
        document.getElementById("admin-leave-date").value = new Date().toISOString().slice(0, 10);
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

function wireAdminTimePicker() {
  const startEl = document.getElementById("admin-log-start-time");
  const endEl   = document.getElementById("admin-log-end-time");
  const display = document.getElementById("admin-log-duration-display");
  const hidden  = document.getElementById("admin-log-duration");

  if (!startEl || !endEl) return;

  function calcDuration() {
    const start = startEl.value;
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
