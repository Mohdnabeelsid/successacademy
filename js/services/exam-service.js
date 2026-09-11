// ==========================================================================
// EXAM & ASSESSMENT SERVICE — SUPABASE
// Handles exam scheduling, marks recording (student & admin), grading,
// synchronization, and stats analytics.
// ==========================================================================

import { TABLES, supabase } from "../config/supabase-config.js";
import {
  createRow,
  updateRowById,
  deleteRowById,
  getAllRows,
  getRowsWhere,
  getRowById,
  toSnakeCase,
  toCamelCase
} from "./supabase-service.js";
import {
  getISTNowIsoTimestamp,
  getISTTodayIso,
  formatLogDate,
  format12Hour,
  getAcademicYear
} from "../utils/date-time.js";

export const EXAM_TYPES = [
  "Onam Exam",
  "Christmas Exam",
  "Final Exam",
  "Unit Test",
  "Model Exam",
  "Class Test",
  "Special Assessment"
];

export {
  DEFAULT_GRADE_CONFIG,
  validateMarks,
  generateGradeScale,
  calculateGrade,
  renderGradeBadge
} from "./grading-service.js";
import { calculateGrade } from "./grading-service.js";

/**
 * Calculates grade badge & label.
 * Supports both calcGrade(percentage) and calcGrade(obtainedMarks, totalMarks, options).
 * @param {number} arg1 - Percentage or obtained marks
 * @param {number} [arg2] - Total marks (if omitted, arg1 is treated as percentage out of 100)
 * @param {Object} [options]
 * @returns {{grade: string, label: string, colorClass: string, colorHex: string, gradePoint: number, passed: boolean}}
 */
export function calcGrade(arg1, arg2 = 100, options = {}) {
  // If only 1 argument is passed, arg1 is a percentage [0..100]
  const obtained = Number(arg1) || 0;
  const total = Number(arg2) || 100;
  return calculateGrade(obtained, total, options);
}

/**
 * List all exams with optional filters (class, branch, examType, search).
 */
export async function listExams(filters = {}) {
  let query = supabase.from(TABLES.EXAMS).select("*").order("exam_date", { ascending: false });

  if (filters.class) {
    const rawCls = String(filters.class).trim();
    const cleanCls = rawCls.replace(/^class\s*/i, "");
    const variants = Array.from(new Set([rawCls, cleanCls, `Class ${cleanCls}`]));
    query = query.in("class", variants);
  }
  if (filters.branch) query = query.eq("branch", filters.branch);
  if (filters.examType) query = query.eq("exam_type", filters.examType);
  if (filters.subject && filters.subject !== "All Subjects") query = query.eq("subject", filters.subject);

  const { data, error } = await query;
  if (error) {
    console.error("Error listing exams:", error);
    return [];
  }

  let list = (data || []).map(toCamelCase);
  if (filters.search) {
    const s = filters.search.toLowerCase();
    list = list.filter((e) =>
      (e.title && e.title.toLowerCase().includes(s)) ||
      (e.subject && e.subject.toLowerCase().includes(s)) ||
      (e.examType && e.examType.toLowerCase().includes(s))
    );
  }
  return list;
}

/**
 * Get a single exam by ID.
 */
export async function getExam(examId) {
  return getRowById(TABLES.EXAMS, examId);
}

/**
 * Create a new Exam.
 */
export async function createExam(examData) {
  const now = getISTNowIsoTimestamp();
  return createRow(TABLES.EXAMS, {
    title: examData.title,
    examType: examData.examType || "Onam Exam",
    class: String(examData.class),
    branch: examData.branch || "MAN",
    subject: examData.subject || "All Subjects",
    examDate: examData.examDate || getISTTodayIso(),
    startTime: examData.startTime || "",
    maxMarks: Number(examData.maxMarks) || 100,
    passingMarks: Number(examData.passingMarks) || 35,
    academicYear: examData.academicYear || getAcademicYear(examData.examDate),
    createdAt: now,
    updatedAt: now  // Fix #4: always set updated_at on creation
  });
}

/**
 * Create multiple exams in batch (e.g. multi-class, multi-subject scheduling).
 */
export async function createMultipleExams(examsList) {
  if (!examsList || !examsList.length) return [];
  const now = getISTNowIsoTimestamp();
  const rows = examsList.map((e) => ({
    title: e.title,
    exam_type: e.examType || "Onam Exam",
    class: String(e.class),
    branch: e.branch || "MAN",
    subject: e.subject || "All Subjects",
    exam_date: e.examDate || getISTTodayIso(),
    start_time: e.startTime || "",
    max_marks: Number(e.maxMarks) || 100,
    passing_marks: Number(e.passingMarks) || 35,
    academic_year: e.academicYear || getAcademicYear(e.examDate),
    created_at: now,
    updated_at: now
  }));

  const { data, error } = await supabase
    .from(TABLES.EXAMS)
    .insert(rows)
    .select();

  if (error) throw new Error(error.message);
  return (data || []).map(toCamelCase);
}

/**
 * Update an existing Exam.
 */
export async function updateExam(examId, examData) {
  return updateRowById(TABLES.EXAMS, examId, {
    ...examData,
    updatedAt: getISTNowIsoTimestamp()
  });
}

/**
 * Delete an Exam and all associated marks.
 */
export async function deleteExam(examId) {
  return deleteRowById(TABLES.EXAMS, examId);
}

/**
 * Retrieve all marks for a specific exam.
 */
export async function getExamMarksForExam(examId) {
  const { data, error } = await supabase
    .from(TABLES.EXAM_MARKS)
    .select("*")
    .eq("exam_id", examId);

  if (error) {
    console.error("Error getting exam marks:", error);
    return [];
  }
  return (data || []).map(toCamelCase);
}

/**
 * Retrieve all marks for a specific student.
 */
export async function getExamMarksForStudent(studentId) {
  const { data, error } = await supabase
    .from(TABLES.EXAM_MARKS)
    .select("*")
    .eq("student_id", studentId);

  if (error) {
    console.error("Error getting student exam marks:", error);
    return [];
  }
  return (data || []).map(toCamelCase);
}

/**
 * Upsert / Save a single student mark for an exam and subject.
 */
export async function upsertExamMark(examId, studentId, markData) {
  const isAbsent = Boolean(markData.isAbsent);
  const marksObtained = isAbsent ? null : (markData.marksObtained !== undefined && markData.marksObtained !== null && markData.marksObtained !== "" ? Number(markData.marksObtained) : null);
  const maxMarks = Number(markData.maxMarks) || 100;
  const subject = markData.subject || "";

  // Fix #5: server-side validation — marks cannot exceed maxMarks
  if (!isAbsent && marksObtained !== null && marksObtained > maxMarks) {
    throw new Error(`Marks obtained (${marksObtained}) cannot exceed maximum marks (${maxMarks}).`);
  }
  if (!isAbsent && marksObtained !== null && marksObtained < 0) {
    throw new Error(`Marks obtained cannot be negative.`);
  }

  const payload = {
    exam_id: examId,
    student_id: studentId,
    subject: subject,
    marks_obtained: marksObtained,
    max_marks: maxMarks,
    is_absent: isAbsent,
    remarks: markData.remarks || "",
    entered_by: markData.enteredBy || "student",
    updated_at: getISTNowIsoTimestamp()
  };

  const { data, error } = await supabase
    .from(TABLES.EXAM_MARKS)
    .upsert([payload], { onConflict: "exam_id, student_id, subject" })
    .select();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Bulk save / upsert student marks for an exam.
 */
export async function bulkSaveExamMarks(examId, marksList) {
  if (!marksList || marksList.length === 0) return;

  // Fix #5: server-side validation for all marks in bulk save
  for (const m of marksList) {
    if (!m.isAbsent && m.marksObtained !== null && m.marksObtained !== undefined && m.marksObtained !== "") {
      const obtained = Number(m.marksObtained);
      const max = Number(m.maxMarks) || 100;
      if (obtained > max) {
        throw new Error(`Marks for student exceed maximum (${obtained} > ${max}). Please review and correct.`);
      }
      if (obtained < 0) {
        throw new Error(`Marks cannot be negative.`);
      }
    }
  }

  const payloads = marksList.map((m) => ({
    exam_id: examId,
    student_id: m.studentId,
    subject: m.subject || "",
    marks_obtained: m.isAbsent ? null : (m.marksObtained !== null && m.marksObtained !== undefined && m.marksObtained !== "" ? Number(m.marksObtained) : null),
    max_marks: Number(m.maxMarks) || 100,
    is_absent: Boolean(m.isAbsent),
    remarks: m.remarks || "",
    entered_by: m.enteredBy || "admin",
    updated_at: getISTNowIsoTimestamp()
  }));

  const { error } = await supabase
    .from(TABLES.EXAM_MARKS)
    .upsert(payloads, { onConflict: "exam_id, student_id, subject" });

  if (error) throw new Error(error.message);
}

/**
 * Calculates statistics for an exam based on student marks list.
 */
export function calcClassExamStats(exam, marksList) {
  const passingMarks = Number(exam.passingMarks) || 35;
  const maxMarks = Number(exam.maxMarks) || 100;

  const validMarks = marksList.filter((m) => !m.isAbsent && m.marksObtained !== null && m.marksObtained !== undefined);
  const absentCount = marksList.filter((m) => m.isAbsent).length;

  if (validMarks.length === 0) {
    return {
      totalGraded: 0,
      absentCount,
      highest: "—",
      lowest: "—",
      average: "—",
      averagePct: "0",
      passedCount: 0,
      failedCount: 0,
      passPct: "0"
    };
  }

  const scores = validMarks.map((m) => Number(m.marksObtained));
  const highest = Math.max(...scores);
  const lowest = Math.min(...scores);
  const sum = scores.reduce((a, b) => a + b, 0);
  const avg = sum / scores.length;
  const avgPct = ((avg / maxMarks) * 100).toFixed(1);

  const passed = validMarks.filter((m) => Number(m.marksObtained) >= passingMarks).length;
  const failed = validMarks.length - passed;
  const passPct = ((passed / validMarks.length) * 100).toFixed(1);

  return {
    totalGraded: validMarks.length,
    absentCount,
    highest: highest.toFixed(1).replace(/\.0$/, ""),
    lowest: lowest.toFixed(1).replace(/\.0$/, ""),
    average: avg.toFixed(1).replace(/\.0$/, ""),
    averagePct: avgPct,
    passedCount: passed,
    failedCount: failed,
    passPct: passPct
  };
}
