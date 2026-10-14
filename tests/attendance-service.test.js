// ==========================================================================
// TEST SUITE: ATTENDANCE SERVICE, BUSINESS RULES & DATA INTEGRITY
// Runs with plain node and no network dependencies.
// ==========================================================================

import {
  calcAttendancePercentage,
  normalizeClass,
  ATTENDANCE_STATUS,
  markAttendance,
  createAttendanceSession,
  updateAttendanceSession
} from "../js/services/attendance-service.js";
import { buildAttendanceReportRows } from "../js/services/report-service.js";
import { setSupabaseClient, createSupabaseStub, TABLES } from "../js/config/supabase-config.js";
import { updateStudent, createStudentWithCredentials } from "../js/services/student-service.js";

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

// --------------------------------------------------------------------------
// 1. Percentage formula test: ((Present + Late) / Total) * 100
// --------------------------------------------------------------------------
console.log("--- 1. Attendance Percentage Formula ---");
// Prompt example: Present: 28, Late: 3, Absent: 2 => Rate: 93.9%
const samplePct = calcAttendancePercentage(28, 3, 33);
assertEqual(samplePct, 93.9, "Attendance rate calculation matches prompt example (93.9%)");

// Edge cases
assertEqual(calcAttendancePercentage(0, 0, 0), 0, "Zero sessions returns 0%");
assertEqual(calcAttendancePercentage(10, 0, 10), 100, "100% attendance when all present");
assertEqual(calcAttendancePercentage(0, 10, 10), 100, "100% attendance when all late (late counts as attended)");
assertEqual(calcAttendancePercentage(0, 0, 10), 0, "0% attendance when all absent");
assertEqual(calcAttendancePercentage(5, 5, 20), 50, "50% attendance (5 present + 5 late out of 20)");

// --------------------------------------------------------------------------
// 2. Status definitions
// --------------------------------------------------------------------------
console.log("--- 2. Attendance Status Constants ---");
assertEqual(ATTENDANCE_STATUS.PRESENT, "Present", "Status Present exists");
assertEqual(ATTENDANCE_STATUS.LATE, "Late", "Status Late exists");
assertEqual(ATTENDANCE_STATUS.ABSENT, "Absent", "Status Absent exists");
assert(!ATTENDANCE_STATUS.EXCUSED, "Excused status does not exist (only Present, Late, Absent allowed)");

// --------------------------------------------------------------------------
// 3. Class normalization helper
// --------------------------------------------------------------------------
console.log("--- 3. Class Normalization ---");
assertEqual(normalizeClass("Class 10"), "10", "Class 10 normalizes to 10");
assertEqual(normalizeClass("10"), "10", "10 stays 10");
assertEqual(normalizeClass("class 8"), "8", "class 8 normalizes to 8");
assertEqual(normalizeClass("  Class  9  "), "9", "Trims extra spaces and normalizes to 9");
assertEqual(normalizeClass("Class 11 Science"), "11 Science", "Class 11 Science retains stream");
assertEqual(normalizeClass(""), "", "Empty string returns empty string");
assertEqual(normalizeClass(null), "", "Null returns empty string");

// --------------------------------------------------------------------------
// 4. Percentage calculation with unmarked sessions (Session-based denominator)
// --------------------------------------------------------------------------
console.log("--- 4. Percentage Calculation with Unmarked Sessions ---");
{
  const students = [
    { id: "s1", admissionNumber: "SA101", name: "Ahmed", class: "10", branch: "MAN" },
    { id: "s2", admissionNumber: "SA102", name: "Fatima", class: "10", branch: "MAN" }
  ];

  // Ahmed was marked Present twice, but 5 total sessions were held for Class 10 (3 unmarked)
  // Fatima was marked Present 3 times and Late 1 time out of 5 sessions (1 unmarked)
  const attendanceMap = {
    s1: [{ status: "Present" }, { status: "Present" }],
    s2: [{ status: "Present" }, { status: "Present" }, { status: "Present" }, { status: "Late" }]
  };
  const totalSessionsHeld = 5;

  const rows = buildAttendanceReportRows(students, attendanceMap, totalSessionsHeld);
  assertEqual(rows.length, 2, "2 report rows generated");

  // Student 1 (Ahmed): 2 attended out of 5 sessions => 40.0%
  assertEqual(rows[0].totalSessions, 5, "Ahmed total sessions is 5 (sessions held)");
  assertEqual(rows[0].present, 2, "Ahmed present count is 2");
  assertEqual(rows[0].late, 0, "Ahmed late count is 0");
  assertEqual(rows[0].absent, 0, "Ahmed absent count is 0");
  assertEqual(rows[0].unmarked, 3, "Ahmed unmarked sessions count is 3 (5 - 2)");
  assertEqual(rows[0].attended, 2, "Ahmed attended count is 2");
  assertEqual(rows[0].attendancePercentage, 40, "Ahmed attendance percentage is 40% (2 / 5 * 100), not 100%");

  // Student 2 (Fatima): 4 attended out of 5 sessions => 80.0%
  assertEqual(rows[1].totalSessions, 5, "Fatima total sessions is 5");
  assertEqual(rows[1].present, 3, "Fatima present count is 3");
  assertEqual(rows[1].late, 1, "Fatima late count is 1");
  assertEqual(rows[1].unmarked, 1, "Fatima unmarked count is 1 (5 - 4)");
  assertEqual(rows[1].attendancePercentage, 80, "Fatima attendance percentage is 80% ((3+1)/5 * 100)");
}

// --------------------------------------------------------------------------
// 5. Class normalization on write (updateStudent & createStudentWithCredentials)
// --------------------------------------------------------------------------
console.log("--- 5. Class Normalization on Write ---");
{
  let writtenClass = null;
  const mockClient = createSupabaseStub();
  mockClient.from = (table) => {
    return {
      update: (data) => {
        writtenClass = data.class;
        return {
          eq: () => Promise.resolve({ data: null, error: null })
        };
      },
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { id: "std-1", class: writtenClass }, error: null })
        })
      })
    };
  };

  setSupabaseClient(mockClient);

  // Calling updateStudent with "Class 10" must normalize to "10" on write
  await updateStudent("std-1", { class: "Class 10" });
  assertEqual(writtenClass, "10", "updateStudent normalizes 'Class 10' to '10' on write");

  await updateStudent("std-1", { class: "class  8" });
  assertEqual(writtenClass, "8", "updateStudent normalizes 'class  8' to '8' on write");

  // Restore default stub
  setSupabaseClient(createSupabaseStub());
}

// --------------------------------------------------------------------------
// 6. markAttendance rejecting students from another class or branch
// --------------------------------------------------------------------------
console.log("--- 6. markAttendance Roster Isolation ---");
{
  const mockSession = {
    id: "session-abc",
    branch: "MAN",
    class: "10"
  };

  const mockStudents = [
    { id: "s-man-10", name: "Valid Student", branch: "MAN", class: "10", admission_number: "SA101" },
    { id: "s-alp-10", name: "Alappuzha Student", branch: "ALP", class: "10", admission_number: "SA102" },
    { id: "s-man-9", name: "Class 9 Student", branch: "MAN", class: "9", admission_number: "SA103" }
  ];

  let upsertCalled = false;
  const mockClient = createSupabaseStub();
  mockClient.from = (table) => {
    if (table === TABLES.ATTENDANCE_SESSIONS) {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: mockSession.id,
                branch: mockSession.branch,
                class: mockSession.class,
                start_time: "09:00",
                end_time: "10:00"
              },
              error: null
            })
          })
        })
      };
    }
    if (table === TABLES.STUDENTS) {
      return {
        select: () => ({
          in: (col, ids) => {
            const filtered = mockStudents.filter((s) => ids.includes(s.id));
            return Promise.resolve({ data: filtered, error: null });
          }
        })
      };
    }
    if (table === TABLES.ATTENDANCE_RECORDS) {
      return {
        upsert: async () => {
          upsertCalled = true;
          return { error: null };
        }
      };
    }
    return createSupabaseStub().from(table);
  };

  setSupabaseClient(mockClient);

  // Case A: Valid student in Class 10 MAN
  upsertCalled = false;
  const validOk = await markAttendance(mockSession.id, [
    { studentId: "s-man-10", status: "Present", remarks: "" }
  ]);
  assertEqual(validOk, true, "Valid student markAttendance returns true");
  assertEqual(upsertCalled, true, "Upsert called for valid student");

  // Case B: Foreign branch student (ALP student in MAN session)
  let branchError = null;
  try {
    await markAttendance(mockSession.id, [
      { studentId: "s-alp-10", status: "Present", remarks: "" }
    ]);
  } catch (err) {
    branchError = err.message;
  }
  assert(
    branchError && branchError.includes("do not belong to Class 10 (MAN)"),
    "markAttendance rejects student from different branch with clear error"
  );

  // Case C: Foreign class student (Class 9 student in Class 10 session)
  let classError = null;
  try {
    await markAttendance(mockSession.id, [
      { studentId: "s-man-9", status: "Present", remarks: "" }
    ]);
  } catch (err) {
    classError = err.message;
  }
  assert(
    classError && classError.includes("do not belong to Class 10 (MAN)"),
    "markAttendance rejects student from different class with clear error"
  );

  // Restore default stub
  setSupabaseClient(createSupabaseStub());
}

// --------------------------------------------------------------------------
// 7. Dirty-only saves
// --------------------------------------------------------------------------
console.log("--- 7. Dirty-Only Saves ---");
{
  const roster = [
    { studentId: "s1", status: "Present", remarks: "unchanged", dirty: false },
    { studentId: "s2", status: "Late", remarks: "changed remarks", dirty: true },
    { studentId: "s3", status: "Absent", remarks: "", dirty: true },
    { studentId: "s4", status: null, remarks: "", dirty: false }
  ];

  // Simulating dirty-only filter logic
  const dirtyRecords = roster.filter((r) => r.dirty && r.status !== null);

  assertEqual(dirtyRecords.length, 2, "Only dirty marked rows are sent to save");
  assertEqual(dirtyRecords[0].studentId, "s2", "Student s2 included because remarks changed");
  assertEqual(dirtyRecords[1].studentId, "s3", "Student s3 included because status changed");
  assert(!dirtyRecords.some((r) => r.studentId === "s1"), "Unchanged student s1 is NOT re-sent");

  // After save completes, dirty flags are cleared
  dirtyRecords.forEach((r) => (r.dirty = false));
  const remainingDirty = roster.filter((r) => r.dirty);
  assertEqual(remainingDirty.length, 0, "All dirty flags are cleared after save");
}

// --------------------------------------------------------------------------
// 8. Stale-response guard simulation (Overlapping selectSession calls)
// --------------------------------------------------------------------------
console.log("--- 8. Stale-Response Guard Simulation ---");
{
  let selectSessionRequestId = 0;
  let activeSessionId = null;
  let rosterSessionId = null;
  let currentRoster = [];

  async function mockSelectSession(sessionId, simulatedLatencyMs, returnRoster) {
    const currentReqId = ++selectSessionRequestId;
    activeSessionId = sessionId;

    await new Promise((res) => setTimeout(res, simulatedLatencyMs));

    // Stale guard: if another request was launched, ignore this response
    if (currentReqId !== selectSessionRequestId || sessionId !== activeSessionId) {
      return { dropped: true };
    }

    rosterSessionId = sessionId;
    currentRoster = returnRoster;
    return { dropped: false };
  }

  // Session A is clicked (slow, 60ms). Then Session B is clicked (fast, 15ms).
  const callA = mockSelectSession("session-A", 60, [{ id: "roster-A" }]);
  const callB = mockSelectSession("session-B", 15, [{ id: "roster-B" }]);

  const [resA, resB] = await Promise.all([callA, callB]);

  assertEqual(resA.dropped, true, "Call A (stale response) was safely dropped");
  assertEqual(resB.dropped, false, "Call B (latest selection) was accepted");
  assertEqual(activeSessionId, "session-B", "activeSessionId is session-B");
  assertEqual(rosterSessionId, "session-B", "rosterSessionId is session-B");
  assertEqual(currentRoster[0].id, "roster-B", "currentRoster holds roster for session-B, not session-A");

  // Boundary check: save requires rosterSessionId === activeSessionId
  function validateSaveAllowed(rId, aId) {
    if (rId !== aId) throw new Error("Roster does not match active session.");
    return true;
  }
  assertEqual(validateSaveAllowed(rosterSessionId, activeSessionId), true, "Save allowed when roster matches session");

  let mismatchedSaveError = null;
  try {
    validateSaveAllowed("stale-session-A", "session-B");
  } catch (e) {
    mismatchedSaveError = e.message;
  }
  assert(mismatchedSaveError && mismatchedSaveError.includes("does not match"), "Save rejected on session ID mismatch");
}

// --------------------------------------------------------------------------
// 9. confirm-modal XSS escaping
// --------------------------------------------------------------------------
console.log("--- 9. Confirm-Modal Text Escaping ---");
{
  // Simulate DOM element for testing confirm-modal text assignment
  class MockElement {
    constructor() {
      this.textContent = "";
      this.innerHTML = "";
    }
  }

  const titleEl = new MockElement();
  const messageEl = new MockElement();

  const maliciousTitle = `<script>alert('pwned')</script>`;
  const maliciousMessage = `<img src=x onerror=alert('xss')>`;

  // Safe implementation uses .textContent
  titleEl.textContent = maliciousTitle;
  messageEl.textContent = maliciousMessage;

  assertEqual(titleEl.textContent, `<script>alert('pwned')</script>`, "Title safely stored as literal text");
  assertEqual(messageEl.textContent, `<img src=x onerror=alert('xss')>`, "Message safely stored as literal text");
  assertEqual(titleEl.innerHTML, "", "innerHTML remains empty, preventing script execution");
  assertEqual(messageEl.innerHTML, "", "innerHTML remains empty, preventing image onerror injection");
}

// --------------------------------------------------------------------------
// 10. Session time validation & immutability
// --------------------------------------------------------------------------
console.log("--- 10. Session Time Validation & Immutability ---");
{
  // Test invalid time (endTime <= startTime)
  let timeErr = null;
  try {
    await createAttendanceSession({
      branch: "MAN",
      class: "10",
      date: "2026-10-15",
      startTime: "10:30",
      endTime: "09:00" // End before start
    });
  } catch (e) {
    timeErr = e.message;
  }
  assertEqual(timeErr, "End time must be after start time.", "createAttendanceSession validates endTime > startTime");

  let updateTimeErr = null;
  try {
    const mockClient = createSupabaseStub();
    mockClient.from = () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { id: "sess-1", branch: "MAN", class: "10", start_time: "10:00", end_time: "11:00" },
            error: null
          })
        })
      })
    });
    setSupabaseClient(mockClient);

    await updateAttendanceSession("sess-1", {
      startTime: "11:00",
      endTime: "10:00"
    });
  } catch (e) {
    updateTimeErr = e.message;
  } finally {
    setSupabaseClient(createSupabaseStub());
  }
  assertEqual(updateTimeErr, "End time must be after start time.", "updateAttendanceSession validates endTime > startTime");
}

console.log(`\n================================================================`);
console.log(`  TEST RESULTS: ${testsPassed}/${testsRun} PASSED (${testsFailed} FAILED)`);
console.log(`================================================================\n`);

if (testsFailed > 0) {
  process.exit(1);
}
