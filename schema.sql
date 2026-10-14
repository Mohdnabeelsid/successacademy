-- ==========================================================================
-- SUCCESS Learning Log — Supabase Database Schema & Row Level Security (RLS)
-- Copy and run this script in your Supabase SQL Editor (SQL Editor → New Query)
-- ==========================================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create Users Table (Admin Profiles)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'student')),
  branch TEXT DEFAULT 'MAN',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create Students Table
CREATE TABLE IF NOT EXISTS public.students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  uid UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  admission_number TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  class TEXT NOT NULL,
  branch TEXT NOT NULL,
  phone TEXT DEFAULT '',
  parent_name TEXT DEFAULT '',
  password TEXT, -- Initial or plain reference password managed by admin
  email TEXT UNIQUE NOT NULL,
  login_disabled BOOLEAN DEFAULT FALSE,
  pending_password_reset TEXT,
  pending_password_reset_at TIMESTAMPTZ,
  subjects JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure subjects column exists on existing databases
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS subjects JSONB DEFAULT '[]'::jsonb;

-- 4. Create Study Logs Table
CREATE TABLE IF NOT EXISTS public.study_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  day TEXT NOT NULL,
  subject TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 0,
  start_time TEXT DEFAULT '',
  end_time TEXT DEFAULT '',
  chapter TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Needs Correction')),
  admin_comment TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure start_time and end_time exist on existing databases
ALTER TABLE public.study_logs ADD COLUMN IF NOT EXISTS start_time TEXT DEFAULT '';
ALTER TABLE public.study_logs ADD COLUMN IF NOT EXISTS end_time TEXT DEFAULT '';

-- 5. Create Exams Table
CREATE TABLE IF NOT EXISTS public.exams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  exam_type TEXT NOT NULL DEFAULT 'Onam Exam',
  class TEXT NOT NULL,
  branch TEXT NOT NULL DEFAULT 'MAN',
  subject TEXT NOT NULL DEFAULT 'All Subjects',
  exam_date DATE NOT NULL,
  start_time TEXT DEFAULT '',
  max_marks NUMERIC(5,2) NOT NULL DEFAULT 100,
  passing_marks NUMERIC(5,2) NOT NULL DEFAULT 35,
  academic_year TEXT DEFAULT '2026-2027',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Create Exam Marks Table
CREATE TABLE IF NOT EXISTS public.exam_marks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject TEXT NOT NULL DEFAULT '',
  marks_obtained NUMERIC(5,2),
  max_marks NUMERIC(5,2) DEFAULT 100,
  is_absent BOOLEAN DEFAULT FALSE,
  remarks TEXT DEFAULT '',
  entered_by TEXT DEFAULT 'student',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(exam_id, student_id, subject)
);

-- 7. Reference Tables
CREATE TABLE IF NOT EXISTS public.branches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed official branches (Alappuzha & Mannancherry)
INSERT INTO public.branches (id, name, code) VALUES
  ('ALP', 'Alappuzha', 'ALP'),
  ('MAN', 'Mannancherry', 'MAN')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.classes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  grade_level INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.subjects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.academic_years (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_current BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_students_admission ON public.students(admission_number);
CREATE INDEX IF NOT EXISTS idx_students_uid ON public.students(uid);
CREATE INDEX IF NOT EXISTS idx_study_logs_student_id ON public.study_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_study_logs_date ON public.study_logs(date);
CREATE INDEX IF NOT EXISTS idx_study_logs_status ON public.study_logs(status);
CREATE INDEX IF NOT EXISTS idx_exams_class ON public.exams(class);
CREATE INDEX IF NOT EXISTS idx_exams_date ON public.exams(exam_date);
CREATE INDEX IF NOT EXISTS idx_exam_marks_exam ON public.exam_marks(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_marks_student ON public.exam_marks(student_id);

-- 7. Updated At Trigger Function
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users;
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_students_updated_at ON public.students;
CREATE TRIGGER trg_students_updated_at BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 11. RPC Function to sync password resets in both auth.users and public.students
CREATE OR REPLACE FUNCTION public.reset_student_password(
  p_admission text,
  p_new_password text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_email text;
BEGIN
  -- Strict admin check: Only authenticated admins can reset passwords
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied. Only administrators can reset student passwords.';
  END IF;

  v_email := lower(p_admission) || '@students.successacademy.app';
  
  -- 1. Update Supabase Auth encrypted_password
  UPDATE auth.users
  SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf'))
  WHERE lower(email) = v_email;

  -- 2. Update public.students display password
  UPDATE public.students
  SET password = p_new_password,
      pending_password_reset = NULL,
      pending_password_reset_at = NULL
  WHERE lower(admission_number) = lower(p_admission);

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reset_student_password(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reset_student_password(text, text) TO authenticated;

-- 12. Password Sync Trigger: Automatically syncs password edits in public.students to auth.users
CREATE OR REPLACE FUNCTION public.trg_sync_student_password_to_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF (TG_OP = 'UPDATE') AND (NEW.password IS DISTINCT FROM OLD.password) AND (NEW.email IS NOT NULL) THEN
    UPDATE auth.users
    SET encrypted_password = extensions.crypt(NEW.password, extensions.gen_salt('bf'))
    WHERE lower(email) = lower(NEW.email);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_student_password ON public.students;
CREATE TRIGGER trg_sync_student_password
  AFTER UPDATE OF password ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sync_student_password_to_auth();

DROP TRIGGER IF EXISTS trg_study_logs_updated_at ON public.study_logs;
CREATE TRIGGER trg_study_logs_updated_at BEFORE UPDATE ON public.study_logs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 8. Row Level Security (RLS) Policies
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;

-- Helper function to check if current user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Helper function to check if current user is an all-branch admin
CREATE OR REPLACE FUNCTION public.is_all_branch_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin' AND (branch IS NULL OR branch = 'ALL' OR branch = '')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Backwards compatibility alias
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN is_all_branch_admin();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Prevent branch admin from elevating their role or changing branch to ALL
CREATE OR REPLACE FUNCTION public.trg_protect_user_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.role IS DISTINCT FROM OLD.role) OR (NEW.branch IS DISTINCT FROM OLD.branch) THEN
    IF NOT is_all_branch_admin() THEN
      RAISE EXCEPTION 'Only all-branch administrators can modify user role or branch.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_user_roles ON public.users;
CREATE TRIGGER trg_protect_user_roles
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_protect_user_roles();

-- RLS Policies for Users
DROP POLICY IF EXISTS "Admins full access to users" ON public.users;
CREATE POLICY "Admins full access to users" ON public.users FOR ALL USING (is_admin());

DROP POLICY IF EXISTS "Users read own profile" ON public.users;
CREATE POLICY "Users read own profile" ON public.users FOR SELECT USING (auth.uid() = id);

-- Restrict student profile updates: non-admins can only change phone and parent_name
CREATE OR REPLACE FUNCTION public.trg_protect_student_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    IF (NEW.id IS DISTINCT FROM OLD.id) OR
       (NEW.uid IS DISTINCT FROM OLD.uid) OR
       (NEW.admission_number IS DISTINCT FROM OLD.admission_number) OR
       (NEW.name IS DISTINCT FROM OLD.name) OR
       (NEW.class IS DISTINCT FROM OLD.class) OR
       (NEW.branch IS DISTINCT FROM OLD.branch) OR
       (NEW.password IS DISTINCT FROM OLD.password) OR
       (NEW.email IS DISTINCT FROM OLD.email) OR
       (NEW.login_disabled IS DISTINCT FROM OLD.login_disabled) OR
       (NEW.pending_password_reset IS DISTINCT FROM OLD.pending_password_reset) OR
       (NEW.pending_password_reset_at IS DISTINCT FROM OLD.pending_password_reset_at) OR
       (NEW.subjects IS DISTINCT FROM OLD.subjects) OR
       (NEW.created_at IS DISTINCT FROM OLD.created_at) THEN
      RAISE EXCEPTION 'Non-admins can only update phone and parent_name.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_student_fields ON public.students;
CREATE TRIGGER trg_protect_student_fields
  BEFORE UPDATE ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_protect_student_fields();

-- RLS Policies for Students
DROP POLICY IF EXISTS "Admins full access to students" ON public.students;
CREATE POLICY "Admins full access to students" ON public.students FOR ALL USING (is_admin());

DROP POLICY IF EXISTS "Students read own record" ON public.students;
CREATE POLICY "Students read own record" ON public.students FOR SELECT USING (auth.uid() = uid);

DROP POLICY IF EXISTS "Students update own contact details" ON public.students;
CREATE POLICY "Students update own contact details" ON public.students
  FOR UPDATE
  USING (auth.uid() = uid)
  WITH CHECK (
    auth.uid() = uid AND
    class = (SELECT s.class FROM public.students s WHERE s.uid = auth.uid()) AND
    branch = (SELECT s.branch FROM public.students s WHERE s.uid = auth.uid()) AND
    admission_number = (SELECT s.admission_number FROM public.students s WHERE s.uid = auth.uid()) AND
    login_disabled = (SELECT s.login_disabled FROM public.students s WHERE s.uid = auth.uid())
  );

-- RLS Policies for Study Logs
DROP POLICY IF EXISTS "Admins full access to study_logs" ON public.study_logs;
CREATE POLICY "Admins full access to study_logs" ON public.study_logs FOR ALL USING (is_admin());

DROP POLICY IF EXISTS "Students read own study_logs" ON public.study_logs;
CREATE POLICY "Students read own study_logs" ON public.study_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.students WHERE id = public.study_logs.student_id AND uid = auth.uid())
);

DROP POLICY IF EXISTS "Students insert pending study_logs" ON public.study_logs;
DROP POLICY IF EXISTS "Students insert own study_logs" ON public.study_logs;
CREATE POLICY "Students insert own study_logs" ON public.study_logs FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.students WHERE id = public.study_logs.student_id AND uid = auth.uid())
);

-- Fix #1: Explicit DELETE policy for students (defense-in-depth).
-- Without this, the implicit Supabase deny applies, which is safe but fragile.
-- Granting students delete on their own rows lets them correct mistakes without admin.
DROP POLICY IF EXISTS "Students delete own study_logs" ON public.study_logs;
CREATE POLICY "Students delete own study_logs" ON public.study_logs FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.students WHERE id = public.study_logs.student_id AND uid = auth.uid())
);


-- Fix #12: Split exams policy — only admins can INSERT/UPDATE/DELETE;
-- all authenticated users (including students) can only SELECT.
DROP POLICY IF EXISTS "Authenticated users read exams" ON public.exams;
DROP POLICY IF EXISTS "Admins manage exams" ON public.exams;
DROP POLICY IF EXISTS "Authenticated users manage exams" ON public.exams;

CREATE POLICY "Admins manage exams" ON public.exams
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Authenticated users read exams" ON public.exams
  FOR SELECT USING (auth.role() = 'authenticated');

-- Fix #13: Restrict exam_marks access by row ownership.
-- Admins have full access. Students can only read/write their OWN marks.
-- Previously any authenticated user could read or modify any student's marks.
DROP POLICY IF EXISTS "Admins full access to exam_marks" ON public.exam_marks;
DROP POLICY IF EXISTS "Students read own exam_marks" ON public.exam_marks;
DROP POLICY IF EXISTS "Students insert own exam_marks" ON public.exam_marks;
DROP POLICY IF EXISTS "Students update own exam_marks" ON public.exam_marks;
DROP POLICY IF EXISTS "Authenticated users manage exam_marks" ON public.exam_marks;

CREATE POLICY "Users manage own exam_marks" ON public.exam_marks
  FOR ALL
  USING (
    is_admin() OR
    EXISTS (
      SELECT 1 FROM public.students
      WHERE id = public.exam_marks.student_id
        AND uid = auth.uid()
    )
  )
  WITH CHECK (
    is_admin() OR
    EXISTS (
      SELECT 1 FROM public.students
      WHERE id = public.exam_marks.student_id
        AND uid = auth.uid()
    )
  );

-- RLS Policies for Reference Tables
DROP POLICY IF EXISTS "Authenticated users read branches" ON public.branches;
CREATE POLICY "Authenticated users read branches" ON public.branches FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins manage branches" ON public.branches;
CREATE POLICY "Admins manage branches" ON public.branches FOR ALL USING (is_admin());

DROP POLICY IF EXISTS "Authenticated users read classes" ON public.classes;
CREATE POLICY "Authenticated users read classes" ON public.classes FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins manage classes" ON public.classes;
CREATE POLICY "Admins manage classes" ON public.classes FOR ALL USING (is_admin());

DROP POLICY IF EXISTS "Authenticated users read subjects" ON public.subjects;
CREATE POLICY "Authenticated users read subjects" ON public.subjects FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins manage subjects" ON public.subjects;
CREATE POLICY "Admins manage subjects" ON public.subjects FOR ALL USING (is_admin());

DROP POLICY IF EXISTS "Authenticated users read academic_years" ON public.academic_years;
CREATE POLICY "Authenticated users read academic_years" ON public.academic_years FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins manage academic_years" ON public.academic_years;
CREATE POLICY "Admins manage academic_years" ON public.academic_years FOR ALL USING (is_admin());

-- ==========================================================================
-- 9. Attendance Management System: Sessions & Records
-- ==========================================================================

-- Attendance Sessions Table
CREATE TABLE IF NOT EXISTS public.attendance_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch TEXT NOT NULL,
  class TEXT NOT NULL,
  date DATE NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT DEFAULT '',
  title TEXT DEFAULT '',
  academic_year TEXT DEFAULT '2026-2027',
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure session_type column is removed if previously created
ALTER TABLE public.attendance_sessions DROP COLUMN IF EXISTS session_type;

-- Attendance Records Table
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES public.attendance_sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('Present', 'Late', 'Absent')),
  remarks TEXT DEFAULT '',
  marked_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  marked_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, student_id)
);

-- Indexes for Attendance
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_branch ON public.attendance_sessions(branch);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_class ON public.attendance_sessions(class);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_date ON public.attendance_sessions(date);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_composite ON public.attendance_sessions(branch, class, date);
CREATE INDEX IF NOT EXISTS idx_attendance_records_session_id ON public.attendance_records(session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_student_id ON public.attendance_records(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_status ON public.attendance_records(status);

-- Ensure unique constraint on (branch, class, date, start_time)
ALTER TABLE public.attendance_sessions
  DROP CONSTRAINT IF EXISTS uq_attendance_sessions_branch_class_date_time;
ALTER TABLE public.attendance_sessions
  ADD CONSTRAINT uq_attendance_sessions_branch_class_date_time
  UNIQUE (branch, class, date, start_time);

-- Validation Trigger: Ensure end_time is after start_time when provided
CREATE OR REPLACE FUNCTION public.trg_validate_attendance_session_times()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.end_time IS NOT NULL AND NEW.end_time <> '' THEN
    IF NEW.end_time <= NEW.start_time THEN
      RAISE EXCEPTION 'End time must be after start time.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_attendance_session_times ON public.attendance_sessions;
CREATE TRIGGER trg_validate_attendance_session_times
  BEFORE INSERT OR UPDATE ON public.attendance_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_validate_attendance_session_times();

-- Immutability Trigger: Block changing class or branch when session already has records
CREATE OR REPLACE FUNCTION public.trg_protect_attendance_session_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.class IS DISTINCT FROM OLD.class) OR (NEW.branch IS DISTINCT FROM OLD.branch) THEN
    IF EXISTS (SELECT 1 FROM public.attendance_records WHERE session_id = OLD.id) THEN
      RAISE EXCEPTION 'Cannot modify class or branch of an attendance session that already has attendance records.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_attendance_session_immutability ON public.attendance_sessions;
CREATE TRIGGER trg_protect_attendance_session_immutability
  BEFORE UPDATE ON public.attendance_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_protect_attendance_session_immutability();

-- Updated At Triggers for Attendance
DROP TRIGGER IF EXISTS trg_attendance_sessions_updated_at ON public.attendance_sessions;
CREATE TRIGGER trg_attendance_sessions_updated_at
  BEFORE UPDATE ON public.attendance_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_attendance_records_updated_at ON public.attendance_records;
CREATE TRIGGER trg_attendance_records_updated_at
  BEFORE UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Enable RLS
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

-- Helper function to check branch admin access
-- If admin has a specific branch ('MAN', 'ALP', etc.), they can access only that branch.
-- If admin branch is NULL or 'ALL', they can access all branches.
CREATE OR REPLACE FUNCTION is_admin_for_branch(target_branch TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
      AND role = 'admin'
      AND (branch = target_branch OR branch IS NULL OR branch = 'ALL' OR branch = '')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- RLS Policies for attendance_sessions
DROP POLICY IF EXISTS "Admins manage attendance sessions for permitted branch" ON public.attendance_sessions;
CREATE POLICY "Admins manage attendance sessions for permitted branch"
  ON public.attendance_sessions
  FOR ALL
  USING (is_admin_for_branch(branch))
  WITH CHECK (is_admin_for_branch(branch));

-- Students can read sessions for their own class & branch.
-- NOTE: We do NOT join back to attendance_records here, to avoid
-- the RLS recursion cycle (sessions <-> records cross-reference).
DROP POLICY IF EXISTS "Students read attendance sessions for their class & branch" ON public.attendance_sessions;
CREATE POLICY "Students read attendance sessions for their class & branch"
  ON public.attendance_sessions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.uid = auth.uid()
        AND s.branch = public.attendance_sessions.branch
        AND (
          s.class = public.attendance_sessions.class
          OR s.class = ('Class ' || public.attendance_sessions.class)
          OR public.attendance_sessions.class = ('Class ' || s.class)
          OR regexp_replace(s.class, '^Class\s*', '', 'i') = regexp_replace(public.attendance_sessions.class, '^Class\s*', '', 'i')
        )
    )
  );

-- ==========================================================================
-- FIX: Infinite RLS recursion — attendance_records admin policy
-- Root cause: querying attendance_sessions (RLS-enabled) from inside the
-- attendance_records policy caused Postgres to detect a policy cycle:
--   attendance_records policy → attendance_sessions RLS →
--   attendance_sessions student policy → attendance_records → loop!
--
-- Fix: a SECURITY DEFINER function reads attendance_sessions bypassing RLS,
-- so no RLS policy is re-entered during evaluation.
-- ==========================================================================

-- Helper: reads session branch bypassing RLS (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION get_session_branch(p_session_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_branch TEXT;
BEGIN
  SELECT branch INTO v_branch
  FROM public.attendance_sessions
  WHERE id = p_session_id;
  RETURN v_branch;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_session_branch(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_for_branch(TEXT) TO authenticated;

-- RLS Policies for attendance_records
DROP POLICY IF EXISTS "Admins manage attendance records for permitted branch" ON public.attendance_records;
CREATE POLICY "Admins manage attendance records for permitted branch"
  ON public.attendance_records
  FOR ALL
  USING (is_admin_for_branch(get_session_branch(session_id)))
  WITH CHECK (is_admin_for_branch(get_session_branch(session_id)));

DROP POLICY IF EXISTS "Students read own attendance records" ON public.attendance_records;
CREATE POLICY "Students read own attendance records"
  ON public.attendance_records
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = public.attendance_records.student_id
        AND s.uid = auth.uid()
    )
  );

-- 10. Server-side RPC for admin attendance summary aggregation
CREATE OR REPLACE FUNCTION public.get_attendance_summary(
  p_branch text DEFAULT NULL,
  p_class text DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE (
  sessions_count bigint,
  total_records bigint,
  present_count bigint,
  late_count bigint,
  absent_count bigint,
  unmarked_count bigint,
  attended_count bigint,
  attendance_rate numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_branch text;
  v_class text;
  v_user_branch text;
  v_sessions_count bigint;
  v_total_records bigint;
  v_present bigint;
  v_late bigint;
  v_absent bigint;
  v_attended bigint;
  v_rate numeric;
BEGIN
  -- Strict admin authorization check
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied. Only administrators can query attendance summaries.';
  END IF;

  -- Enforce branch isolation for branch admins
  IF NOT is_all_branch_admin() THEN
    SELECT u.branch INTO v_user_branch FROM public.users u WHERE u.id = auth.uid();
    v_branch := v_user_branch;
  ELSE
    IF p_branch IS NULL OR p_branch = '' OR p_branch = 'ALL' THEN
      v_branch := NULL;
    ELSE
      v_branch := p_branch;
    END IF;
  END IF;

  v_class := NULLIF(trim(regexp_replace(COALESCE(p_class, ''), '^class\s*', '', 'i')), '');

  -- Count total sessions in scope
  SELECT COUNT(*)
  INTO v_sessions_count
  FROM public.attendance_sessions s
  WHERE (v_branch IS NULL OR s.branch = v_branch)
    AND (v_class IS NULL OR regexp_replace(s.class, '^class\s*', '', 'i') = v_class)
    AND (p_start_date IS NULL OR s.date >= p_start_date)
    AND (p_end_date IS NULL OR s.date <= p_end_date);

  -- Aggregate attendance records in scope
  SELECT
    COALESCE(COUNT(*), 0),
    COALESCE(COUNT(*) FILTER (WHERE r.status = 'Present'), 0),
    COALESCE(COUNT(*) FILTER (WHERE r.status = 'Late'), 0),
    COALESCE(COUNT(*) FILTER (WHERE r.status = 'Absent'), 0)
  INTO
    v_total_records,
    v_present,
    v_late,
    v_absent
  FROM public.attendance_records r
  JOIN public.attendance_sessions s ON s.id = r.session_id
  WHERE (v_branch IS NULL OR s.branch = v_branch)
    AND (v_class IS NULL OR regexp_replace(s.class, '^class\s*', '', 'i') = v_class)
    AND (p_start_date IS NULL OR s.date >= p_start_date)
    AND (p_end_date IS NULL OR s.date <= p_end_date);

  v_attended := v_present + v_late;
  IF (v_present + v_late + v_absent) > 0 THEN
    v_rate := ROUND(((v_present + v_late)::numeric / (v_present + v_late + v_absent)) * 100, 1);
  ELSE
    v_rate := 0;
  END IF;

  RETURN QUERY SELECT
    v_sessions_count,
    v_total_records,
    v_present,
    v_late,
    v_absent,
    0::bigint,
    v_attended,
    v_rate;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_attendance_summary(text, text, date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_attendance_summary(text, text, date, date) TO authenticated;

-- ==========================================================================
-- INSTRUCTIONS TO BOOTSTRAP FIRST ADMIN:
-- 1. In Supabase Dashboard → Authentication → Users → Add User:
--    Email: admin@yourinstitution.com
--    Password: <your_secure_password>
--    (Copy the generated User UID)
--
-- 2. Run the following SQL replacing '<ADMIN_USER_UID>' with the copied UID:
-- INSERT INTO public.users (id, email, name, role, branch)
-- VALUES ('<ADMIN_USER_UID>', 'admin@yourinstitution.com', 'System Administrator', 'admin', 'ALL')
-- ON CONFLICT (id) DO NOTHING;
-- ==========================================================================

