// ==========================================================================
// TEST SUITE: TIMETABLE SERVICE
// Tests:
// - Constants & Icons
// - Class normalization
// - Time & summary formatting
// - Proximity alert priority calculation (Today, Tomorrow, 2 Days)
// - Validation logic (time constraints, 7-day bounds, required fields)
// - Date grouping & time sorting
// - In-memory mock DB operations (create, update, list, week, alerts)
// ==========================================================================

import {
  SESSION_TYPES,
  SESSION_TYPE_ICONS,
  normalizeClass,
  formatEntryTime,
  getEntrySummary,
  computeAlertPriority,
  validateTimetableEntry,
  groupEntriesByDate,
  createTimetableEntry,
  updateTimetableEntry,
  deleteTimetableEntry,
  getTimetableEntry,
  listTimetableEntries,
  getWeekEntries,
  getUpcomingAlerts
} from "../js/services/timetable-service.js";

import { setSupabaseClient } from "../js/config/supabase-config.js";
import { getISTTodayIso, addDaysToIso } from "../js/utils/date-time.js";

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
console.log("  RUNNING SUCCESS ACADEMY TIMETABLE MODULE TEST SUITE");
console.log("================================================================\n");

// -----------------------------------------------------------------------------
// 1. Constants & Formatting
// -----------------------------------------------------------------------------
console.log("--- 1. Constants & Basic Formatting ---");

assert(SESSION_TYPES.includes("Class"), "SESSION_TYPES includes Class");
assert(SESSION_TYPES.includes("Exam"), "SESSION_TYPES includes Exam");
assert(SESSION_TYPES.includes("Event"), "SESSION_TYPES includes Event");
assert(SESSION_TYPES.includes("Other"), "SESSION_TYPES includes Other");

assertEqual(SESSION_TYPE_ICONS.Class, "📚", "Class icon is 📚");
assertEqual(SESSION_TYPE_ICONS.Exam, "📝", "Exam icon is 📝");
assertEqual(SESSION_TYPE_ICONS.Event, "🎯", "Event icon is 🎯");
assertEqual(SESSION_TYPE_ICONS.Other, "📌", "Other icon is 📌");

assertEqual(normalizeClass("Class 10"), "10", "Strips 'Class ' prefix");
assertEqual(normalizeClass("10"), "10", "Leaves plain class number untouched");
assertEqual(normalizeClass("Class 11 Science"), "11 Science", "Normalizes higher secondary classes");

assertEqual(formatEntryTime({ startTime: "09:00", endTime: "10:30" }), "09:00 AM – 10:30 AM", "Formats 24h start and end to 12h range");
assertEqual(formatEntryTime({ startTime: "09:00" }), "09:00 AM", "Formats single start time");
assertEqual(formatEntryTime({}), "Time TBA", "Handles missing times gracefully");

const summary = getEntrySummary({
  sessionType: "Exam",
  subject: "Chemistry",
  title: "Unit Test 1",
  startTime: "14:00"
});
assert(summary.includes("📝"), "Summary contains Exam icon");
assert(summary.includes("Chemistry"), "Summary contains subject");
assert(summary.includes("Unit Test 1"), "Summary contains title");
assert(summary.includes("02:00 PM"), "Summary contains 12h formatted time");

// -----------------------------------------------------------------------------
// 2. Alert Priority Calculation
// -----------------------------------------------------------------------------
console.log("\n--- 2. Alert Priority Calculation ---");

const testToday = "2026-11-06";
const pToday = computeAlertPriority("2026-11-06", testToday);
assert(pToday !== null, "Today should trigger an alert");
assertEqual(pToday?.level, 1, "Today has priority level 1 (highest)");
assertEqual(pToday?.label, "Today", "Today label is 'Today'");

const pTomorrow = computeAlertPriority("2026-11-07", testToday);
assert(pTomorrow !== null, "Tomorrow should trigger an alert");
assertEqual(pTomorrow?.level, 2, "Tomorrow has priority level 2");
assertEqual(pTomorrow?.label, "Tomorrow", "Tomorrow label is 'Tomorrow'");

const pIn2Days = computeAlertPriority("2026-11-08", testToday);
assert(pIn2Days !== null, "Day after tomorrow should trigger an alert");
assertEqual(pIn2Days?.level, 3, "Day after tomorrow has priority level 3");
assertEqual(pIn2Days?.label, "In 2 days", "Day after tomorrow label is 'In 2 days'");

const pBeyond = computeAlertPriority("2026-11-09", testToday);
assertEqual(pBeyond, null, "3 days away should not trigger an alert");

const pPast = computeAlertPriority("2026-11-05", testToday);
assertEqual(pPast, null, "Past dates should not trigger an alert");

// -----------------------------------------------------------------------------
// 3. Validation Logic
// -----------------------------------------------------------------------------
console.log("\n--- 3. Validation Logic ---");

const today = getISTTodayIso();
const validEntry = {
  date: today,
  class: "10",
  branch: "MAN",
  sessionType: "Class",
  startTime: "09:00",
  endTime: "10:30"
};
const val1 = validateTimetableEntry(validEntry);
assert(val1.valid, "Valid entry passes validation");

const missingDate = { ...validEntry, date: "" };
const val2 = validateTimetableEntry(missingDate);
assert(!val2.valid, "Missing date fails validation");

const missingClass = { ...validEntry, class: "" };
const val3 = validateTimetableEntry(missingClass);
assert(!val3.valid, "Missing class fails validation");

const invalidType = { ...validEntry, sessionType: "RandomType" };
const val4 = validateTimetableEntry(invalidType);
assert(!val4.valid, "Invalid sessionType fails validation");

const invalidTimes = { ...validEntry, startTime: "11:00", endTime: "09:00" };
const val5 = validateTimetableEntry(invalidTimes);
assert(!val5.valid, "End time earlier than start time fails validation");

const farFutureDate = addDaysToIso(today, 10);
const val6 = validateTimetableEntry({ ...validEntry, date: farFutureDate });
assert(!val6.valid, "Date more than 7 days ahead fails validation by default");

const threeSubjects = { ...validEntry, subjects: ["Maths", "Physics", "Chemistry"] };
const val7 = validateTimetableEntry(threeSubjects);
assert(val7.valid, "Up to 3 subjects passes validation");

const fourSubjects = { ...validEntry, subjects: ["Maths", "Physics", "Chemistry", "Biology"] };
const val8 = validateTimetableEntry(fourSubjects);
assert(!val8.valid, "More than 3 subjects fails validation");

// -----------------------------------------------------------------------------
// 4. Date Grouping and Time Sorting
// -----------------------------------------------------------------------------
console.log("\n--- 4. Date Grouping & Sorting ---");

const entriesToGroup = [
  { id: "1", date: "2026-11-06", startTime: "14:00", subject: "Physics" },
  { id: "2", date: "2026-11-06", startTime: "09:00", subject: "Maths" },
  { id: "3", date: "2026-11-08", startTime: "10:00", subject: "Chemistry" }
];

const grouped = groupEntriesByDate(entriesToGroup, "2026-11-06", 7);
assertEqual(Object.keys(grouped).length, 7, "Grouped object contains 7 days");
assertEqual(grouped["2026-11-06"].length, 2, "Day 1 has 2 entries");
assertEqual(grouped["2026-11-06"][0].subject, "Maths", "09:00 entry sorted before 14:00 entry");
assertEqual(grouped["2026-11-06"][1].subject, "Physics", "14:00 entry sorted after 09:00 entry");
assertEqual(grouped["2026-11-07"].length, 0, "Empty day has empty array");
assertEqual(grouped["2026-11-08"].length, 1, "Day 3 has 1 entry");

// -----------------------------------------------------------------------------
// 5. In-Memory Mock Database Tests
// -----------------------------------------------------------------------------
console.log("\n--- 5. In-Memory Mock Database CRUD Tests ---");

const mockDatabase = {
  timetable_entries: []
};

let autoId = 1;

const mockClient = {
  from: (table) => {
    return {
      insert: (rows) => ({
        select: () => ({
          single: async () => {
            const row = { id: `entry-${autoId++}`, ...rows[0] };
            mockDatabase[table].push(row);
            return { data: row, error: null };
          }
        })
      }),
      update: (updates) => ({
        eq: async (col, val) => {
          const idx = mockDatabase[table].findIndex(r => r[col] === val);
          if (idx >= 0) {
            mockDatabase[table][idx] = { ...mockDatabase[table][idx], ...updates };
          }
          return { error: null };
        }
      }),
      delete: () => ({
        eq: async (col, val) => {
          const idx = mockDatabase[table].findIndex(r => r[col] === val);
          if (idx >= 0) mockDatabase[table].splice(idx, 1);
          return { error: null };
        }
      }),
      select: () => {
        let filters = [];
        const builder = {
          eq: (col, val) => {
            filters.push(r => r[col] === val);
            return builder;
          },
          in: (col, vals) => {
            filters.push(r => vals.includes(r[col]));
            return builder;
          },
          gte: (col, val) => {
            filters.push(r => r[col] >= val);
            return builder;
          },
          lte: (col, val) => {
            filters.push(r => r[col] <= val);
            return builder;
          },
          order: () => builder,
          single: async () => {
            let res = mockDatabase[table];
            for (const f of filters) res = res.filter(f);
            return { data: res[0] || null, error: null };
          },
          maybeSingle: async () => {
            let res = mockDatabase[table];
            for (const f of filters) res = res.filter(f);
            return { data: res[0] || null, error: null };
          },
          then: (resolve) => {
            let res = mockDatabase[table];
            for (const f of filters) res = res.filter(f);
            resolve({ data: res, error: null });
          }
        };
        return builder;
      }
    };
  }
};

setSupabaseClient(mockClient);

async function runAsyncCrudTests() {
  try {
    const today = getISTTodayIso();
    const tomorrow = addDaysToIso(today, 1);

    // 1. Create Entry with 2 subjects
    const entryId = await createTimetableEntry({
      date: today,
      class: "10",
      branch: "MAN",
      sessionType: "Class",
      subjects: ["Mathematics", "Physics"],
      title: "Algebra & Mechanics Combined",
      startTime: "09:00",
      endTime: "10:30"
    });
    assert(Boolean(entryId), "Entry created successfully");
    const created = await getTimetableEntry(entryId);
    assertEqual(created?.subject, "Mathematics, Physics", "Multiple subjects joined as string");
    assertEqual(created?.subjects?.length, 2, "Stored 2 subjects in subjects array");

    // 2. Create another entry for tomorrow with 3 subjects (Exam)
    await createTimetableEntry({
      date: tomorrow,
      class: "10",
      branch: "MAN",
      sessionType: "Exam",
      subjects: ["Physics", "Chemistry", "Biology"],
      title: "Science Tri-Subject Model Exam",
      startTime: "10:00",
      endTime: "12:00"
    });

    // 3. List entries
    const list = await listTimetableEntries({ branch: "MAN", class: "10" });
    assertEqual(list.length, 2, "List returns 2 entries for Class 10 MAN");

    // 4. Update entry
    await updateTimetableEntry(entryId, {
      title: "Algebra Revision Part 2"
    });
    const updated = await getTimetableEntry(entryId);
    assertEqual(updated?.title, "Algebra Revision Part 2", "Entry title updated successfully");

    // 5. Get week entries
    const weekResult = await getWeekEntries("10", "MAN", today);
    assertEqual(weekResult.entries.length, 2, "Week result contains 2 entries");
    assertEqual(weekResult.grouped[today].length, 1, "Today has 1 entry");
    assertEqual(weekResult.grouped[tomorrow].length, 1, "Tomorrow has 1 entry");

    // 6. Test Upcoming Alerts
    const alertResult = await getUpcomingAlerts("10", "MAN", today);
    assertEqual(alertResult.unreadCount, 2, "2 upcoming alerts detected within 48h");
    assertEqual(alertResult.alerts[0].priority.level, 1, "First alert is priority 1 (Today)");
    assertEqual(alertResult.alerts[1].priority.level, 2, "Second alert is priority 2 (Tomorrow)");

    // 7. Delete entry
    await deleteTimetableEntry(entryId);
    const afterDelete = await listTimetableEntries({ branch: "MAN", class: "10" });
    assertEqual(afterDelete.length, 1, "1 entry remains after deletion");

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
