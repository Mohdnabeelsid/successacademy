-- ==========================================================================
-- 003: Fees Management Module
-- Tables: fee_schedule, fee_payments
-- RLS, Indexes, Triggers
-- ==========================================================================

-- 1. Create Fee Schedule Table
CREATE TABLE IF NOT EXISTS public.fee_schedule (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class TEXT NOT NULL UNIQUE,
  monthly_fee NUMERIC(8,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed Initial Fee Schedule
INSERT INTO public.fee_schedule (class, monthly_fee) VALUES
  ('5', 700),
  ('6', 750),
  ('7', 800),
  ('8', 850),
  ('9', 900),
  ('10', 1000),
  ('11', 1400),
  ('11 Science', 1400),
  ('11 Commerce', 1400),
  ('12', 1400),
  ('12 Science', 1400),
  ('12 Commerce', 1400)
ON CONFLICT (class) DO UPDATE SET monthly_fee = EXCLUDED.monthly_fee;

-- 2. Create Fee Payments Table
CREATE TABLE IF NOT EXISTS public.fee_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  fee_type TEXT NOT NULL CHECK (fee_type IN ('admission', 'monthly')),
  amount NUMERIC(8,2) NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'upi')),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  month_year TEXT DEFAULT NULL, -- e.g. '2026-11' for monthly fees
  academic_year TEXT DEFAULT '2026-2027',
  branch TEXT NOT NULL,
  remarks TEXT DEFAULT '',
  recorded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fee_payments
CREATE INDEX IF NOT EXISTS idx_fee_payments_student ON public.fee_payments(student_id);
CREATE INDEX IF NOT EXISTS idx_fee_payments_type ON public.fee_payments(fee_type);
CREATE INDEX IF NOT EXISTS idx_fee_payments_date ON public.fee_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_fee_payments_month ON public.fee_payments(month_year);
CREATE INDEX IF NOT EXISTS idx_fee_payments_branch ON public.fee_payments(branch);

-- Uniqueness: 1 admission fee per student, 1 monthly fee per student per month
CREATE UNIQUE INDEX IF NOT EXISTS uq_fee_payments_admission 
  ON public.fee_payments(student_id) 
  WHERE fee_type = 'admission';

CREATE UNIQUE INDEX IF NOT EXISTS uq_fee_payments_monthly 
  ON public.fee_payments(student_id, month_year) 
  WHERE fee_type = 'monthly';

-- Updated At Triggers
DROP TRIGGER IF EXISTS trg_fee_schedule_updated_at ON public.fee_schedule;
CREATE TRIGGER trg_fee_schedule_updated_at 
  BEFORE UPDATE ON public.fee_schedule 
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_fee_payments_updated_at ON public.fee_payments;
CREATE TRIGGER trg_fee_payments_updated_at 
  BEFORE UPDATE ON public.fee_payments 
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Enable RLS
ALTER TABLE public.fee_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_payments ENABLE ROW LEVEL SECURITY;

-- RLS: fee_schedule
DROP POLICY IF EXISTS "Authenticated users read fee schedule" ON public.fee_schedule;
CREATE POLICY "Authenticated users read fee schedule"
  ON public.fee_schedule FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins manage fee schedule" ON public.fee_schedule;
CREATE POLICY "Admins manage fee schedule"
  ON public.fee_schedule FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

-- RLS: fee_payments
DROP POLICY IF EXISTS "Admins manage fee payments" ON public.fee_payments;
CREATE POLICY "Admins manage fee payments"
  ON public.fee_payments FOR ALL
  USING (is_admin_for_branch(branch))
  WITH CHECK (is_admin_for_branch(branch));

DROP POLICY IF EXISTS "Students read own fee payments" ON public.fee_payments;
CREATE POLICY "Students read own fee payments"
  ON public.fee_payments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = public.fee_payments.student_id AND s.uid = auth.uid()
    )
  );

