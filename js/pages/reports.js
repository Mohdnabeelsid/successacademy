import { requireAuth } from "../services/auth-service.js";
import { renderSidebar } from "../components/sidebar.js";
import { listStudents } from "../services/student-service.js";
import { getStudentLogs } from "../services/studylog-service.js";
import { buildLeaderboard, toCSV, downloadCSV, downloadExcel } from "../services/report-service.js";

let currentRows = [];

(async function init() {
  const admin = await requireAuth("admin", "admin-login.html");
  renderSidebar("admin", "reports", { name: admin.name || admin.email, sub: "Branch Admin" });

  await refresh();
  document.getElementById("page-loader").classList.add("done");
  wireEvents();
})();

async function refresh() {
  const branch = document.getElementById("filter-branch").value;
  const cls = document.getElementById("filter-class").value;
  const rankBy = document.getElementById("rank-by").value;

  let students = await listStudents({ branch, class: cls });

  const logsByStudentId = {};
  await Promise.all(
    students.map(async (s) => {
      logsByStudentId[s.id] = await getStudentLogs(s.id, 500);
    })
  );

  currentRows = buildLeaderboard(students, logsByStudentId, rankBy);
  renderTable(currentRows);
}

function renderTable(rows) {
  const body = document.getElementById("leaderboard-body");
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="8"><div class="empty-state">No students match these filters.</div></td></tr>`;
    return;
  }
  body.innerHTML = rows
    .map(
      (r) => `<tr>
      <td><strong>#${r.rank}</strong></td>
      <td>${r.name}</td>
      <td>${r.admissionNumber}</td>
      <td>${r.class}</td>
      <td>${r.branch}</td>
      <td><span class="badge badge-success">${r.streak} days</span></td>
      <td>${r.hours} hrs</td>
      <td>${r.activeCount}</td>
    </tr>`
    )
    .join("");
}

function wireEvents() {
  ["filter-branch", "filter-class", "rank-by"].forEach((id) =>
    document.getElementById(id).addEventListener("change", refresh)
  );

  document.getElementById("export-csv-btn").addEventListener("click", () => {
    const csv = toCSV(currentRows, [
      { key: "rank", label: "Rank" },
      { key: "name", label: "Name" },
      { key: "admissionNumber", label: "Admission Number" },
      { key: "class", label: "Class" },
      { key: "branch", label: "Branch" },
      { key: "streak", label: "Streak (days)" },
      { key: "hours", label: "Total Hours" },
      { key: "activeCount", label: "Logs Approved" }
    ]);
    downloadCSV("success-academy-leaderboard.csv", csv);
  });

  document.getElementById("export-excel-btn").addEventListener("click", () => {
    downloadExcel("success-academy-leaderboard.xlsx", currentRows, "Leaderboard");
  });
}
