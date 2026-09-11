// ==========================================================================
// SUBJECT SERVICE — Class-specific Subject Lists
// Updated to official curriculum standards
// ==========================================================================

export function getSubjectsForClass(studentClass) {
  const cls = String(studentClass || "").trim().toLowerCase();

  // Class 11 Science & Class 12 Science
  if (cls.includes("science")) {
    return [
      "English",
      "Physics",
      "Chemistry",
      "Biology",
      "Arabic",
      "Malayalam",
      "Hindi",
      "Maths"
    ];
  }

  // Class 11 Commerce & Class 12 Commerce
  if (cls.includes("commerce")) {
    return [
      "English",
      "Accountancy",
      "Economics",
      "Business Studies",
      "Arabic",
      "Malayalam",
      "Hindi",
      "Maths",
      "Computer Application",
      "Political Science"
    ];
  }

  // Extract class number or Roman numeral
  // Handles: "8", "Class 8", "8th", "Class 8th", "8-A", "8 A", "std 8", "VIII", "Class VIII"
  const digitMatch = cls.match(/\b(12|11|10|9|8|7|6|5)\b/) || cls.match(/(12|11|10|9|8|7|6|5)/);
  let clsNum = digitMatch ? parseInt(digitMatch[1], 10) : null;

  if (!clsNum) {
    if (cls.includes("xii")) clsNum = 12;
    else if (cls.includes("xi")) clsNum = 11;
    else if (cls.includes("viii")) clsNum = 8;
    else if (cls.includes("vii")) clsNum = 7;
    else if (cls.includes("vi")) clsNum = 6;
    else if (cls.includes("ix")) clsNum = 9;
    else if (cls.includes("x")) clsNum = 10;
    else if (cls.includes("v")) clsNum = 5;
  }

  // Class 10
  if (clsNum === 10 || cls.includes("10")) {
    return [
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
  }

  // Class 9
  if (clsNum === 9 || cls.includes("9")) {
    return [
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
  }

  // Class 8
  if (clsNum === 8 || cls.includes("8")) {
    return [
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
  }

  // Class 7
  if (clsNum === 7 || cls.includes("7")) {
    return [
      "English",
      "Malayalam I",
      "Malayalam II",
      "Social Science",
      "Basic Science",
      "Arabic",
      "Maths",
      "Hindi"
    ];
  }

  // Class 6
  if (clsNum === 6 || cls.includes("6")) {
    return [
      "English",
      "Malayalam I",
      "Malayalam II",
      "Social Science",
      "Basic Science",
      "Arabic",
      "Maths",
      "Hindi"
    ];
  }

  // Class 5 (and default fallback)
  return [
    "English",
    "Malayalam I",
    "Malayalam II",
    "Social Science",
    "Basic Science",
    "Arabic",
    "Maths",
    "Hindi"
  ];
}

/**
 * Returns the student's customized enrolled subjects if set, or all class subjects as fallback.
 * Automatically reconciles legacy curriculum subjects (e.g. Basic Science -> Physics, Chemistry, Biology)
 * and guarantees that all required curriculum subjects are available.
 */
export function getStudentEffectiveSubjects(student) {
  if (!student) return getSubjectsForClass("");
  const classSubjects = getSubjectsForClass(student.class);

  let subs = student.subjects;
  if (typeof subs === "string") {
    try {
      subs = JSON.parse(subs);
    } catch (e) {
      subs = subs.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }

  // If no enrolled subjects configured, return the full class curriculum
  if (!Array.isArray(subs) || subs.length === 0) {
    return classSubjects;
  }

  // Upgrade legacy subjects: if saved subjects contains "Basic Science" and class now has separate sciences
  if (subs.includes("Basic Science") && classSubjects.includes("Physics")) {
    subs = subs.filter((s) => s !== "Basic Science");
    ["Physics", "Chemistry", "Biology"].forEach((s) => {
      if (classSubjects.includes(s) && !subs.includes(s)) {
        subs.push(s);
      }
    });
  }

  // Filter out any subjects that do not exist in the official class curriculum (e.g. Arabic in Class 8)
  let validSubs = subs.filter((s) => classSubjects.includes(s));

  // If filtering resulted in an empty list, return the entire class curriculum
  if (validSubs.length === 0) {
    return classSubjects;
  }

  // For classes where all subjects are core (such as Class 8), or for any core class subject
  // that was newly added to the curriculum, ensure it is present in the student's effective list
  const optionalElectives = ["Arabic", "Urdu", "Sanskrit", "Computer Application", "Political Science"];
  classSubjects.forEach((s) => {
    // If not an optional language/elective, it is mandatory curriculum
    if (!optionalElectives.includes(s) && !validSubs.includes(s)) {
      validSubs.push(s);
    }
  });

  // Preserve the official curriculum sequence
  return classSubjects.filter((s) => validSubs.includes(s));
}
