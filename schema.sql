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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create Study Logs Table
CREATE TABLE IF NOT EXISTS public.study_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  day TEXT NOT NULL,
  subject TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 0,
  chapter TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Needs Correction')),
  admin_comment TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Reference Tables
CREATE TABLE IF NOT EXISTS public.branches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

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

-- 6. Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_students_admission ON public.students(admission_number);
CREATE INDEX IF NOT EXISTS idx_students_uid ON public.students(uid);
CREATE INDEX IF NOT EXISTS idx_study_logs_student_id ON public.study_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_study_logs_date ON public.study_logs(date);
CREATE INDEX IF NOT EXISTS idx_study_logs_status ON public.study_logs(status);

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
--    Email: admin@successacademy.com
--    Password: <your_password>
--    (Copy the generated User UID)
--
-- 2. Run the following SQL replacing '<ADMIN_USER_UID>' with the copied UID:
-- INSERT INTO public.users (id, email, name, role, branch)
-- VALUES ('<ADMIN_USER_UID>', 'admin@successacademy.com', 'Mohammed Nabeel', 'admin', 'MAN')
-- ON CONFLICT (id) DO NOTHING;
-- ==========================================================================
