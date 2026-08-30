import { requireAuth } from "../services/auth-service.js";
import { renderSidebar } from "../components/sidebar.js";
import { toast } from "../components/toast.js";
import { listStudents } from "../services/student-service.js";
import { getAllLogs, LOG_STATUS, calcStreak } from "../services/studylog-service.js";

let allStudents = [];
let allLogs = [];

(async function init() {
  try {
    const admin = await requireAuth("admin", "admin-login.html");
    renderSidebar("admin", "dashboard", { name: admin.name || admin.email, sub: "Branch Admin" });

    document.getElementById("today-label").textContent = new Date().toLocaleDateString("en-IN", {
      weekday: "long", year: "numeric", month: "long", day: "numeric"
    });

    const [studentsData, logsData] = await Promise.all([listStudents(), getAllLogs()]);
    allStudents = studentsData;
    allLogs = logsData;

    document.getElementById("stat-students").textContent = allStudents.length;

    const pending = allLogs.filter((l) => l.status === LOG_STATUS.PENDING);
    document.getElementById("stat-pending").textContent = pending.length;

    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    const weekStartIso = weekStart.toISOString().slice(0, 10);
    const weekLogs = allLogs.filter((l) => l.date >= weekStartIso);
    document.getElementById("stat-weeklogs").textContent = weekLogs.length;

    // Average streak across students
    const logsByStudent = {};
    allLogs.forEach((l) => {
      (logsByStudent[l.studentId] = logsByStudent[l.studentId] || []).push(l);
    });
    const streaks = allStudents.map((s) => calcStreak(logsByStudent[s.id] || []));
    const avgStreak = streaks.length ? (streaks.reduce((a, b) => a + b, 0) / streaks.length).toFixed(1) : "0";
    document.getElementById("stat-streak").textContent = avgStreak;

    // Pending table
    const tbody = document.getElementById("pending-table-body");
    const studentMap = Object.fromEntries(allStudents.map((s) => [s.id, s]));
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
    const ranked = allStudents
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

    wireWhatsAppEvents();
  } catch (err) {
    console.error("Admin dashboard initialization error:", err);
  } finally {
    const loader = document.getElementById("page-loader");
    if (loader) loader.classList.add("done");
  }
})();

function wireWhatsAppEvents() {
  const modal = document.getElementById("whatsapp-modal");
  const openBtn = document.getElementById("open-whatsapp-modal-btn");
  const closeBtn = document.getElementById("close-wa-modal");
  const classSelect = document.getElementById("wa-class-select");
  const dateInput = document.getElementById("wa-date-input");
  const templateInput = document.getElementById("wa-message-template");
  const copyBtn = document.getElementById("wa-copy-btn");
  const sendBtn = document.getElementById("wa-send-btn");

  if (!modal || !openBtn) return;

  const todayIso = new Date().toISOString().slice(0, 10);
  dateInput.value = todayIso;

  openBtn.addEventListener("click", () => {
    modal.classList.add("active");
    updateWhatsAppPreview();
  });

  closeBtn?.addEventListener("click", () => modal.classList.remove("active"));
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.remove("active"); });

  classSelect?.addEventListener("change", updateWhatsAppPreview);
  dateInput?.addEventListener("change", updateWhatsAppPreview);
  templateInput?.addEventListener("input", updateWhatsAppPreview);

  copyBtn?.addEventListener("click", () => {
    const preview = document.getElementById("wa-message-preview")?.textContent || "";
    if (!preview) return;
    navigator.clipboard.writeText(preview).then(() => {
      toast.success("WhatsApp reminder message copied to clipboard!");
    }).catch(() => {
      toast.error("Could not copy message.");
    });
  });

  sendBtn?.addEventListener("click", () => {
    const preview = document.getElementById("wa-message-preview")?.textContent || "";
    if (!preview) {
      toast.error("No message to send.");
      return;
    }
    const encoded = encodeURIComponent(preview);
    window.open(`https://api.whatsapp.com/send?text=${encoded}`, "_blank");
  });
}

function updateWhatsAppPreview() {
  const classVal = document.getElementById("wa-class-select")?.value || "";
  const dateVal = document.getElementById("wa-date-input")?.value || new Date().toISOString().slice(0, 10);
  const template = document.getElementById("wa-message-template")?.value || "";

  // 1. Filter target students by class
  let targetStudents = allStudents.filter((s) => !s.loginDisabled);
  if (classVal) {
    targetStudents = targetStudents.filter((s) => String(s.class) === String(classVal));
  }

  // 2. Find students who submitted at least one log on dateVal
  const submittedStudentIds = new Set(
    allLogs.filter((l) => l.date === dateVal).map((l) => l.studentId)
  );

  // 3. Identify non-submitting students
  const missingStudents = targetStudents.filter((s) => !submittedStudentIds.has(s.id));
  missingStudents.sort((a, b) => a.name.localeCompare(b.name));

  // Format student list string
  const studentListStr = missingStudents.length
    ? missingStudents.map((s, i) => `${i + 1}. ${s.name}`).join("\n")
    : "🎉 All students have submitted their study logs!";

  // Format date display
  let formattedDate = dateVal;
  try {
    const [y, m, d] = dateVal.split("-");
    formattedDate = `${d}/${m}/${y}`;
  } catch (e) {}

  const classDisplay = classVal ? `Class ${classVal}` : "All Classes";

  // Substitute placeholders
  const generatedMessage = template
    .replace(/\{class\}/g, classDisplay)
    .replace(/\{date\}/g, formattedDate)
    .replace(/\{count\}/g, missingStudents.length)
    .replace(/\{student_list\}/g, studentListStr);

  const previewEl = document.getElementById("wa-message-preview");
  if (previewEl) {
    previewEl.textContent = generatedMessage;
  }

  const countLabel = document.getElementById("wa-count-label");
  if (countLabel) {
    if (missingStudents.length === 0) {
      countLabel.textContent = "0 students pending 🎉";
      countLabel.style.color = "var(--c-success)";
    } else {
      countLabel.textContent = `${missingStudents.length} student(s) pending`;
      countLabel.style.color = "var(--c-danger)";
    }
  }

  const namesPill = document.getElementById("wa-missing-names-pill");
  if (namesPill) {
    namesPill.textContent = classVal ? `${targetStudents.length} total in Class ${classVal}` : `${targetStudents.length} total active students`;
  }
}
