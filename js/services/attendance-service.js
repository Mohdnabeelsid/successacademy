// ==========================================================================
// ATTENDANCE SERVICE — SUPABASE
// Handles session-based attendance management, fast roster marking,
// branch isolation, duplicate prevention, and analytics summaries.
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
  getISTNowIsoTimestamp,
  getISTTodayIso,
  getAcademicYear,
  format12Hour
} from "../utils/date-time.js";
import { listStudents } from "./student-service.js";

export const ATTENDANCE_STATUS = {
  PRESENT: "Present",
  LATE: "Late",
  ABSENT: "Absent"
};

/**
 * Calculates attendance percentage:
 * Formula: ((Present + Late) / Total) * 100
 * @param {number} present 
 * @param {number} late 
 * @param {number} total 
 * @returns {number} Rounded to 1 decimal place (e.g. 93.9)
 */
export function calcAttendancePercentage(present = 0, late = 0, total = 0) {
  const p = Number(present) || 0;
  const l = Number(late) || 0;
  const t = Number(total) || 0;
  if (t <= 0) return 0;
  const pct = ((p + l) / t) * 100;
  return Math.round(pct * 10) / 10;
}

/**
 * Normalizes class string representation (e.g., "Class 10" -> "10")
 * @param {string|number} cls
 * @returns {string}
 */
export function normalizeClass(cls) {
  if (!cls) return "";
  return String(cls).replace(/^class\s*/i, "").trim();
}

/**
 * Creates a new attendance session.
 * @param {Object} sessionData
 * @param {string} sessionData.branch - 'MAN', 'ALP', etc.
 * @param {string} sessionData.class - e.g. "10" or "Class 10"
 * @param {string} sessionData.date - "YYYY-MM-DD"
 * @param {string} sessionData.startTime - e.g. "09:00" or "09:00 AM"
 * @param {string} [sessionData.endTime] - e.g. "10:30"
 * @param {string} [sessionData.title] - e.g. "Mathematics", "Science"
 * @param {string} [sessionData.academicYear] - e.g. "2026-2027"
 * @param {string} [sessionData.createdBy] - Admin user UID
 * @returns {Promise<string>} Session ID
 */
export async function createAttendanceSession(sessionData) {
  const branch = String(sessionData.branch || "").trim().toUpperCase();
  const cls = normalizeClass(sessionData.class);
  const date = sessionData.date || getISTTodayIso();
  const startTime = String(sessionData.startTime || "").trim();

  if (!branch) throw new Error("Branch is required.");
  if (!cls) throw new Error("Class is required.");
  if (!date) throw new Error("Date is required.");
  if (!startTime) throw new Error("Session start time is required.");

  const now = getISTNowIsoTimestamp();
  const payload = {
    branch,
    class: cls,
    date,
    startTime,
    endTime: sessionData.endTime || "",
    title: sessionData.title || `Class ${cls}`,
    academicYear: sessionData.academicYear || getAcademicYear(date),
    createdBy: sessionData.createdBy || null,
    createdAt: now,
    updatedAt: now
  };

  return createRow(TABLES.ATTENDANCE_SESSIONS, payload);
}

/**
 * Updates an existing attendance session.
 * @param {string} id - Session ID
 * @param {Object} sessionData
 */
export async function updateAttendanceSession(id, sessionData) {
  if (!id) throw new Error("Session ID is required.");
  const updates = { ...sessionData };
  if (updates.class) updates.class = normalizeClass(updates.class);
  if (updates.branch) updates.branch = String(updates.branch).trim().toUpperCase();
  updates.updatedAt = getISTNowIsoTimestamp();

  return updateRowById(TABLES.ATTENDANCE_SESSIONS, id, updates);
}

/**
 * Deletes an attendance session and its corresponding attendance records.
 * @param {string} id - Session ID
 */
export async function deleteAttendanceSession(id) {
  if (!id) throw new Error("Session ID is required.");
  return deleteRowById(TABLES.ATTENDANCE_SESSIONS, id);
}

/**
 * Retrieves an attendance session by ID.
 * @param {string} id - Session ID
 * @returns {Promise<Object|null>}
 */
export async function getAttendanceSession(id) {
  if (!id) return null;
  return getRowById(TABLES.ATTENDANCE_SESSIONS, id);
}

/**
 * Lists attendance sessions with filters.
 * @param {Object} [filters]
 * @param {string} [filters.branch]
 * @param {string} [filters.class]
 * @param {string} [filters.date]
 * @param {string} [filters.startDate]
 * @param {string} [filters.endDate]
 * @param {string} [filters.academicYear]
 * @param {string} [filters.search]
 * @returns {Promise<Array<Object>>}
 */
export async function listAttendanceSessions(filters = {}) {
  let query = supabase
    .from(TABLES.ATTENDANCE_SESSIONS)
    .select("*")
    .order("date", { ascending: false })
    .order("start_time", { ascending: true });

  if (filters.branch) {
    query = query.eq("branch", String(filters.branch).trim().toUpperCase());
  }
  if (filters.class) {
    const rawCls = normalizeClass(filters.class);
    query = query.in("class", [rawCls, `Class ${rawCls}`]);
  }
  if (filters.date) {
    query = query.eq("date", filters.date);
  }
  if (filters.startDate) {
    query = query.gte("date", filters.startDate);
  }
  if (filters.endDate) {
    query = query.lte("date", filters.endDate);
  }
  if (filters.academicYear) {
    query = query.eq("academic_year", filters.academicYear);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Error listing attendance sessions:", error);
    return [];
  }

  let list = (data || []).map(toCamelCase);

  if (filters.search) {
    const s = filters.search.toLowerCase();
    list = list.filter((sess) =>
      (sess.title && sess.title.toLowerCase().includes(s)) ||
      (sess.class && sess.class.toLowerCase().includes(s))
    );
  }

  return list;
}

/**
 * Retrieves the full attendance roster for a session,
 * joining all active students for that class/branch and their existing status.
 * @param {string} sessionId
 * @returns {Promise<{ session: Object, roster: Array<Object>, summary: Object }>}
 */
export async function getSessionAttendance(sessionId) {
  if (!sessionId) throw new Error("Session ID is required.");

  const session = await getAttendanceSession(sessionId);
  if (!session) throw new Error("Attendance session not found.");

  // Fetch all students for the session's class and branch
  const students = await listStudents({
    branch: session.branch,
    class: session.class
  });

  // Fetch recorded attendance rows for this session
  const { data: recordRows, error } = await supabase
    .from(TABLES.ATTENDANCE_RECORDS)
    .select("*")
    .eq("session_id", sessionId);

  if (error) {
    console.error("Error fetching session attendance records:", error);
    throw new Error(error.message);
  }

  const recordMap = new Map();
  (recordRows || []).forEach((r) => {
    recordMap.set(r.student_id, toCamelCase(r));
  });

  // Merge student info with attendance record
  let presentCount = 0;
  let lateCount = 0;
  let absentCount = 0;

  const roster = students.map((st) => {
    const rec = recordMap.get(st.id);
    const status = rec ? rec.status : null; // null if unrecorded
    if (status === ATTENDANCE_STATUS.PRESENT) presentCount++;
    else if (status === ATTENDANCE_STATUS.LATE) lateCount++;
    else if (status === ATTENDANCE_STATUS.ABSENT) absentCount++;

    return {
      studentId: st.id,
      admissionNumber: st.admissionNumber,
      name: st.name,
      class: st.class,
      branch: st.branch,
      phone: st.phone,
      recordId: rec ? rec.id : null,
      status: status,
      remarks: rec ? (rec.remarks || "") : "",
      markedAt: rec ? rec.markedAt : null,
      markedBy: rec ? rec.markedBy : null
    };
  });

  // Sort roster alphabetically by student name
  roster.sort((a, b) => a.name.localeCompare(b.name));

  const totalMarked = presentCount + lateCount + absentCount;
  const attendanceRate = totalMarked > 0
    ? calcAttendancePercentage(presentCount, lateCount, totalMarked)
    : 0;

  return {
    session,
    roster,
    summary: {
      totalStudents: students.length,
      totalMarked,
      present: presentCount,
      late: lateCount,
      absent: absentCount,
      attended: presentCount + lateCount,
      attendanceRate
    }
  };
}

/**
 * Bulk marks or updates attendance for a session.
 * Uses database unique constraint UNIQUE(session_id, student_id) for safe upsert.
 * @param {string} sessionId
 * @param {Array<{ studentId: string, status: string, remarks?: string }>} records
 * @param {string} [markedBy] - UID of the admin user marking attendance
 * @returns {Promise<boolean>}
 */
export async function markAttendance(sessionId, records, markedBy = null) {
  if (!sessionId) throw new Error("Session ID is required.");
  if (!Array.isArray(records) || records.length === 0) {
    return true;
  }

  const validStatuses = new Set([
    ATTENDANCE_STATUS.PRESENT,
    ATTENDANCE_STATUS.LATE,
    ATTENDANCE_STATUS.ABSENT
  ]);

  const now = getISTNowIsoTimestamp();
  const dbRows = records
    .filter((r) => r.studentId && validStatuses.has(r.status))
    .map((r) => ({
      session_id: sessionId,
      student_id: r.studentId,
      status: r.status,
      remarks: String(r.remarks || "").trim(),
      marked_by: markedBy,
      marked_at: now,
      updated_at: now
    }));

  if (dbRows.length === 0) {
    throw new Error("No valid attendance records provided.");
  }

  // Supabase upsert on conflict (session_id, student_id)
  const { error } = await supabase
    .from(TABLES.ATTENDANCE_RECORDS)
    .upsert(dbRows, { onConflict: "session_id,student_id" });

  if (error) {
    console.error("Error saving attendance records:", error);
    throw new Error(`Failed to save attendance: ${error.message}`);
  }

  return true;
}

/**
 * Quick action to mark all given students as Present for a session.
 * @param {string} sessionId
 * @param {Array<string>} studentIds
 * @param {string} [markedBy]
 */
export async function markAllPresent(sessionId, studentIds, markedBy = null) {
  const records = studentIds.map((id) => ({
    studentId: id,
    status: ATTENDANCE_STATUS.PRESENT,
    remarks: ""
  }));
  return markAttendance(sessionId, records, markedBy);
}

/**
 * Quick action to mark all given students as Absent for a session.
 * @param {string} sessionId
 * @param {Array<string>} studentIds
 * @param {string} [markedBy]
 */
export async function markAllAbsent(sessionId, studentIds, markedBy = null) {
  const records = studentIds.map((id) => ({
    studentId: id,
    status: ATTENDANCE_STATUS.ABSENT,
    remarks: ""
  }));
  return markAttendance(sessionId, records, markedBy);
}

/**
 * Updates a single attendance record.
 * @param {string} recordId
 * @param {Object} updates - { status, remarks, markedBy }
 */
export async function updateAttendanceRecord(recordId, updates) {
  if (!recordId) throw new Error("Record ID is required.");
  const payload = {
    ...updates,
    updatedAt: getISTNowIsoTimestamp()
  };
  return updateRowById(TABLES.ATTENDANCE_RECORDS, recordId, payload);
}

/**
 * Retrieves all attendance records for a specific student,
 * joined with the corresponding session metadata.
 * @param {string} studentId
 * @param {Object} [filters]
 * @param {string} [filters.startDate]
 * @param {string} [filters.endDate]
 * @param {string} [filters.academicYear]
 * @returns {Promise<Array<Object>>}
 */
export async function getStudentAttendance(studentId, filters = {}) {
  if (!studentId) return [];

  let query = supabase
    .from(TABLES.ATTENDANCE_RECORDS)
    .select(`
      id,
      session_id,
      student_id,
      status,
      remarks,
      marked_at,
      updated_at,
      attendance_sessions (
        id,
        branch,
        class,
        date,
        start_time,
        end_time,
        title,
        academic_year
      )
    `)
    .eq("student_id", studentId)
    .order("marked_at", { ascending: false });

  const { data, error } = await query;
  if (error) {
    console.error("Error fetching student attendance:", error);
    return [];
  }

  let list = (data || []).map((row) => {
    const session = toCamelCase(row.attendance_sessions) || {};
    return {
      recordId: row.id,
      sessionId: row.session_id,
      studentId: row.student_id,
      status: row.status,
      remarks: row.remarks || "",
      markedAt: row.marked_at,
      date: session.date || "",
      startTime: session.startTime || "",
      endTime: session.endTime || "",
      formattedTime: session.startTime ? format12Hour(session.startTime) : "—",
      title: session.title || "Class Session",
      class: session.class || "",
      branch: session.branch || "",
      academicYear: session.academicYear || ""
    };
  });

  // Apply filters if passed
  if (filters.startDate) {
    list = list.filter((r) => r.date >= filters.startDate);
  }
  if (filters.endDate) {
    list = list.filter((r) => r.date <= filters.endDate);
  }
  if (filters.academicYear) {
    list = list.filter((r) => r.academicYear === filters.academicYear);
  }

  // Sort by session date descending, then startTime descending
  list.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return (b.startTime || "").localeCompare(a.startTime || "");
  });

  return list;
}

/**
 * Calculates a summary of attendance statistics for a single student.
 * @param {string} studentId
 * @param {Object} [dateRange]
 * @returns {Promise<{ totalSessions: number, present: number, late: number, absent: number, attended: number, percentage: number }>}
 */
export async function getStudentAttendanceSummary(studentId, dateRange = {}) {
  const records = await getStudentAttendance(studentId, dateRange);

  let present = 0;
  let late = 0;
  let absent = 0;

  records.forEach((r) => {
    if (r.status === ATTENDANCE_STATUS.PRESENT) present++;
    else if (r.status === ATTENDANCE_STATUS.LATE) late++;
    else if (r.status === ATTENDANCE_STATUS.ABSENT) absent++;
  });

  const totalSessions = records.length;
  const attended = present + late;
  const percentage = calcAttendancePercentage(present, late, totalSessions);

  return {
    totalSessions,
    present,
    late,
    absent,
    attended,
    percentage
  };
}

/**
 * Calculates attendance summary for a class & branch over an optional date range.
 * @param {string} classId
 * @param {string} branch
 * @param {Object} [dateRange]
 * @returns {Promise<{ totalSessions: number, totalSlots: number, present: number, late: number, absent: number, attendanceRate: number }>}
 */
export async function getClassAttendanceSummary(classId, branch, dateRange = {}) {
  const sessions = await listAttendanceSessions({
    class: classId,
    branch,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate
  });

  if (sessions.length === 0) {
    return {
      totalSessions: 0,
      totalSlots: 0,
      present: 0,
      late: 0,
      absent: 0,
      attendanceRate: 0
    };
  }

  const sessionIds = sessions.map((s) => s.id);
  const { data: records, error } = await supabase
    .from(TABLES.ATTENDANCE_RECORDS)
    .select("status")
    .in("session_id", sessionIds);

  if (error) {
    console.error("Error calculating class attendance summary:", error);
    return {
      totalSessions: sessions.length,
      totalSlots: 0,
      present: 0,
      late: 0,
      absent: 0,
      attendanceRate: 0
    };
  }

  let present = 0;
  let late = 0;
  let absent = 0;

  (records || []).forEach((r) => {
    if (r.status === ATTENDANCE_STATUS.PRESENT) present++;
    else if (r.status === ATTENDANCE_STATUS.LATE) late++;
    else if (r.status === ATTENDANCE_STATUS.ABSENT) absent++;
  });

  const totalSlots = (records || []).length;
  const attendanceRate = totalSlots > 0
    ? calcAttendancePercentage(present, late, totalSlots)
    : 0;

  return {
    totalSessions: sessions.length,
    totalSlots,
    present,
    late,
    absent,
    attended: present + late,
    attendanceRate
  };
}

/**
 * Gets today's attendance summary for a branch (used by admin dashboard).
 * @param {string} branch
 * @param {string} [todayIso]
 * @returns {Promise<{ sessionsCount: number, presentCount: number, lateCount: number, absentCount: number, attendanceRate: number }>}
 */
export async function getTodayAttendanceSummary(branch, todayIso = getISTTodayIso()) {
  const sessions = await listAttendanceSessions({
    branch,
    date: todayIso
  });

  if (!sessions || sessions.length === 0) {
    return {
      sessionsCount: 0,
      presentCount: 0,
      lateCount: 0,
      absentCount: 0,
      attendanceRate: 0
    };
  }

  const sessionIds = sessions.map((s) => s.id);
  const { data: records, error } = await supabase
    .from(TABLES.ATTENDANCE_RECORDS)
    .select("status")
    .in("session_id", sessionIds);

  if (error) {
    console.error("Error fetching today's attendance records:", error);
    return {
      sessionsCount: sessions.length,
      presentCount: 0,
      lateCount: 0,
      absentCount: 0,
      attendanceRate: 0
    };
  }

  let presentCount = 0;
  let lateCount = 0;
  let absentCount = 0;

  (records || []).forEach((r) => {
    if (r.status === ATTENDANCE_STATUS.PRESENT) presentCount++;
    else if (r.status === ATTENDANCE_STATUS.LATE) lateCount++;
    else if (r.status === ATTENDANCE_STATUS.ABSENT) absentCount++;
  });

  const total = presentCount + lateCount + absentCount;
  const attendanceRate = total > 0
    ? calcAttendancePercentage(presentCount, lateCount, total)
    : 0;

  return {
    sessionsCount: sessions.length,
    presentCount,
    lateCount,
    absentCount,
    attendanceRate
  };
}
