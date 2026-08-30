// ==========================================================================
// STUDY LOG SERVICE — SUPABASE
// Logs are auto-approved on submission. No admin approval needed.
// ==========================================================================

import { TABLES } from "../config/supabase-config.js";
import {
  createRow,
  updateRowById,
  deleteRowById,
  getRowsWhere,
  getAllRows
} from "./supabase-service.js";

export const LOG_STATUS = {
  PENDING: "Pending",
  APPROVED: "Approved",
  CORRECTION: "Needs Correction"
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function dayOfWeek(dateStr) {
  return DAY_NAMES[new Date(dateStr).getDay()];
}

export async function addStudyLog(studentId, log) {
  return createRow(TABLES.STUDY_LOGS, {
    studentId,
    date: log.date,
    day: dayOfWeek(log.date),
    subject: log.subject,
    durationMinutes: Number(log.durationMinutes),
    chapter: log.chapter || "",
    notes: log.notes || "",
    // Always auto-approved on submission
    status: LOG_STATUS.APPROVED,
    adminComment: log.adminComment || ""
  });
}

export async function getStudentLogs(studentId, max = 200) {
  const logs = await getRowsWhere(TABLES.STUDY_LOGS, "studentId", "==", studentId);
  logs.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return logs.slice(0, max);
}

export async function getAllLogs(max = 500) {
  return getAllRows(TABLES.STUDY_LOGS, { orderByField: "date", direction: "desc", max });
}

export async function deleteLog(logId) {
  return deleteRowById(TABLES.STUDY_LOGS, logId);
}

/** Calculates current daily streak (consecutive days with at least one log). */
export function calcStreak(logs) {
  // Count all submitted logs (no approval required)
  const logDates = new Set(
    logs.filter((l) => Number(l.durationMinutes) > 0).map((l) => l.date)
  );
  let streak = 0;
  let cursor = new Date();
  while (true) {
    const iso = cursor.toISOString().slice(0, 10);
    if (logDates.has(iso)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

function minutesInRange(logs, startDate, endDate) {
  return logs
    .filter((l) => Number(l.durationMinutes) > 0 && l.date >= startDate && l.date <= endDate)
    .reduce((sum, l) => sum + (Number(l.durationMinutes) || 0), 0);
}

export function calcWeeklyHours(logs) {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay());
  const startIso = start.toISOString().slice(0, 10);
  const endIso = now.toISOString().slice(0, 10);
  return +(minutesInRange(logs, startIso, endIso) / 60).toFixed(1);
}

export function calcMonthlyHours(logs) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const end = now.toISOString().slice(0, 10);
  return +(minutesInRange(logs, start, end) / 60).toFixed(1);
}

export function calcTotalHours(logs) {
  const mins = logs
    .filter((l) => Number(l.durationMinutes) > 0)
    .reduce((s, l) => s + (Number(l.durationMinutes) || 0), 0);
  return +(mins / 60).toFixed(1);
}

/** Builds a Set of ISO date strings that have a submitted log — for calendar rendering. */
export function loggedDateSet(logs) {
  return new Set(logs.filter((l) => Number(l.durationMinutes) > 0).map((l) => l.date));
}
