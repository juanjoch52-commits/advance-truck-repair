-- Create enum for assignment mode if missing
do $$
begin
  if not exists (select 1 from pg_type where typname = 'assignment_mode') then
    create type assignment_mode as enum ('percent', 'manual');
  end if;
end;
$$;

-- Create table that links a work order to one or more employees
create table if not exists public.work_order_assignments (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  assignment_mode assignment_mode not null default 'percent',
  percent_share numeric(5,2),
  manual_amount numeric(12,2),
  approved_amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_order_assignments_unique unique (work_order_id, employee_id),
  constraint work_order_assignments_percent_range check (
    percent_share is null or (percent_share >= 0 and percent_share <= 100)
  ),
  constraint work_order_assignments_manual_non_negative check (
    manual_amount is null or manual_amount >= 0
  ),
  constraint work_order_assignments_approved_non_negative check (
    approved_amount >= 0
  )
);

create index if not exists idx_work_order_assignments_work_order
  on public.work_order_assignments(work_order_id);

create index if not exists idx_work_order_assignments_employee
  on public.work_order_assignments(employee_id, created_at desc);

create or replace function public.touch_work_order_assignments_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_work_order_assignments_updated_at on public.work_order_assignments;
create trigger trg_work_order_assignments_updated_at
before update on public.work_order_assignments
for each row execute function public.touch_work_order_assignments_updated_at();

create or replace function public.enforce_max_two_mechanics()
returns trigger
language plpgsql
as $$
declare
  v_count integer;
begin
  select count(*)
  into v_count
  from public.work_order_assignments
  where work_order_id = new.work_order_id
    and (tg_op = 'INSERT' or id <> new.id);

  if v_count >= 2 then
    raise exception 'A work order can only have up to 2 mechanics';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_work_order_assignments_max_two on public.work_order_assignments;
create trigger trg_work_order_assignments_max_two
before insert or update on public.work_order_assignments
for each row execute function public.enforce_max_two_mechanics();
