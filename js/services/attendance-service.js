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
import { listStudents, getStudent } from "./student-service.js";
import { buildAttendanceReportRows } from "./report-service.js";

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
  return String(cls).trim().replace(/^class\s*/i, "").trim();
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
  const endTime = String(sessionData.endTime || "").trim();

  if (!branch) throw new Error("Branch is required.");
  if (!cls) throw new Error("Class is required.");
  if (!date) throw new Error("Date is required.");
  if (!startTime) throw new Error("Session start time is required.");

  if (endTime && endTime <= startTime) {
    throw new Error("End time must be after start time.");
  }

  const now = getISTNowIsoTimestamp();
  const payload = {
    branch,
    class: cls,
    date,
    startTime,
    endTime: endTime || "",
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

  const existing = await getAttendanceSession(id);
  if (!existing) {
    throw new Error(`Attendance session "${id}" not found.`);
  }

  const newClass = sessionData.class !== undefined ? normalizeClass(sessionData.class) : normalizeClass(existing.class);
  const newBranch = sessionData.branch !== undefined ? String(sessionData.branch).trim().toUpperCase() : String(existing.branch).trim().toUpperCase();

  const classChanged = newClass !== normalizeClass(existing.class);
  const branchChanged = newBranch !== String(existing.branch).trim().toUpperCase();

  // Block changing class or branch when records already exist
  if (classChanged || branchChanged) {
    const { count, error } = await supabase
      .from(TABLES.ATTENDANCE_RECORDS)
      .select("id", { count: "exact", head: true })
      .eq("session_id", id);

    if (error) {
      console.warn("Could not check existing records:", error);
    } else if (count && count > 0) {
      throw new Error("Cannot change class or branch of an attendance session that already has attendance records.");
    }
  }

  const startTime = sessionData.startTime !== undefined ? String(sessionData.startTime).trim() : existing.startTime;
  const endTime = sessionData.endTime !== undefined ? String(sessionData.endTime).trim() : existing.endTime;

  if (endTime && startTime && endTime <= startTime) {
    throw new Error("End time must be after start time.");
  }

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

  if (filters.branch && filters.branch !== "ALL") {
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
  roster.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

  const totalMarked = presentCount + lateCount + absentCount;
  const attendanceRate = students.length > 0
    ? calcAttendancePercentage(presentCount, lateCount, students.length)
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

  const session = await getAttendanceSession(sessionId);
  if (!session) {
    throw new Error(`Attendance session "${sessionId}" not found.`);
  }

  const validStatuses = new Set([
    ATTENDANCE_STATUS.PRESENT,
    ATTENDANCE_STATUS.LATE,
    ATTENDANCE_STATUS.ABSENT
  ]);

  const candidateRecords = records.filter((r) => r.studentId && validStatuses.has(r.status));
  if (candidateRecords.length === 0) {
    throw new Error("No valid attendance records provided.");
  }

  // Verify that every student belongs to the session's branch and class
  const studentIds = candidateRecords.map((r) => r.studentId);
  const sessionClassNorm = normalizeClass(session.class);
  const sessionBranchNorm = String(session.branch).trim().toUpperCase();

  const { data: dbStudents, error: stdErr } = await supabase
    .from(TABLES.STUDENTS)
    .select("id, name, class, branch, admission_number")
    .in("id", studentIds);

  if (stdErr) {
    throw new Error(`Failed to verify student roster: ${stdErr.message}`);
  }

  const studentMap = new Map((dbStudents || []).map((s) => [s.id, s]));
  const invalidStudents = [];

  for (const sId of studentIds) {
    const s = studentMap.get(sId);
    if (!s) {
      invalidStudents.push(`ID ${sId} (student not found)`);
    } else {
      const sClassNorm = normalizeClass(s.class);
      const sBranchNorm = String(s.branch).trim().toUpperCase();
      if (sClassNorm !== sessionClassNorm || sBranchNorm !== sessionBranchNorm) {
        invalidStudents.push(
          `${s.name || "Student"} [${s.admission_number || sId}] is in Class ${sClassNorm} (${sBranchNorm})`
        );
      }
    }
  }

  if (invalidStudents.length > 0) {
    throw new Error(
      `Cannot mark attendance: one or more students do not belong to Class ${sessionClassNorm} (${sessionBranchNorm}): ${invalidStudents.join("; ")}`
    );
  }

  const now = getISTNowIsoTimestamp();
  const dbRows = candidateRecords.map((r) => ({
    session_id: sessionId,
    student_id: r.studentId,
    status: r.status,
    remarks: String(r.remarks || "").trim(),
    marked_by: markedBy,
    marked_at: now,
    updated_at: now
  }));

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
  const student = await getStudent(studentId);
  if (!student) throw new Error("Student not found.");

  // Count total sessions held for this student's class and branch in the date range
  const sessions = await listAttendanceSessions({
    class: student.class,
    branch: student.branch,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate
  });
  const totalSessions = sessions.length;

  const records = await getStudentAttendance(studentId, dateRange);

  let present = 0;
  let late = 0;
  let absent = 0;

  records.forEach((r) => {
    if (r.status === ATTENDANCE_STATUS.PRESENT) present++;
    else if (r.status === ATTENDANCE_STATUS.LATE) late++;
    else if (r.status === ATTENDANCE_STATUS.ABSENT) absent++;
  });

  const marked = present + late + absent;
  const unmarked = Math.max(0, totalSessions - marked);
  const attended = present + late;
  const percentage = totalSessions > 0 ? calcAttendancePercentage(present, late, totalSessions) : 0;

  return {
    totalSessions,
    present,
    late,
    absent,
    unmarked,
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
  const branchFilter = (!branch || branch === "ALL") ? null : branch;

  // Try server-side aggregation RPC
  try {
    const { data, error } = await supabase.rpc("get_attendance_summary", {
      p_branch: branchFilter,
      p_class: classId || null,
      p_start_date: dateRange.startDate || null,
      p_end_date: dateRange.endDate || null
    });
    if (!error && data && data.length > 0) {
      const row = data[0];
      return {
        totalSessions: Number(row.sessions_count || 0),
        totalSlots: Number(row.total_records || 0),
        present: Number(row.present_count || 0),
        late: Number(row.late_count || 0),
        absent: Number(row.absent_count || 0),
        attended: Number(row.attended_count || 0),
        attendanceRate: Number(row.attendance_rate || 0)
      };
    }
  } catch (e) {
    console.warn("RPC get_attendance_summary fallback for class summary:", e);
  }

  const sessions = await listAttendanceSessions({
    class: classId,
    branch: branchFilter,
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
  const branchFilter = (!branch || branch === "ALL") ? null : branch;

  // Try server-side aggregation RPC
  try {
    const { data, error } = await supabase.rpc("get_attendance_summary", {
      p_branch: branchFilter,
      p_class: null,
      p_start_date: todayIso,
      p_end_date: todayIso
    });
    if (!error && data && data.length > 0) {
      const row = data[0];
      return {
        sessionsCount: Number(row.sessions_count || 0),
        presentCount: Number(row.present_count || 0),
        lateCount: Number(row.late_count || 0),
        absentCount: Number(row.absent_count || 0),
        attendanceRate: Number(row.attendance_rate || 0)
      };
    }
  } catch (e) {
    console.warn("RPC get_attendance_summary fallback for today summary:", e);
  }

  const sessions = await listAttendanceSessions({
    branch: branchFilter,
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

/**
 * Fetches attendance report data for admin reporting.
 * @param {Object} [filters]
 * @param {string} [filters.branch]
 * @param {string} [filters.class]
 * @param {string} [filters.startDate]
 * @param {string} [filters.endDate]
 * @returns {Promise<{ rows: Array<Object>, totalSessions: number, totalStudents: number }>}
 */
export async function getAttendanceReport(filters = {}) {
  const branchFilter = (!filters.branch || filters.branch === "ALL") ? null : filters.branch;
  const classFilter = filters.class || null;

  // 1. Fetch students for branch & class
  const studentFilters = {};
  if (branchFilter) studentFilters.branch = branchFilter;
  if (classFilter) studentFilters.class = classFilter;
  const students = await listStudents(studentFilters);

  if (!students || students.length === 0) {
    return { rows: [], totalSessions: 0, totalStudents: 0 };
  }

  // 2. Fetch sessions in the date range
  const sessionFilters = {};
  if (branchFilter) sessionFilters.branch = branchFilter;
  if (classFilter) sessionFilters.class = classFilter;
  if (filters.startDate) sessionFilters.startDate = filters.startDate;
  if (filters.endDate) sessionFilters.endDate = filters.endDate;

  const sessions = await listAttendanceSessions(sessionFilters);

  if (!sessions || sessions.length === 0) {
    const rows = buildAttendanceReportRows(students, {}, 0);
    return { rows, totalSessions: 0, totalStudents: students.length };
  }

  // 3. Count sessions by class
  const totalSessionsMap = {};
  sessions.forEach((s) => {
    const c = normalizeClass(s.class);
    totalSessionsMap[c] = (totalSessionsMap[c] || 0) + 1;
  });

  // 4. Fetch attendance records for these sessions
  const sessionIds = sessions.map((s) => s.id);
  const attendanceByStudentId = {};

  for (let i = 0; i < sessionIds.length; i += 200) {
    const chunk = sessionIds.slice(i, i + 200);
    const { data: records, error } = await supabase
      .from(TABLES.ATTENDANCE_RECORDS)
      .select("id, session_id, student_id, status, remarks")
      .in("session_id", chunk);

    if (error) {
      console.error("Error fetching attendance records for report:", error);
    } else if (records) {
      records.forEach((r) => {
        if (!attendanceByStudentId[r.student_id]) {
          attendanceByStudentId[r.student_id] = [];
        }
        attendanceByStudentId[r.student_id].push({
          id: r.id,
          sessionId: r.session_id,
          status: r.status,
          remarks: r.remarks
        });
      });
    }
  }

  const rows = buildAttendanceReportRows(
    students,
    attendanceByStudentId,
    classFilter ? sessions.length : totalSessionsMap
  );

  return {
    rows,
    totalSessions: sessions.length,
    totalStudents: students.length
  };
}
