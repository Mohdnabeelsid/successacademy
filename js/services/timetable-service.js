// ==========================================================================
// TIMETABLE SERVICE — SUPABASE
// Handles Timetable scheduling, week views, class/branch filtering,
// and student in-app alerts with time/proximity priority.
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
import {
  getISTTodayIso,
  getAcademicYear,
  addDaysToIso,
  dayOfWeek,
  format12Hour,
  parseTimeToMinutes,
  formatLogDate
} from "../utils/date-time.js";

export const SESSION_TYPES = ["Class", "Exam", "Event", "Other"];

export const SESSION_TYPE_ICONS = {
  Class: "📚",
  Exam: "📝",
  Event: "🎯",
  Other: "📌"
};

export const SESSION_TYPE_COLORS = {
  Class: "var(--c-primary)",
  Exam: "var(--c-warning)",
  Event: "var(--c-success)",
  Other: "var(--c-text-muted)"
};

/**
 * Normalizes class representation by stripping any leading "Class " prefix.
 * e.g. "Class 10" -> "10", "10" -> "10", "Class 11 Science" -> "11 Science"
 * @param {string} cls
 * @returns {string}
 */
export function normalizeClass(cls) {
  if (!cls) return "";
  return String(cls).trim().replace(/^class\s+/i, "");
}

/**
 * Validates a timetable entry input object.
 * @param {Object} data
 * @param {Object} [options]
 * @param {boolean} [options.allowFutureBeyondWeek=false]
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateTimetableEntry(data = {}, options = {}) {
  const errors = [];
  const today = getISTTodayIso();

  if (!data.date) {
    errors.push("Date is required.");
  } else if (!options.allowFutureBeyondWeek) {
    const maxDate = addDaysToIso(today, 7);
    if (data.date > maxDate) {
      errors.push("Date cannot be more than 7 days from today.");
    }
  }

  if (!data.class || !String(data.class).trim()) {
    errors.push("Class is required.");
  }

  if (!data.branch || !String(data.branch).trim()) {
    errors.push("Branch is required.");
  }

  if (!data.sessionType || !SESSION_TYPES.includes(data.sessionType)) {
    errors.push(`Session type must be one of: ${SESSION_TYPES.join(", ")}.`);
  }

  if (data.startTime && data.endTime) {
    const startMins = parseTimeToMinutes(data.startTime);
    const endMins = parseTimeToMinutes(data.endTime);
    if (startMins !== null && endMins !== null && endMins <= startMins) {
      errors.push("End time must be after start time.");
    }
  }

  if (data.subjects && Array.isArray(data.subjects) && data.subjects.length > 3) {
    errors.push("You can select up to 3 subjects.");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Formats start and optional end time of an entry in 12-hour format.
 * @param {Object} entry
 * @returns {string} e.g. "09:00 AM – 10:30 AM" or "09:00 AM"
 */
export function formatEntryTime(entry = {}) {
  const start = entry.startTime ? format12Hour(entry.startTime) : "";
  const end = entry.endTime ? format12Hour(entry.endTime) : "";
  if (start && end) return `${start} – ${end}`;
  if (start) return start;
  if (end) return `Until ${end}`;
  return "Time TBA";
}

/**
 * Returns a brief one-line summary string for an entry.
 * @param {Object} entry
 * @returns {string} e.g. "[📚] Mathematics — Algebra Ch.5 (09:00 AM)"
 */
export function getEntrySummary(entry = {}) {
  const icon = SESSION_TYPE_ICONS[entry.sessionType] || "📌";
  const subjectsList = entry.subjects && entry.subjects.length ? entry.subjects.join(", ") : (entry.subject || "Session");
  const detail = entry.title && subjectsList ? ` — ${entry.title}` : (entry.title ? entry.title : "");
  const time = entry.startTime ? ` (${format12Hour(entry.startTime)})` : "";
  return `[${icon}] ${subjectsList}${detail}${time}`;
}

/**
 * Computes in-app notification priority based on date proximity to today.
 * Priority 1: Today
 * Priority 2: Tomorrow
 * Priority 3: In 2 days
 * returns null if beyond 2 days or in the past
 * @param {string} entryDate ISO date string YYYY-MM-DD
 * @param {string} [todayIso] optional override for testing
 * @returns {{ level: number, label: string, color: string } | null}
 */
export function computeAlertPriority(entryDate, todayIso) {
  if (!entryDate) return null;
  const today = todayIso || getISTTodayIso();
  const tomorrow = addDaysToIso(today, 1);
  const dayAfter = addDaysToIso(today, 2);

  if (entryDate === today) {
    return { level: 1, label: "Today", color: "var(--c-danger)" };
  }
  if (entryDate === tomorrow) {
    return { level: 2, label: "Tomorrow", color: "var(--c-warning)" };
  }
  if (entryDate === dayAfter) {
    return { level: 3, label: "In 2 days", color: "var(--c-info)" };
  }
  return null;
}

/**
 * Groups an array of timetable entries by date into an object key-value map.
 * Pre-populates all days between startDate and (startDate + numDays - 1).
 * @param {Array} entries
 * @param {string} [startDate] ISO date string (defaults to today)
 * @param {number} [numDays=7]
 * @returns {Record<string, Array>}
 */
export function groupEntriesByDate(entries = [], startDate, numDays = 7) {
  const start = startDate || getISTTodayIso();
  const grouped = {};

  for (let i = 0; i < numDays; i++) {
    const d = addDaysToIso(start, i);
    grouped[d] = [];
  }

  (entries || []).forEach(entry => {
    const d = entry.date;
    if (!grouped[d]) {
      grouped[d] = [];
    }
    grouped[d].push(entry);
  });

  // Sort entries within each day by start_time
  Object.keys(grouped).forEach(d => {
    grouped[d].sort((a, b) => {
      const aMins = parseTimeToMinutes(a.startTime) ?? 9999;
      const bMins = parseTimeToMinutes(b.startTime) ?? 9999;
      return aMins - bMins;
    });
  });

  return grouped;
}

/**
 * Creates a new timetable entry.
 * @param {Object} entryData
 * @returns {Promise<Object>}
 */
export async function createTimetableEntry(entryData) {
  const normClass = normalizeClass(entryData.class);

  // Normalize subjects: up to 3 subjects
  let subjects = [];
  if (Array.isArray(entryData.subjects)) {
    subjects = entryData.subjects.map(s => String(s).trim()).filter(Boolean);
  } else if (entryData.subject) {
    subjects = String(entryData.subject).split(",").map(s => s.trim()).filter(Boolean);
  }
  if (subjects.length > 3) subjects = subjects.slice(0, 3);
  const subjectStr = subjects.join(", ") || (entryData.subject ? String(entryData.subject).trim() : "");

  const payload = {
    branch: entryData.branch ? String(entryData.branch).toUpperCase().trim() : "MAN",
    class: normClass,
    date: entryData.date,
    startTime: entryData.startTime || "",
    endTime: entryData.endTime || "",
    sessionType: entryData.sessionType || "Class",
    subject: subjectStr,
    subjects: subjects,
    title: entryData.title || "",
    description: entryData.description || "",
    location: entryData.location || "",
    academicYear: entryData.academicYear || getAcademicYear(entryData.date),
    createdBy: entryData.createdBy || null
  };

  const validation = validateTimetableEntry(payload);
  if (!validation.valid) {
    throw new Error(validation.errors.join(" "));
  }

  try {
    return await createRow(TABLES.TIMETABLE_ENTRIES, payload);
  } catch (err) {
    // Graceful fallback if migration 005 ALTER TABLE hasn't been run yet in Supabase
    if (err?.message && err.message.includes("timetable_entries.subjects does not exist")) {
      const fallbackPayload = { ...payload };
      delete fallbackPayload.subjects;
      return await createRow(TABLES.TIMETABLE_ENTRIES, fallbackPayload);
    }
    throw err;
  }
}

/**
 * Updates an existing timetable entry by ID.
 * @param {string} id
 * @param {Object} updates
 * @returns {Promise<Object>}
 */
export async function updateTimetableEntry(id, updates) {
  if (!id) throw new Error("Entry ID is required.");
  const payload = { ...updates };
  if (payload.class) {
    payload.class = normalizeClass(payload.class);
  }
  if (payload.branch) {
    payload.branch = String(payload.branch).toUpperCase().trim();
  }

  if (payload.subjects !== undefined) {
    let subjects = Array.isArray(payload.subjects)
      ? payload.subjects.map(s => String(s).trim()).filter(Boolean)
      : (payload.subjects ? String(payload.subjects).split(",").map(s => s.trim()).filter(Boolean) : []);
    if (subjects.length > 3) subjects = subjects.slice(0, 3);
    payload.subjects = subjects;
    payload.subject = subjects.join(", ") || (payload.subject ? String(payload.subject).trim() : "");
  }

  try {
    return await updateRowById(TABLES.TIMETABLE_ENTRIES, id, payload);
  } catch (err) {
    if (err?.message && err.message.includes("timetable_entries.subjects does not exist")) {
      const fallbackPayload = { ...payload };
      delete fallbackPayload.subjects;
      return await updateRowById(TABLES.TIMETABLE_ENTRIES, id, fallbackPayload);
    }
    throw err;
  }
}

/**
 * Deletes a timetable entry by ID.
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteTimetableEntry(id) {
  if (!id) throw new Error("Entry ID is required.");
  return await deleteRowById(TABLES.TIMETABLE_ENTRIES, id);
}

/**
 * Retrieves a single timetable entry by ID.
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function getTimetableEntry(id) {
  if (!id) return null;
  return await getRowById(TABLES.TIMETABLE_ENTRIES, id);
}

/**
 * Lists timetable entries with filters.
 * @param {Object} [filters]
 * @param {string} [filters.branch]
 * @param {string} [filters.class]
 * @param {string} [filters.sessionType]
 * @param {string} [filters.dateFrom]
 * @param {string} [filters.dateTo]
 * @param {string} [filters.teacherId]
 * @param {string} [filters.search]
 * @returns {Promise<Array>}
 */
export async function listTimetableEntries(filters = {}) {
  let query = supabase.from(TABLES.TIMETABLE_ENTRIES).select("*");

  if (filters.branch && filters.branch !== "ALL") {
    query = query.eq("branch", String(filters.branch).toUpperCase().trim());
  }

  if (filters.class && filters.class !== "ALL") {
    const cleanCls = normalizeClass(filters.class);
    const variants = Array.from(new Set([cleanCls, `Class ${cleanCls}`]));
    query = query.in("class", variants);
  }

  if (filters.sessionType && filters.sessionType !== "ALL") {
    query = query.eq("session_type", filters.sessionType);
  }

  if (filters.teacherId) {
    query = query.eq("teacher_id", filters.teacherId);
  }

  if (filters.dateFrom) {
    query = query.gte("date", filters.dateFrom);
  }

  if (filters.dateTo) {
    query = query.lte("date", filters.dateTo);
  }

  query = query.order("date", { ascending: true }).order("start_time", { ascending: true });

  const { data, error } = await query;
  if (error) {
    console.error("Error listing timetable entries:", error);
    return [];
  }

  let list = (data || []).map(row => {
    const item = toCamelCase(row);
    if (!item.subjects || !Array.isArray(item.subjects)) {
      item.subjects = item.subject ? item.subject.split(",").map(s => s.trim()).filter(Boolean) : [];
    }
    return item;
  });

  if (filters.search && String(filters.search).trim()) {
    const q = String(filters.search).trim().toLowerCase();
    list = list.filter(e => {
      const sub = (e.subject || "").toLowerCase();
      const subs = (e.subjects || []).join(" ").toLowerCase();
      const title = (e.title || "").toLowerCase();
      const loc = (e.location || "").toLowerCase();
      return sub.includes(q) || subs.includes(q) || title.includes(q) || loc.includes(q);
    });
  }

  return list;
}

/**
 * Gets entries for a 7-day week starting at startDate (defaults to today) grouped by day.
 * @param {string} [cls]
 * @param {string} [branch]
 * @param {string} [startDate] ISO date string
 * @returns {Promise<{ entries: Array, grouped: Record<string, Array>, startDate: string, endDate: string }>}
 */
export async function getWeekEntries(cls, branch, startDate) {
  const start = startDate || getISTTodayIso();
  const end = addDaysToIso(start, 6);

  const filters = {
    dateFrom: start,
    dateTo: end
  };

  if (cls && cls !== "ALL") filters.class = cls;
  if (branch && branch !== "ALL") filters.branch = branch;

  const entries = await listTimetableEntries(filters);
  const grouped = groupEntriesByDate(entries, start, 7);

  return {
    entries,
    grouped,
    startDate: start,
    endDate: end
  };
}

/**
 * Fetches timetable entries for a student's class and branch for the upcoming week.
 * @param {string} studentClass
 * @param {string} studentBranch
 * @param {string} [startDate]
 * @returns {Promise<{ entries: Array, grouped: Record<string, Array>, startDate: string, endDate: string }>}
 */
export async function getStudentTimetable(studentClass, studentBranch, startDate) {
  return await getWeekEntries(studentClass, studentBranch, startDate);
}

/**
 * Fetches in-app alerts for sessions scheduled within 2 days (today, tomorrow, day-after-tomorrow).
 * Ordered by priority level ASC (today first), then start_time ASC.
 * @param {string} studentClass
 * @param {string} studentBranch
 * @param {string} [todayIso] optional override
 * @returns {Promise<{ alerts: Array, unreadCount: number }>}
 */
export async function getUpcomingAlerts(studentClass, studentBranch, todayIso) {
  const today = todayIso || getISTTodayIso();
  const dayAfter = addDaysToIso(today, 2);

  const entries = await listTimetableEntries({
    class: studentClass,
    branch: studentBranch,
    dateFrom: today,
    dateTo: dayAfter
  });

  const alerts = entries
    .map(entry => {
      const priority = computeAlertPriority(entry.date, today);
      return {
        ...entry,
        priority
      };
    })
    .filter(item => item.priority !== null);

  // Sort by priority level ASC, then start_time ASC
  alerts.sort((a, b) => {
    if (a.priority.level !== b.priority.level) {
      return a.priority.level - b.priority.level;
    }
    const aMins = parseTimeToMinutes(a.startTime) ?? 9999;
    const bMins = parseTimeToMinutes(b.startTime) ?? 9999;
    return aMins - bMins;
  });

  return {
    alerts,
    unreadCount: alerts.length
  };
}

