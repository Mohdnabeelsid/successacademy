-- ==========================================================================
-- Migration 005: Timetable Module
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.timetable_entries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch          TEXT NOT NULL DEFAULT 'MAN',
  class           TEXT NOT NULL,
  date            DATE NOT NULL,
  start_time      TEXT NOT NULL DEFAULT '',    -- "HH:MM" 24h format
  end_time        TEXT DEFAULT '',             -- optional "HH:MM" 24h format
  session_type    TEXT NOT NULL DEFAULT 'Class'
                  CHECK (session_type IN ('Class', 'Exam', 'Event', 'Other')),
  subject         TEXT DEFAULT '',             -- Curriculum subject name (or comma-separated)
  subjects        JSONB DEFAULT '[]'::jsonb,   -- Array of up to 3 subjects
  title           TEXT DEFAULT '',             -- e.g. "Chemistry Unit Test" / "Special Physics Revision"
  description     TEXT DEFAULT '',             -- Additional notes or instructions
  location        TEXT DEFAULT '',             -- Room/hall (optional)
  academic_year   TEXT DEFAULT '2026-2027',
  created_by      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_timetable_entries_branch
  ON public.timetable_entries(branch);
CREATE INDEX IF NOT EXISTS idx_timetable_entries_class
  ON public.timetable_entries(class);
CREATE INDEX IF NOT EXISTS idx_timetable_entries_date
  ON public.timetable_entries(date);
CREATE INDEX IF NOT EXISTS idx_timetable_entries_session_type
  ON public.timetable_entries(session_type);
CREATE INDEX IF NOT EXISTS idx_timetable_entries_teacher_id
  ON public.timetable_entries(teacher_id);
CREATE INDEX IF NOT EXISTS idx_timetable_entries_class_branch_date
  ON public.timetable_entries(class, branch, date);

-- Ensure subjects column exists if table was previously created
ALTER TABLE public.timetable_entries ADD COLUMN IF NOT EXISTS subjects JSONB DEFAULT '[]'::jsonb;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trg_timetable_entries_updated_at ON public.timetable_entries;
CREATE TRIGGER trg_timetable_entries_updated_at
  BEFORE UPDATE ON public.timetable_entries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Row Level Security
ALTER TABLE public.timetable_entries ENABLE ROW LEVEL SECURITY;

-- Admins: full CRUD (branch-scoped)
DROP POLICY IF EXISTS "Admins manage timetable entries" ON public.timetable_entries;
CREATE POLICY "Admins manage timetable entries"
  ON public.timetable_entries FOR ALL
  USING (is_admin_for_branch(branch))
  WITH CHECK (is_admin_for_branch(branch));

-- Students: read-only, filtered by their class + branch
DROP POLICY IF EXISTS "Students read own timetable" ON public.timetable_entries;
CREATE POLICY "Students read own timetable"
  ON public.timetable_entries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.uid = auth.uid()
        AND (s.class = public.timetable_entries.class OR s.class = ('Class ' || public.timetable_entries.class) OR ('Class ' || s.class) = public.timetable_entries.class)
        AND s.branch = public.timetable_entries.branch
    )
  );

