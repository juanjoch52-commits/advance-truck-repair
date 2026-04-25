-- Add creator tracking to work_reports
-- Stores who created each report so super admin / owner / admin can audit it.

ALTER TABLE public.work_reports
  ADD COLUMN IF NOT EXISTS created_by_name text,
  ADD COLUMN IF NOT EXISTS created_by_role text;

-- Foreign key from created_by to employees(id), set null on delete to preserve history.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'work_reports_created_by_fkey'
      AND table_name = 'work_reports'
  ) THEN
    ALTER TABLE public.work_reports
      ADD CONSTRAINT work_reports_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES public.employees(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_work_reports_created_by ON public.work_reports(created_by);
