// ==========================================================================
// AUTOMATED TEST SUITE: DYNAMIC EXAM GRADING ENGINE
// Tests: 80-mark scale, 20/25/40/50/100 marks scales, continuity/gaps,
// overlapping boundaries, decimal marks, validations, absence & edge cases.
// ==========================================================================

import {
  generateGradeScale,
  calculateGrade,
  validateMarks,
  DEFAULT_GRADE_CONFIG
} from "../js/services/grading-service.js";

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
console.log("  RUNNING SUCCESS ACADEMY DYNAMIC GRADING ENGINE TEST SUITE");
console.log("================================================================\n");

// -----------------------------------------------------------------------------
// TEST SUITE 1: 80-Mark Subject Exact Boundaries
// -----------------------------------------------------------------------------
console.log("--- Test Suite 1: 80-Mark Subject Explicit Boundaries ---");
const marks80Expected = [
  { mark: 80, grade: "A+" },
  { mark: 73, grade: "A+" },
  { mark: 72, grade: "A" },
  { mark: 65, grade: "A" },
  { mark: 64, grade: "B+" },
  { mark: 57, grade: "B+" },
  { mark: 56, grade: "B" },
  { mark: 49, grade: "B" },
  { mark: 48, grade: "C+" },
  { mark: 41, grade: "C+" },
  { mark: 40, grade: "C" },
  { mark: 33, grade: "C" },
  { mark: 32, grade: "D+" },
  { mark: 25, grade: "D+" },
  { mark: 24, grade: "D" },
  { mark: 17, grade: "D" },
  { mark: 16, grade: "E" },
  { mark: 9,  grade: "E" },
  { mark: 8,  grade: "F" },
  { mark: 0,  grade: "F" }
];

for (const { mark, grade } of marks80Expected) {
  const result = calculateGrade(mark, 80);
  assertEqual(result.grade, grade, `80-mark subject: mark ${mark} should be grade ${grade}`);
}

// -----------------------------------------------------------------------------
// TEST SUITE 2: Range Integrity & Disjoint Coverage (No Gaps, No Overlaps)
// -----------------------------------------------------------------------------
console.log("\n--- Test Suite 2: Range Integrity across Multiple Totals ---");
const testTotals = [20, 25, 40, 50, 80, 100, 150];

for (const total of testTotals) {
  const scale = generateGradeScale(total);
  assertEqual(scale.length, 10, `Scale for total ${total} should have exactly 10 grade bands`);

  // Verify top band max is total
  assertEqual(scale[0].maxMarks, total, `Scale top band maxMarks should equal total ${total}`);

  // Verify lowest band min is 0
  assertEqual(scale[scale.length - 1].minMarks, 0, `Scale bottom band minMarks should equal 0`);

  // Verify continuity and strictly no gaps / no overlaps across all adjacent bands
  for (let i = 0; i < scale.length - 1; i++) {
    const higherBand = scale[i];
    const lowerBand = scale[i + 1];
    assertEqual(
      higherBand.minMarks,
      lowerBand.maxMarks + 1,
      `Scale continuity at ${total}: ${higherBand.grade} minMarks (${higherBand.minMarks}) must equal ${lowerBand.grade} maxMarks + 1 (${lowerBand.maxMarks + 1})`
    );
  }

  // Verify that EVERY valid integer mark from 0 to total maps to EXACTLY one grade
  for (let m = 0; m <= total; m++) {
    const res = calculateGrade(m, total);
    assert(res.grade !== "Invalid" && res.grade !== "—", `Mark ${m} in total ${total} must map to a valid grade`);
    // Find matching band in scale
    const matchingBands = scale.filter((b) => m >= b.minMarks && m <= b.maxMarks);
    assertEqual(matchingBands.length, 1, `Mark ${m} in total ${total} must match exactly 1 band in scale`);
    assertEqual(res.grade, matchingBands[0].grade, `calculateGrade(${m}, ${total}) must match band grade`);
  }
}

// -----------------------------------------------------------------------------
// TEST SUITE 3: Minimum & Maximum Boundary Checks for 100, 50, 40, 25, 20
// -----------------------------------------------------------------------------
console.log("\n--- Test Suite 3: Boundary Min/Max Mapping for 100, 50, 40, 25, 20 ---");
for (const total of [100, 50, 40, 25, 20]) {
  const scale = generateGradeScale(total);
  for (const band of scale) {
    const minRes = calculateGrade(band.minMarks, total);
    const maxRes = calculateGrade(band.maxMarks, total);
    assertEqual(minRes.grade, band.grade, `Total ${total}: Min mark ${band.minMarks} should map to ${band.grade}`);
    assertEqual(maxRes.grade, band.grade, `Total ${total}: Max mark ${band.maxMarks} should map to ${band.grade}`);
  }
}

// -----------------------------------------------------------------------------
// TEST SUITE 4: Edge Cases & Validation Handling
// -----------------------------------------------------------------------------
console.log("\n--- Test Suite 4: Edge Cases & Input Validation ---");

// Case 1: Obtained marks = 0
const zeroResult = calculateGrade(0, 80);
assertEqual(zeroResult.grade, "F", "Mark 0 should result in F");
assertEqual(zeroResult.percentage, 0, "Mark 0 percentage should be 0%");

// Case 2: Obtained marks = maximum marks
const maxResult = calculateGrade(80, 80);
assertEqual(maxResult.grade, "A+", "Mark 80/80 should result in A+");
assertEqual(maxResult.percentage, 100, "Mark 80/80 percentage should be 100%");

// Case 3: Marks greater than maximum marks -> validation error
const overflowResult = calculateGrade(85, 80);
assertEqual(overflowResult.status, "Error", "Marks > max marks should produce Error status");
assertEqual(overflowResult.grade, "Invalid", "Marks > max marks should have Invalid grade");

// Case 4: Negative marks -> validation error
const negativeResult = calculateGrade(-5, 80);
assertEqual(negativeResult.status, "Error", "Negative marks should produce Error status");
assertEqual(negativeResult.grade, "Invalid", "Negative marks should have Invalid grade");

// Case 5: Decimal marks
const decimalResult1 = calculateGrade(72.5, 80);
assertEqual(decimalResult1.grade, "A+", "Decimal mark 72.5 out of 80 (90.6%) should be A+");
const decimalResult2 = calculateGrade(64.5, 80);
assertEqual(decimalResult2.grade, "A", "Decimal mark 64.5 out of 80 (80.6%) should be A");

// Case 6: Missing marks / empty string / null -> "Not Entered"
const nullResult = calculateGrade(null, 80);
assertEqual(nullResult.status, "Not Entered", "Null marks should return Not Entered status");
assertEqual(nullResult.grade, "—", "Null marks grade should be '—'");

const emptyResult = calculateGrade("", 80);
assertEqual(emptyResult.status, "Not Entered", "Empty marks should return Not Entered status");

// Case 7: Absent student -> Absent status separate from F
const absentResult = calculateGrade(0, 80, { isAbsent: true });
assertEqual(absentResult.status, "Absent", "Absent flag should return Absent status");
assertEqual(absentResult.grade, "Absent", "Absent student grade should be Absent, not F");
assertEqual(absentResult.passed, false, "Absent student passed should be false");

// Case 8: Independent Subject Calculations
const subMath = calculateGrade(68, 80);
assertEqual(subMath.percentage, 85, "Math 68/80 percentage should be 85%");
assertEqual(subMath.grade, "A", "Math 68/80 grade should be A");

const subScience = calculateGrade(92, 100);
assertEqual(subScience.percentage, 92, "Science 92/100 percentage should be 92%");
assertEqual(subScience.grade, "A+", "Science 92/100 grade should be A+");

const subEnglish = calculateGrade(34, 50);
assertEqual(subEnglish.percentage, 68, "English 34/50 percentage should be 68%");
assertEqual(subEnglish.grade, "B", "English 34/50 grade should be B");

const subSocial = calculateGrade(31, 40);
assertEqual(subSocial.percentage, 77.5, "Social 31/40 percentage should be 77.5%");
assertEqual(subSocial.grade, "B+", "Social 31/40 grade should be B+");

// -----------------------------------------------------------------------------
// SUMMARY & EXIT CODE
// -----------------------------------------------------------------------------
console.log("\n================================================================");
console.log(`  TEST RESULTS: ${testsPassed} / ${testsRun} PASSED (${testsFailed} FAILED)`);
console.log("================================================================\n");

if (testsFailed > 0) {
  process.exit(1);
} else {
  console.log("🎉 ALL TESTS PASSED SUCCESSFULLY!");
}
