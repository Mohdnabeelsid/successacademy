import { requireAuth } from "../services/auth-service.js";
import { renderSidebar } from "../components/sidebar.js";
import { renderCalendar } from "../components/calendar.js";
import { toast } from "../components/toast.js";
import {
  addStudyLog,
  getStudentLogs,
  calcStreak,
  calcWeeklyHours,
  calcMonthlyHours,
  calcTotalHours,
  loggedDateSet,
  LOG_STATUS
} from "../services/studylog-service.js";

let student;

(async function init() {
  try {
    student = await requireAuth("student", "student-login.html");
    renderSidebar("student", "dashboard", { name: student.name, sub: `Class ${student.class || "-"} · ${student.branch || ""}` });

    document.getElementById("greeting").textContent = `Welcome back, ${(student.name || "Student").split(" ")[0]}`;
    document.getElementById("today-label").textContent = new Date().toLocaleDateString("en-IN", {
      weekday: "long", year: "numeric", month: "long", day: "numeric"
    });
    document.getElementById("log-date").value = new Date().toISOString().slice(0, 10);

    await refreshData();
  } catch (err) {
    console.error("Dashboard initialization error:", err);
    toast.error("Error loading dashboard data.");
  } finally {
    const loader = document.getElementById("page-loader");
    if (loader) loader.classList.add("done");
  }

  // Populate subjects based on student's class
  populateSubjects(student.class);

  // Wire time picker → auto-calculate duration
  wireTimePicker();

  // Modal wiring
  const modal = document.getElementById("log-modal");
  document.getElementById("open-log-modal").addEventListener("click", () => modal.classList.add("active"));
  document.getElementById("close-log-modal").addEventListener("click", () => modal.classList.remove("active"));
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.remove("active"); });

  // Leave / Inability to study modal wiring
  const leaveModal = document.getElementById("leave-modal");
  const openLeaveBtn = document.getElementById("open-leave-modal");
  const closeLeaveBtn = document.getElementById("close-leave-modal");
  if (openLeaveBtn && leaveModal) {
    document.getElementById("leave-date").value = new Date().toISOString().slice(0, 10);
    openLeaveBtn.addEventListener("click", () => leaveModal.classList.add("active"));
    closeLeaveBtn?.addEventListener("click", () => leaveModal.classList.remove("active"));
    leaveModal.addEventListener("click", (e) => { if (e.target === leaveModal) leaveModal.classList.remove("active"); });

    document.getElementById("leave-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector("button[type=submit]");
      btn.disabled = true;
      try {
        await addStudyLog(student.id, {
          date: document.getElementById("leave-date").value,
          subject: "⚠️ Inability to Study / Leave",
          durationMinutes: 0,
          chapter: document.getElementById("leave-reason").value,
          notes: document.getElementById("leave-notes").value,
          status: "Approved"
        });
        toast.success("Inability to study reported successfully.");
        leaveModal.classList.remove("active");
        e.target.reset();
        document.getElementById("leave-date").value = new Date().toISOString().slice(0, 10);
        await refreshData();
      } catch (err) {
        toast.error(err.message || "Could not submit report.");
      } finally {
        btn.disabled = false;
      }
    });
  }

  document.getElementById("log-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button[type=submit]");
    const durationVal = document.getElementById("log-duration").value;
    if (!durationVal || Number(durationVal) <= 0) {
      toast.error("Please select a valid start and end time.");
      return;
    }
    btn.disabled = true;
    try {
      await addStudyLog(student.id, {
        date: document.getElementById("log-date").value,
        subject: document.getElementById("log-subject").value,
        durationMinutes: durationVal,
        chapter: document.getElementById("log-chapter").value,
        notes: document.getElementById("log-notes").value
      });
      toast.success("Study log submitted and counted!");
      modal.classList.remove("active");
      e.target.reset();
      document.getElementById("log-date").value = new Date().toISOString().slice(0, 10);
      document.getElementById("log-duration-display").textContent = "Duration will appear here after selecting times.";
      document.getElementById("log-duration-display").style.color = "var(--c-slate-500)";
      await refreshData();
    } catch (err) {
      toast.error(err.message || "Could not submit log.");
    } finally {
      btn.disabled = false;
    }
  });
})();

async function refreshData() {
  const logs = await getStudentLogs(student.id);

  document.getElementById("stat-streak").textContent = `${calcStreak(logs)} 🔥`;
  document.getElementById("stat-weekly").textContent = `${calcWeeklyHours(logs)} hrs`;
  document.getElementById("stat-monthly").textContent = `${calcMonthlyHours(logs)} hrs`;
  document.getElementById("stat-total").textContent = `${calcTotalHours(logs)} hrs`;

  renderCalendar(document.getElementById("calendar"), loggedDateSet(logs));

  const recentEl = document.getElementById("recent-logs");
  const recent = logs.slice(0, 6);
  recentEl.innerHTML = recent.length
    ? recent
        .map((l) => {
          const isLeave = Number(l.durationMinutes) === 0 || (l.subject && l.subject.includes("Leave"));
          const badge = isLeave
            ? '<span class="badge badge-warning" style="background:#FFFBEB; color:#D97706; border:1px solid #FCD34D;">Leave / No Study</span>'
            : '<span class="badge badge-success">Logged ✓</span>';

          const title = isLeave
            ? `⚠️ ${l.chapter || "Inability Reported"}`
            : `${l.subject} · ${l.durationMinutes} min`;

          const subtitle = isLeave
            ? `${l.date}${l.notes ? " · " + l.notes : ""}`
            : `${l.date}${l.chapter ? " · " + l.chapter : ""}`;

          return `<div class="flex items-center justify-between" style="padding:10px 0;border-bottom:1px solid var(--c-border);">
            <div>
              <div style="font-size:var(--fs-sm);font-weight:600;">${title}</div>
              <div style="font-size:var(--fs-xs);color:var(--c-slate-500);">${subtitle}</div>
            </div>
            ${badge}
          </div>`;
        })
        .join("")
    : `<div class="empty-state"><h4>No logs yet</h4>Add your first study log to start your streak.</div>`;
}

import { getSubjectsForClass } from "../services/subject-service.js";

/**
 * Populate the subject dropdown based on the student's class.
 */
function populateSubjects(studentClass) {
  const select = document.getElementById("log-subject");
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

/**
 * Wire the start-time and end-time inputs so that duration
 * is automatically calculated and stored in the hidden #log-duration field.
 */
function wireTimePicker() {
  const startEl = document.getElementById("log-start-time");
  const endEl   = document.getElementById("log-end-time");
  const display = document.getElementById("log-duration-display");
  const hidden  = document.getElementById("log-duration");

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
