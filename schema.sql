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
$$ LANGUAGE plpgsql;

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
AS $$
DECLARE
  v_email text;
BEGIN
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

-- 12. Password Sync Trigger: Automatically syncs password edits in public.students to auth.users
CREATE OR REPLACE FUNCTION public.trg_sync_student_password_to_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Policies for Users
DROP POLICY IF EXISTS "Admins full access to users" ON public.users;
CREATE POLICY "Admins full access to users" ON public.users FOR ALL USING (is_admin());

DROP POLICY IF EXISTS "Users read own profile" ON public.users;
CREATE POLICY "Users read own profile" ON public.users FOR SELECT USING (auth.uid() = id);

-- RLS Policies for Students
DROP POLICY IF EXISTS "Admins full access to students" ON public.students;
CREATE POLICY "Admins full access to students" ON public.students FOR ALL USING (is_admin());

DROP POLICY IF EXISTS "Students read own record" ON public.students;
CREATE POLICY "Students read own record" ON public.students FOR SELECT USING (auth.uid() = uid);

DROP POLICY IF EXISTS "Students update own contact details" ON public.students;
CREATE POLICY "Students update own contact details" ON public.students FOR UPDATE USING (auth.uid() = uid);

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
-- INSTRUCTIONS TO BOOTSTRAP FIRST ADMIN:
-- 1. In Supabase Dashboard → Authentication → Users → Add User:
--    Email: admin@yourinstitution.com
--    Password: <your_secure_password>
--    (Copy the generated User UID)
--
-- 2. Run the following SQL replacing '<ADMIN_USER_UID>' with the copied UID:
-- INSERT INTO public.users (id, email, name, role, branch)
-- VALUES ('<ADMIN_USER_UID>', 'admin@yourinstitution.com', 'System Administrator', 'admin', 'MAIN')
-- ON CONFLICT (id) DO NOTHING;
-- ==========================================================================

