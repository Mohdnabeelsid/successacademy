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
import { formatISTFullDate, getISTTodayIso } from "../utils/date-time.js";
import { getStudent } from "../services/student-service.js";
// Fix #11: moved here from line 168 where it was incorrectly placed mid-file
import { getSubjectsForClass, getStudentEffectiveSubjects } from "../services/subject-service.js";
// Fix #7: import shared wireTimePicker instead of duplicating the implementation
import { wireTimePicker } from "../utils/time-picker.js";
import { setButtonLoading } from "../utils/ui-helpers.js";

let student;

(async function init() {
  try {
    const authStudent = await requireAuth("student", "student-login.html");
    const dbStudent = await getStudent(authStudent.id);
    student = dbStudent || authStudent;

    renderSidebar("student", "dashboard", { name: student.name, sub: `Class ${student.class || "-"} · ${student.branch || ""}` });

    document.getElementById("greeting").textContent = `Welcome back, ${student.name || "Student"}`;
    document.getElementById("today-label").textContent = formatISTFullDate();
    document.getElementById("log-date").value = getISTTodayIso();

    // Populate subjects based on student's enrolled subjects
    populateSubjects(student);

    await refreshData();
  } catch (err) {
    console.error("Dashboard initialization error:", err);
    toast.error("Error loading dashboard data.");
  } finally {
    const loader = document.getElementById("page-loader");
    if (loader) loader.classList.add("done");
  }

  // Wire time picker → auto-calculate duration using shared utility
  wireTimePicker({
    startId:   "log-start-time",
    endId:     "log-end-time",
    displayId: "log-duration-display",
    hiddenId:  "log-duration"
  });

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
    document.getElementById("leave-date").value = getISTTodayIso();
    openLeaveBtn.addEventListener("click", () => leaveModal.classList.add("active"));
    closeLeaveBtn?.addEventListener("click", () => leaveModal.classList.remove("active"));
    leaveModal.addEventListener("click", (e) => { if (e.target === leaveModal) leaveModal.classList.remove("active"); });

    document.getElementById("leave-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector("button[type=submit]");
      setButtonLoading(btn, true, "Submitting...");
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
        document.getElementById("leave-date").value = getISTTodayIso();
        await refreshData();
      } catch (err) {
        toast.error(err.message || "Could not submit report.");
      } finally {
        setButtonLoading(btn, false);
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
    setButtonLoading(btn, true, "Submitting...");
    try {
      const startTimeVal = document.getElementById("log-start-time")?.value || "";
      const endTimeVal   = document.getElementById("log-end-time")?.value || "";

      await addStudyLog(student.id, {
        date: document.getElementById("log-date").value,
        subject: document.getElementById("log-subject").value,
        durationMinutes: durationVal,
        startTime: startTimeVal,
        endTime: endTimeVal,
        chapter: document.getElementById("log-chapter").value,
        notes: document.getElementById("log-notes").value
      });
      toast.success("Study log submitted and counted!");
      modal.classList.remove("active");
      e.target.reset();
      document.getElementById("log-date").value = getISTTodayIso();
      document.getElementById("log-duration-display").textContent = "Duration will appear here after selecting times.";
      document.getElementById("log-duration-display").style.color = "var(--c-slate-500)";
      await refreshData();
    } catch (err) {
      toast.error(err.message || "Could not submit log.");
    } finally {
      setButtonLoading(btn, false);
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

  renderSubjectDistribution(logs);
}

const SUBJECT_COLORS = [
  "#0FA15D", // Emerald
  "#1F7A78", // Teal
  "#2E4C8C", // Blue
  "#C88A2E", // Amber
  "#7C3AED", // Violet
  "#DB2777", // Pink
  "#0284C7", // Sky
  "#EA580C"  // Orange
];

function renderSubjectDistribution(logs) {
  const container = document.getElementById("subject-dist-bars");
  const totalEl = document.getElementById("dist-total-hours");
  if (!container) return;

  const validLogs = logs.filter((l) => Number(l.durationMinutes) > 0 && l.subject);
  if (!validLogs.length) {
    container.innerHTML = `
      <div class="empty-state" style="padding:var(--sp-4);">
        <p style="font-size:var(--fs-xs); color:var(--c-slate-500);">Log study sessions to visualize your subject time distribution.</p>
      </div>`;
    if (totalEl) totalEl.textContent = "";
    return;
  }

  const subjectTotals = {};
  let totalMinutes = 0;

  validLogs.forEach((l) => {
    const mins = Number(l.durationMinutes) || 0;
    subjectTotals[l.subject] = (subjectTotals[l.subject] || 0) + mins;
    totalMinutes += mins;
  });

  const sortedSubjects = Object.entries(subjectTotals).sort((a, b) => b[1] - a[1]);
  const totalHours = (totalMinutes / 60).toFixed(1);
  if (totalEl) totalEl.textContent = `${totalHours} hrs total across ${sortedSubjects.length} subjects`;

  const segsHtml = sortedSubjects
    .map(([subj, mins], idx) => {
      const color = SUBJECT_COLORS[idx % SUBJECT_COLORS.length];
      const pct = ((mins / totalMinutes) * 100).toFixed(1);
      return `<div class="dist-bar-seg" style="width:${pct}%; background:${color};" title="${subj}: ${pct}% (${(mins / 60).toFixed(1)} hrs)"></div>`;
    })
    .join("");

  const legendHtml = sortedSubjects
    .map(([subj, mins], idx) => {
      const color = SUBJECT_COLORS[idx % SUBJECT_COLORS.length];
      const pct = Math.round((mins / totalMinutes) * 100);
      const hrs = (mins / 60).toFixed(1);
      return `
        <div class="dist-legend-card">
          <div class="dist-legend-left">
            <span class="dist-legend-dot" style="background:${color};"></span>
            <span class="dist-legend-name">${subj}</span>
          </div>
          <div class="dist-legend-val">${hrs}h <span style="font-weight:400; font-size:11px; color:var(--c-slate-400);">(${pct}%)</span></div>
        </div>
      `;
    })
    .join("");

  container.innerHTML = `
    <div class="dist-bar-track">${segsHtml}</div>
    <div class="dist-legend-grid">${legendHtml}</div>
  `;
}

// Fix #11: import for getSubjectsForClass was here (line 168) — moved to top of file


/**
 * Populate the subject dropdown based on the student's enrolled subjects.
 */
function populateSubjects(studentObj) {
  const select = document.getElementById("log-subject");
  if (!select) return;
  select.innerHTML = '<option value="">Select subject</option>';

  const subjects = getStudentEffectiveSubjects(studentObj);
  subjects.forEach((subj) => {
    const opt = document.createElement("option");
    opt.value = subj;
    opt.textContent = subj;
    select.appendChild(opt);
  });
}

// Fix #7: wireTimePicker removed — replaced with shared utility from ../utils/time-picker.js
// Called above in the init IIFE with the correct element IDs for the student log modal.

