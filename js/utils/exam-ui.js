// ==========================================================================
// EXAM UI UTILITIES — Shared helpers for both admin-exams.js and student-exams.js
// Fixes #10 (getExamTypeBadge duplicated) and #11 (escapeHtml duplicated)
// ==========================================================================

/**
 * Escape a string for safe HTML insertion.
 * @param {string|null|undefined} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Returns a styled HTML badge string for a given exam type.
 * @param {string} type
 * @returns {string}
 */
export function getExamTypeBadge(type) {
  switch (type) {
    case "Onam Exam":
      return '<span class="badge badge-warning" style="background:#FEF3C7; color:#B45309; border:1px solid #FCD34D;">🌾 Onam Exam</span>';
    case "Christmas Exam":
      return '<span class="badge badge-primary" style="background:#ECFDF5; color:#047857; border:1px solid #6EE7B7;">🎄 Christmas Exam</span>';
    case "Final Exam":
      return '<span class="badge badge-primary" style="background:#EEF2FF; color:#4338CA; border:1px solid #C7D2FE;">🏆 Final Exam</span>';
    case "Unit Test":
      return '<span class="badge badge-primary" style="background:#F0F9FF; color:#0369A1; border:1px solid #BAE6FD;">📝 Unit Test</span>';
    case "Model Exam":
      return '<span class="badge badge-primary" style="background:#FAF5FF; color:#7E22CE; border:1px solid #E9D5FF;">🎯 Model Exam</span>';
    case "Class Test":
      return '<span class="badge" style="background:#FDF2F8; color:#BE185D; border:1px solid #FBCFE8;">📚 Class Test</span>';
    case "Special Assessment":
      return '<span class="badge" style="background:#FFFBEB; color:#B45309; border:1px solid #FDE68A;">⭐ Special Assessment</span>';
    default:
      return `<span class="badge badge-ghost">${escapeHtml(type || "Assessment")}</span>`;
  }
}
