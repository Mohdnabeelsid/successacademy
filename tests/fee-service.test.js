// ==========================================================================
// TEST SUITE: FEE SERVICE & FEES MODULE
// Tests:
// - Class monthly fee calculations (5: 700, 6: 750, ..., 11: 1400)
// - Admission fee = 1000
// - Validation of Cash / UPI payment methods
// - Automated payment date assignment
// - Student monthly fee alert condition (strictly after 5th of month if unpaid)
// - Payment recording and duplicate prevention
// ==========================================================================

import {
  normalizeClassForFee,
  getMonthlyFeeForClass,
  ADMISSION_FEE_AMOUNT,
  DEFAULT_MONTHLY_FEES,
  PAYMENT_METHODS,
  FEE_TYPES,
  formatMonthYear,
  recordPayment,
  getStudentFeeStatus
} from "../js/services/fee-service.js";

import { setSupabaseClient } from "../js/config/supabase-config.js";

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
console.log("  RUNNING SUCCESS ACADEMY FEES MODULE TEST SUITE");
console.log("================================================================\n");

// -----------------------------------------------------------------------------
// 1. Fee Schedule Rate Verification
// -----------------------------------------------------------------------------
console.log("--- 1. Monthly Fee Schedule by Class ---");

assertEqual(getMonthlyFeeForClass("5"), 700, "Class 5 fee should be 700");
assertEqual(getMonthlyFeeForClass("Class 5"), 700, "Class 5 with prefix fee should be 700");
assertEqual(getMonthlyFeeForClass("6"), 750, "Class 6 fee should be 750");
assertEqual(getMonthlyFeeForClass("Class 6"), 750, "Class 6 with prefix fee should be 750");
assertEqual(getMonthlyFeeForClass("7"), 800, "Class 7 fee should be 800");
assertEqual(getMonthlyFeeForClass("Class 7"), 800, "Class 7 with prefix fee should be 800");
assertEqual(getMonthlyFeeForClass("8"), 850, "Class 8 fee should be 850");
assertEqual(getMonthlyFeeForClass("Class 8"), 850, "Class 8 with prefix fee should be 850");
assertEqual(getMonthlyFeeForClass("9"), 900, "Class 9 fee should be 900");
assertEqual(getMonthlyFeeForClass("Class 9"), 900, "Class 9 with prefix fee should be 900");
assertEqual(getMonthlyFeeForClass("10"), 1000, "Class 10 fee should be 1000");
assertEqual(getMonthlyFeeForClass("Class 10"), 1000, "Class 10 with prefix fee should be 1000");
assertEqual(getMonthlyFeeForClass("11"), 1400, "Class 11 fee should be 1400");
assertEqual(getMonthlyFeeForClass("11 Commerce"), 1400, "Class 11 Commerce fee should be 1400");
assertEqual(getMonthlyFeeForClass("Class 11 Commerce"), 1400, "Class 11 Commerce prefixed fee should be 1400");
assertEqual(getMonthlyFeeForClass("11 Science"), 1400, "Class 11 Science fee should be 1400");
assertEqual(getMonthlyFeeForClass("12"), 1400, "Class 12 fee should be 1400");
assertEqual(getMonthlyFeeForClass("12 Commerce"), 1400, "Class 12 Commerce fee should be 1400");
assertEqual(getMonthlyFeeForClass("12 Science"), 1400, "Class 12 Science fee should be 1400");

assertEqual(ADMISSION_FEE_AMOUNT, 1000, "Standard admission fee should be 1000 rupees for every student");

// -----------------------------------------------------------------------------
// 2. Class Normalization
// -----------------------------------------------------------------------------
console.log("\n--- 2. Class Normalization ---");
assertEqual(normalizeClassForFee("10"), "10", "Normalizes '10'");
assertEqual(normalizeClassForFee("Class 10"), "10", "Normalizes 'Class 10'");
assertEqual(normalizeClassForFee("11 Commerce"), "11", "Normalizes '11 Commerce' to '11'");
assertEqual(normalizeClassForFee("11 Science"), "11", "Normalizes '11 Science' to '11'");
assertEqual(normalizeClassForFee("Class 8"), "8", "Normalizes 'Class 8'");
assertEqual(normalizeClassForFee("8th"), "8", "Normalizes '8th'");
assertEqual(normalizeClassForFee("VI"), "6", "Normalizes Roman numeral 'VI'");
assertEqual(normalizeClassForFee("X"), "10", "Normalizes Roman numeral 'X'");
assertEqual(normalizeClassForFee("XI"), "11", "Normalizes Roman numeral 'XI'");

// -----------------------------------------------------------------------------
// 3. Payment Validation (Cash / UPI / Types)
// -----------------------------------------------------------------------------
console.log("\n--- 3. Payment Method & Type Validation ---");

// Test validation without studentId
try {
  await recordPayment({});
  assert(false, "Should fail when studentId is missing");
} catch (e) {
  assert(e.message.includes("Student ID is required"), "Correctly rejects missing studentId");
}

// Test validation with invalid feeType
try {
  await recordPayment({ studentId: "s-1", feeType: "invalid_type", paymentMethod: "cash", amount: 1000 });
  assert(false, "Should fail with invalid feeType");
} catch (e) {
  assert(e.message.includes("Invalid fee type"), "Correctly rejects invalid feeType");
}

// Test validation with missing payment method
try {
  await recordPayment({ studentId: "s-1", feeType: "admission", paymentMethod: "crypto", amount: 1000 });
  assert(false, "Should fail with invalid paymentMethod");
} catch (e) {
  assert(e.message.includes("valid payment method: Cash or UPI"), "Correctly enforces Cash or UPI method");
}

// Test validation for monthly fee missing monthYear
try {
  await recordPayment({ studentId: "s-1", feeType: "monthly", paymentMethod: "cash", amount: 1000 });
  assert(false, "Should fail with missing monthYear for monthly fee");
} catch (e) {
  assert(e.message.includes("valid month (YYYY-MM) is required"), "Correctly requires YYYY-MM for monthly fees");
}

// -----------------------------------------------------------------------------
// 4. In-Memory Mock Store for Payment CRUD & Alert Rules
// -----------------------------------------------------------------------------
console.log("\n--- 4. Payment Recording & 5th-of-Month Alert Rules ---");

const paymentStore = [];

const mockSupabase = {
  from: (table) => {
    let currentData = [...paymentStore];
    let filters = [];

    const builder = {
      select: () => builder,
      insert: (rows) => {
        const row = rows[0];
        // Enforce admission uniqueness
        if (row.fee_type === "admission") {
          const exists = paymentStore.some((p) => p.student_id === row.student_id && p.fee_type === "admission");
          if (exists) {
            return {
              select: () => ({
                single: async () => ({
                  data: null,
                  error: { code: "23505", message: "uq_fee_payments_admission violation" }
                })
              })
            };
          }
        }
        // Enforce monthly uniqueness
        if (row.fee_type === "monthly") {
          const exists = paymentStore.some(
            (p) => p.student_id === row.student_id && p.fee_type === "monthly" && p.month_year === row.month_year
          );
          if (exists) {
            return {
              select: () => ({
                single: async () => ({
                  data: null,
                  error: { code: "23505", message: "uq_fee_payments_monthly violation" }
                })
              })
            };
          }
        }

        const newRow = { id: `pay-${paymentStore.length + 1}`, ...row, created_at: new Date().toISOString() };
        paymentStore.push(newRow);
        return {
          select: () => ({
            single: async () => ({ data: newRow, error: null })
          })
        };
      },
      eq: (col, val) => {
        filters.push((r) => r[col] === val);
        return builder;
      },
      order: () => builder,
      then: (resolve) => {
        const filtered = currentData.filter((r) => filters.every((f) => f(r)));
        resolve({ data: filtered, error: null });
      }
    };

    return builder;
  }
};

setSupabaseClient(mockSupabase);

// Record Admission Fee via UPI
const admPayment = await recordPayment({
  studentId: "student-101",
  feeType: "admission",
  amount: 1000,
  paymentMethod: "upi",
  branch: "MAN",
  remarks: "GPay payment"
});

assertEqual(admPayment.feeType, "admission", "Recorded admission fee");
assertEqual(admPayment.amount, 1000, "Admission fee amount recorded as 1000");
assertEqual(admPayment.paymentMethod, "upi", "Payment method recorded as UPI");
assert(Boolean(admPayment.paymentDate), "Payment date automatically populated");

// Duplicate admission fee should throw
try {
  await recordPayment({
    studentId: "student-101",
    feeType: "admission",
    amount: 1000,
    paymentMethod: "cash",
    branch: "MAN"
  });
  assert(false, "Should reject duplicate admission fee for same student");
} catch (err) {
  assert(err.message.includes("Admission fee has already been recorded"), "Correctly prevented duplicate admission fee");
}

// -----------------------------------------------------------------------------
// 5. Test 5th-of-Month Alert Logic
// -----------------------------------------------------------------------------
console.log("\n--- 5. 5th-of-Month Alert Rules ---");

// Date: 3rd of November 2026 (Before 5th, unpaid)
const statusNov3 = await getStudentFeeStatus("student-101", "10", new Date(2026, 10, 3));
assertEqual(statusNov3.admissionPaid, true, "Admission fee detected as paid");
assertEqual(statusNov3.currentMonthPaid, false, "November fee is not yet paid");
assertEqual(statusNov3.shouldAlert, false, "Before 5th of month (Nov 3): should NOT alert yet");

// Date: 5th of November 2026 (On 5th, unpaid)
const statusNov5 = await getStudentFeeStatus("student-101", "10", new Date(2026, 10, 5));
assertEqual(statusNov5.shouldAlert, false, "On 5th of month (Nov 5): should NOT alert yet");

// Date: 6th of November 2026 (After 5th, unpaid)
const statusNov6 = await getStudentFeeStatus("student-101", "10", new Date(2026, 10, 6));
assertEqual(statusNov6.shouldAlert, true, "After 5th of month (Nov 6): SHOULD alert student!");
assertEqual(statusNov6.daysPastDue, 1, "1 day past due");
assertEqual(statusNov6.expectedMonthlyFee, 1000, "Expected fee for Class 10 is 1000");

// Date: 12th of November 2026 (After 5th, unpaid)
const statusNov12 = await getStudentFeeStatus("student-101", "11 Commerce", new Date(2026, 10, 12));
assertEqual(statusNov12.shouldAlert, true, "After 5th of month (Nov 12): SHOULD alert student!");
assertEqual(statusNov12.daysPastDue, 7, "7 days past due");
assertEqual(statusNov12.expectedMonthlyFee, 1400, "Expected fee for Class 11 Commerce is 1400");

// Now record November monthly fee via Cash
const monthPayment = await recordPayment({
  studentId: "student-101",
  feeType: "monthly",
  amount: 1000,
  paymentMethod: "cash",
  monthYear: "2026-11",
  branch: "MAN",
  remarks: "Paid in cash at office"
});

assertEqual(monthPayment.feeType, "monthly", "Monthly payment recorded");
assertEqual(monthPayment.paymentMethod, "cash", "Cash payment recorded");
assertEqual(monthPayment.monthYear, "2026-11", "Month recorded as 2026-11");

// Now recheck on Nov 6 or Nov 12 with payment present
const statusNovAfterPaid = await getStudentFeeStatus("student-101", "10", new Date(2026, 10, 12));
assertEqual(statusNovAfterPaid.currentMonthPaid, true, "November fee is now detected as paid");
assertEqual(statusNovAfterPaid.shouldAlert, false, "Alert is CLEARED once current month fee is paid");

// Format test
assertEqual(formatMonthYear("2026-11"), "November 2026", "formatMonthYear produces 'November 2026'");

console.log("\n================================================================");
console.log(`  RESULTS: ${testsPassed} passed, ${testsFailed} failed out of ${testsRun} assertions`);
console.log("================================================================\n");

if (testsFailed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
