// ==========================================================================
// SUPABASE CONFIGURATION
// SUCCESS Learning Log — replace SUPABASE_URL and SUPABASE_ANON_KEY with
// your Supabase project credentials (Project Settings → API).
// ==========================================================================

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

export const SUPABASE_URL = "https://gsfwxqkbdrmvuvpqcllw.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_ix1qvKAccJd2-M8lDLah6g_W-f3phW9";

// Initialize Supabase Client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

// Database table name constants
export const TABLES = {
  STUDENTS: "students",
  STUDY_LOGS: "study_logs",
  USERS: "users",
  BRANCHES: "branches",
  CLASSES: "classes",
  SUBJECTS: "subjects",
  ACADEMIC_YEARS: "academic_years"
};

// Backwards compatibility alias for COLLECTIONS
export const COLLECTIONS = TABLES;
