-- ==========================================================================
-- Migration 006: NEXTGEN Online Sessions & Attendance Check-In System
-- ==========================================================================

-- 1. Create nextgen_sessions Table
CREATE TABLE IF NOT EXISTS public.nextgen_sessions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title             TEXT NOT NULL,
  facilitator_name  TEXT NOT NULL,
  scheduled_at      TIMESTAMPTZ NOT NULL,
  meet_url          TEXT NOT NULL CHECK (meet_url ~* '^https:\/\/meet\.google\.com\/[a-zA-Z0-9_\-]+'),
  status            TEXT NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled', 'live', 'finished')),
  created_by        UUID REFERENCES public.users(id) ON DELETE SET NULL,
  live_at           TIMESTAMPTZ,
  finished_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Enforce Single Live Session at Database Level via Partial Unique Index
CREATE UNIQUE INDEX IF NOT EXISTS idx_nextgen_single_live 
  ON public.nextgen_sessions (status) 
  WHERE status = 'live';

-- Indexes for status, date, and creation
CREATE INDEX IF NOT EXISTS idx_nextgen_sessions_status ON public.nextgen_sessions(status);
CREATE INDEX IF NOT EXISTS idx_nextgen_sessions_scheduled_at ON public.nextgen_sessions(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_nextgen_sessions_created_at ON public.nextgen_sessions(created_at);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trg_nextgen_sessions_updated_at ON public.nextgen_sessions;
CREATE TRIGGER trg_nextgen_sessions_updated_at
  BEFORE UPDATE ON public.nextgen_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 2. Create nextgen_attendees Table
CREATE TABLE IF NOT EXISTS public.nextgen_attendees (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id        UUID NOT NULL REFERENCES public.nextgen_sessions(id) ON DELETE RESTRICT,
  student_name      TEXT NOT NULL,
  class_level       INTEGER NOT NULL CHECK (class_level IN (8, 9, 10, 11, 12)),
  school_name       TEXT NOT NULL,
  phone             TEXT NOT NULL,
  phone_normalized  TEXT NOT NULL,
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for attendees
CREATE INDEX IF NOT EXISTS idx_nextgen_attendees_session_id ON public.nextgen_attendees(session_id);
CREATE INDEX IF NOT EXISTS idx_nextgen_attendees_submitted_at ON public.nextgen_attendees(submitted_at);
CREATE INDEX IF NOT EXISTS idx_nextgen_attendees_class_level ON public.nextgen_attendees(class_level);
CREATE INDEX IF NOT EXISTS idx_nextgen_attendees_phone_norm ON public.nextgen_attendees(phone_normalized);

-- Unique constraint for duplicate check-ins (same student name & normalized phone for same session)
-- Allows siblings with different names sharing phone to check in safely
CREATE UNIQUE INDEX IF NOT EXISTS idx_nextgen_attendee_dedup 
  ON public.nextgen_attendees(session_id, phone_normalized, LOWER(TRIM(student_name)));

-- 3. Row Level Security (RLS)
ALTER TABLE public.nextgen_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nextgen_attendees ENABLE ROW LEVEL SECURITY;

-- Admins manage all sessions
DROP POLICY IF EXISTS "Admins manage nextgen sessions" ON public.nextgen_sessions;
CREATE POLICY "Admins manage nextgen sessions"
  ON public.nextgen_sessions FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Admins read all attendees
DROP POLICY IF EXISTS "Admins read nextgen attendees" ON public.nextgen_attendees;
CREATE POLICY "Admins read nextgen attendees"
  ON public.nextgen_attendees FOR SELECT
  USING (is_admin());

-- Admins can delete attendee where needed (restricted to admins)
DROP POLICY IF EXISTS "Admins delete nextgen attendees" ON public.nextgen_attendees;
CREATE POLICY "Admins delete nextgen attendees"
  ON public.nextgen_attendees FOR DELETE
  USING (is_admin());

-- NOTE: Public users have NO direct table SELECT on attendees or sessions.
-- This ensures meet_url is NEVER leaked before check-in and attendee PII is protected.

-- 4. PostgreSQL Database Functions / RPCs

-- A. Get currently live session safe info (WITHOUT exposing meet_url!)
CREATE OR REPLACE FUNCTION public.get_live_nextgen_session()
RETURNS TABLE (
  id UUID,
  title TEXT,
  facilitator_name TEXT,
  scheduled_at TIMESTAMPTZ,
  status TEXT
) 
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT s.id, s.title, s.facilitator_name, s.scheduled_at, s.status
  FROM public.nextgen_sessions s
  WHERE s.status = 'live'
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_live_nextgen_session() TO anon, authenticated;

-- B. Atomic Session Activation (Prevents concurrent/double live sessions)
CREATE OR REPLACE FUNCTION public.activate_nextgen_session(p_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_live_session RECORD;
  v_target_session RECORD;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied. Administrator privileges required.';
  END IF;

  -- Lock sessions table to serialize activation attempts
  PERFORM pg_advisory_xact_lock(hashtext('nextgen_session_activation'));

  -- Check if target exists
  SELECT * INTO v_target_session FROM public.nextgen_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found.';
  END IF;

  IF v_target_session.status = 'finished' THEN
    RAISE EXCEPTION 'Finished sessions cannot be reactivated.';
  END IF;

  IF v_target_session.status = 'live' THEN
    RETURN jsonb_build_object('success', true, 'message', 'Session is already live.', 'session_id', p_session_id);
  END IF;

  -- Check if another session is already live
  SELECT * INTO v_live_session FROM public.nextgen_sessions WHERE status = 'live' AND id <> p_session_id LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Another session is already live ("%"). Please finish it before activating this session.', v_live_session.title;
  END IF;

  -- Set target live
  UPDATE public.nextgen_sessions
  SET status = 'live', live_at = NOW(), updated_at = NOW()
  WHERE id = p_session_id;

  RETURN jsonb_build_object('success', true, 'message', 'Session activated successfully.', 'session_id', p_session_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.activate_nextgen_session(UUID) TO authenticated;

-- C. Finish Live Session
CREATE OR REPLACE FUNCTION public.finish_nextgen_session(p_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied. Administrator privileges required.';
  END IF;

  UPDATE public.nextgen_sessions
  SET status = 'finished', finished_at = NOW(), updated_at = NOW()
  WHERE id = p_session_id;

  RETURN jsonb_build_object('success', true, 'message', 'Session finished successfully.', 'session_id', p_session_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.finish_nextgen_session(UUID) TO authenticated;

-- D. Atomic Student Check-In (Validates live status, saves attendee, returns meet_url)
CREATE OR REPLACE FUNCTION public.check_in_nextgen_attendee(
  p_student_name TEXT,
  p_class_level INTEGER,
  p_school_name TEXT,
  p_phone TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session RECORD;
  v_clean_name TEXT;
  v_clean_school TEXT;
  v_clean_phone TEXT;
  v_norm_phone TEXT;
  v_attendee_id UUID;
BEGIN
  -- 1. Validate student name
  v_clean_name := TRIM(COALESCE(p_student_name, ''));
  IF LENGTH(v_clean_name) < 2 THEN
    RAISE EXCEPTION 'Student name must be at least 2 characters long.';
  END IF;

  -- 2. Validate class level
  IF p_class_level NOT IN (8, 9, 10, 11, 12) THEN
    RAISE EXCEPTION 'Class must be between 8 and 12.';
  END IF;

  -- 3. Validate school name
  v_clean_school := TRIM(COALESCE(p_school_name, ''));
  IF LENGTH(v_clean_school) < 2 THEN
    RAISE EXCEPTION 'School name must be at least 2 characters long.';
  END IF;

  -- 4. Validate & normalize Indian mobile number
  v_clean_phone := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
  IF LENGTH(v_clean_phone) = 12 AND v_clean_phone LIKE '91%' THEN
    v_clean_phone := SUBSTRING(v_clean_phone FROM 3);
  ELSIF LENGTH(v_clean_phone) = 11 AND v_clean_phone LIKE '0%' THEN
    v_clean_phone := SUBSTRING(v_clean_phone FROM 2);
  END IF;

  IF LENGTH(v_clean_phone) <> 10 OR v_clean_phone !~ '^[6-9]\d{9}$' THEN
    RAISE EXCEPTION 'Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.';
  END IF;

  v_norm_phone := '+91' || v_clean_phone;

  -- 5. Find the currently LIVE NEXTGEN session
  SELECT id, title, meet_url, status
  INTO v_session
  FROM public.nextgen_sessions
  WHERE status = 'live'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'There is currently no live NEXTGEN session. Please follow SUCCESS ACADEMY announcements.';
  END IF;

  -- 6. Insert Attendee Record (idempotent for accidental retries/double-clicks)
  INSERT INTO public.nextgen_attendees (
    session_id,
    student_name,
    class_level,
    school_name,
    phone,
    phone_normalized,
    submitted_at
  ) VALUES (
    v_session.id,
    v_clean_name,
    p_class_level,
    v_clean_school,
    p_phone,
    v_norm_phone,
    NOW()
  )
  ON CONFLICT (session_id, phone_normalized, LOWER(TRIM(student_name)))
  DO UPDATE SET submitted_at = NOW()
  RETURNING id INTO v_attendee_id;

  -- 7. Return session meet_url ONLY after successful check-in
  RETURN jsonb_build_object(
    'success', true,
    'session_id', v_session.id,
    'session_title', v_session.title,
    'meet_url', v_session.meet_url,
    'attendee_id', v_attendee_id,
    'message', 'Check-in successful! Redirecting to Google Meet...'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_in_nextgen_attendee(TEXT, INTEGER, TEXT, TEXT) TO anon, authenticated;

