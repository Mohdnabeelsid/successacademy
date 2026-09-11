// ==========================================================================
// TEST SUITE: FRAME SERVICE & ADMISSION TEMPLATE ENGINE
// ==========================================================================

import {
  FRAME_CONFIG,
  getStudentAdmissionYear,
  formatStudentClass,
  formatStudentBranch
} from "../js/services/frame-service.js";

let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

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
console.log("  RUNNING SUCCESS ACADEMY FRAME SERVICE TEST SUITE");
console.log("================================================================\n");

// 1. Frame Dimension Checks
assertEqual(FRAME_CONFIG.width, 1080, "Canvas frame width must be 1080px");
assertEqual(FRAME_CONFIG.height, 1080, "Canvas frame height must be 1080px");

// 2. Official Brand Colors
assertEqual(FRAME_CONFIG.colors.primary, "#0FA15D", "Primary color must be Emerald Green #0FA15D");
assertEqual(FRAME_CONFIG.colors.secondary, "#1F7A78", "Secondary color must be Teal #1F7A78");
assertEqual(FRAME_CONFIG.colors.blue, "#2E4C8C", "Blue color must be Academic Blue #2E4C8C");
assertEqual(FRAME_CONFIG.colors.dark, "#071A17", "Dark color must be Deep Forest #071A17");
assertEqual(FRAME_CONFIG.colors.darkForestTeal, "#0E3B36", "Dark Forest Teal must be #0E3B36");
assertEqual(FRAME_CONFIG.colors.beige, "#D8C7AA", "Accent color must be Warm Beige #D8C7AA");
assertEqual(FRAME_CONFIG.colors.white, "#FFFFFF", "Foundation color must be White #FFFFFF");
assertEqual(FRAME_CONFIG.fonts.sans.includes("Montserrat"), true, "Typography must use Montserrat font family");

// 3. Class Formatting
assertEqual(formatStudentClass("10"), "Class 10", "Class 10 formatting");
assertEqual(formatStudentClass("Class 9"), "Class 9", "Class 9 already prefixed");
assertEqual(formatStudentClass("11 Science"), "Class 11 Science", "Plus One Science formatting");
assertEqual(formatStudentClass(""), "Classroom Journey", "Empty class fallback");
assertEqual(formatStudentClass(null), "Classroom Journey", "Null class fallback");

// 4. Branch Formatting (Only two branches: Alappuzha & Mannancherry)
assertEqual(formatStudentBranch("MAN"), "Mannancherry Campus", "MAN branch mapping to Mannancherry Campus");
assertEqual(formatStudentBranch("Mannancherry"), "Mannancherry Campus", "Mannancherry full name mapping");
assertEqual(formatStudentBranch("ALP"), "Alappuzha Campus", "ALP branch mapping to Alappuzha Campus");
assertEqual(formatStudentBranch("Alappuzha"), "Alappuzha Campus", "Alappuzha full name mapping");
assertEqual(formatStudentBranch(""), "Mannancherry Campus", "Empty branch default");

// 5. Admission Year Derivation
const s1 = { academicYear: "2026–2027" };
assertEqual(getStudentAdmissionYear(s1), "2026–2027", "Direct academicYear property");

const s2 = { admissionDate: "2026-05-15" };
assertEqual(getStudentAdmissionYear(s2), "2026–2027", "Derived from admissionDate");

const s3 = { createdAt: "2026-08-01T10:00:00Z" };
assertEqual(getStudentAdmissionYear(s3), "2026–2027", "Derived from createdAt timestamp");

const currentYr = new Date().getFullYear();
const s4 = {};
assertEqual(getStudentAdmissionYear(s4), `${currentYr}–${currentYr + 1}`, "Fallback to current academic year");

console.log("\n================================================================");
console.log(`  TEST RESULTS: ${testsPassed} / ${testsRun} PASSED (${testsFailed} FAILED)`);
console.log("================================================================\n");

if (testsFailed > 0) process.exit(1);
