// ==========================================================================
// STUDENT SERVICE — SUPABASE
// Handles student CRUD, credential generation (admission no + password),
// login enable/disable, and bulk Excel import.
// ==========================================================================

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY, TABLES } from "../config/supabase-config.js";
import { admissionNumberToEmail } from "./auth-service.js";
import {
  createRow,
  updateRowById,
  deleteRowById,
  getAllRows,
  getRowsWhere,
  getRowById
} from "./supabase-service.js";

function randomPassword(len = 8) {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function getSecondaryClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function createAuthUserSecondary(email, password) {
  const secondaryClient = getSecondaryClient();
  const { data, error } = await secondaryClient.auth.signUp({
    email,
    password
  });

  if (error) {
    // If account already exists in Supabase Auth, attempt recovery by signing in
    if (error.message.includes("User already registered") || error.message.includes("already exists")) {
      const { data: signInData, error: signInErr } = await secondaryClient.auth.signInWithPassword({
        email,
        password
      });
      if (!signInErr && signInData?.user) {
        return signInData.user.id;
      }
      throw new Error(`The login account "${email}" already exists in Supabase Auth. Please remove this email from Supabase Dashboard (Authentication → Users) or check credentials.`);
    }

    if (error.message.includes("rate limit") || error.status === 429 || error.code === "over_email_send_rate_limit") {
      throw new Error(`Supabase Email Rate Limit Exceeded. Please turn OFF 'Confirm email' in Supabase Dashboard (Authentication ➔ Providers ➔ Email ➔ Confirm email = OFF).`);
    }
    throw error;
  }

  if (!data.user) {
    throw new Error("Failed to register user in Supabase Authentication.");
  }
  return data.user.id;
}

/** Create a student record + Supabase Auth login in one step. */
export async function createStudentWithCredentials(studentData) {
  const admissionNumber = String(studentData.admissionNumber || "").trim();
  const name = String(studentData.name || "").trim();
  const studentClass = String(studentData.class || "").trim();

  if (!admissionNumber) throw new Error("Admission number is required.");
  if (!name) throw new Error("Student name is required.");
  if (!studentClass) throw new Error("Class is required.");

  // 1. Check if a student with this admission number already exists in database
  const existingDocs = await getRowsWhere(TABLES.STUDENTS, "admissionNumber", "==", admissionNumber);
  if (existingDocs.length > 0) {
    throw new Error(`A student with admission number "${admissionNumber}" already exists in the database.`);
  }

  const password = studentData.password || randomPassword();
  const email = admissionNumberToEmail(admissionNumber);

  // 2. Create secondary Auth user (or reuse existing Auth account)
  const uid = await createAuthUserSecondary(email, password);

  // 3. Insert student record into Supabase table
  const id = await createRow(TABLES.STUDENTS, {
    admissionNumber,
    name,
    class: studentClass,
    branch: studentData.branch || "MAN",
    phone: studentData.phone || "",
    parentName: studentData.parentName || "",
    password,
    uid,
    email,
    loginDisabled: false
  });

  return { id, uid, admissionNumber, password };
}

export async function listStudents(filters = {}) {
  let students = await getAllRows(TABLES.STUDENTS, { orderByField: "name", direction: "asc" });
  if (filters.branch) students = students.filter((s) => s.branch === filters.branch);
  if (filters.class) students = students.filter((s) => s.class === filters.class);
  if (filters.search) {
    const q = filters.search.toLowerCase();
    students = students.filter(
      (s) =>
        s.name?.toLowerCase().includes(q) ||
        s.admissionNumber?.toLowerCase().includes(q) ||
        s.phone?.includes(q)
    );
  }
  return students;
}

export async function getStudent(id) {
  return getRowById(TABLES.STUDENTS, id);
}

export async function updateStudent(id, data) {
  return updateRowById(TABLES.STUDENTS, id, data);
}

export async function deleteStudent(id) {
  return deleteRowById(TABLES.STUDENTS, id);
}

export async function toggleLogin(id, disabled) {
  return updateRowById(TABLES.STUDENTS, id, { loginDisabled: disabled });
}

/** Generates & stores a new random password for a student. */
export async function resetStudentPassword(studentId) {
  const student = await getStudent(studentId);
  if (!student) throw new Error("Student not found.");
  const newPassword = randomPassword();

  await updateRowById(TABLES.STUDENTS, studentId, {
    password: newPassword,
    pendingPasswordReset: newPassword,
    pendingPasswordResetAt: new Date().toISOString()
  });

  return newPassword;
}

function getRowVal(row, keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== "") {
      return String(row[k]).trim();
    }
  }
  return "";
}

export async function bulkImportStudents(rows, defaultBranch = "MAN", onProgress = null) {
  const results = { total: rows.length, success: 0, skipped: 0, failed: [] };
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const name = getRowVal(row, ["name", "Name", "Student Name", "NAME", "StudentName"]);
    const admissionNumber = getRowVal(row, ["admissionNumber", "Admission Number", "ADMISSION NUMBER", "Admission No", "AdmissionNo", "admission_number"]);
    const studentClass = getRowVal(row, ["class", "Class", "CLASS", "Grade"]);
    const branch = getRowVal(row, ["branch", "Branch", "BRANCH"]) || defaultBranch || "MAN";
    const phone = getRowVal(row, ["phone", "Phone", "PHONE", "Phone Number", "Mobile"]);
    const parentName = getRowVal(row, ["parentName", "Parent Name", "PARENT NAME", "ParentName", "Guardian Name"]);

    if (onProgress) {
      onProgress({
        current: i + 1,
        total: rows.length,
        percent: Math.round(((i + 1) / rows.length) * 100),
        currentStudent: name || admissionNumber || `Row ${i + 1}`
      });
    }

    try {
      if (!admissionNumber) {
        throw new Error("Missing or invalid Admission Number.");
      }
      if (!name) {
        throw new Error("Missing student Name.");
      }
      if (!studentClass) {
        throw new Error("Missing Class.");
      }

      await createStudentWithCredentials({
        name,
        admissionNumber,
        class: studentClass,
        branch,
        phone,
        parentName
      });
      results.success++;

      if (i < rows.length - 1) {
        await new Promise((res) => setTimeout(res, 100));
      }
    } catch (err) {
      if (err.message.includes("already exists in the database")) {
        results.skipped++;
      } else {
        results.failed.push({
          rowNum: i + 1,
          admissionNumber: admissionNumber || "—",
          name: name || "—",
          error: err.message
        });
      }
    }
  }
  return results;
}

export function excelTemplateRows() {
  return [
    { "Admission Number": "SA2026001", Name: "Student Name", Class: "8", Branch: "MAN", "Parent Name": "Parent Name", Phone: "9800000000" }
  ];
}
