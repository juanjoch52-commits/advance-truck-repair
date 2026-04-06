create extension if not exists pgcrypto;

create type employee_role as enum ('mechanic', 'admin');
create type one_time_deduction_type as enum ('warranty', 'advance', 'other');

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  email text,
  address text,
  hire_date date not null,
  access_pin text not null,
  role employee_role not null default 'mechanic',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employees_email_unique unique (email),
  constraint employees_pin_min_length check (char_length(access_pin) >= 4)
);

create table if not exists public.work_orders (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date date not null default current_date,
  company text not null,
  unit text not null,
  invoice_number text not null,
  labor_amount numeric(12,2) not null check (labor_amount >= 0),
  mechanic_share numeric(12,2) generated always as (round((labor_amount * 0.50)::numeric, 2)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_work_orders_employee_date
  on public.work_orders(employee_id, work_date desc);

create table if not exists public.debts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  total_amount numeric(12,2) not null check (total_amount > 0),
  description text not null,
  weekly_installment numeric(12,2) not null check (weekly_installment > 0),
  remaining_balance numeric(12,2) not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint debts_remaining_non_negative check (remaining_balance >= 0),
  constraint debts_remaining_not_over_total check (remaining_balance <= total_amount)
);

create index if not exists idx_debts_employee_active
  on public.debts(employee_id, is_active, created_at desc);

create table if not exists public.debt_payments (
  id uuid primary key default gen_random_uuid(),
  debt_id uuid not null references public.debts(id) on delete cascade,
  week_ending date not null,
  amount numeric(12,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  constraint debt_payments_unique_week unique (debt_id, week_ending)
);

create table if not exists public.one_time_deductions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_order_id uuid references public.work_orders(id) on delete set null,
  deduction_type one_time_deduction_type not null,
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  report_week_ending date not null,
  applied boolean not null default false,
  applied_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_one_time_deductions_employee_week
  on public.one_time_deductions(employee_id, report_week_ending desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_employees_updated_at
before update on public.employees
for each row execute function public.touch_updated_at();

create trigger trg_work_orders_updated_at
before update on public.work_orders
for each row execute function public.touch_updated_at();

create trigger trg_debts_updated_at
before update on public.debts
for each row execute function public.touch_updated_at();

create or replace function public.sync_debt_status()
returns trigger
language plpgsql
as $$
begin
  if new.remaining_balance <= 0 then
    new.remaining_balance = 0;
    new.is_active = false;
  else
    new.is_active = true;
  end if;

  return new;
end;
$$;

create trigger trg_sync_debt_status
before insert or update of remaining_balance on public.debts
for each row execute function public.sync_debt_status();

create or replace function public.process_weekly_debt_deductions(p_week_ending date default current_date)
returns table(debt_id uuid, employee_id uuid, deducted_amount numeric, new_remaining_balance numeric)
language plpgsql
as $$
declare
  v_deduction numeric(12,2);
  v_row public.debts%rowtype;
begin
  for v_row in
    select *
    from public.debts
    where is_active = true
      and remaining_balance > 0
  loop
    if exists (
      select 1
      from public.debt_payments dp
      where dp.debt_id = v_row.id
        and dp.week_ending = p_week_ending
    ) then
      continue;
    end if;

    v_deduction = least(v_row.weekly_installment, v_row.remaining_balance);

    insert into public.debt_payments (debt_id, week_ending, amount)
    values (v_row.id, p_week_ending, v_deduction);

    update public.debts
    set remaining_balance = remaining_balance - v_deduction
    where id = v_row.id
    returning remaining_balance into v_row.remaining_balance;

    debt_id := v_row.id;
    employee_id := v_row.employee_id;
    deducted_amount := v_deduction;
    new_remaining_balance := v_row.remaining_balance;
    return next;
  end loop;

  return;
end;
$$;

create or replace view public.employee_profile_summary as
select
  e.id as employee_id,
  e.full_name,
  e.phone,
  e.email,
  e.address,
  e.hire_date,
  e.role,
  e.notes,
  coalesce(sum(wo.labor_amount), 0)::numeric(12,2) as total_labor_amount,
  coalesce(sum(wo.mechanic_share), 0)::numeric(12,2) as total_mechanic_share,
  coalesce(sum(d.remaining_balance), 0)::numeric(12,2) as total_pending_debt
from public.employees e
left join public.work_orders wo on wo.employee_id = e.id
left join public.debts d on d.employee_id = e.id and d.remaining_balance > 0
group by e.id;
