-- Final bootstrap for access credentials:
-- 1) Ensure Juan Chávez Medina exists as SUPER_USER with PIN 2026
-- 2) Force all other employees into temporary PIN onboarding

create extension if not exists pgcrypto;

do $$
declare
  v_juan_id uuid;
  v_pin text;
  v_employee record;
begin
  -- Ensure enum has SUPER_USER
  if not exists (
    select 1
    from pg_enum
    where enumlabel = 'SUPER_USER'
      and enumtypid = (select oid from pg_type where typname = 'employee_role')
  ) then
    alter type employee_role add value 'SUPER_USER';
  end if;

  -- Ensure columns used by temporary-PIN flows
  alter table public.employees
    add column if not exists is_temporary_pin boolean not null default false,
    add column if not exists temporary_pin_plain text;

  -- Reuse existing SUPER_USER if present, otherwise create one
  select id into v_juan_id
  from public.employees
  where role = 'SUPER_USER'::employee_role
  order by created_at asc
  limit 1;

  if v_juan_id is null then
    insert into public.employees (
      full_name,
      phone,
      email,
      address,
      hire_date,
      access_pin,
      is_temporary_pin,
      temporary_pin_plain,
      role,
      notes
    ) values (
      'Juan Chávez Medina',
      null,
      'juan@jrcsmartsystems.com',
      null,
      current_date,
      '2026',
      false,
      null,
      'SUPER_USER'::employee_role,
      'Super-admin de JRC Smart Systems'
    )
    returning id into v_juan_id;
  end if;

  -- Normalize Juan account with required name and PIN
  update public.employees
  set
    full_name = 'Juan Chávez Medina',
    role = 'SUPER_USER'::employee_role,
    access_pin = '2026',
    is_temporary_pin = false,
    temporary_pin_plain = null,
    notes = coalesce(notes, 'Super-admin de JRC Smart Systems')
  where id = v_juan_id;

  -- For all other employees: reset to temporary PIN and mark pending change
  for v_employee in
    select id
    from public.employees
    where id <> v_juan_id
  loop
    v_pin := lpad((floor(random() * 10000)::int)::text, 4, '0');

    update public.employees
    set
      access_pin = v_pin,
      is_temporary_pin = true,
      temporary_pin_plain = v_pin
    where id = v_employee.id;
  end loop;
end
$$;
