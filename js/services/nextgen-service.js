// ==========================================================================
// NEXTGEN SERVICE — SUPABASE
// Handles NEXTGEN Online Student-Development Sessions & Attendance Check-In,
// Atomic Single-Live Session Lifecycle, Verification, and Protected CSV Export.
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
  formatISTTimestamp,
  formatLogDate
} from "../utils/date-time.js";
import { sanitizeCsvValue, toCSV, downloadCSV } from "./report-service.js";
export { sanitizeCsvValue };

export const NEXTGEN_STATUS = {
  SCHEDULED: "scheduled",
  LIVE: "live",
  FINISHED: "finished"
};

export const ALLOWED_CLASSES = [8, 9, 10, 11, 12];

/**
 * Validates Google Meet URL.
 * Accepts official Google Meet links: e.g. https://meet.google.com/abc-defg-hij
 * Also tolerates http:// or bare meet.google.com/
 * @param {string} url
 * @returns {boolean}
 */
export function isValidGoogleMeetUrl(url) {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  const pattern = /^(https?:\/\/)?meet\.google\.com\/[a-zA-Z0-9_\-]+(\?.*)?$/;
  return pattern.test(trimmed);
}

/**
 * Normalizes and validates Indian 10-digit mobile numbers.
 * Validates leading digit 6, 7, 8, or 9.
 * Handles numbers with or without +91 / 91 / 0 prefix.
 * Returns normalized string "+91XXXXXXXXXX" or null if invalid.
 * If strict is true, throws an Error on invalid input.
 * @param {string|number} phone
 * @param {boolean} [strict=false]
 * @returns {string|null}
 */
export function normalizeIndianPhone(phone, strict = false) {
  if (!phone) {
    if (strict) throw new Error("Phone number is required.");
    return null;
  }
  let digits = String(phone).replace(/\D/g, "");

  if (digits.length === 12 && digits.startsWith("91")) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
    return `+91${digits}`;
  }
  if (strict) {
    if (digits.length !== 10) throw new Error("Phone number must be exactly 10 digits.");
    throw new Error("Please enter a valid Indian mobile number starting with 6, 7, 8, or 9.");
  }
  return null;
}

/**
 * Validates student check-in form input.
 * @param {Object} data
 * @param {Object} [options]
 * @param {boolean} [options.throwOnError=false]
 * @returns {{ valid: boolean, errors: string[], studentName: string, classLevel: number, schoolName: string, phone: string }}
 */
export function validateCheckInInput(data = {}, options = {}) {
  const errors = [];

  const name = String(data.studentName || data.student_name || "").trim();
  if (name.length < 2) {
    errors.push("Please enter your full student name (at least 2 characters).");
  }

  const cls = Number(data.classLevel || data.class_level);
  if (!ALLOWED_CLASSES.includes(cls)) {
    errors.push(`Please select a valid class (${ALLOWED_CLASSES.join(", ")}).`);
  }

  const school = String(data.schoolName || data.school_name || "").trim();
  if (school.length < 2) {
    errors.push("Please enter your school name (at least 2 characters).");
  }

  const normalizedPhone = normalizeIndianPhone(data.phone);
  if (!normalizedPhone) {
    errors.push("Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.");
  }

  if (errors.length > 0 && options.throwOnError) {
    throw new Error(errors.join(" "));
  }

  return {
    valid: errors.length === 0,
    errors,
    studentName: name,
    student_name: name,
    classLevel: cls,
    class_level: cls,
    schoolName: school,
    school_name: school,
    phone: normalizedPhone,
    phone_normalized: normalizedPhone
  };
}

/**
 * Validates administrator session creation/edit input.
 * @param {Object} data
 * @param {Object} [options]
 * @param {boolean} [options.throwOnError=false]
 * @returns {{ valid: boolean, errors: string[], title: string, facilitatorName: string, scheduledAt: string, meetUrl: string }}
 */
export function validateSessionInput(data = {}, options = {}) {
  const errors = [];

  const title = String(data.title || "").trim();
  if (title.length < 3) {
    errors.push("Session title is required (at least 3 characters).");
  }

  const facilitator = String(data.facilitatorName || data.facilitator_name || "").trim();
  if (facilitator.length < 2) {
    errors.push("Facilitator name is required.");
  }

  const scheduledAt = data.scheduledAt || data.scheduled_at;
  if (!scheduledAt) {
    errors.push("Session scheduled date and time is required.");
  }

  const meetUrl = String(data.meetUrl || data.meet_url || "").trim();
  if (!isValidGoogleMeetUrl(meetUrl)) {
    errors.push("Please enter a valid Google Meet link (e.g. https://meet.google.com/abc-defg-hij).");
  }

  if (errors.length > 0 && options.throwOnError) {
    throw new Error(errors.join(" "));
  }

  return {
    valid: errors.length === 0,
    errors,
    title,
    facilitatorName: facilitator,
    facilitator_name: facilitator,
    scheduledAt,
    scheduled_at: scheduledAt,
    meetUrl,
    meet_url: meetUrl
  };
}

// ==========================================================================
// PUBLIC ATTENDANCE CHECK-IN APIS
// ==========================================================================

/**
 * Retrieves the currently live NEXTGEN session safe info for public check-in.
 * Deliberately excludes the meet_url so it cannot be scraped prior to check-in.
 * @returns {Promise<Object|null>}
 */
export async function getLiveSessionInfo() {
  try {
    // Attempt RPC first (Security Definer with strictly safe fields)
    const { data, error } = await supabase.rpc("get_live_nextgen_session");
    if (!error && data && data.length > 0) {
      return toCamelCase(data[0]);
    }

    // Fallback query for live session
    const { data: rows, error: qErr } = await supabase
      .from(TABLES.NEXTGEN_SESSIONS)
      .select("id, title, facilitator_name, scheduled_at, status")
      .eq("status", NEXTGEN_STATUS.LIVE)
      .limit(1);

    if (qErr) {
      console.warn("Could not query live session:", qErr);
      return null;
    }

    if (rows && rows.length > 0) {
      return toCamelCase(rows[0]);
    }
    return null;
  } catch (err) {
    console.error("Error fetching live NEXTGEN session:", err);
    return null;
  }
}

/**
 * Submits student check-in.
 * Atomically verifies session is live, inserts attendee record, and returns Google Meet URL.
 * @param {Object} formData { studentName, classLevel, schoolName, phone }
 * @returns {Promise<{ success: boolean, meetUrl: string, sessionTitle: string, attendeeId?: string }>}
 */
export async function submitCheckIn(formData) {
  const validation = validateCheckInInput(formData);
  if (!validation.valid) {
    throw new Error(validation.errors[0]);
  }

  const cleanName = validation.studentName;
  const cleanSchool = validation.schoolName;
  const normPhone = validation.phone;
  const clsNum = validation.classLevel;

  // 1. Try atomic database RPC
  try {
    const { data: rpcRes, error: rpcErr } = await supabase.rpc("check_in_nextgen_attendee", {
      p_student_name: cleanName,
      p_class_level: clsNum,
      p_school_name: cleanSchool,
      p_phone: normPhone
    });

    if (!rpcErr && rpcRes && (rpcRes.success || rpcRes.meet_url)) {
      return {
        success: true,
        meetUrl: rpcRes.meet_url,
        sessionTitle: rpcRes.session_title,
        attendeeId: rpcRes.attendee_id
      };
    }

    if (rpcErr && rpcErr.message) {
      // If error specifically says no live session, propagate friendly message
      if (rpcErr.message.includes("no live NEXTGEN session")) {
        throw new Error("There is currently no live NEXTGEN session. Check-in is closed.");
      }
      throw new Error(rpcErr.message);
    }
  } catch (err) {
    // If RPC doesn't exist yet on backend, execute client-side transaction fallback
    if (err.message && !err.message.includes("function") && !err.message.includes("not found")) {
      throw err;
    }
  }

  // 2. Direct Fallback Flow (validates live session, inserts attendee, returns meet_url)
  const { data: liveSessions, error: liveErr } = await supabase
    .from(TABLES.NEXTGEN_SESSIONS)
    .select("id, title, meet_url, status")
    .eq("status", NEXTGEN_STATUS.LIVE)
    .limit(1);

  if (liveErr || !liveSessions || liveSessions.length === 0) {
    throw new Error("There is currently no live NEXTGEN session. Check-in is closed.");
  }

  const liveSession = liveSessions[0];
  const payload = {
    session_id: liveSession.id,
    student_name: cleanName,
    class_level: clsNum,
    school_name: cleanSchool,
    phone: phone,
    phone_normalized: normPhone,
    submitted_at: getISTNowIsoTimestamp()
  };

  const { data: inserted, error: insErr } = await supabase
    .from(TABLES.NEXTGEN_ATTENDEES)
    .insert([payload])
    .select()
    .single();

  if (insErr) {
    // If duplicate check-in (same student + phone for same session), allow access to meet link
    if (insErr.code === "23505" || insErr.message?.includes("duplicate key")) {
      return {
        success: true,
        meetUrl: liveSession.meet_url,
        sessionTitle: liveSession.title,
        message: "Welcome back! Your attendance was already recorded."
      };
    }
    throw new Error(insErr.message || "Failed to record check-in.");
  }

  return {
    success: true,
    meetUrl: liveSession.meet_url,
    sessionTitle: liveSession.title,
    attendeeId: inserted?.id
  };
}

// ==========================================================================
// ADMINISTRATOR SESSION & ATTENDEE MANAGEMENT
// ==========================================================================

/**
 * Lists NEXTGEN sessions with attendee counts.
 * @param {Object} [filters]
 * @param {string} [filters.status]
 * @param {string} [filters.search]
 * @returns {Promise<Array>}
 */
export async function listNextgenSessions(filters = {}) {
  let query = supabase
    .from(TABLES.NEXTGEN_SESSIONS)
    .select(`
      id,
      title,
      facilitator_name,
      scheduled_at,
      meet_url,
      status,
      created_by,
      live_at,
      finished_at,
      created_at,
      updated_at,
      nextgen_attendees (count)
    `)
    .order("scheduled_at", { ascending: false });

  if (filters.status && filters.status !== "ALL") {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Error listing NEXTGEN sessions:", error);
    // Fallback to plain query if relation count fails
    const { data: simpleData, error: sErr } = await supabase
      .from(TABLES.NEXTGEN_SESSIONS)
      .select("*")
      .order("scheduled_at", { ascending: false });

    if (sErr) return [];
    return (simpleData || []).map(row => {
      const item = toCamelCase(row);
      item.attendeeCount = 0;
      return item;
    });
  }

  let list = (data || []).map(row => {
    const item = toCamelCase(row);
    // Extract attendee count from Supabase count aggregate
    const countArr = row.nextgen_attendees;
    item.attendeeCount = (countArr && countArr[0]?.count) ? countArr[0].count : 0;
    return item;
  });

  if (filters.search && String(filters.search).trim()) {
    const q = String(filters.search).trim().toLowerCase();
    list = list.filter(s =>
      (s.title || "").toLowerCase().includes(q) ||
      (s.facilitatorName || "").toLowerCase().includes(q)
    );
  }

  return list;
}

/**
 * Creates a new NEXTGEN session in 'scheduled' status.
 * @param {Object} sessionData
 * @returns {Promise<Object>} Created session object
 */
export async function createNextgenSession(sessionData) {
  const validation = validateSessionInput(sessionData);
  if (!validation.valid) {
    throw new Error(validation.errors.join(" "));
  }

  // Ensure meet_url has standard https:// format required by PostgreSQL check constraint
  let cleanMeetUrl = (sessionData.meetUrl || sessionData.meet_url || "").trim();
  if (!/^https?:\/\//i.test(cleanMeetUrl)) {
    cleanMeetUrl = `https://${cleanMeetUrl}`;
  } else if (/^http:\/\//i.test(cleanMeetUrl)) {
    cleanMeetUrl = cleanMeetUrl.replace(/^http:\/\//i, "https://");
  }

  const payload = {
    title: (sessionData.title || "").trim(),
    facilitatorName: (sessionData.facilitatorName || sessionData.facilitator_name || "").trim(),
    scheduledAt: sessionData.scheduledAt || sessionData.scheduled_at,
    meetUrl: cleanMeetUrl,
    status: sessionData.status || NEXTGEN_STATUS.SCHEDULED
  };

  // Only pass createdBy if it's a valid UUID
  const rawCreatedBy = sessionData.createdBy || sessionData.created_by;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (rawCreatedBy && uuidRegex.test(String(rawCreatedBy).trim())) {
    payload.createdBy = String(rawCreatedBy).trim();
  }

  // 1. Try atomic database RPC first (bypasses RLS issues)
  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc("create_nextgen_session", {
      p_title: payload.title,
      p_facilitator_name: payload.facilitatorName,
      p_scheduled_at: payload.scheduledAt,
      p_meet_url: payload.meetUrl
    });

    if (!rpcErr && rpcData) {
      const res = toCamelCase(rpcData);
      res.facilitator_name = res.facilitatorName;
      res.scheduled_at = res.scheduledAt;
      res.meet_url = res.meetUrl;
      res.attendee_count = 0;
      return res;
    }
  } catch (_e) {
    // Fall back to direct insert if RPC not present in DB
  }

  // 2. Direct table insert fallback
  try {
    const id = await createRow(TABLES.NEXTGEN_SESSIONS, payload);
    if (id) {
      const session = await getNextgenSession(id);
      if (session) return session;
    }
    return {
      id: id || "session-" + Date.now(),
      ...payload,
      attendee_count: 0
    };
  } catch (err) {
    // If foreign key constraint on created_by failed, retry without created_by
    if (payload.createdBy && (err.message?.includes("foreign key") || err.message?.includes("created_by") || err.message?.includes("23503"))) {
      delete payload.createdBy;
      const id = await createRow(TABLES.NEXTGEN_SESSIONS, payload);
      if (id) {
        const session = await getNextgenSession(id);
        if (session) return session;
      }
      return {
        id: id || "session-" + Date.now(),
        ...payload,
        attendee_count: 0
      };
    }
    throw err;
  }
}

/**
 * Updates an existing NEXTGEN session details.
 * @param {string} id
 * @param {Object} updates
 * @returns {Promise<Object>}
 */
export async function updateNextgenSession(id, updates) {
  if (!id) throw new Error("Session ID is required.");

  const payload = {};
  if (updates.title !== undefined) payload.title = updates.title.trim();
  if (updates.facilitatorName !== undefined || updates.facilitator_name !== undefined) {
    payload.facilitatorName = (updates.facilitatorName || updates.facilitator_name).trim();
  }
  if (updates.scheduledAt !== undefined || updates.scheduled_at !== undefined) {
    payload.scheduledAt = updates.scheduledAt || updates.scheduled_at;
  }
  if (updates.meetUrl !== undefined || updates.meet_url !== undefined) {
    let url = (updates.meetUrl || updates.meet_url).trim();
    if (!isValidGoogleMeetUrl(url)) {
      throw new Error("Please enter a valid Google Meet link.");
    }
    if (!/^https?:\/\//i.test(url)) {
      url = `https://${url}`;
    } else if (/^http:\/\//i.test(url)) {
      url = url.replace(/^http:\/\//i, "https://");
    }
    payload.meetUrl = url;
  }
  if (updates.status !== undefined) payload.status = updates.status;

  await updateRowById(TABLES.NEXTGEN_SESSIONS, id, payload);
  return await getNextgenSession(id);
}

/**
 * Sets a session LIVE atomically.
 * Enforces single-live session rule: rejects if another session is already live.
 * @param {string} sessionId
 * @returns {Promise<Object>} Updated session object
 */
export async function activateNextgenSession(sessionId) {
  if (!sessionId) throw new Error("Session ID is required.");

  // 1. Try atomic PostgreSQL RPC with advisory lock
  try {
    const { data, error } = await supabase.rpc("activate_nextgen_session", {
      p_session_id: sessionId
    });

    if (!error && (data?.success || data?.id || data?.status === NEXTGEN_STATUS.LIVE)) {
      return await getNextgenSession(sessionId);
    }
    if (error && error.message) {
      throw new Error(error.message);
    }
  } catch (err) {
    if (err.message && !err.message.includes("function") && !err.message.includes("not found")) {
      throw err;
    }
  }

  // 2. Client-side fallback with active session check
  const { data: existingLive, error: checkErr } = await supabase
    .from(TABLES.NEXTGEN_SESSIONS)
    .select("id, title")
    .eq("status", NEXTGEN_STATUS.LIVE);

  if (checkErr) throw new Error("Failed to verify active sessions.");

  const otherLive = (existingLive || []).find(s => s.id !== sessionId);
  if (otherLive) {
    throw new Error(`Another session is already live: "${otherLive.title}". Please finish it first before activating this session.`);
  }

  const payload = {
    status: NEXTGEN_STATUS.LIVE,
    live_at: getISTNowIsoTimestamp(),
    updated_at: getISTNowIsoTimestamp()
  };

  const { error: updErr } = await supabase
    .from(TABLES.NEXTGEN_SESSIONS)
    .update(payload)
    .eq("id", sessionId);

  if (updErr) {
    // Handle database partial unique index rejection
    if (updErr.code === "23505" || updErr.message?.includes("idx_nextgen_single_live")) {
      throw new Error("Another session is already live. Only one live session is permitted.");
    }
    throw new Error(updErr.message || "Failed to activate session.");
  }

  return await getNextgenSession(sessionId);
}

/**
 * Finishes a live NEXTGEN session.
 * @param {string} sessionId
 * @returns {Promise<Object>} Updated session object
 */
export async function finishNextgenSession(sessionId) {
  if (!sessionId) throw new Error("Session ID is required.");

  try {
    const { data, error } = await supabase.rpc("finish_nextgen_session", {
      p_session_id: sessionId
    });

    if (!error && (data?.success || data?.id || data?.status === NEXTGEN_STATUS.FINISHED)) {
      return await getNextgenSession(sessionId);
    }
    if (error && error.message) {
      throw new Error(error.message);
    }
  } catch (err) {
    if (err.message && !err.message.includes("function") && !err.message.includes("not found")) {
      throw err;
    }
  }

  const payload = {
    status: NEXTGEN_STATUS.FINISHED,
    finished_at: getISTNowIsoTimestamp(),
    updated_at: getISTNowIsoTimestamp()
  };

  const { error } = await supabase
    .from(TABLES.NEXTGEN_SESSIONS)
    .update(payload)
    .eq("id", sessionId);

  if (error) throw new Error(error.message || "Failed to finish session.");

  return await getNextgenSession(sessionId);
}

/**
 * Deletes a session if it has NO attendance records.
 * Prevents accidental loss of historical check-in records.
 * @param {string} sessionId
 * @returns {Promise<boolean>}
 */
export async function deleteNextgenSession(sessionId) {
  if (!sessionId) throw new Error("Session ID is required.");

  // Check attendee count first
  const { count, error: countErr } = await supabase
    .from(TABLES.NEXTGEN_ATTENDEES)
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId);

  if (countErr) throw new Error("Failed to verify session attendees.");

  if (count > 0) {
    throw new Error(`Cannot delete this session because it contains ${count} recorded attendees / check-in records. Finished sessions must be preserved for historical records.`);
  }

  await deleteRowById(TABLES.NEXTGEN_SESSIONS, sessionId);
  return true;
}

/**
 * Retrieves a single session by ID.
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function getNextgenSession(id) {
  if (!id) return null;
  const res = await getRowById(TABLES.NEXTGEN_SESSIONS, id);
  if (!res) return null;
  res.facilitator_name = res.facilitatorName;
  res.scheduled_at = res.scheduledAt;
  res.meet_url = res.meetUrl;
  return res;
}

/**
 * Lists attendees for a specific NEXTGEN session.
 * @param {string} sessionId
 * @param {Object} [filters]
 * @param {string|number} [filters.classLevel]
 * @param {string} [filters.search]
 * @returns {Promise<Array>}
 */
export async function listSessionAttendees(sessionId, filters = {}) {
  if (!sessionId) return [];

  let query = supabase
    .from(TABLES.NEXTGEN_ATTENDEES)
    .select("*")
    .eq("session_id", sessionId)
    .order("submitted_at", { ascending: false });

  if (filters.classLevel && filters.classLevel !== "ALL") {
    query = query.eq("class_level", Number(filters.classLevel));
  }

  const { data, error } = await query;
  if (error) {
    console.error("Error listing session attendees:", error);
    return [];
  }

  let list = (data || []).map(row => {
    const item = toCamelCase(row);
    item.student_name = item.studentName;
    item.class_level = item.classLevel;
    item.school_name = item.schoolName;
    item.phone_normalized = item.phoneNormalized;
    item.submitted_at = item.submittedAt;
    return item;
  });

  if (filters.search && String(filters.search).trim()) {
    const q = String(filters.search).trim().toLowerCase();
    list = list.filter(a =>
      (a.studentName || "").toLowerCase().includes(q) ||
      (a.phone || "").includes(q) ||
      (a.schoolName || "").toLowerCase().includes(q)
    );
  }

  return list;
}

/**
 * Exports attendees of a specific session to a CSV file.
 * Formula-injection protected using sanitizeCsvValue().
 * @param {Object} session
 * @param {Array} attendees
 */
export function exportSessionAttendeesToCSV(session, attendees = []) {
  if (!session) {
    throw new Error("Session information is required for export.");
  }

  const columns = [
    { label: "Session Name", key: "sessionTitle" },
    { label: "Facilitator", key: "facilitatorName" },
    { label: "Session Date", key: "sessionDate" },
    { label: "Student Name", key: "studentName" },
    { label: "Class", key: "classLevel" },
    { label: "School Name", key: "schoolName" },
    { label: "Phone Number", key: "phone" },
    { label: "Submitted At", key: "submittedAtFormatted" }
  ];

  const sessionDateFormatted = session.scheduledAt ? formatLogDate(session.scheduledAt) : "—";

  const rows = attendees.map(a => ({
    sessionTitle: session.title || "NEXTGEN Session",
    facilitatorName: session.facilitatorName || "SUCCESS ACADEMY",
    sessionDate: sessionDateFormatted,
    studentName: a.studentName || "",
    classLevel: a.classLevel ? `Class ${a.classLevel}` : "",
    schoolName: a.schoolName || "",
    phone: a.phone || a.phoneNormalized || "",
    submittedAtFormatted: a.submittedAt ? formatISTTimestamp(a.submittedAt) : ""
  }));

  const csvContent = toCSV(rows, columns);

  // Filename format: NEXTGEN_<Session_Title>_Attendees_<YYYY-MM-DD>.csv
  const safeTitle = (session.title || "Session")
    .replace(/[^a-zA-Z0-9_\-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 30);
  const dateStr = getISTTodayIso();
  const filename = `NEXTGEN_${safeTitle}_Attendees_${dateStr}.csv`;

  downloadCSV(filename, csvContent);
  return rows.length;
}

/**
 * Calculates overview statistics for NEXTGEN admin dashboard from actual DB records.
 * @returns {Promise<{ totalSessions: number, totalCheckIns: number, totalAttendees: number, liveSession: Object|null, scheduledCount: number, finishedCount: number, finishedSessions: number }>}
 */
export async function getNextgenDashboardStats() {
  const [sessionsRes, attendeesRes] = await Promise.all([
    supabase.from(TABLES.NEXTGEN_SESSIONS).select("id, title, facilitator_name, scheduled_at, status, meet_url"),
    supabase.from(TABLES.NEXTGEN_ATTENDEES).select("id", { count: "exact", head: true })
  ]);

  const sessions = sessionsRes.data || [];
  const totalCheckIns = attendeesRes.count || 0;

  const liveSession = sessions.find(s => s.status === NEXTGEN_STATUS.LIVE);
  const scheduledCount = sessions.filter(s => s.status === NEXTGEN_STATUS.SCHEDULED).length;
  const finishedCount = sessions.filter(s => s.status === NEXTGEN_STATUS.FINISHED).length;

  return {
    totalSessions: sessions.length,
    totalCheckIns,
    totalAttendees: totalCheckIns,
    liveSession: liveSession ? toCamelCase(liveSession) : null,
    scheduledCount,
    scheduledSessions: scheduledCount,
    finishedCount,
    finishedSessions: finishedCount
  };
}
