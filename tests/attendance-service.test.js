// ==========================================================================
// TEST SUITE: ATTENDANCE SERVICE & BUSINESS RULES
// ==========================================================================

import {
  calcAttendancePercentage,
  normalizeClass,
  ATTENDANCE_STATUS,
  SESSION_TYPES
} from "../js/services/attendance-service.js";

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
    console.error(`❌ FAIL: ${message}\n  Expected: ${expected}\n  Got:      ${actual}`);
  }
}

console.log("================================================================");
console.log("  RUNNING SUCCESS ACADEMY ATTENDANCE TEST SUITE");
console.log("================================================================\n");

// 1. Percentage formula test: (Present + Late) / Total * 100
// Prompt example: Present: 28, Late: 3, Absent: 2 => Rate: 93.9%
const samplePct = calcAttendancePercentage(28, 3, 33);
assertEqual(samplePct, 93.9, "Attendance rate calculation matches prompt example (93.9%)");

// Edge cases
assertEqual(calcAttendancePercentage(0, 0, 0), 0, "Zero sessions returns 0%");
assertEqual(calcAttendancePercentage(10, 0, 10), 100, "100% attendance when all present");
assertEqual(calcAttendancePercentage(0, 10, 10), 100, "100% attendance when all late (late counts as attended)");
assertEqual(calcAttendancePercentage(0, 0, 10), 0, "0% attendance when all absent");
assertEqual(calcAttendancePercentage(5, 5, 20), 50, "50% attendance (5 present + 5 late out of 20)");

// 2. Status definitions
assertEqual(ATTENDANCE_STATUS.PRESENT, "Present", "Status Present exists");
assertEqual(ATTENDANCE_STATUS.LATE, "Late", "Status Late exists");
assertEqual(ATTENDANCE_STATUS.ABSENT, "Absent", "Status Absent exists");
assert(!ATTENDANCE_STATUS.EXCUSED, "Excused status does not exist (only Present, Late, Absent allowed)");

// 3. Class normalization
assertEqual(normalizeClass("Class 10"), "10", "Class 10 normalizes to 10");
assertEqual(normalizeClass("10"), "10", "10 stays 10");
assertEqual(normalizeClass("class 8"), "8", "class 8 normalizes to 8");
assertEqual(normalizeClass("Class 11 Science"), "11 Science", "Class 11 Science retains stream");

// 4. Reporting calculation integration test
import { buildAttendanceReportRows } from "../js/services/report-service.js";
const sampleStudents = [
  { id: "s1", admissionNumber: "SA101", name: "Ahmed", class: "10", branch: "MAN" }
];
const sampleAttendanceMap = {
  s1: [
    { status: "Present" },
    { status: "Present" },
    { status: "Late" },
    { status: "Absent" }
  ]
};
const reportRows = buildAttendanceReportRows(sampleStudents, sampleAttendanceMap);
assertEqual(reportRows.length, 1, "1 report row generated");
assertEqual(reportRows[0].totalSessions, 4, "Total sessions is 4");
assertEqual(reportRows[0].present, 2, "Present count is 2");
assertEqual(reportRows[0].late, 1, "Late count is 1");
assertEqual(reportRows[0].absent, 1, "Absent count is 1");
assertEqual(reportRows[0].attended, 3, "Attended count is 3 (2 Present + 1 Late)");
assertEqual(reportRows[0].attendancePercentage, 75, "Attendance percentage is 75%");

console.log(`\n================================================================`);
console.log(`  TEST RESULTS: ${testsPassed}/${testsRun} PASSED (${testsFailed} FAILED)`);
console.log(`================================================================\n`);

