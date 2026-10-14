// ==========================================================================
// REPORT SERVICE — CSV/Excel export + leaderboard ranking
// ==========================================================================

import { calcStreak, calcTotalHours, LOG_STATUS } from "./studylog-service.js";

/**
 * Sanitizes a CSV cell value against Formula Injection (CSV Injection).
 * If the value starts with '=', '+', '-', or '@', prefixes it with a single quote (').
 * Also escapes double-quotes.
 * @param {*} val
 * @returns {string} Safe quoted CSV cell
 */
export function sanitizeCsvValue(val) {
  let str = String(val ?? "");
  if (/^[=+\-@]/.test(str)) {
    str = "'" + str;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

export function toCSV(rows, columns) {
  const header = columns.map((c) => `"${String(c.label ?? "").replace(/"/g, '""')}"`).join(",");
  const body = rows
    .map((r) => columns.map((c) => sanitizeCsvValue(r[c.key])).join(","))
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

/**
 * Builds attendance report rows for CSV/Excel export and reporting.
 * Computes total sessions held, present, late, absent, unmarked, attended, and attendance percentage.
 * @param {Array<Object>} students
 * @param {Object} attendanceByStudentId - Map of studentId -> Array of attendance records
 * @param {number|Object} [totalSessionsOrMap=0] - Total sessions held (number or map by class/student)
 * @returns {Array<Object>}
 */
export function buildAttendanceReportRows(students, attendanceByStudentId, totalSessionsOrMap = 0) {
  return students.map((s) => {
    const records = attendanceByStudentId[s.id] || [];
    let present = 0;
    let late = 0;
    let absent = 0;
    records.forEach((r) => {
      if (r.status === "Present") present++;
      else if (r.status === "Late") late++;
      else if (r.status === "Absent") absent++;
    });

    let totalSessions = 0;
    if (typeof totalSessionsOrMap === "number") {
      totalSessions = totalSessionsOrMap > 0 ? totalSessionsOrMap : records.length;
    } else if (typeof totalSessionsOrMap === "object" && totalSessionsOrMap !== null) {
      const clsKey = s.class ? String(s.class).replace(/^class\s*/i, "").trim() : "";
      totalSessions = totalSessionsOrMap[clsKey] ?? totalSessionsOrMap[s.id] ?? records.length;
    } else {
      totalSessions = records.length;
    }

    const marked = present + late + absent;
    const unmarked = Math.max(0, totalSessions - marked);
    const attended = present + late;
    const percentage = totalSessions > 0 ? Math.round(((present + late) / totalSessions) * 1000) / 10 : 0;

    return {
      studentId: s.id,
      admissionNumber: s.admissionNumber,
      name: s.name,
      class: s.class,
      branch: s.branch,
      phone: s.phone || "",
      parentName: s.parentName || "",
      totalSessions,
      present,
      late,
      absent,
      unmarked,
      attended,
      attendancePercentage: percentage
    };
  });
}

/**
 * Sanitizes an Indian phone number for wa.me links.
 * Strips non-digits; if 10 digits, prepends '91'.
 * Returns cleaned number or empty string if invalid.
 * @param {string|number} phone
 * @returns {string}
 */
export function sanitizeWhatsAppPhone(phone) {
  if (!phone) return "";
  const cleaned = String(phone).replace(/\D/g, "");
  if (cleaned.length === 10) {
    return `91${cleaned}`;
  }
  if (cleaned.length === 12 && cleaned.startsWith("91")) {
    return cleaned;
  }
  return cleaned;
}

/**
 * Generates a WhatsApp wa.me URL for parent attendance notification.
 * @param {Object} studentRow - Row produced by buildAttendanceReportRows
 * @returns {string|null} wa.me URL or null if phone is unavailable
 */
export function generateWhatsAppAttendanceLink(studentRow) {
  if (!studentRow) return null;
  const phone = sanitizeWhatsAppPhone(studentRow.phone);
  if (!phone) return null;

  const parentGreeting = studentRow.parentName ? `Dear ${studentRow.parentName},` : `Dear Parent,`;
  const text = `${parentGreeting} Attendance notice from Success Academy: ${studentRow.name} (Class ${studentRow.class}) has an attendance rate of ${studentRow.attendancePercentage}% (${studentRow.attended}/${studentRow.totalSessions} sessions attended, ${studentRow.absent} absent). Regular attendance is required for academic progress.`;

  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

