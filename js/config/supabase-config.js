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
  const store = {};

  const createQueryBuilder = (tableName) => {
    let filters = [];
    let orderCol = null;
    let orderAsc = true;
    let limitVal = null;

    const builder = {
      select: () => builder,
      insert: () => builder,
      update: () => builder,
      delete: () => builder,
      upsert: () => builder,
      eq: (col, val) => {
        filters.push((row) => row[col] === val);
        return builder;
      },
      neq: (col, val) => {
        filters.push((row) => row[col] !== val);
        return builder;
      },
      gt: (col, val) => {
        filters.push((row) => row[col] > val);
        return builder;
      },
      gte: (col, val) => {
        filters.push((row) => row[col] >= val);
        return builder;
      },
      lt: (col, val) => {
        filters.push((row) => row[col] < val);
        return builder;
      },
      lte: (col, val) => {
        filters.push((row) => row[col] <= val);
        return builder;
      },
      in: (col, vals) => {
        filters.push((row) => Array.isArray(vals) && vals.includes(row[col]));
        return builder;
      },
      order: (col, opts = {}) => {
        orderCol = col;
        orderAsc = opts?.ascending !== false;
        return builder;
      },
      limit: (n) => {
        limitVal = n;
        return builder;
      },
      single: async () => {
        const rows = execute();
        return { data: rows[0] || null, error: null };
      },
      maybeSingle: async () => {
        const rows = execute();
        return { data: rows[0] || null, error: null };
      },
      then: (resolve) => {
        const rows = execute();
        return resolve({ data: rows, error: null });
      }
    };

    function execute() {
      let rows = store[tableName] ? [...store[tableName]] : [];
      for (const f of filters) {
        rows = rows.filter(f);
      }
      if (orderCol) {
        rows.sort((a, b) => {
          const valA = a[orderCol];
          const valB = b[orderCol];
          if (valA === valB) return 0;
          const cmp = valA > valB ? 1 : -1;
          return orderAsc ? cmp : -cmp;
        });
      }
      if (limitVal !== null) {
        rows = rows.slice(0, limitVal);
      }
      return rows;
    }

    return builder;
  };

  return {
    seed: (tableName, rows) => {
      store[tableName] = Array.isArray(rows) ? rows.map((r) => ({ ...r })) : [];
    },
    from: (table) => createQueryBuilder(table),
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
  ACADEMIC_YEARS: "academic_years",
  FEE_SCHEDULE: "fee_schedule",
  FEE_PAYMENTS: "fee_payments",
  TEACHERS: "teachers",
  CLASS_LOGS: "class_logs",
  TIMETABLE_ENTRIES: "timetable_entries",
  NEXTGEN_SESSIONS: "nextgen_sessions",
  NEXTGEN_ATTENDEES: "nextgen_attendees"
};

// Backwards compatibility alias for COLLECTIONS
export const COLLECTIONS = TABLES;
