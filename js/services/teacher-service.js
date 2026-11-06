// ==========================================================================
// TEACHER SERVICE — SUPABASE
// Handles Teacher Master Management, Teacher Diary / Class Log Tracking,
// Duration Calculation, Analytics & CSV Export.
// ==========================================================================

import { TABLES, supabase } from "../config/supabase-config.js";
import {
  createRow,
  updateRowById,
  deleteRowById,
  getRowById,
  toSnakeCase,
  toCamelCase
} from "./supabase-service.js";
import { parseTimeToMinutes, getISTTodayIso, getAcademicYear } from "../utils/date-time.js";
import { sanitizeCsvValue } from "./report-service.js";

export const TEACHER_STATUS = {
  ACTIVE: "Active",
  INACTIVE: "Inactive"
};

/**
 * Calculates duration in minutes given start and end time strings.
 * Supports "HH:MM" (24h) and "hh:mm AM/PM" (12h).
 * If end time is not provided or invalid, returns 0.
 * @param {string} startTime e.g. "09:00" or "09:00 AM"
 * @param {string} endTime e.g. "10:30" or "10:30 AM"
 * @returns {number} duration in minutes
 */
export function calculateDurationMinutes(startTime, endTime) {
  if (!startTime || !endTime) return 0;
  const startMins = parseTimeToMinutes(startTime);
  const endMins = parseTimeToMinutes(endTime);

  if (startMins === null || endMins === null) return 0;

  if (endMins >= startMins) {
    return endMins - startMins;
  }
  // If session crosses midnight (rare for daytime class), handle wrap-around:
  return (24 * 60 - startMins) + endMins;
}

/**
 * Formats duration in minutes to human-readable string.
 * e.g. 90 -> "1 hr 30 mins", 60 -> "1 hr", 45 -> "45 mins"
 * @param {number} minutes
 * @returns {string}
 */
export function formatDurationDisplay(minutes) {
  const m = Math.max(0, parseInt(minutes, 10) || 0);
  if (m === 0) return "0 mins";
  const hours = Math.floor(m / 60);
  const mins = m % 60;

  if (hours > 0 && mins > 0) {
    return `${hours} hr ${mins} min${mins > 1 ? "s" : ""}`;
  }
  if (hours > 0) {
    return `${hours} hr${hours > 1 ? "s" : ""}`;
  }
  return `${mins} min${mins > 1 ? "s" : ""}`;
}

// ==========================================================================
// 1. TEACHER MASTER CRUD
// ==========================================================================

/**
 * Lists teachers with optional filters.
 * @param {Object} filters { branch, status, search }
 * @returns {Promise<Array>} List of teacher objects
 */
export async function listTeachers(filters = {}) {
  let query = supabase
    .from(TABLES.TEACHERS)
    .select("*")
    .order("name", { ascending: true });

  if (filters.branch && filters.branch !== "ALL") {
    // Teachers may be designated for a specific branch or "ALL"
    query = query.or(`branch.eq.${filters.branch},branch.eq.ALL`);
  }

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  let teachers = (data || []).map((row) => toCamelCase(row));

  if (filters.search) {
    const q = filters.search.trim().toLowerCase();
    teachers = teachers.filter((t) => {
      const name = (t.name || "").toLowerCase();
      const phone = (t.phone || "").toLowerCase();
      const email = (t.email || "").toLowerCase();
      const subjects = Array.isArray(t.subjects) ? t.subjects.join(" ").toLowerCase() : "";
      return name.includes(q) || phone.includes(q) || email.includes(q) || subjects.includes(q);
    });
  }

  return teachers;
}

/**
 * Retrieves a single teacher by ID.
 * @param {string} id
 * @returns {Promise<Object>}
 */
export async function getTeacher(id) {
  const row = await getRowById(TABLES.TEACHERS, id);
  return toCamelCase(row);
}

/**
 * Creates a new teacher record.
 * @param {Object} teacherData
 * @returns {Promise<string>} Created teacher ID
 */
export async function createTeacher(teacherData) {
  if (!teacherData.name || !teacherData.name.trim()) {
    throw new Error("Teacher name is required.");
  }

  const cleanData = {
    name: teacherData.name.trim(),
    phone: (teacherData.phone || "").trim(),
    email: (teacherData.email || "").trim(),
    branch: teacherData.branch || "MAN",
    subjects: Array.isArray(teacherData.subjects) ? teacherData.subjects : [],
    classes: Array.isArray(teacherData.classes) ? teacherData.classes : [],
    status: teacherData.status || TEACHER_STATUS.ACTIVE,
    notes: (teacherData.notes || "").trim()
  };

  return await createRow(TABLES.TEACHERS, cleanData);
}

/**
 * Updates an existing teacher.
 * @param {string} id
 * @param {Object} teacherData
 */
export async function updateTeacher(id, teacherData) {
  if (!id) throw new Error("Teacher ID is required for update.");

  const payload = {};
  if (teacherData.name !== undefined) payload.name = teacherData.name.trim();
  if (teacherData.phone !== undefined) payload.phone = teacherData.phone.trim();
  if (teacherData.email !== undefined) payload.email = teacherData.email.trim();
  if (teacherData.branch !== undefined) payload.branch = teacherData.branch;
  if (teacherData.subjects !== undefined) payload.subjects = teacherData.subjects;
  if (teacherData.classes !== undefined) payload.classes = teacherData.classes;
  if (teacherData.status !== undefined) payload.status = teacherData.status;
  if (teacherData.notes !== undefined) payload.notes = teacherData.notes.trim();

  await updateRowById(TABLES.TEACHERS, id, payload);
}

/**
 * Deletes a teacher record.
 * @param {string} id
 */
export async function deleteTeacher(id) {
  if (!id) throw new Error("Teacher ID is required for deletion.");
  await deleteRowById(TABLES.TEACHERS, id);
}

/**
 * Toggles a teacher's status between Active and Inactive.
 * @param {string} id
 * @param {string} currentStatus
 */
export async function toggleTeacherStatus(id, currentStatus) {
  const nextStatus = currentStatus === TEACHER_STATUS.ACTIVE ? TEACHER_STATUS.INACTIVE : TEACHER_STATUS.ACTIVE;
  await updateRowById(TABLES.TEACHERS, id, { status: nextStatus });
  return nextStatus;
}

// ==========================================================================
// 2. CLASS LOG TRACKING (TEACHER'S DIARY)
// ==========================================================================

/**
 * Lists class logs with filtering options.
 * @param {Object} filters { branch, class, teacherId, teacherName, date, dateFrom, dateTo, academicYear }
 * @returns {Promise<Array>} List of class logs
 */
export async function listClassLogs(filters = {}) {
  let query = supabase
    .from(TABLES.CLASS_LOGS)
    .select("*")
    .order("date", { ascending: false })
    .order("start_time", { ascending: true });

  if (filters.branch && filters.branch !== "ALL") {
    query = query.eq("branch", filters.branch);
  }
  if (filters.class) {
    query = query.eq("class", filters.class);
  }
  if (filters.teacherId) {
    query = query.eq("teacher_id", filters.teacherId);
  }
  if (filters.date) {
    query = query.eq("date", filters.date);
  }
  if (filters.dateFrom) {
    query = query.gte("date", filters.dateFrom);
  }
  if (filters.dateTo) {
    query = query.lte("date", filters.dateTo);
  }
  if (filters.academicYear) {
    query = query.eq("academic_year", filters.academicYear);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  let logs = (data || []).map((row) => toCamelCase(row));

  if (filters.teacherName) {
    const q = filters.teacherName.trim().toLowerCase();
    logs = logs.filter((l) => (l.teacherName || "").toLowerCase().includes(q));
  }

  return logs;
}

/**
 * Retrieves a single class log by ID.
 * @param {string} id
 * @returns {Promise<Object>}
 */
export async function getClassLog(id) {
  const row = await getRowById(TABLES.CLASS_LOGS, id);
  return toCamelCase(row);
}

/**
 * Records a new class teaching session log.
 * @param {Object} logData
 * @returns {Promise<string>}
 */
export async function createClassLog(logData) {
  if (!logData.teacherName || !logData.teacherName.trim()) {
    throw new Error("Teacher name is required.");
  }
  if (!logData.class) {
    throw new Error("Class is required.");
  }
  if (!logData.subject) {
    throw new Error("Subject is required.");
  }

  const date = logData.date || getISTTodayIso();
  const startTime = (logData.startTime || "").trim();
  const endTime = (logData.endTime || "").trim();
  const durationMinutes = logData.durationMinutes !== undefined && logData.durationMinutes !== null
    ? Number(logData.durationMinutes)
    : calculateDurationMinutes(startTime, endTime);

  const cleanData = {
    teacherId: logData.teacherId || null,
    teacherName: logData.teacherName.trim(),
    date,
    startTime,
    endTime,
    durationMinutes,
    class: String(logData.class).trim(),
    subject: String(logData.subject).trim(),
    branch: logData.branch || "MAN",
    topic: (logData.topic || "").trim(),
    notes: (logData.notes || "").trim(),
    academicYear: logData.academicYear || getAcademicYear(date),
    createdBy: logData.createdBy || null
  };

  return await createRow(TABLES.CLASS_LOGS, cleanData);
}

/**
 * Updates an existing class log.
 * @param {string} id
 * @param {Object} logData
 */
export async function updateClassLog(id, logData) {
  if (!id) throw new Error("Log ID is required for update.");

  const payload = {};
  if (logData.teacherId !== undefined) payload.teacherId = logData.teacherId;
  if (logData.teacherName !== undefined) payload.teacherName = logData.teacherName.trim();
  if (logData.date !== undefined) payload.date = logData.date;
  if (logData.startTime !== undefined) payload.startTime = logData.startTime.trim();
  if (logData.endTime !== undefined) payload.endTime = logData.endTime.trim();
  if (logData.class !== undefined) payload.class = String(logData.class).trim();
  if (logData.subject !== undefined) payload.subject = String(logData.subject).trim();
  if (logData.branch !== undefined) payload.branch = logData.branch;
  if (logData.topic !== undefined) payload.topic = (logData.topic || "").trim();
  if (logData.notes !== undefined) payload.notes = (logData.notes || "").trim();
  if (logData.academicYear !== undefined) payload.academicYear = logData.academicYear;

  // Auto recalculate duration if times updated and duration not explicitly specified
  if (payload.startTime || payload.endTime) {
    const existing = await getClassLog(id);
    const s = payload.startTime !== undefined ? payload.startTime : existing.startTime;
    const e = payload.endTime !== undefined ? payload.endTime : existing.endTime;
    payload.durationMinutes = calculateDurationMinutes(s, e);
  } else if (logData.durationMinutes !== undefined) {
    payload.durationMinutes = Number(logData.durationMinutes);
  }

  await updateRowById(TABLES.CLASS_LOGS, id, payload);
}

/**
 * Deletes a class log entry.
 * @param {string} id
 */
export async function deleteClassLog(id) {
  if (!id) throw new Error("Log ID is required for deletion.");
  await deleteRowById(TABLES.CLASS_LOGS, id);
}

// ==========================================================================
// 3. ANALYTICS & SUMMARIES
// ==========================================================================

/**
 * Calculates analytics for a specific teacher.
 * @param {string} teacherId
 * @param {Array} classLogs all logs or filtered logs
 * @returns {Object}
 */
export function getTeacherAnalytics(teacherId, classLogs = []) {
  const teacherLogs = classLogs.filter(
    (l) => l.teacherId === teacherId || (l.teacherId === null && l.teacherName)
  );

  const totalSessions = teacherLogs.length;
  const totalMinutes = teacherLogs.reduce((sum, l) => sum + (Number(l.durationMinutes) || 0), 0);

  const subjectCounts = {};
  const classCounts = {};

  teacherLogs.forEach((l) => {
    if (l.subject) {
      subjectCounts[l.subject] = (subjectCounts[l.subject] || 0) + 1;
    }
    if (l.class) {
      classCounts[l.class] = (classCounts[l.class] || 0) + 1;
    }
  });

  const topSubject = Object.entries(subjectCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
  const topClass = Object.entries(classCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";

  return {
    totalSessions,
    totalMinutes,
    totalHours: (totalMinutes / 60).toFixed(1),
    topSubject,
    topClass,
    subjectCounts,
    classCounts,
    recentLogs: teacherLogs.slice(0, 10)
  };
}

/**
 * Calculates high-level metrics for dashboard cards.
 * @param {Array} logs
 * @param {string} targetDate ISO date (defaults to today)
 * @returns {Object}
 */
export function getClassLogsOverviewStats(logs = [], targetDate = null) {
  const today = targetDate || getISTTodayIso();
  const todayLogs = logs.filter((l) => l.date === today);

  const activeTeachersToday = new Set(todayLogs.map((l) => l.teacherName).filter(Boolean)).size;
  const classesCoveredToday = new Set(todayLogs.map((l) => l.class).filter(Boolean)).size;
  const todayMinutes = todayLogs.reduce((sum, l) => sum + (Number(l.durationMinutes) || 0), 0);

  const totalSessions = logs.length;
  const totalMinutes = logs.reduce((sum, l) => sum + (Number(l.durationMinutes) || 0), 0);

  return {
    todaySessions: todayLogs.length,
    activeTeachersToday,
    classesCoveredToday,
    todayMinutes,
    todayHours: (todayMinutes / 60).toFixed(1),
    totalSessions,
    totalMinutes,
    totalHours: (totalMinutes / 60).toFixed(1)
  };
}

// ==========================================================================
// 4. CSV EXPORT FOR CLASS LOGS (DIARY)
// ==========================================================================

/**
 * Builds CSV string from class logs with formula injection sanitization.
 * @param {Array} logs
 * @returns {string} Safe CSV string
 */
export function exportClassLogsToCSV(logs = []) {
  const headers = [
    "Date",
    "Branch",
    "Teacher Name",
    "Class",
    "Subject",
    "Start Time",
    "End Time",
    "Duration (Mins)",
    "Topic Covered",
    "Notes"
  ];

  const headerRow = headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(",");

  const rows = logs.map((l) => [
    sanitizeCsvValue(l.date || ""),
    sanitizeCsvValue(l.branch || ""),
    sanitizeCsvValue(l.teacherName || ""),
    sanitizeCsvValue(l.class || ""),
    sanitizeCsvValue(l.subject || ""),
    sanitizeCsvValue(l.startTime || ""),
    sanitizeCsvValue(l.endTime || ""),
    sanitizeCsvValue(l.durationMinutes || 0),
    sanitizeCsvValue(l.topic || ""),
    sanitizeCsvValue(l.notes || "")
  ].join(","));

  return [headerRow, ...rows].join("\n");
}

