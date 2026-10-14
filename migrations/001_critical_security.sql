-- ==========================================================================
-- Migration 001: Critical Security Fixes
--
-- Rollback Instructions:
-- 1. DROP TRIGGER IF EXISTS trg_protect_user_roles ON public.users;
--    DROP FUNCTION IF EXISTS public.trg_protect_user_roles();
-- 2. DROP TRIGGER IF EXISTS trg_protect_student_fields ON public.students;
--    DROP FUNCTION IF EXISTS public.trg_protect_student_fields();
-- 3. GRANT EXECUTE ON FUNCTION public.reset_student_password(text, text) TO anon, public;
-- 4. Revert functions (is_admin, is_admin_for_branch, get_session_branch,
--    set_updated_at, reset_student_password) to versions without search_path / admin checks.
-- ==========================================================================

-- 1. Secure set_updated_at with explicit search_path
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 2. Secure is_admin with explicit search_path = public
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Helper to check if current user is an all-branch admin (branch NULL, '' or 'ALL')
CREATE OR REPLACE FUNCTION public.is_all_branch_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
      AND role = 'admin'
      AND (branch IS NULL OR branch = 'ALL' OR branch = '')
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

-- 4. Secure is_admin_for_branch with explicit search_path = public
CREATE OR REPLACE FUNCTION public.is_admin_for_branch(target_branch TEXT)
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

-- 5. Secure get_session_branch with explicit search_path = public
CREATE OR REPLACE FUNCTION public.get_session_branch(p_session_id UUID)
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

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_all_branch_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_for_branch(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_session_branch(UUID) TO authenticated;

-- 6. Harden reset_student_password with authorization check & search_path
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

-- Restrict execution to authenticated users only (disallow anon and public)
REVOKE EXECUTE ON FUNCTION public.reset_student_password(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reset_student_password(text, text) TO authenticated;

-- 7. Restrict updates to branch and role in public.users to all-branch admins
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

-- 8. Restrict student profile updates: non-admins can only change phone and parent_name
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
