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
    if (error.message.includes("User already registered") || error.message.includes("already exists")) {
      throw new Error(`The login account "${email}" already exists in Supabase Auth. Please remove this email from Supabase Dashboard (Authentication → Users) before creating this student again.`);
    }
    if (error.message.includes("rate limit") || error.status === 429 || error.code === "over_email_send_rate_limit") {
      throw new Error(`Supabase Email Rate Limit Exceeded. Please turn OFF 'Confirm email' in Supabase Dashboard (Authentication ➔ Providers ➔ Email ➔ Confirm email = OFF) to allow instant student imports.`);
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

  // 1. Check if a student with this admission number already exists
  const existingDocs = await getRowsWhere(TABLES.STUDENTS, "admissionNumber", "==", admissionNumber);
  if (existingDocs.length > 0) {
    throw new Error(`A student with admission number "${admissionNumber}" already exists in the database.`);
  }

  const password = studentData.password || randomPassword();
  const email = admissionNumberToEmail(admissionNumber);

  // 2. Create secondary Auth user
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

export async function bulkImportStudents(rows, defaultBranch = "MAN") {
  const results = { success: 0, failed: [] };
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const name = getRowVal(row, ["name", "Name", "Student Name", "NAME", "StudentName"]);
      const admissionNumber = getRowVal(row, ["admissionNumber", "Admission Number", "ADMISSION NUMBER", "Admission No", "AdmissionNo", "admission_number"]);
      const studentClass = getRowVal(row, ["class", "Class", "CLASS", "Grade"]);
      const branch = getRowVal(row, ["branch", "Branch", "BRANCH"]) || defaultBranch || "MAN";
      const phone = getRowVal(row, ["phone", "Phone", "PHONE", "Phone Number", "Mobile"]);
      const parentName = getRowVal(row, ["parentName", "Parent Name", "PARENT NAME", "ParentName", "Guardian Name"]);

      if (!admissionNumber) {
        throw new Error(`Row ${i + 1}: Missing or invalid Admission Number.`);
      }
      if (!name) {
        throw new Error(`Row ${i + 1}: Missing student Name for Admission No "${admissionNumber}".`);
      }
      if (!studentClass) {
        throw new Error(`Row ${i + 1}: Missing Class for student "${name}".`);
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

      // Small delay between signups to avoid rate limiting
      if (i < rows.length - 1) {
        await new Promise((res) => setTimeout(res, 200));
      }
    } catch (err) {
      results.failed.push({ row, error: err.message });
      // If we hit email rate limit, stop the loop immediately so the error message is displayed
      if (err.message.includes("Confirm email") || err.message.includes("Rate Limit")) {
        break;
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
