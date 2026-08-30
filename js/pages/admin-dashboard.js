import { requireAuth } from "../services/auth-service.js";
import { renderSidebar } from "../components/sidebar.js";
import { listStudents } from "../services/student-service.js";
import { getAllLogs, LOG_STATUS, calcStreak } from "../services/studylog-service.js";

(async function init() {
  try {
    const admin = await requireAuth("admin", "admin-login.html");
    renderSidebar("admin", "dashboard", { name: admin.name || admin.email, sub: "Branch Admin" });

    document.getElementById("today-label").textContent = new Date().toLocaleDateString("en-IN", {
      weekday: "long", year: "numeric", month: "long", day: "numeric"
    });

    const [students, logs] = await Promise.all([listStudents(), getAllLogs()]);

    document.getElementById("stat-students").textContent = students.length;

    const pending = logs.filter((l) => l.status === LOG_STATUS.PENDING);
    document.getElementById("stat-pending").textContent = pending.length;

    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    const weekStartIso = weekStart.toISOString().slice(0, 10);
    const weekLogs = logs.filter((l) => l.date >= weekStartIso);
    document.getElementById("stat-weeklogs").textContent = weekLogs.length;

    // Average streak across students
    const logsByStudent = {};
    logs.forEach((l) => {
      (logsByStudent[l.studentId] = logsByStudent[l.studentId] || []).push(l);
    });
    const streaks = students.map((s) => calcStreak(logsByStudent[s.id] || []));
    const avgStreak = streaks.length ? (streaks.reduce((a, b) => a + b, 0) / streaks.length).toFixed(1) : "0";
    document.getElementById("stat-streak").textContent = avgStreak;

    // Pending table
    const tbody = document.getElementById("pending-table-body");
    const studentMap = Object.fromEntries(students.map((s) => [s.id, s]));
    if (!pending.length) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><h4>All caught up</h4>No study logs waiting for review.</div></td></tr>`;
    } else {
      tbody.innerHTML = pending
        .slice(0, 8)
        .map((l) => {
          const s = studentMap[l.studentId];
          return `<tr>
            <td>${s ? s.name : "Unknown"}</td>
            <td>${l.date}</td>
            <td>${l.subject}</td>
            <td>${l.durationMinutes} min</td>
            <td><span class="badge badge-warning">Pending</span></td>
          </tr>`;
        })
        .join("");
    }

    // Mini leaderboard (top 5 by streak)
    const ranked = students
      .map((s) => ({ s, streak: calcStreak(logsByStudent[s.id] || []) }))
      .sort((a, b) => b.streak - a.streak)
      .slice(0, 5);
    const lbEl = document.getElementById("leaderboard-mini");
    lbEl.innerHTML = ranked.length
      ? ranked
          .map(
            (r, i) => `
        <div class="flex items-center justify-between" style="padding:10px 0;border-bottom:1px solid var(--c-border);">
          <div class="flex items-center gap-3">
            <div class="avatar" style="width:32px;height:32px;font-size:var(--fs-xs);">${i + 1}</div>
            <div style="font-size:var(--fs-sm);font-weight:600;">${r.s.name}</div>
          </div>
          <span class="badge badge-success">${r.streak} day streak</span>
        </div>`
          )
          .join("")
      : `<div class="empty-state">No data yet</div>`;
  } catch (err) {
    console.error("Admin dashboard initialization error:", err);
  } finally {
    const loader = document.getElementById("page-loader");
    if (loader) loader.classList.add("done");
  }
})();
