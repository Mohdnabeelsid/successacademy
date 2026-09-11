// ==========================================================================
// STUDY LOG SERVICE — SUPABASE
// Logs are auto-approved on submission. No admin approval needed.
// ==========================================================================

import { TABLES } from "../config/supabase-config.js";
import { supabase } from "../config/supabase-config.js";
import {
  createRow,
  updateRowById,
  deleteRowById,
  getRowsWhere,
  getAllRows
} from "./supabase-service.js";
import {
  dayOfWeek,
  getISTTodayIso,
  getISTNowIsoTimestamp,
  createISTTimestamp,
  addDaysToIso,
  getISTWeekRange,
  getISTMonthRange
} from "../utils/date-time.js";

export { dayOfWeek };

export const LOG_STATUS = {
  PENDING: "Pending",
  APPROVED: "Approved",
  CORRECTION: "Needs Correction"
};

/**
 * Add a study log for a student.
 * Fix #5: Before inserting, checks for an existing log on the same (studentId, date, subject)
 *          to prevent duplicate inflation of hours and streak.
 * Fix #4: Removed the silent startTime/endTime fallback — the schema has had these columns
 *          since initial setup. Any column error should surface, not be silently swallowed.
 */
export async function addStudyLog(studentId, log) {
  const isLeave = Number(log.durationMinutes) === 0;

  // Fix #5: Duplicate-log guard for real study sessions (not leave entries).
  // Leave entries for the same day are allowed (multiple leave reports are edge-case valid).
  if (!isLeave && log.date && log.subject) {
    const { data: existing } = await supabase
      .from(TABLES.STUDY_LOGS)
      .select("id")
      .eq("student_id", studentId)
      .eq("date", log.date)
      .eq("subject", log.subject)
      .maybeSingle();

    if (existing) {
      throw new Error(
        `A study log for "${log.subject}" on ${log.date} already exists. ` +
        `Please edit the existing entry instead of creating a duplicate.`
      );
    }
  }

  const createdAt = log.createdAt || (
    (log.date && log.endTime)
      ? createISTTimestamp(log.date, log.endTime)
      : getISTNowIsoTimestamp()
  );

  const payload = {
    studentId,
    date: log.date,
    day: dayOfWeek(log.date),
    subject: log.subject,
    durationMinutes: Number(log.durationMinutes),
    chapter: log.chapter || "",
    notes: log.notes || "",
    // Always auto-approved on submission
    status: log.status || LOG_STATUS.APPROVED,
    adminComment: log.adminComment || "",
    createdAt: createdAt
  };

  // Fix #4: No silent fallback. The schema has had start_time/end_time since initial setup.
  // Any column error should surface as a real error, not be silently swallowed.
  if (log.startTime) payload.startTime = log.startTime;
  if (log.endTime) payload.endTime = log.endTime;

  return await createRow(TABLES.STUDY_LOGS, payload);
}

/**
 * Get all logs for a student, sorted newest-first.
 * Fix #3: Removed the hard cap of 200 rows. Stat functions (calcStreak, calcWeeklyHours,
 *          calcTotalHours) operate on the FULL log history and must not be truncated.
 *          Callers that only need recent entries should slice the returned array themselves.
 */
export async function getStudentLogs(studentId) {
  const logs = await getRowsWhere(TABLES.STUDY_LOGS, "studentId", "==", studentId);
  logs.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return logs; // Full history — no artificial cap
}

/**
 * Get all logs across all students (admin view), sorted newest-first.
 * Fix #2: Removed the silent 500-row cap. Returns all rows so admin sees complete data.
 */
export async function getAllLogs() {
  return getAllRows(TABLES.STUDY_LOGS, { orderByField: "date", direction: "desc" });
}

export async function deleteLog(logId) {
  return deleteRowById(TABLES.STUDY_LOGS, logId);
}

/**
 * Updates an existing study log entry.
 * @param {string} logId
 * @param {Object} updates
 */
export async function updateStudyLog(logId, updates) {
  const payload = {};
  if (updates.date !== undefined) {
    payload.date = updates.date;
    payload.day = dayOfWeek(updates.date);
  }
  if (updates.subject !== undefined) payload.subject = updates.subject;
  if (updates.durationMinutes !== undefined) payload.durationMinutes = Number(updates.durationMinutes);
  if (updates.startTime !== undefined) payload.startTime = updates.startTime;
  if (updates.endTime !== undefined) payload.endTime = updates.endTime;
  if (updates.chapter !== undefined) payload.chapter = updates.chapter;
  if (updates.notes !== undefined) payload.notes = updates.notes;
  if (updates.status !== undefined) payload.status = updates.status;

  return await updateRowById(TABLES.STUDY_LOGS, logId, payload);
}

/** 
 * Calculates current daily streak (consecutive days with at least one log or excused leave) in IST.
 * An ongoing streak is maintained if the student studied today OR studied yesterday.
 */
export function calcStreak(logs) {
  if (!logs || !logs.length) return 0;

  // Build a set of unique dates with active study (duration > 0) or registered leaves
  const logDates = new Set(
    logs
      .filter((l) => Number(l.durationMinutes) > 0 || (l.subject && (l.subject.includes("Inability") || l.subject.includes("Leave"))))
      .map((l) => l.date)
      .filter(Boolean)
  );

  const todayIso = getISTTodayIso();
  const yesterdayIso = addDaysToIso(todayIso, -1);

  // If student studied today, start chain from today.
  // If student studied yesterday (and hasn't logged today yet), streak is still alive starting from yesterday!
  let cursorIso;
  if (logDates.has(todayIso)) {
    cursorIso = todayIso;
  } else if (logDates.has(yesterdayIso)) {
    cursorIso = yesterdayIso;
  } else {
    return 0; // Streak broken
  }

  let streak = 0;
  while (logDates.has(cursorIso)) {
    streak++;
    cursorIso = addDaysToIso(cursorIso, -1);
  }

  return streak;
}

function minutesInRange(logs, startDate, endDate) {
  return logs
    .filter((l) => Number(l.durationMinutes) > 0 && l.date >= startDate && l.date <= endDate)
    .reduce((sum, l) => sum + (Number(l.durationMinutes) || 0), 0);
}

export function calcWeeklyHours(logs) {
  const { startIso } = getISTWeekRange();
  const todayIso = getISTTodayIso();
  return +(minutesInRange(logs, startIso, todayIso) / 60).toFixed(1);
}

export function calcMonthlyHours(logs) {
  const { startIso } = getISTMonthRange();
  const todayIso = getISTTodayIso();
  return +(minutesInRange(logs, startIso, todayIso) / 60).toFixed(1);
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
