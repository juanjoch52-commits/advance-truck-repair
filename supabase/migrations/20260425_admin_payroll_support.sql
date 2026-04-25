-- Admin payroll: support fixed-weekly, hourly, and manual payment types for non-mechanic staff.

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS payment_type text
    CHECK (payment_type IN ('mechanic_commission','fixed_weekly','hourly','manual'));

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS weekly_salary numeric(12,2);

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS hourly_rate numeric(12,2);

UPDATE public.employees
SET payment_type = CASE
  WHEN role = 'mechanic' THEN 'mechanic_commission'
  ELSE 'manual'
END
WHERE payment_type IS NULL;

ALTER TABLE public.earned_entries
  ADD COLUMN IF NOT EXISTS entry_type text
    CHECK (entry_type IN ('mechanic','admin_fixed','admin_hourly','admin_manual'));

ALTER TABLE public.earned_entries
  ADD COLUMN IF NOT EXISTS hours_worked numeric(8,2);

UPDATE public.earned_entries SET entry_type = 'mechanic' WHERE entry_type IS NULL;

CREATE INDEX IF NOT EXISTS idx_earned_entries_entry_type ON public.earned_entries(entry_type);
CREATE INDEX IF NOT EXISTS idx_employees_payment_type ON public.employees(payment_type);
