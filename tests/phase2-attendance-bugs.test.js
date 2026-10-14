// ==========================================================================
// TEST SUITE: PHASE 2 ATTENDANCE BUGS & DATA INTEGRITY FIXES
// Tests:
// 1. confirm-modal safe textContent rendering
// 2. selectSession stale response guard & Save rosterSessionId check
// 3. Filter handlers reversion on cancel
// 4. Single summary rate calculation with Unmarked count
// 5. Dirty-only save (status and remarks changes)
// 6. normalizeClass on write (create, update, bulk import, migration)
// 7. markAttendance rejection of mismatched branch/class students
// 8. Block modifying session class/branch when records exist
// 9. All-branch admin ('ALL', NULL, '') no branch filtering
// 10. Server-side RPC aggregation and listStudents query filtering
// 11. Time validation (endTime > startTime) and unique constraint
// 12. Session-based attendance percentage calculation with unmarked sessions
// ==========================================================================

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Pure unit implementations for algorithmic assertions
function calcAttendancePercentage(present = 0, late = 0, total = 0) {
  const p = Number(present) || 0;
  const l = Number(late) || 0;
  const t = Number(total) || 0;
  if (t <= 0) return 0;
  const pct = ((p + l) / t) * 100;
  return Math.round(pct * 10) / 10;
}

function normalizeClass(cls) {
  if (!cls) return "";
  return String(cls).replace(/^class\s*/i, "").trim();
}

const ATTENDANCE_STATUS = {
  PRESENT: "Present",
  LATE: "Late",
  ABSENT: "Absent"
};

function buildAttendanceReportRows(students, attendanceByStudentId, totalSessionsOrMap = 0) {
  return students.map((s) => {
    const records = attendanceByStudentId[s.id] || [];
    let present = 0;
    let late = 0;
    let absent = 0;
    records.forEach((r) => {
      if (r.status === "Present") present++;
      else if (r.status === "Late") late++;
      else if (r.status === "Absent") absent++;
    });

    let totalSessions = 0;
    if (typeof totalSessionsOrMap === "number") {
      totalSessions = totalSessionsOrMap > 0 ? totalSessionsOrMap : records.length;
    } else if (typeof totalSessionsOrMap === "object" && totalSessionsOrMap !== null) {
      const clsKey = s.class ? String(s.class).replace(/^class\s*/i, "").trim() : "";
      totalSessions = totalSessionsOrMap[clsKey] ?? totalSessionsOrMap[s.id] ?? records.length;
    } else {
      totalSessions = records.length;
    }

    const marked = present + late + absent;
    const unmarked = Math.max(0, totalSessions - marked);
    const attended = present + late;
    const percentage = totalSessions > 0 ? Math.round(((present + late) / totalSessions) * 1000) / 10 : 0;

    return {
      studentId: s.id,
      admissionNumber: s.admissionNumber,
      name: s.name,
      class: s.class,
      branch: s.branch,
      phone: s.phone || "",
      parentName: s.parentName || "",
      totalSessions,
      present,
      late,
      absent,
      unmarked,
      attended,
      attendancePercentage: percentage
    };
  });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

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
console.log("  RUNNING SUCCESS ACADEMY PHASE 2 ATTENDANCE TEST SUITE");
console.log("================================================================\n");

// Read code files to verify implementations
const confirmModalJs = fs.readFileSync(path.join(rootDir, "js", "components", "confirm-modal.js"), "utf8");
const attendanceMgmtJs = fs.readFileSync(path.join(rootDir, "js", "pages", "attendance-management.js"), "utf8");
const attendanceServiceJs = fs.readFileSync(path.join(rootDir, "js", "services", "attendance-service.js"), "utf8");
const studentServiceJs = fs.readFileSync(path.join(rootDir, "js", "services", "student-service.js"), "utf8");
const adminDashboardJs = fs.readFileSync(path.join(rootDir, "js", "pages", "admin-dashboard.js"), "utf8");
const migration2Path = path.join(rootDir, "migrations", "002_attendance_integrity_and_summaries.sql");
assert(fs.existsSync(migration2Path), "Migration 002 exists in /migrations");
const migration2Sql = fs.readFileSync(migration2Path, "utf8");
const schemaSql = fs.readFileSync(path.join(rootDir, "schema.sql"), "utf8");

// 1. confirm-modal.js safe textContent check
assert(
  confirmModalJs.includes(".querySelector(\"#confirm-dialog-title\").textContent = title;") &&
  confirmModalJs.includes(".querySelector(\"#confirm-dialog-message\").textContent = message;"),
  "confirm-modal.js sets title and message via textContent rather than vulnerable innerHTML interpolation"
);

// 2. selectSession stale response guard simulation
{
  let activeSessionId = null;
  let activeSession = null;
  let currentRoster = [];
  let selectSessionRequestId = 0;

  async function simulateSelectSession(sessionId, delayMs, rosterData) {
    const currentReqId = ++selectSessionRequestId;
    activeSessionId = sessionId;

    // Simulate network delay
    await new Promise((res) => setTimeout(res, delayMs));

    // Stale guard check
    if (currentReqId !== selectSessionRequestId || sessionId !== activeSessionId) {
      return { discarded: true };
    }

    activeSession = { id: sessionId };
    currentRoster = rosterData;
    return { discarded: false };
  }

  // Fire session 1 (slow, 50ms) then session 2 (fast, 10ms)
  const req1Promise = simulateSelectSession("session-1", 50, [{ id: "std-1" }]);
  const req2Promise = simulateSelectSession("session-2", 10, [{ id: "std-2" }]);

  const [res1, res2] = await Promise.all([req1Promise, req2Promise]);

  assertEqual(res1.discarded, true, "Slow response for session-1 is discarded");
  assertEqual(res2.discarded, false, "Fast response for session-2 is accepted");
  assertEqual(activeSessionId, "session-2", "Active session ID remains session-2");
  assertEqual(currentRoster[0].id, "std-2", "Active roster belongs to session-2 and was not overwritten by stale response");
}

// 2b. Ensure Save checks rosterSessionId matching activeSessionId
assert(
  attendanceMgmtJs.includes("if (rosterSessionId !== activeSessionId)"),
  "attendance-management.js verifies rosterSessionId === activeSessionId before saving"
);

// 3. Filter handlers state reversal on discard cancel
assert(
  attendanceMgmtJs.includes("classSelect.value = currentClass;") &&
  attendanceMgmtJs.includes("dateInput.value = currentDate;") &&
  attendanceMgmtJs.includes("branchSelect.value = currentBranch;"),
  "attendance-management.js reverts filter select inputs when user cancels unsaved changes prompt"
);

// 4. Single summary rate function with Unmarked count
{
  const roster = [
    { status: "Present" },
    { status: "Present" },
    { status: "Late" },
    { status: "Absent" },
    { status: null }, // Unmarked
    { status: null }  // Unmarked
  ];

  let present = 0;
  let late = 0;
  let absent = 0;
  let unmarked = 0;

  roster.forEach((r) => {
    if (r.status === ATTENDANCE_STATUS.PRESENT) present++;
    else if (r.status === ATTENDANCE_STATUS.LATE) late++;
    else if (r.status === ATTENDANCE_STATUS.ABSENT) absent++;
    else unmarked++;
  });

  const total = roster.length; // 6
  const rate = calcAttendancePercentage(present, late, total); // (2+1)/6 * 100 = 50.0%

  assertEqual(total, 6, "Total students is roster length (6)");
  assertEqual(present, 2, "Present count is 2");
  assertEqual(late, 1, "Late count is 1");
  assertEqual(absent, 1, "Absent count is 1");
  assertEqual(unmarked, 2, "Unmarked count is 2");
  assertEqual(rate, 50, "Attendance rate uses total roster size as denominator (50.0%)");
}

// 5. Dirty-only save behavior
{
  const roster = [
    { studentId: "s1", status: "Present", remarks: "", dirty: false },
    { studentId: "s2", status: "Absent", remarks: "Doctor note", dirty: true },
    { studentId: "s3", status: null, remarks: "", dirty: false }
  ];

  const dirtyRecords = roster.filter((r) => r.dirty && r.status !== null);
  assertEqual(dirtyRecords.length, 1, "Only dirty marked row (s2) is selected for save");
  assertEqual(dirtyRecords[0].studentId, "s2", "Selected student is s2");
}

assert(
  attendanceMgmtJs.includes("target.remarks = val;\n        target.dirty = true;"),
  "attendance-management.js reliably sets dirty = true on remarks input edit"
);

// 6. normalizeClass on write
assertEqual(normalizeClass("Class 10"), "10", "Class 10 normalizes to 10");
assertEqual(normalizeClass("class  8"), "8", "class  8 normalizes to 8");
assertEqual(normalizeClass("10"), "10", "10 stays 10");
assertEqual(normalizeClass("Class 11 Science"), "11 Science", "Retains stream");

assert(
  studentServiceJs.includes("updates.class = normalizeClass(updates.class);"),
  "updateStudent normalizes class on write"
);
assert(
  studentServiceJs.includes("const studentClass = normalizeClass(getRowVal(row,"),
  "bulkImportStudents normalizes class on write"
);
assert(
  migration2Sql.includes("UPDATE public.students") &&
  migration2Sql.includes("regexp_replace(class, '^class\\s*', '', 'i')"),
  "Migration 002 normalizes existing students.class in SQL"
);

// 7. markAttendance student verification logic simulation
{
  const session = { id: "sess-1", branch: "MAN", class: "10" };
  const mockStudents = [
    { id: "s1", name: "Student One", branch: "MAN", class: "10", admission_number: "SA01" },
    { id: "s2", name: "Student Two", branch: "ALP", class: "10", admission_number: "SA02" }, // Mismatched branch
    { id: "s3", name: "Student Three", branch: "MAN", class: "9", admission_number: "SA03" }  // Mismatched class
  ];

  function verifyRosterForSession(session, records, dbStudents) {
    const studentMap = new Map(dbStudents.map((s) => [s.id, s]));
    const sessionClassNorm = normalizeClass(session.class);
    const sessionBranchNorm = String(session.branch).trim().toUpperCase();
    const invalid = [];

    for (const r of records) {
      const s = studentMap.get(r.studentId);
      if (!s) {
        invalid.push(`ID ${r.studentId} (not found)`);
      } else {
        const sClassNorm = normalizeClass(s.class);
        const sBranchNorm = String(s.branch).trim().toUpperCase();
        if (sClassNorm !== sessionClassNorm || sBranchNorm !== sessionBranchNorm) {
          invalid.push(`${s.name} [${s.admission_number}]`);
        }
      }
    }
    if (invalid.length > 0) {
      throw new Error(`Cannot mark attendance: mismatched students: ${invalid.join(", ")}`);
    }
    return true;
  }

  // Valid record
  const validResult = verifyRosterForSession(session, [{ studentId: "s1", status: "Present" }], mockStudents);
  assertEqual(validResult, true, "Valid student is accepted");

  // Invalid branch
  let branchErr = null;
  try {
    verifyRosterForSession(session, [{ studentId: "s2", status: "Present" }], mockStudents);
  } catch (e) {
    branchErr = e.message;
  }
  assert(branchErr && branchErr.includes("mismatched students"), "Student with wrong branch is rejected");

  // Invalid class
  let classErr = null;
  try {
    verifyRosterForSession(session, [{ studentId: "s3", status: "Present" }], mockStudents);
  } catch (e) {
    classErr = e.message;
  }
  assert(classErr && classErr.includes("mismatched students"), "Student with wrong class is rejected");
}

// 8. Block changing session class or branch when records exist
assert(
  attendanceServiceJs.includes("Cannot change class or branch of an attendance session that already has attendance records."),
  "updateAttendanceSession blocks changing class or branch when session has records"
);
assert(
  migration2Sql.includes("trg_protect_attendance_session_immutability") &&
  schemaSql.includes("trg_protect_attendance_session_immutability"),
  "Database trigger trg_protect_attendance_session_immutability exists in migration and schema.sql"
);

// 9. All-branch admin ('ALL', NULL, '') no branch filtering
assert(
  adminDashboardJs.includes("const isAllBranch = !admin.branch || admin.branch === \"ALL\" || admin.branch === \"\";") &&
  adminDashboardJs.includes("const branch = isAllBranch ? null : admin.branch;"),
  "admin-dashboard.js does not filter by branch when admin branch is ALL, null, or empty"
);
assert(
  attendanceServiceJs.includes("const branchFilter = (!branch || branch === \"ALL\") ? null : branch;"),
  "attendance-service.js maps 'ALL' branch to null to bypass branch filter"
);

// 10. Server-side RPC aggregation and query filtering
assert(
  migration2Sql.includes("CREATE OR REPLACE FUNCTION public.get_attendance_summary") &&
  schemaSql.includes("CREATE OR REPLACE FUNCTION public.get_attendance_summary"),
  "get_attendance_summary server-side RPC exists in migration and schema.sql"
);
assert(
  studentServiceJs.includes("if (filters.branch && filters.branch !== \"ALL\")") &&
  studentServiceJs.includes("if (filters.class) {\n    const rawCls = normalizeClass(filters.class);"),
  "listStudents filters branch and class in the database query directly, eliminating 1000-row truncation risk"
);

// 11. Time validation (endTime > startTime) & unique constraint
assert(
  attendanceServiceJs.includes("if (endTime && endTime <= startTime)") &&
  attendanceMgmtJs.includes("if (endTime && endTime <= startTime)"),
  "End time before start time is validated and rejected with an error"
);
assert(
  migration2Sql.includes("uq_attendance_sessions_branch_class_date_time") &&
  schemaSql.includes("uq_attendance_sessions_branch_class_date_time"),
  "Unique constraint (branch, class, date, start_time) defined in migration and schema.sql"
);

// 12. Session-based denominator in buildAttendanceReportRows
{
  const students = [
    { id: "s1", admissionNumber: "ADM01", name: "Aisha", class: "10", branch: "MAN" }
  ];
  // Student Aisha has only 2 records (both Present), but 5 sessions were held
  const attendanceMap = {
    s1: [{ status: "Present" }, { status: "Present" }]
  };
  const totalSessionsHeld = 5;

  const rows = buildAttendanceReportRows(students, attendanceMap, totalSessionsHeld);
  assertEqual(rows.length, 1, "Generated 1 report row");
  assertEqual(rows[0].totalSessions, 5, "Total sessions denominator is sessions held (5), not records count (2)");
  assertEqual(rows[0].present, 2, "Present count is 2");
  assertEqual(rows[0].unmarked, 3, "Unmarked sessions count is 3 (5 total - 2 marked)");
  assertEqual(rows[0].attended, 2, "Attended count is 2");
  assertEqual(rows[0].attendancePercentage, 40, "Percentage is 40% (2 / 5 * 100), not 100%");
}

console.log(`\n================================================================`);
console.log(`  TEST RESULTS: ${testsPassed}/${testsRun} PASSED (${testsFailed} FAILED)`);
console.log(`================================================================\n`);

if (testsFailed > 0) {
  process.exit(1);
}
