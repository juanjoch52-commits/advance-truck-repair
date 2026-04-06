-- Add onboarding temporary pin flag and super user role support.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1
    from pg_enum
    where enumlabel = 'SUPER_USER'
      and enumtypid = (select oid from pg_type where typname = 'employee_role')
  ) then
    alter type employee_role add value 'SUPER_USER';
  end if;
end;
$$;

alter table public.employees
  add column if not exists is_temporary_pin boolean not null default false,
  add column if not exists temporary_pin_plain text;

-- Create Juan (JRC Smart Systems) as SUPER_USER if not exists.
insert into public.employees (
  full_name,
  phone,
  email,
  address,
  hire_date,
  access_pin,
  is_temporary_pin,
  role,
  notes
)
select
  'Juan - JRC Smart Systems',
  null,
  'juan@jrcsmartsystems.com',
  null,
  current_date,
  '9999',
  true,
  'SUPER_USER'::employee_role,
  'Cuenta super-admin para pruebas de vistas. Debe cambiar PIN en primer acceso.'
where not exists (
  select 1 from public.employees where role = 'SUPER_USER'::employee_role
);
