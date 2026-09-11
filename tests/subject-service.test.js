// ==========================================================================
// AUTOMATED TEST SUITE: SUBJECT SERVICE & CURRICULUM RESOLUTION
// ==========================================================================

import {
  getSubjectsForClass,
  getStudentEffectiveSubjects
} from "../js/services/subject-service.js";

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
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr === expectedStr) {
    testsPassed++;
  } else {
    testsFailed++;
    console.error(`❌ FAIL: ${message}\n  Expected: ${expectedStr}\n  Got:      ${actualStr}`);
  }
}

console.log("================================================================");
console.log("  RUNNING SUCCESS ACADEMY SUBJECT SERVICE TEST SUITE");
console.log("================================================================\n");

// 1. Class 8 Subjects - Official Curriculum
const expectedClass8Subjects = [
  "English",
  "Malayalam I",
  "Malayalam II",
  "Social Science",
  "Physics",
  "Chemistry",
  "Biology",
  "Maths",
  "Hindi"
];

assertEqual(getSubjectsForClass("8"), expectedClass8Subjects, "Class 8 by string '8'");
assertEqual(getSubjectsForClass("Class 8"), expectedClass8Subjects, "Class 8 by 'Class 8'");
assertEqual(getSubjectsForClass("8th"), expectedClass8Subjects, "Class 8 by '8th'");
assertEqual(getSubjectsForClass("Class 8th"), expectedClass8Subjects, "Class 8 by 'Class 8th'");
assertEqual(getSubjectsForClass("VIII"), expectedClass8Subjects, "Class 8 by Roman 'VIII'");
assertEqual(getSubjectsForClass("Class VIII"), expectedClass8Subjects, "Class 8 by 'Class VIII'");
assertEqual(getSubjectsForClass("8 - MAN"), expectedClass8Subjects, "Class 8 with branch suffix '8 - MAN'");

// 2. Student Effective Subjects for Class 8 with no saved subjects
const studentEmpty = { id: "test-1", name: "Student 1", class: "8" };
assertEqual(
  getStudentEffectiveSubjects(studentEmpty),
  expectedClass8Subjects,
  "Class 8 student with no saved subjects returns all 9 subjects"
);

// 3. Student Effective Subjects for Class 8 with legacy saved subjects
// (contains old Basic Science and Arabic, missing Physics, Chemistry, Biology)
const studentLegacy = {
  id: "test-2",
  name: "Student 2",
  class: "8",
  subjects: [
    "English",
    "Malayalam I",
    "Malayalam II",
    "Social Science",
    "Basic Science",
    "Arabic",
    "Maths",
    "Hindi"
  ]
};

assertEqual(
  getStudentEffectiveSubjects(studentLegacy),
  expectedClass8Subjects,
  "Class 8 student with legacy saved subjects upgrades to all 9 subjects without Basic Science or Arabic"
);

// 4. Student with stringified JSON subjects
const studentJsonStr = {
  id: "test-3",
  name: "Student 3",
  class: "Class 8",
  subjects: JSON.stringify(["English", "Maths"])
};
assertEqual(
  getStudentEffectiveSubjects(studentJsonStr),
  expectedClass8Subjects,
  "Class 8 student with partial JSON string subjects retains full core subjects"
);

// 5. Class 10 subjects
const expectedClass10Subjects = [
  "English",
  "Malayalam I",
  "Malayalam II",
  "Social Science",
  "Physics",
  "Chemistry",
  "Biology",
  "Arabic",
  "Maths",
  "Hindi"
];
assertEqual(getSubjectsForClass("10"), expectedClass10Subjects, "Class 10 subjects");
assertEqual(getSubjectsForClass("Class 10"), expectedClass10Subjects, "Class 10 with prefix");
assertEqual(getSubjectsForClass("X"), expectedClass10Subjects, "Class 10 Roman numeral");

console.log(`\n================================================================`);
console.log(`  TEST RESULTS: ${testsPassed}/${testsRun} PASSED (${testsFailed} FAILED)`);
console.log(`================================================================\n`);
