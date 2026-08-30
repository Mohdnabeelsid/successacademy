// ==========================================================================
// AUTH SERVICE — SUPABASE
// Admins sign in with email + password (standard Supabase Auth).
// Students sign in with Admission Number + password — internally mapped to
// a synthetic email (admissionNumber@students.successacademy.app).
// ==========================================================================

import { supabase, TABLES } from "../config/supabase-config.js";

const STUDENT_EMAIL_DOMAIN = "students.successacademy.app";

export function admissionNumberToEmail(admissionNumber) {
  return `${admissionNumber.trim().toLowerCase()}@${STUDENT_EMAIL_DOMAIN}`;
}

export function parseAuthError(err) {
  if (!err) return "An unexpected error occurred. Please try again.";
  const msg = (err.message || "").toLowerCase();
  if (msg.includes("invalid login credentials") || msg.includes("invalid credentials")) {
    return "Invalid email or password. Please verify your credentials or ensure the account has been created in Supabase.";
  }
  if (msg.includes("email not confirmed")) {
    return "Email address has not been confirmed.";
  }
  if (msg.includes("too many requests")) {
    return "Too many failed login attempts. Please wait a few minutes and try again.";
  }
  return err.message || "Sign in failed. Please try again.";
}

/** Get admin user profile from /users table */
export async function getUserProfile(uid) {
  const { data, error } = await supabase
    .from(TABLES.USERS)
    .select("*")
    .eq("id", uid)
    .maybeSingle();

  if (error) {
    console.error("Error fetching user profile:", error);
    return null;
  }
  return data ? { id: data.id, role: data.role, name: data.name, branch: data.branch, email: data.email } : null;
}

/** Get student profile from /students table */
export async function getStudentByUid(uid) {
  const { data, error } = await supabase
    .from(TABLES.STUDENTS)
    .select("*")
    .eq("uid", uid)
    .maybeSingle();

  if (error) {
    console.error("Error fetching student profile:", error);
    return null;
  }
  if (!data) return null;
  return {
    id: data.id,
    uid: data.uid,
    admissionNumber: data.admission_number,
    name: data.name,
    class: data.class,
    branch: data.branch,
    phone: data.phone,
    parentName: data.parent_name,
    email: data.email,
    loginDisabled: data.login_disabled
  };
}

/** Sign in an admin using email + password. Verifies role === 'admin' in /users. */
export async function adminLogin(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password
  });

  if (error) throw new Error(parseAuthError(error));

  const uid = data.user.id;
  const profile = await getUserProfile(uid);

  if (!profile || profile.role !== "admin") {
    await supabase.auth.signOut();
    throw new Error("This account is not authorized for admin access.");
  }

  return { uid, ...profile };
}

/** Sign in a student using Admission Number + password. */
export async function studentLogin(admissionNumber, password) {
  const email = admissionNumberToEmail(admissionNumber);
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) throw new Error("Invalid admission number or password.");

  const uid = data.user.id;
  const student = await getStudentByUid(uid);

  if (!student) {
    await supabase.auth.signOut();
    throw new Error("No student record found for this account. Contact your branch admin.");
  }

  if (student.loginDisabled) {
    await supabase.auth.signOut();
    throw new Error("This account has been disabled. Contact your branch admin.");
  }

  return { uid, ...student };
}

export function logout() {
  sessionStorage.removeItem("success_user_admin");
  sessionStorage.removeItem("success_user_student");
  return supabase.auth.signOut();
}

/** Subscribe to auth state changes */
export function onAuthChange(callback) {
  const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
    callback(session ? session.user : null);
  });
  return () => listener.subscription.unsubscribe();
}

/** Guard a page: redirects if not authenticated as the required role. */
export function requireAuth(requiredRole, loginPath) {
  return new Promise((resolve) => {
    const cacheKey = `success_user_${requiredRole}`;

    // Attempt instant resolution from session storage cache
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        resolve(parsed);
      } catch (err) {
        console.warn("Failed to parse cached auth state", err);
      }
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session || !session.user) {
        sessionStorage.removeItem(cacheKey);
        window.location.href = loginPath;
        return;
      }

      try {
        let profile;
        const uid = session.user.id;

        if (requiredRole === "admin") {
          profile = await getUserProfile(uid);
          if (!profile || profile.role !== "admin") {
            sessionStorage.removeItem(cacheKey);
            window.location.href = loginPath;
            return;
          }
          profile = { uid, ...profile };
        } else {
          profile = await getStudentByUid(uid);
          if (!profile || profile.loginDisabled) {
            sessionStorage.removeItem(cacheKey);
            window.location.href = loginPath;
            return;
          }
          profile = { uid, ...profile };
        }

        sessionStorage.setItem(cacheKey, JSON.stringify(profile));
        resolve(profile);
      } catch (e) {
        console.error("Auth guard error:", e);
        sessionStorage.removeItem(cacheKey);
        window.location.href = loginPath;
      }
    });
  });
}

export async function changeOwnPassword(currentPassword, newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
}
