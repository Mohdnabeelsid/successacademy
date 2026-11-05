// ==========================================================================
// FEE SERVICE — SUPABASE
// Handles fee schedules, fee payments (admission & monthly),
// payment recording (cash/upi), automated payment dates,
// student history, and 5th-of-month alert verification.
// ==========================================================================

import { TABLES, supabase } from "../config/supabase-config.js";
import { toSnakeCase, toCamelCase } from "./supabase-service.js";
import { getISTTodayIso, getAcademicYear } from "../utils/date-time.js";

export const ADMISSION_FEE_AMOUNT = 1000;

export const DEFAULT_MONTHLY_FEES = {
  "5": 700,
  "6": 750,
  "7": 800,
  "8": 850,
  "9": 900,
  "10": 1000,
  "11": 1400,
  "12": 1400
};

export const PAYMENT_METHODS = {
  CASH: "cash",
  UPI: "upi"
};

export const FEE_TYPES = {
  ADMISSION: "admission",
  MONTHLY: "monthly"
};

/**
 * Normalizes class string to a standard fee key ("5" - "12").
 * @param {string} studentClass 
 * @returns {string}
 */
export function normalizeClassForFee(studentClass) {
  const str = String(studentClass || "").trim().toLowerCase();
  const match = str.match(/\b(12|11|10|9|8|7|6|5)\b/) || str.match(/(12|11|10|9|8|7|6|5)/);
  if (match) return match[1];
  if (str.includes("xii")) return "12";
  if (str.includes("xi")) return "11";
  if (str.includes("x")) return "10";
  if (str.includes("ix")) return "9";
  if (str.includes("viii")) return "8";
  if (str.includes("vii")) return "7";
  if (str.includes("vi")) return "6";
  if (str.includes("v")) return "5";
  return str;
}

/**
 * Computes standard monthly fee for a given class name.
 * @param {string} studentClass
 * @returns {number}
 */
export function getMonthlyFeeForClass(studentClass) {
  const norm = normalizeClassForFee(studentClass);
  return DEFAULT_MONTHLY_FEES[norm] || 0;
}

/**
 * Loads fee schedule from database or returns defaults.
 * @returns {Promise<Array<{class: string, monthlyFee: number}>>}
 */
export async function loadFeeSchedule() {
  try {
    const { data, error } = await supabase
      .from(TABLES.FEE_SCHEDULE)
      .select("*")
      .order("class", { ascending: true });

    if (!error && Array.isArray(data) && data.length > 0) {
      return data.map(toCamelCase);
    }
  } catch (err) {
    console.warn("Could not load fee_schedule from DB, using defaults:", err);
  }

  return Object.entries(DEFAULT_MONTHLY_FEES).map(([cls, fee]) => ({
    class: cls,
    monthlyFee: fee
  }));
}

/**
 * Validates and records a fee payment.
 * Automatically assigns payment_date to today (IST) if not provided.
 * @param {Object} payment
 * @param {string} payment.studentId
 * @param {'admission'|'monthly'} payment.feeType
 * @param {number} [payment.amount]
 * @param {'cash'|'upi'} payment.paymentMethod
 * @param {string} [payment.paymentDate] - YYYY-MM-DD
 * @param {string} [payment.monthYear] - YYYY-MM (required for monthly)
 * @param {string} [payment.branch]
 * @param {string} [payment.academicYear]
 * @param {string} [payment.remarks]
 * @param {string} [payment.recordedBy]
 * @returns {Promise<Object>} Created payment record
 */
export async function recordPayment(payment) {
  if (!payment?.studentId) {
    throw new Error("Student ID is required to record a payment.");
  }

  const feeType = (payment.feeType || "").toLowerCase();
  if (feeType !== FEE_TYPES.ADMISSION && feeType !== FEE_TYPES.MONTHLY) {
    throw new Error("Invalid fee type. Must be 'admission' or 'monthly'.");
  }

  const method = (payment.paymentMethod || "").toLowerCase();
  if (method !== PAYMENT_METHODS.CASH && method !== PAYMENT_METHODS.UPI) {
    throw new Error("Please select a valid payment method: Cash or UPI.");
  }

  let amount = Number(payment.amount);
  if (feeType === FEE_TYPES.ADMISSION && (!amount || amount <= 0)) {
    amount = ADMISSION_FEE_AMOUNT;
  }
  if (!amount || amount <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }

  let monthYear = null;
  if (feeType === FEE_TYPES.MONTHLY) {
    if (!payment.monthYear || !/^\d{4}-(0[1-9]|1[0-2])$/.test(payment.monthYear)) {
      throw new Error("A valid month (YYYY-MM) is required for monthly fees.");
    }
    monthYear = payment.monthYear;
  }

  const paymentDate = payment.paymentDate || getISTTodayIso();
  const academicYear = payment.academicYear || getAcademicYear();
  const branch = (payment.branch || "MAN").toUpperCase();

  const payload = toSnakeCase({
    studentId: payment.studentId,
    feeType,
    amount,
    paymentMethod: method,
    paymentDate,
    monthYear,
    academicYear,
    branch,
    remarks: payment.remarks || "",
    recordedBy: payment.recordedBy || null
  });

  const { data, error } = await supabase
    .from(TABLES.FEE_PAYMENTS)
    .insert([payload])
    .select()
    .single();

  if (error) {
    if (error.code === "23505" || error.message?.includes("uq_fee_payments")) {
      if (feeType === FEE_TYPES.ADMISSION) {
        throw new Error("Admission fee has already been recorded for this student.");
      } else {
        throw new Error(`Monthly fee for ${monthYear} has already been recorded for this student.`);
      }
    }
    throw new Error(error.message || "Failed to record payment.");
  }

  return toCamelCase(data);
}

/**
 * Fetches all fee payments for a specific student.
 * @param {string} studentId
 * @returns {Promise<Array>}
 */
export async function getStudentPayments(studentId) {
  if (!studentId) return [];

  const { data, error } = await supabase
    .from(TABLES.FEE_PAYMENTS)
    .select("*")
    .eq("student_id", studentId)
    .order("payment_date", { ascending: false });

  if (error) {
    console.error("Error fetching student payments:", error);
    throw new Error(error.message);
  }

  return (data || []).map(toCamelCase);
}

/**
 * Fetches fee payments for admin view with optional filters.
 * @param {Object} filters
 * @param {string} [filters.branch]
 * @param {string} [filters.feeType]
 * @param {string} [filters.monthYear]
 * @param {string} [filters.paymentMethod]
 * @param {string} [filters.studentId]
 * @param {number} [filters.limit]
 * @returns {Promise<Array>}
 */
export async function getAllPayments(filters = {}) {
  let query = supabase
    .from(TABLES.FEE_PAYMENTS)
    .select("*, students:student_id(id, name, admission_number, class, branch)")
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (filters.branch && filters.branch !== "ALL") {
    query = query.eq("branch", filters.branch);
  }
  if (filters.feeType && filters.feeType !== "all") {
    query = query.eq("fee_type", filters.feeType);
  }
  if (filters.monthYear && filters.monthYear !== "all") {
    query = query.eq("month_year", filters.monthYear);
  }
  if (filters.paymentMethod && filters.paymentMethod !== "all") {
    query = query.eq("payment_method", filters.paymentMethod);
  }
  if (filters.studentId) {
    query = query.eq("student_id", filters.studentId);
  }
  if (filters.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Error fetching fee payments:", error);
    throw new Error(error.message);
  }

  return (data || []).map((row) => {
    const item = toCamelCase(row);
    if (row.students) {
      item.student = toCamelCase(row.students);
    }
    return item;
  });
}

/**
 * Deletes a fee payment record by ID (Admin only).
 * @param {string} id
 */
export async function deletePayment(id) {
  if (!id) throw new Error("Payment ID is required.");
  const { error } = await supabase.from(TABLES.FEE_PAYMENTS).delete().eq("id", id);
  if (error) throw new Error(error.message);
  return true;
}

/**
 * Returns fee payment status for a student, including whether the monthly fee alert is active.
 * Alert rule: current date is strictly after 5th of current month (i.e. day >= 6)
 * and student has NOT paid the monthly fee for the current month.
 * 
 * @param {string} studentId
 * @param {string} studentClass
 * @param {Date} [currentDate] - optional date for testing/time shifts
 * @returns {Promise<{
 *   admissionPaid: boolean,
 *   admissionPayment: Object|null,
 *   currentMonthKey: string,
 *   currentMonthPaid: boolean,
 *   currentMonthPayment: Object|null,
 *   expectedMonthlyFee: number,
 *   shouldAlert: boolean,
 *   daysPastDue: number,
 *   allPayments: Array
 * }>}
 */
export async function getStudentFeeStatus(studentId, studentClass, currentDate = new Date()) {
  const payments = await getStudentPayments(studentId);

  const admissionPayment = payments.find((p) => p.feeType === FEE_TYPES.ADMISSION) || null;
  const admissionPaid = Boolean(admissionPayment);

  const year = currentDate.getFullYear();
  const monthNum = String(currentDate.getMonth() + 1).padStart(2, "0");
  const currentMonthKey = `${year}-${monthNum}`;
  const dayOfMonth = currentDate.getDate();

  const currentMonthPayment = payments.find(
    (p) => p.feeType === FEE_TYPES.MONTHLY && p.monthYear === currentMonthKey
  ) || null;
  const currentMonthPaid = Boolean(currentMonthPayment);

  const expectedMonthlyFee = getMonthlyFeeForClass(studentClass);

  // Alert condition: day > 5 AND monthly fee not paid for current month
  const shouldAlert = dayOfMonth > 5 && !currentMonthPaid;
  const daysPastDue = dayOfMonth > 5 && !currentMonthPaid ? dayOfMonth - 5 : 0;

  return {
    admissionPaid,
    admissionPayment,
    currentMonthKey,
    currentMonthPaid,
    currentMonthPayment,
    expectedMonthlyFee,
    shouldAlert,
    daysPastDue,
    allPayments: payments
  };
}

/**
 * Formats a monthYear key (e.g. "2026-11") to human readable "November 2026".
 * @param {string} monthYear 
 * @returns {string}
 */
export function formatMonthYear(monthYear) {
  if (!monthYear || !monthYear.includes("-")) return monthYear || "—";
  const [y, m] = monthYear.split("-");
  const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

