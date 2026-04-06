-- Reset ALL PINs to plain text.
-- SUPER_USER gets PIN 2026.
-- All other employees get a random 4-digit plain-text PIN (visible in temporary_pin_plain).

do $$
declare
  v_super_id uuid;
  v_emp record;
  v_pin text;
begin
  -- Fix SUPER_USER first
  update public.employees
  set
    access_pin          = '2026',
    is_temporary_pin    = false,
    temporary_pin_plain = null
  where role = 'SUPER_USER'::employee_role
  returning id into v_super_id;

  -- Reset all other employees to a plain 4-digit temp PIN
  for v_emp in
    select id from public.employees
    where role <> 'SUPER_USER'::employee_role
  loop
    v_pin := lpad((floor(random() * 9000)::int + 1000)::text, 4, '0');
    update public.employees
    set
      access_pin          = v_pin,
      is_temporary_pin    = true,
      temporary_pin_plain = v_pin
    where id = v_emp.id;
  end loop;
end;
$$;
