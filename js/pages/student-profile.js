import { requireAuth } from "../services/auth-service.js";
import { renderSidebar } from "../components/sidebar.js";
import { renderCalendar } from "../components/calendar.js";
import { getStudentLogs, loggedDateSet, LOG_STATUS } from "../services/studylog-service.js";

(async function init() {
  const student = await requireAuth("student", "student-login.html");
  renderSidebar("student", "profile", { name: student.name, sub: `Class ${student.class || "-"}` });

  const initials = (student.name || "S")
    .split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  document.getElementById("profile-avatar").textContent = initials;
  document.getElementById("profile-name").textContent = student.name || "—";
  document.getElementById("profile-meta").textContent =
    `Admission No: ${student.admissionNumber || "—"} · Class ${student.class || "—"} · ${student.branch || "—"} Branch`;

  const logs = await getStudentLogs(student.id, 500);

  renderCalendar(document.getElementById("calendar"), loggedDateSet(logs));

  // Subject-wise minutes (approved only)
  const bySubject = {};
  logs.filter((l) => l.status === LOG_STATUS.APPROVED).forEach((l) => {
    bySubject[l.subject] = (bySubject[l.subject] || 0) + Number(l.durationMinutes || 0);
  });
  const maxMin = Math.max(1, ...Object.values(bySubject));
  const barsEl = document.getElementById("subject-bars");
  const entries = Object.entries(bySubject).sort((a, b) => b[1] - a[1]);
  barsEl.innerHTML = entries.length
    ? entries
        .map(
          ([subj, min]) => `
      <div class="bar-row">
        <div class="lbl">${subj}</div>
        <div class="progress-track" style="flex:1;">
          <div class="progress-fill" style="width:${(min / maxMin) * 100}%;"></div>
        </div>
        <div class="val">${(min / 60).toFixed(1)}h</div>
      </div>`
        )
        .join("")
    : `<div class="empty-state">No approved logs yet</div>`;

  // History table
  const historyBody = document.getElementById("history-body");
  historyBody.innerHTML = logs.length
    ? logs
        .map((l) => {
          const badge =
            l.status === LOG_STATUS.APPROVED
              ? '<span class="badge badge-success">Approved</span>'
              : l.status === LOG_STATUS.CORRECTION
              ? '<span class="badge badge-danger">Needs Correction</span>'
              : '<span class="badge badge-warning">Pending</span>';
          return `<tr><td>${l.date}</td><td>${l.day || ""}</td><td>${l.subject}</td><td>${l.chapter || "—"}</td><td>${l.durationMinutes} min</td><td>${badge}</td></tr>`;
        })
        .join("")
    : `<tr><td colspan="6"><div class="empty-state">No study logs yet</div></td></tr>`;

  document.getElementById("page-loader").classList.add("done");
})();
