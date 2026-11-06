// ==========================================================================
// TEST SUITE: TEACHER SERVICE & CLASS LOG TRACKING
// Tests:
// - Duration calculation & formatting
// - CSV export with formula injection sanitization
// - Teacher analytics & overview statistics
// - Teacher validation & CRUD with Supabase stub
// - Class log validation & CRUD with Supabase stub
// ==========================================================================

import {
  calculateDurationMinutes,
  formatDurationDisplay,
  exportClassLogsToCSV,
  getTeacherAnalytics,
  getClassLogsOverviewStats,
  createTeacher,
  createClassLog,
  TEACHER_STATUS
} from "../js/services/teacher-service.js";

import { setSupabaseClient } from "../js/config/supabase-config.js";

let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  testsRun++;
  if (condition) {
    testsPassed++;
  } else {
    testsFailed++;
    console.error(`❌ FAIL: ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  testsRun++;
  if (actual === expected) {
    testsPassed++;
  } else {
    testsFailed++;
    console.error(`❌ FAIL: ${message} | Expected: ${expected}, Got: ${actual}`);
  }
}

console.log("================================================================");
console.log("  RUNNING SUCCESS ACADEMY TEACHERS & CLASS LOGS TEST SUITE");
console.log("================================================================\n");

// -----------------------------------------------------------------------------
// 1. Duration Calculation Tests
// -----------------------------------------------------------------------------
console.log("--- 1. Session Duration Calculation ---");

assertEqual(calculateDurationMinutes("09:00", "10:00"), 60, "09:00 to 10:00 should be 60 mins");
assertEqual(calculateDurationMinutes("09:30", "11:00"), 90, "09:30 to 11:00 should be 90 mins");
assertEqual(calculateDurationMinutes("14:15", "15:00"), 45, "14:15 to 15:00 should be 45 mins");
assertEqual(calculateDurationMinutes("09:00 AM", "10:30 AM"), 90, "12-hour AM format should calculate correctly");
assertEqual(calculateDurationMinutes("11:30 AM", "01:00 PM"), 90, "Cross-noon 12-hour AM to PM should calculate 90 mins");
assertEqual(calculateDurationMinutes("09:00", ""), 0, "Missing end time should yield 0 mins");
assertEqual(calculateDurationMinutes("", "10:00"), 0, "Missing start time should yield 0 mins");

// -----------------------------------------------------------------------------
// 2. Duration Formatting Tests
// -----------------------------------------------------------------------------
console.log("\n--- 2. Duration Display Formatting ---");

assertEqual(formatDurationDisplay(60), "1 hr", "60 mins should format as '1 hr'");
assertEqual(formatDurationDisplay(120), "2 hrs", "120 mins should format as '2 hrs'");
assertEqual(formatDurationDisplay(90), "1 hr 30 mins", "90 mins should format as '1 hr 30 mins'");
assertEqual(formatDurationDisplay(45), "45 mins", "45 mins should format as '45 mins'");
assertEqual(formatDurationDisplay(1), "1 min", "1 min should format as '1 min'");
assertEqual(formatDurationDisplay(0), "0 mins", "0 mins should format as '0 mins'");

// -----------------------------------------------------------------------------
// 3. Analytics & Overview Calculations
// -----------------------------------------------------------------------------
console.log("\n--- 3. Analytics & Summary Metrics ---");

const sampleLogs = [
  {
    id: "1",
    teacherId: "t1",
    teacherName: "Farook Sir",
    date: "2026-11-05",
    class: "10",
    subject: "Maths",
    durationMinutes: 60
  },
  {
    id: "2",
    teacherId: "t1",
    teacherName: "Farook Sir",
    date: "2026-11-05",
    class: "10",
    subject: "Maths",
    durationMinutes: 90
  },
  {
    id: "3",
    teacherId: "t2",
    teacherName: "Reena Ma'am",
    date: "2026-11-05",
    class: "8",
    subject: "English",
    durationMinutes: 45
  },
  {
    id: "4",
    teacherId: "t1",
    teacherName: "Farook Sir",
    date: "2026-11-04",
    class: "9",
    subject: "Physics",
    durationMinutes: 60
  }
];

const analyticsFarook = getTeacherAnalytics("t1", sampleLogs);
assertEqual(analyticsFarook.totalSessions, 3, "Farook Sir should have 3 total sessions");
assertEqual(analyticsFarook.totalMinutes, 210, "Farook Sir should have 210 total mins");
assertEqual(analyticsFarook.totalHours, "3.5", "Farook Sir should have 3.5 total hours");
assertEqual(analyticsFarook.topSubject, "Maths", "Top subject should be Maths");

const overview = getClassLogsOverviewStats(sampleLogs, "2026-11-05");
assertEqual(overview.todaySessions, 3, "Today's sessions count should be 3");
assertEqual(overview.activeTeachersToday, 2, "Active teachers today should be 2");
assertEqual(overview.classesCoveredToday, 2, "Classes covered today should be 2 (Class 10 and Class 8)");
assertEqual(overview.todayMinutes, 195, "Total minutes today should be 195");
assertEqual(overview.todayHours, "3.3", "Total hours today should be 3.3");

// -----------------------------------------------------------------------------
// 4. CSV Formula Injection Sanitization
// -----------------------------------------------------------------------------
console.log("\n--- 4. CSV Export Formula Sanitization ---");

const dangerousLogs = [
  {
    date: "2026-11-05",
    branch: "MAN",
    teacherName: "=cmd|' /C calc'!A0",
    class: "10",
    subject: "+Maths",
    startTime: "09:00",
    endTime: "10:00",
    durationMinutes: 60,
    topic: "-Injected Formula",
    notes: "@Risk"
  }
];

const csv = exportClassLogsToCSV(dangerousLogs);
assert(csv.includes('"Date","Branch","Teacher Name"'), "CSV contains headers");
assert(csv.includes("\"'=cmd"), "CSV sanitizes '=' prefix with single quote");
assert(csv.includes("\"'+Maths"), "CSV sanitizes '+' prefix with single quote");
assert(csv.includes("\"'-Injected Formula"), "CSV sanitizes '-' prefix with single quote");
assert(csv.includes("\"'@Risk"), "CSV sanitizes '@' prefix with single quote");

// -----------------------------------------------------------------------------
// 5. In-Memory Mock Database CRUD Tests
// -----------------------------------------------------------------------------
console.log("\n--- 5. In-Memory Mock Database Tests ---");

const mockDatabase = {
  teachers: [],
  class_logs: []
};

// Simple mock Supabase client
const mockClient = {
  from: (table) => {
    return {
      insert: (rows) => ({
        select: () => ({
          single: async () => {
            const row = { id: `mock-${Date.now()}`, ...rows[0] };
            mockDatabase[table].push(row);
            return { data: row, error: null };
          }
        })
      }),
      select: () => ({
        order: () => ({
          order: async () => ({ data: mockDatabase[table], error: null })
        })
      })
    };
  }
};

setSupabaseClient(mockClient);

async function runAsyncCrudTests() {
  try {
    const teacherId = await createTeacher({
      name: "Suresh Sir",
      phone: "9876543210",
      branch: "MAN",
      subjects: ["Maths", "Physics"],
      classes: ["10", "11 Science"],
      status: TEACHER_STATUS.ACTIVE
    });
    assert(Boolean(teacherId), "Teacher created successfully with mock client");

    const logId = await createClassLog({
      teacherId,
      teacherName: "Suresh Sir",
      class: "10",
      subject: "Maths",
      startTime: "10:00",
      endTime: "11:00",
      branch: "MAN"
    });
    assert(Boolean(logId), "Class log created successfully with mock client");
  } catch (err) {
    assert(false, `Async CRUD test threw error: ${err.message}`);
  }

  // Summary
  console.log("\n================================================================");
  console.log(`  TEST RESULTS: ${testsPassed} passed, ${testsFailed} failed out of ${testsRun} assertions`);
  console.log("================================================================\n");

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runAsyncCrudTests();
