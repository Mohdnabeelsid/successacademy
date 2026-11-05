-- ==========================================================================
-- 004: Teachers Module & Teacher's Class Diary / Log Tracking
-- Tables: teachers, class_logs
-- RLS, Indexes, Triggers
-- ==========================================================================

-- 1. Create Teachers Table
CREATE TABLE IF NOT EXISTS public.teachers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  branch TEXT NOT NULL DEFAULT 'MAN', -- 'MAN', 'ALP', or 'ALL'
  subjects JSONB DEFAULT '[]'::jsonb, -- e.g. ["Maths", "Physics"]
  classes JSONB DEFAULT '[]'::jsonb,  -- e.g. ["10", "11 Science"]
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create Class Logs Table (Teacher's Diary / Log Tracking)
CREATE TABLE IF NOT EXISTS public.class_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id UUID REFERENCES public.teachers(id) ON DELETE SET NULL,
  teacher_name TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  start_time TEXT NOT NULL DEFAULT '', -- "09:00" or "9:00 AM"
  end_time TEXT DEFAULT '',           -- "10:00" or "10:00 AM"
  duration_minutes INTEGER DEFAULT 0,
  class TEXT NOT NULL,
  subject TEXT NOT NULL,
  branch TEXT NOT NULL DEFAULT 'MAN',
  topic TEXT DEFAULT '',              -- Chapter / Topic covered
  notes TEXT DEFAULT '',              -- Remarks, homework, student behavior
  academic_year TEXT DEFAULT '2026-2027',
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Indexes for Teachers & Class Logs
CREATE INDEX IF NOT EXISTS idx_teachers_branch ON public.teachers(branch);
CREATE INDEX IF NOT EXISTS idx_teachers_status ON public.teachers(status);
CREATE INDEX IF NOT EXISTS idx_teachers_name ON public.teachers(name);

CREATE INDEX IF NOT EXISTS idx_class_logs_teacher_id ON public.class_logs(teacher_id);
CREATE INDEX IF NOT EXISTS idx_class_logs_date ON public.class_logs(date);
CREATE INDEX IF NOT EXISTS idx_class_logs_class ON public.class_logs(class);
CREATE INDEX IF NOT EXISTS idx_class_logs_subject ON public.class_logs(subject);
CREATE INDEX IF NOT EXISTS idx_class_logs_branch ON public.class_logs(branch);

-- 4. Triggers for updated_at
DROP TRIGGER IF EXISTS trg_teachers_updated_at ON public.teachers;
CREATE TRIGGER trg_teachers_updated_at 
  BEFORE UPDATE ON public.teachers 
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_class_logs_updated_at ON public.class_logs;
CREATE TRIGGER trg_class_logs_updated_at 
  BEFORE UPDATE ON public.class_logs 
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 5. Row Level Security (RLS)
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_logs ENABLE ROW LEVEL SECURITY;

-- Admins have full access to teachers
DROP POLICY IF EXISTS "Admins have full access to teachers" ON public.teachers;
CREATE POLICY "Admins have full access to teachers"
  ON public.teachers FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

-- Admins have full access to class_logs
DROP POLICY IF EXISTS "Admins have full access to class_logs" ON public.class_logs;
CREATE POLICY "Admins have full access to class_logs"
  ON public.class_logs FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );
