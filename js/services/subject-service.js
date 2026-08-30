// ==========================================================================
// SUBJECT SERVICE — Class-specific Subject Lists
// ==========================================================================

export function getSubjectsForClass(studentClass) {
  const clsStr = String(studentClass || "").trim().toLowerCase();
  const clsNum = parseInt(clsStr, 10);

  // Class 10
  if (clsStr.includes("10") || clsNum === 10) {
    return [
      "History",
      "Geography",
      "Hindi",
      "English",
      "Maths",
      "Physics",
      "Biology",
      "Chemistry",
      "Arabic",
      "Malayalam I",
      "Malayalam II"
    ];
  }

  // Class 9
  if (clsStr.includes("9") || clsNum === 9) {
    return [
      "History",
      "Geography",
      "Hindi",
      "English",
      "Maths",
      "Physics",
      "Biology",
      "Chemistry",
      "Arabic",
      "Malayalam I",
      "Malayalam II"
    ];
  }

  // Class 8
  if (clsStr.includes("8") || clsNum === 8) {
    return [
      "Social Sciences",
      "Hindi",
      "English",
      "Maths",
      "Physics",
      "Biology",
      "Chemistry",
      "Arabic",
      "Malayalam I",
      "Malayalam II"
    ];
  }

  // Class 5, 6, 7
  if (clsNum === 5 || clsNum === 6 || clsNum === 7 || clsStr.includes("5") || clsStr.includes("6") || clsStr.includes("7")) {
    return [
      "Social Science",
      "Hindi",
      "English",
      "Maths",
      "Basic Science",
      "Arabic",
      "Malayalam I",
      "Malayalam II"
    ];
  }

  // Class 11 & 12 Science
  if (clsStr.includes("11 science") || clsStr.includes("12 science")) {
    return [
      "Physics",
      "Chemistry",
      "Biology",
      "Maths",
      "English",
      "Computer Science",
      "Arabic",
      "Malayalam I",
      "Malayalam II"
    ];
  }

  // Class 11 & 12 Commerce
  if (clsStr.includes("11 commerce") || clsStr.includes("12 commerce")) {
    return [
      "Accountancy",
      "Business Studies",
      "Economics",
      "Maths",
      "English",
      "Computer Application",
      "Arabic",
      "Malayalam I",
      "Malayalam II"
    ];
  }

  // Default / Fallback for Class 3, 4, etc.
  return [
    "Social Science",
    "Hindi",
    "English",
    "Maths",
    "Basic Science",
    "Arabic",
    "Malayalam I",
    "Malayalam II"
  ];
}
