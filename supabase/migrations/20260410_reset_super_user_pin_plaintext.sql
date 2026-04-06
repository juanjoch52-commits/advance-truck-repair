-- Emergency fix: ensure SUPER_USER has plain-text PIN '2026'.
-- This overwrites any previously hashed value.

update public.employees
set
  access_pin         = '2026',
  is_temporary_pin   = false,
  temporary_pin_plain = null
where role = 'SUPER_USER'::employee_role;
