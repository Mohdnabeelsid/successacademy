// ==========================================================================
// SUPABASE CONFIGURATION
// SUCCESS Learning Log — replace SUPABASE_URL and SUPABASE_ANON_KEY with
// your Supabase project credentials (Project Settings → API).
// ==========================================================================

export const SUPABASE_URL = "https://gsfwxqkbdrmvuvpqcllw.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_ix1qvKAccJd2-M8lDLah6g_W-f3phW9";

/**
 * Creates an in-memory stub for Node.js / offline test environments.
 */
export function createSupabaseStub() {
  const createQueryBuilder = () => {
    const builder = {
      select: () => builder,
      insert: () => builder,
      update: () => builder,
      delete: () => builder,
      upsert: () => builder,
      eq: () => builder,
      neq: () => builder,
      gt: () => builder,
      gte: () => builder,
      lt: () => builder,
      lte: () => builder,
      in: () => builder,
      order: () => builder,
      limit: () => builder,
      single: async () => ({ data: null, error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
      then: (resolve) => resolve({ data: [], error: null })
    };
    return builder;
  };

  return {
    from: () => createQueryBuilder(),
    rpc: async () => ({ data: null, error: null }),
    auth: {
      signUp: async () => ({ data: { user: { id: "test-uid" } }, error: null }),
      signInWithPassword: async () => ({ data: { user: { id: "test-uid" } }, error: null }),
      getUser: async () => ({ data: { user: null }, error: null }),
      signOut: async () => ({ error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
    }
  };
}

let _createClient = null;
let _supabase = null;

// Browser environment uses native ESM CDN import; Node / test environment uses offline stub
if (typeof window !== "undefined") {
  const mod = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
  _createClient = mod.createClient;
  _supabase = _createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
} else {
  _createClient = () => createSupabaseStub();
  _supabase = createSupabaseStub();
}

// Initialize Supabase Client (injectable for unit tests)
export let supabase = _supabase;

/**
 * Allows test suites to inject a mock or stub Supabase client.
 * @param {Object} client
 */
export function setSupabaseClient(client) {
  supabase = client;
}

export { _createClient as createClient };

// Database table name constants
export const TABLES = {
  STUDENTS: "students",
  STUDY_LOGS: "study_logs",
  EXAMS: "exams",
  EXAM_MARKS: "exam_marks",
  ATTENDANCE_SESSIONS: "attendance_sessions",
  ATTENDANCE_RECORDS: "attendance_records",
  USERS: "users",
  BRANCHES: "branches",
  CLASSES: "classes",
  SUBJECTS: "subjects",
  ACADEMIC_YEARS: "academic_years"
};

// Backwards compatibility alias for COLLECTIONS
export const COLLECTIONS = TABLES;
