-- Add rejection_reason column to work_orders to store the reason when a job is rejected.
-- Safe to run multiple times (idempotent via IF NOT EXISTS check).

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'work_orders'
      and column_name  = 'rejection_reason'
  ) then
    alter table public.work_orders
      add column rejection_reason text;
  end if;
end;
$$;
