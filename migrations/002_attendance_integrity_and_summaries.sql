-- ==========================================================================
-- Migration 002: Attendance Module Data Integrity, Normalization & Server-Side Summaries
--
-- Rollback Instructions:
-- 1. DROP TRIGGER IF EXISTS trg_protect_attendance_session_immutability ON public.attendance_sessions;
--    DROP FUNCTION IF EXISTS public.trg_protect_attendance_session_immutability();
-- 2. DROP TRIGGER IF EXISTS trg_validate_attendance_session_times ON public.attendance_sessions;
--    DROP FUNCTION IF EXISTS public.trg_validate_attendance_session_times();
-- 3. ALTER TABLE public.attendance_sessions DROP CONSTRAINT IF EXISTS uq_attendance_sessions_branch_class_date_time;
-- 4. DROP FUNCTION IF EXISTS public.get_attendance_summary(text, text, date, date);
-- ==========================================================================

-- 1. Normalize existing class columns in students and attendance_sessions
UPDATE public.students
SET class = trim(regexp_replace(class, '^class\s*', '', 'i'))
WHERE class ~* '^class\s*';

UPDATE public.attendance_sessions
SET class = trim(regexp_replace(class, '^class\s*', '', 'i'))
WHERE class ~* '^class\s*';

-- 2. Deduplicate existing duplicate sessions (if any) before applying unique constraint
DELETE FROM public.attendance_sessions a
USING public.attendance_sessions b
WHERE a.id > b.id
  AND a.branch = b.branch
  AND a.class = b.class
  AND a.date = b.date
  AND a.start_time = b.start_time;

-- 3. Add unique constraint on (branch, class, date, start_time)
ALTER TABLE public.attendance_sessions
  DROP CONSTRAINT IF EXISTS uq_attendance_sessions_branch_class_date_time;

ALTER TABLE public.attendance_sessions
  ADD CONSTRAINT uq_attendance_sessions_branch_class_date_time
  UNIQUE (branch, class, date, start_time);

-- 4. Trigger to validate session time (end_time > start_time when provided)
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

-- 5. Trigger to prevent changing class or branch when session already has records
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

-- 6. Server-side RPC for admin attendance summary aggregation (no 1000-row limit risk)
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
