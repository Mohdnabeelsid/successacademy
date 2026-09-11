// ==========================================================================
// DATE & TIME UTILITIES — INDIAN STANDARD TIME (IST / GMT+5:30)
// Ensures all dates, times, streaks, calendars, and ranges throughout
// the portal strictly follow Indian Standard Time (Asia/Kolkata).
// ==========================================================================

export const IST_TIMEZONE = "Asia/Kolkata";
export const IST_LOCALE = "en-IN";

export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday"
];

/**
 * Returns an ISO date string "YYYY-MM-DD" representing the given Date in IST (Asia/Kolkata).
 * If no date is passed, returns today's date in IST.
 * @param {Date|string|number} [date=new Date()]
 * @returns {string} e.g. "2026-09-02"
 */
export function getISTDateString(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return "";
  
  // Intl format with "en-CA" produces "YYYY-MM-DD" format in the specified timeZone
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(d);
}

/**
 * Returns today's ISO date string "YYYY-MM-DD" in Indian Standard Time.
 * @returns {string} e.g. "2026-09-02"
 */
export function getISTTodayIso() {
  return getISTDateString(new Date());
}

/**
 * Returns a full ISO 8601 timestamp string in IST with offset (+05:30).
 * e.g. "2026-09-02T17:12:40.123+05:30"
 * @param {Date|string|number} [date=new Date()]
 * @returns {string}
 */
export function getISTNowIsoTimestamp(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return "";

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  const parts = formatter.formatToParts(d);
  const map = {};
  for (const p of parts) {
    if (p.type !== "literal") {
      map[p.type] = p.value;
    }
  }

  let hour = map.hour === "24" ? "00" : map.hour;
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${map.year}-${map.month}-${map.day}T${hour}:${map.minute}:${map.second}.${ms}+05:30`;
}

/**
 * Creates an IST ISO 8601 timestamp string for a given date ("YYYY-MM-DD") and time ("HH:MM").
 * e.g. createISTTimestamp("2026-09-02", "18:30") -> "2026-09-02T18:30:00.000+05:30"
 * @param {string} dateStr 
 * @param {string} [timeStr] 
 * @returns {string}
 */
export function createISTTimestamp(dateStr, timeStr) {
  if (!dateStr) return getISTNowIsoTimestamp();
  let time = "12:00:00";
  if (timeStr && timeStr.includes(":")) {
    const parts = timeStr.split(":");
    const h = parts[0].padStart(2, "0");
    const m = parts[1].padStart(2, "0");
    const s = parts[2] ? parts[2].padStart(2, "0") : "00";
    time = `${h}:${m}:${s}`;
  }
  return `${dateStr}T${time}.000+05:30`;
}

/**
 * Parses a "YYYY-MM-DD" string into integer year, month (1-indexed), and day.
 * @param {string} dateStr
 * @returns {{year: number, month: number, day: number}|null}
 */
export function parseDateParts(dateStr) {
  if (!dateStr) return null;
  const parts = String(dateStr).split("-").map(Number);
  if (parts.length < 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
    return null;
  }
  return { year: parts[0], month: parts[1], day: parts[2] };
}

/**
 * Returns date components {year, month, day} in IST for a given date or today.
 * @param {Date|string|number} [date=new Date()]
 * @returns {{year: number, month: number, day: number}}
 */
export function getISTDateParts(date = new Date()) {
  const iso = getISTDateString(date);
  return parseDateParts(iso) || {
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    day: new Date().getDate()
  };
}

/**
 * Adds (or subtracts) a number of days to a "YYYY-MM-DD" string.
 * @param {string} isoDateStr 
 * @param {number} days 
 * @returns {string} e.g. "2026-09-01"
 */
export function addDaysToIso(isoDateStr, days) {
  const p = parseDateParts(isoDateStr);
  if (!p) return isoDateStr;
  const d = new Date(p.year, p.month - 1, p.day + days, 12, 0, 0);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Returns the day of the week name ("Sunday", "Monday", etc.) for a YYYY-MM-DD string.
 * Uses midday local time to prevent boundary shifts.
 * @param {string} dateStr 
 * @returns {string}
 */
export function dayOfWeek(dateStr) {
  if (!dateStr) return "";
  const parts = parseDateParts(dateStr);
  if (!parts) return "";
  const d = new Date(parts.year, parts.month - 1, parts.day, 12, 0, 0);
  return DAY_NAMES[d.getDay()] || "";
}

/**
 * Formats a Date or date string to a full human-readable string in IST.
 * e.g. "Wednesday, 2 September 2026"
 * @param {Date|string|number} [date=new Date()]
 * @returns {string}
 */
export function formatISTFullDate(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(IST_LOCALE, {
    timeZone: IST_TIMEZONE,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

/**
 * Formats a "YYYY-MM-DD" date string to "2 Sep 2026" in IST.
 * @param {string} dateStr 
 * @returns {string}
 */
export function formatLogDate(dateStr) {
  if (!dateStr) return "—";
  const parts = parseDateParts(dateStr);
  if (parts) {
    const d = new Date(parts.year, parts.month - 1, parts.day, 12, 0, 0);
    return d.toLocaleDateString(IST_LOCALE, {
      timeZone: IST_TIMEZONE,
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  }
  return dateStr;
}

/**
 * Formats a timestamp (such as Supabase created_at ISO string) in IST.
 * e.g. "Wed, 2 Sep 2026, 04:52 PM IST"
 * @param {string|Date} isoStr 
 * @param {boolean} [includeTimezoneLabel=true]
 * @returns {string}
 */
export function formatISTTimestamp(isoStr, includeTimezoneLabel = true) {
  if (!isoStr) return "—";
  try {
    const d = isoStr instanceof Date ? isoStr : new Date(isoStr);
    if (!isNaN(d.getTime())) {
      const formatted = d.toLocaleString(IST_LOCALE, {
        timeZone: IST_TIMEZONE,
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
      });
      return includeTimezoneLabel ? `${formatted} IST` : formatted;
    }
  } catch (e) {}
  return String(isoStr);
}

/**
 * Alias for formatISTTimestamp
 */
export const formatFullTimestamp = formatISTTimestamp;

/**
 * Formats the time part of a Date or ISO string in IST (e.g. "04:52 PM").
 * @param {Date|string|number} dateOrIso 
 * @returns {string}
 */
export function formatISTTime(dateOrIso) {
  if (!dateOrIso) return "—";
  try {
    const d = dateOrIso instanceof Date ? dateOrIso : new Date(dateOrIso);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString(IST_LOCALE, {
        timeZone: IST_TIMEZONE,
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
      });
    }
  } catch (e) {}
  return "—";
}

/**
 * Converts a 24-hour "HH:MM" string to 12-hour "hh:mm AM/PM".
 * @param {string} timeStr 
 * @returns {string}
 */
export function format12Hour(timeStr) {
  if (!timeStr) return "—";
  if (timeStr.includes("AM") || timeStr.includes("PM") || timeStr.includes("am") || timeStr.includes("pm")) {
    return timeStr;
  }
  const parts = timeStr.split(":");
  if (parts.length >= 2) {
    let h = parseInt(parts[0], 10);
    const m = parts[1].padStart(2, "0");
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12;
    h = h ? h : 12;
    return `${String(h).padStart(2, "0")}:${m} ${ampm}`;
  }
  return timeStr;
}

/**
 * Calculates start and end ISO dates ("YYYY-MM-DD") for the week (Monday to Sunday) in IST.
 * @param {Date|string} [date=new Date()]
 * @returns {{startIso: string, endIso: string}}
 */
export function getISTWeekRange(date = new Date()) {
  const iso = getISTDateString(date);
  const parts = parseDateParts(iso);
  const d = new Date(parts.year, parts.month - 1, parts.day, 12, 0, 0);
  const dayOfWeekIndex = d.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const daysSinceMonday = (dayOfWeekIndex + 6) % 7; // 0 for Mon, 1 for Tue, ..., 6 for Sun
  const startIso = addDaysToIso(iso, -daysSinceMonday); // Monday
  const endIso = addDaysToIso(startIso, 6); // Sunday
  return { startIso, endIso };
}

/**
 * Calculates start and end ISO dates ("YYYY-MM-DD") for the current month in IST.
 * @param {Date|string} [date=new Date()]
 * @returns {{startIso: string, endIso: string}}
 */
export function getISTMonthRange(date = new Date()) {
  const iso = getISTDateString(date);
  const parts = parseDateParts(iso);
  const startIso = `${parts.year}-${String(parts.month).padStart(2, "0")}-01`;
  const lastDay = new Date(parts.year, parts.month, 0).getDate();
  const endIso = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { startIso, endIso };
}

/**
 * Calculates academic year string (e.g. "2026-2027") for a given date in IST.
 * Academic session runs June (month >= 6) to May.
 * @param {Date|string} [date] Date or "YYYY-MM-DD" string (defaults to today)
 * @returns {string} e.g. "2026-2027"
 */
export function getAcademicYear(date) {
  const iso = typeof date === "string" && date ? date : getISTDateString(date || new Date());
  const parts = parseDateParts(iso);
  if (!parts) return "2026-2027";
  const year = parts.year;
  const month = parts.month;
  return month >= 6 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

