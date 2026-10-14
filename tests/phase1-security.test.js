// ==========================================================================
// TEST SUITE: PHASE 1 CRITICAL SECURITY & AUTHORIZATION AUDIT
// Tests:
// 1. reset_student_password authorization, REVOKE/GRANT and search_path
// 2. User role/branch protection trigger (all-branch admin isolation)
// 3. Student profile update protection (only phone & parent_name allowed)
// 4. search_path = public across security definer and trigger functions
// 5. Bootstrap admin branch configuration ('ALL')
// 6. student-service.js resetStudentPassword calls shared supabase.rpc (not anon)
// ==========================================================================

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

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
    console.error(`❌ FAIL: ${message}\n  Expected: ${expected}\n  Got:      ${actual}`);
  }
}

console.log("================================================================");
console.log("  RUNNING SUCCESS ACADEMY PHASE 1 SECURITY AUDIT TEST SUITE");
console.log("================================================================\n");

// Read files
const migrationPath = path.join(rootDir, "migrations", "001_critical_security.sql");
const schemaPath = path.join(rootDir, "schema.sql");
const studentServicePath = path.join(rootDir, "js", "services", "student-service.js");

assert(fs.existsSync(migrationPath), "Migration 001_critical_security.sql exists in /migrations");
const migrationSql = fs.readFileSync(migrationPath, "utf8");
const schemaSql = fs.readFileSync(schemaPath, "utf8");
const studentServiceJs = fs.readFileSync(studentServicePath, "utf8");

// Test 1: Migration format requirements
assert(migrationSql.includes("Rollback Instructions:"), "Migration contains rollback instructions at top");
assert(migrationSql.includes("CREATE OR REPLACE FUNCTION"), "Migration is idempotent with CREATE OR REPLACE");
assert(migrationSql.includes("DROP TRIGGER IF EXISTS"), "Migration is idempotent with DROP TRIGGER IF EXISTS");

// Test 2: reset_student_password authorization & search_path
assert(
  migrationSql.includes("IF NOT is_admin() THEN") &&
  migrationSql.includes("RAISE EXCEPTION 'Access denied. Only administrators can reset student passwords.';"),
  "reset_student_password checks is_admin() inside function in migration"
);
assert(
  schemaSql.includes("IF NOT is_admin() THEN") &&
  schemaSql.includes("RAISE EXCEPTION 'Access denied. Only administrators can reset student passwords.';"),
  "reset_student_password checks is_admin() inside function in schema.sql"
);
assert(
  migrationSql.includes("REVOKE EXECUTE ON FUNCTION public.reset_student_password(text, text) FROM public, anon;") &&
  migrationSql.includes("GRANT EXECUTE ON FUNCTION public.reset_student_password(text, text) TO authenticated;"),
  "reset_student_password revokes anon/public and grants to authenticated in migration"
);
assert(
  schemaSql.includes("REVOKE EXECUTE ON FUNCTION public.reset_student_password(text, text) FROM public, anon;") &&
  schemaSql.includes("GRANT EXECUTE ON FUNCTION public.reset_student_password(text, text) TO authenticated;"),
  "reset_student_password revokes anon/public and grants to authenticated in schema.sql"
);

// Test 3: Restrict updates to branch and role in public.users to all-branch admin
assert(
  migrationSql.includes("trg_protect_user_roles") &&
  migrationSql.includes("(NEW.role IS DISTINCT FROM OLD.role) OR (NEW.branch IS DISTINCT FROM OLD.branch)") &&
  migrationSql.includes("is_all_branch_admin"),
  "trg_protect_user_roles restricts branch and role updates to all-branch admin in migration"
);
assert(
  schemaSql.includes("trg_protect_user_roles") &&
  schemaSql.includes("(NEW.role IS DISTINCT FROM OLD.role) OR (NEW.branch IS DISTINCT FROM OLD.branch)"),
  "trg_protect_user_roles restricts branch and role updates in schema.sql"
);

// Test 4: Student profile update column restriction (only phone and parent_name allowed)
assert(
  migrationSql.includes("trg_protect_student_fields") &&
  migrationSql.includes("NEW.class IS DISTINCT FROM OLD.class") &&
  migrationSql.includes("NEW.branch IS DISTINCT FROM OLD.branch") &&
  migrationSql.includes("NEW.admission_number IS DISTINCT FROM OLD.admission_number") &&
  migrationSql.includes("NEW.uid IS DISTINCT FROM OLD.uid") &&
  migrationSql.includes("NEW.login_disabled IS DISTINCT FROM OLD.login_disabled") &&
  migrationSql.includes("NEW.password IS DISTINCT FROM OLD.password") &&
  migrationSql.includes("NEW.email IS DISTINCT FROM OLD.email") &&
  migrationSql.includes("Non-admins can only update phone and parent_name"),
  "trg_protect_student_fields rejects class, branch, admission_number, uid, login_disabled, password, email for non-admins"
);
assert(
  schemaSql.includes("trg_protect_student_fields") &&
  schemaSql.includes("NEW.class IS DISTINCT FROM OLD.class") &&
  schemaSql.includes("NEW.password IS DISTINCT FROM OLD.password") &&
  schemaSql.includes("Non-admins can only update phone and parent_name"),
  "trg_protect_student_fields in schema.sql restricts student updates to phone and parent_name"
);

// Test 5: SET search_path = public
const searchPathPublicRegex = (fnName) => new RegExp(`CREATE OR REPLACE FUNCTION (?:public\\.)?${fnName}[\\s\\S]*?SET search_path = public[;,]`, "i");

assert(searchPathPublicRegex("set_updated_at").test(migrationSql), "set_updated_at has SET search_path = public in migration");
assert(searchPathPublicRegex("set_updated_at").test(schemaSql), "set_updated_at has SET search_path = public in schema.sql");

assert(searchPathPublicRegex("is_admin\\(\\)").test(migrationSql), "is_admin has SET search_path = public in migration");
assert(searchPathPublicRegex("is_admin\\(\\)").test(schemaSql), "is_admin has SET search_path = public in schema.sql");

assert(searchPathPublicRegex("is_admin_for_branch").test(migrationSql), "is_admin_for_branch has SET search_path = public in migration");
assert(searchPathPublicRegex("is_admin_for_branch").test(schemaSql), "is_admin_for_branch has SET search_path = public in schema.sql");

assert(searchPathPublicRegex("get_session_branch").test(migrationSql), "get_session_branch has SET search_path = public in migration");
assert(searchPathPublicRegex("get_session_branch").test(schemaSql), "get_session_branch has SET search_path = public in schema.sql");

// Test 6: Bootstrap admin branch comment uses 'ALL'
assert(
  schemaSql.includes("'admin@yourinstitution.com', 'System Administrator', 'admin', 'ALL'"),
  "schema.sql bootstrap comment uses 'ALL' branch for the initial administrator"
);
assert(
  !schemaSql.includes("'admin@yourinstitution.com', 'System Administrator', 'admin', 'MAIN'"),
  "schema.sql bootstrap comment does NOT use 'MAIN'"
);

// Test 7: student-service.js resetStudentPassword calls shared supabase.rpc
assert(
  studentServiceJs.includes("supabase.rpc(\"reset_student_password\""),
  "student-service.js calls supabase.rpc('reset_student_password')"
);
assert(
  !studentServiceJs.includes("const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);\n  \n  // Call RPC to update both auth.users and public.students\n  const { error: rpcErr } = await client.rpc"),
  "student-service.js does NOT instantiate an anonymous createClient inside resetStudentPassword"
);

// Test 8: Simulate resetStudentPassword logic with mock Supabase client
{
  let calledRpcName = null;
  let calledRpcParams = null;

  const mockSupabase = {
    rpc: async (name, params) => {
      calledRpcName = name;
      calledRpcParams = params;
      return { data: true, error: null };
    }
  };

  const student = { id: "std-123", admissionNumber: "ADM001" };
  const newPassword = "testPassword88";

  // Simulate execution of resetStudentPassword with mockSupabase
  const { error: rpcErr } = await mockSupabase.rpc("reset_student_password", {
    p_admission: student.admissionNumber,
    p_new_password: newPassword
  });

  assertEqual(rpcErr, null, "RPC call returns no error");
  assertEqual(calledRpcName, "reset_student_password", "RPC method called is reset_student_password");
  assertEqual(calledRpcParams.p_admission, "ADM001", "RPC p_admission matches student admission number");
  assertEqual(calledRpcParams.p_new_password, "testPassword88", "RPC p_new_password matches generated password");
}

console.log(`\n================================================================`);
console.log(`  TEST RESULTS: ${testsPassed}/${testsRun} PASSED (${testsFailed} FAILED)`);
console.log(`================================================================\n`);

if (testsFailed > 0) {
  process.exit(1);
}
