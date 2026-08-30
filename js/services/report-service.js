// ==========================================================================
// REPORT SERVICE — CSV/Excel export + leaderboard ranking
// ==========================================================================

import { calcStreak, calcTotalHours, LOG_STATUS } from "./studylog-service.js";

export function toCSV(rows, columns) {
  const header = columns.map((c) => `"${c.label}"`).join(",");
  const body = rows
    .map((r) => columns.map((c) => `"${String(r[c.key] ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  return `${header}\n${body}`;
}

export function downloadCSV(filename, csvString) {
  const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Requires SheetJS (xlsx) to be loaded globally as `XLSX`. */
export function downloadExcel(filename, rows, sheetName = "Sheet1") {
  if (typeof XLSX === "undefined") {
    console.error("SheetJS (XLSX) not loaded — falling back to CSV.");
    return;
  }
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

/** rankBy: 'streak' | 'hours' | 'active' (log count) */
export function buildLeaderboard(students, logsByStudentId, rankBy = "streak") {
  const rows = students.map((s) => {
    const logs = logsByStudentId[s.id] || [];
    const approved = logs.filter((l) => l.status === LOG_STATUS.APPROVED);
    return {
      studentId: s.id,
      name: s.name,
      admissionNumber: s.admissionNumber,
      class: s.class,
      branch: s.branch,
      streak: calcStreak(logs),
      hours: calcTotalHours(logs),
      activeCount: approved.length
    };
  });

  const key = rankBy === "hours" ? "hours" : rankBy === "active" ? "activeCount" : "streak";
  rows.sort((a, b) => b[key] - a[key]);
  return rows.map((r, i) => ({ rank: i + 1, ...r }));
}
