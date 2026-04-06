-- Migration: add 'pending' and 'paid' values to work_order_status enum
-- and migrate existing 'pending_approval' rows to 'pending'.
--
-- PostgreSQL does not allow dropping enum values, so 'pending_approval' remains
-- in the type as an unused legacy value. The application now uses 'pending'.

-- 1. Add new enum values (idempotent checks via DO block)
do $$
begin
  -- Add 'pending' if not already present
  if not exists (
    select 1 from pg_enum
    where enumlabel = 'pending'
      and enumtypid = (select oid from pg_type where typname = 'work_order_status')
  ) then
    alter type work_order_status add value 'pending';
  end if;

  -- Add 'paid' if not already present
  if not exists (
    select 1 from pg_enum
    where enumlabel = 'paid'
      and enumtypid = (select oid from pg_type where typname = 'work_order_status')
  ) then
    alter type work_order_status add value 'paid';
  end if;
end;
$$;

-- 2. Migrate all existing 'pending_approval' rows to 'pending'
update public.work_orders
set status = 'pending'
where status = 'pending_approval';

-- 3. Change column default to 'pending'
alter table public.work_orders
  alter column status set default 'pending';
