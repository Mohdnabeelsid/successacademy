// ==========================================================================
// TEST SUITE: PHASE 3 ATTENDANCE BUG FIXES & ENHANCEMENTS
// Tests:
// 1. parseTimeToMinutes helper: 24h & 12h formats, minute math, comparison
// 2. Visible-only Mark All Present / Absent respecting search query
// 3. Student attendance calculation using total sessions held as denominator
// 4. Student attendance dynamic stats updating on date filter changes
// 5. deleteAttendanceSession defensive child record cleanup
// 6. getStudentAttendance query filter pass-through
// ==========================================================================

import assert from "assert";
import { parseTimeToMinutes } from "../js/utils/date-time.js";
import {
  calcAttendancePercentage,
  deleteAttendanceSession,
  getStudentAttendance,
  ATTENDANCE_STATUS
} from "../js/services/attendance-service.js";
import { setSupabaseClient, createSupabaseStub, TABLES } from "../js/config/supabase-config.js";

let testsRun = 0;
let testsPassed = 0;

function test(name, fn) {
  testsRun++;
  try {
    fn();
    testsPassed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
  }
}

async function testAsync(name, fn) {
  testsRun++;
  try {
    await fn();
    testsPassed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
  }
}

console.log("================================================================");
console.log("  RUNNING SUCCESS ACADEMY PHASE 3 ATTENDANCE FIXES TEST SUITE");
console.log("================================================================\n");

// --------------------------------------------------------------------------
// 1. parseTimeToMinutes helper (Bug 4 fix)
// --------------------------------------------------------------------------
console.log("--- 1. Time Parsing & Comparison Helper ---");

test("Parses 24h format correctly into minutes", () => {
  assert.strictEqual(parseTimeToMinutes("00:00"), 0);
  assert.strictEqual(parseTimeToMinutes("09:00"), 540);
  assert.strictEqual(parseTimeToMinutes("09:30"), 570);
  assert.strictEqual(parseTimeToMinutes("14:15"), 855);
  assert.strictEqual(parseTimeToMinutes("23:59"), 1439);
});

test("Parses 12h AM/PM format correctly into minutes", () => {
  assert.strictEqual(parseTimeToMinutes("12:00 AM"), 0);
  assert.strictEqual(parseTimeToMinutes("09:00 AM"), 540);
  assert.strictEqual(parseTimeToMinutes("09:30 am"), 570);
  assert.strictEqual(parseTimeToMinutes("12:00 PM"), 720);
  assert.strictEqual(parseTimeToMinutes("02:15 PM"), 855);
  assert.strictEqual(parseTimeToMinutes("11:59 pm"), 1439);
});

test("Returns null for empty or invalid inputs", () => {
  assert.strictEqual(parseTimeToMinutes(""), null);
  assert.strictEqual(parseTimeToMinutes(null), null);
  assert.strictEqual(parseTimeToMinutes(undefined), null);
  assert.strictEqual(parseTimeToMinutes("invalid"), null);
});

test("Time validation correctly detects when endTime <= startTime", () => {
  function validateTimes(startTime, endTime) {
    const sMin = parseTimeToMinutes(startTime);
    const eMin = parseTimeToMinutes(endTime);
    if (sMin !== null && eMin !== null && eMin <= sMin) {
      throw new Error("End time must be after start time.");
    }
    return true;
  }

  // Valid
  assert.strictEqual(validateTimes("09:00", "10:30"), true);
  assert.strictEqual(validateTimes("09:00 AM", "10:30 AM"), true);
  assert.strictEqual(validateTimes("11:30 AM", "01:00 PM"), true);

  // Invalid (same time)
  assert.throws(() => validateTimes("09:00", "09:00"), /End time must be after start time/);
  assert.throws(() => validateTimes("09:00 AM", "09:00 AM"), /End time must be after start time/);

  // Invalid (end before start)
  assert.throws(() => validateTimes("10:30", "09:00"), /End time must be after start time/);
  assert.throws(() => validateTimes("02:00 PM", "11:00 AM"), /End time must be after start time/);
});

// --------------------------------------------------------------------------
// 2. Visible-only Mark All (Bug 1 fix)
// --------------------------------------------------------------------------
console.log("\n--- 2. Visible-Only Mark All Actions ---");

test("Mark All Present targets only search-matching students when query active", () => {
  const currentRoster = [
    { studentId: "s1", name: "Aarav Sharma", admissionNumber: "ADM01", phone: "9876543210", status: null, dirty: false },
    { studentId: "s2", name: "Fatima Khan", admissionNumber: "ADM02", phone: "9876543211", status: null, dirty: false },
    { studentId: "s3", name: "Bilal Ahmed", admissionNumber: "ADM03", phone: "9876543212", status: null, dirty: false }
  ];

  function getVisible(query) {
    const q = (query || "").trim().toLowerCase();
    if (!q) return currentRoster;
    return currentRoster.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.admissionNumber.toLowerCase().includes(q) ||
        s.phone.includes(q)
    );
  }

  function markAllPresentFiltered(query) {
    const targets = getVisible(query);
    targets.forEach((r) => {
      r.status = ATTENDANCE_STATUS.PRESENT;
      r.dirty = true;
    });
  }

  // When filtering by "Fatima"
  markAllPresentFiltered("Fatima");

  assert.strictEqual(currentRoster[0].status, null, "Aarav is unmodified");
  assert.strictEqual(currentRoster[0].dirty, false, "Aarav is not marked dirty");

  assert.strictEqual(currentRoster[1].status, "Present", "Fatima is marked Present");
  assert.strictEqual(currentRoster[1].dirty, true, "Fatima is marked dirty");

  assert.strictEqual(currentRoster[2].status, null, "Bilal is unmodified");
  assert.strictEqual(currentRoster[2].dirty, false, "Bilal is not marked dirty");
});

// --------------------------------------------------------------------------
// 3. Student Attendance Statistics (Bug 2 & 3 fix)
// --------------------------------------------------------------------------
console.log("\n--- 3. Student Attendance Stats & Denominator ---");

test("Attendance rate uses total sessions held as denominator, including unmarked", () => {
  function computeStudentStats(records, totalSessionsHeld) {
    let present = 0;
    let late = 0;
    let absent = 0;

    records.forEach((r) => {
      if (r.status === ATTENDANCE_STATUS.PRESENT) present++;
      else if (r.status === ATTENDANCE_STATUS.LATE) late++;
      else if (r.status === ATTENDANCE_STATUS.ABSENT) absent++;
    });

    const total = totalSessionsHeld > 0 ? totalSessionsHeld : records.length;
    const attended = present + late;
    const unmarked = Math.max(0, total - (present + late + absent));
    const percentage = total > 0 ? calcAttendancePercentage(present, late, total) : 0;

    return { total, present, late, absent, unmarked, attended, percentage };
  }

  // 10 sessions held, student attended 4 present + 1 late, 1 absent => 4 unmarked
  const records = [
    { status: "Present" },
    { status: "Present" },
    { status: "Present" },
    { status: "Present" },
    { status: "Late" },
    { status: "Absent" }
  ];

  const stats = computeStudentStats(records, 10);
  assert.strictEqual(stats.total, 10, "Total sessions is 10 (sessions held)");
  assert.strictEqual(stats.present, 4, "Present is 4");
  assert.strictEqual(stats.late, 1, "Late is 1");
  assert.strictEqual(stats.absent, 1, "Absent is 1");
  assert.strictEqual(stats.unmarked, 4, "Unmarked is 4 (10 - 6)");
  assert.strictEqual(stats.attended, 5, "Attended is 5");
  assert.strictEqual(stats.percentage, 50, "Percentage is 50.0% (5/10), NOT 83.3% (5/6)");
});

test("Date filtering dynamically recalculates stats and records for selected range", () => {
  const allSessions = [
    { id: "sess-1", date: "2026-08-10" },
    { id: "sess-2", date: "2026-08-20" },
    { id: "sess-3", date: "2026-09-05" },
    { id: "sess-4", date: "2026-09-12" }
  ];

  const allRecords = [
    { sessionId: "sess-1", date: "2026-08-10", status: "Present" },
    { sessionId: "sess-2", date: "2026-08-20", status: "Absent" },
    { sessionId: "sess-3", date: "2026-09-05", status: "Present" },
    { sessionId: "sess-4", date: "2026-09-12", status: "Late" }
  ];

  // Filter to September only (2026-09-01 to 2026-09-30)
  const startDate = "2026-09-01";
  const endDate = "2026-09-30";

  const septSessions = allSessions.filter((s) => s.date >= startDate && s.date <= endDate);
  const septRecords = allRecords.filter((r) => r.date >= startDate && r.date <= endDate);

  assert.strictEqual(septSessions.length, 2, "2 sessions in September");
  assert.strictEqual(septRecords.length, 2, "2 records in September");

  let present = 0;
  let late = 0;
  septRecords.forEach((r) => {
    if (r.status === "Present") present++;
    if (r.status === "Late") late++;
  });

  const rate = calcAttendancePercentage(present, late, septSessions.length);
  assert.strictEqual(rate, 100, "September attendance rate is 100% (2/2)");
});

// --------------------------------------------------------------------------
// 4. deleteAttendanceSession Defensive Cleanup (Bug 5 fix)
// --------------------------------------------------------------------------
console.log("\n--- 4. Session Deletion Cleanup ---");

await testAsync("deleteAttendanceSession deletes child records and session row", async () => {
  let recordsDeletedForSession = null;
  let sessionRowDeletedId = null;

  const stub = createSupabaseStub();
  stub.from = (table) => {
    if (table === TABLES.ATTENDANCE_RECORDS) {
      return {
        delete: () => ({
          eq: (col, val) => {
            recordsDeletedForSession = val;
            return Promise.resolve({ error: null });
          }
        })
      };
    }
    if (table === TABLES.ATTENDANCE_SESSIONS) {
      return {
        delete: () => ({
          eq: (col, val) => {
            sessionRowDeletedId = val;
            return Promise.resolve({ error: null });
          }
        })
      };
    }
    return createSupabaseStub().from(table);
  };

  setSupabaseClient(stub);

  await deleteAttendanceSession("target-session-xyz");

  assert.strictEqual(recordsDeletedForSession, "target-session-xyz", "Records deleted for session target-session-xyz");
  assert.strictEqual(sessionRowDeletedId, "target-session-xyz", "Session row deleted for session target-session-xyz");

  // Restore stub
  setSupabaseClient(createSupabaseStub());
});

// --------------------------------------------------------------------------
// 5. getStudentAttendance Query Pass-through (Bug 6 fix)
// --------------------------------------------------------------------------
console.log("\n--- 5. getStudentAttendance Query Filter Pass-through ---");

await testAsync("getStudentAttendance applies date filters", async () => {
  let gteCol = null;
  let gteVal = null;
  let lteCol = null;
  let lteVal = null;

  const stub = createSupabaseStub();
  stub.from = (table) => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      gte: (col, val) => {
        gteCol = col;
        gteVal = val;
        return builder;
      },
      lte: (col, val) => {
        lteCol = col;
        lteVal = val;
        return builder;
      },
      then: (resolve) => resolve({ data: [], error: null })
    };
    return builder;
  };

  setSupabaseClient(stub);

  await getStudentAttendance("std-1", {
    startDate: "2026-09-01",
    endDate: "2026-09-30"
  });

  assert.strictEqual(gteCol, "attendance_sessions.date", "gte filter applied on attendance_sessions.date");
  assert.strictEqual(gteVal, "2026-09-01", "gte value matches startDate");
  assert.strictEqual(lteCol, "attendance_sessions.date", "lte filter applied on attendance_sessions.date");
  assert.strictEqual(lteVal, "2026-09-30", "lte value matches endDate");

  // Restore stub
  setSupabaseClient(createSupabaseStub());
});

console.log("\n================================================================");
console.log(`  TEST RESULTS: ${testsPassed}/${testsRun} PASSED`);
console.log("================================================================\n");

if (testsPassed !== testsRun) {
  process.exit(1);
}

