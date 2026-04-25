-- The created_by field can come from two auth sources:
--   - PIN session (employees.id)
--   - Supabase Auth (profiles.id / auth.users.id)
-- A FK to employees would reject the Supabase-auth case, so drop it.
-- We rely on created_by_name (the snapshot) for display.
ALTER TABLE public.work_reports
  DROP CONSTRAINT IF EXISTS work_reports_created_by_fkey;
