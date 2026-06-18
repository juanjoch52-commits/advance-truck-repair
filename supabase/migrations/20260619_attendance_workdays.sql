-- Control de asistencia para empleados en planilla (asalariados) + días laborales.
--
-- Modelo de pago (confirmado con el dueño): el pago de cada día = salario semanal
-- ÷ número de días laborales del empleado. Cada FALTA resta un día. Solo se
-- registran las faltas (con razón); un día laboral SIN registro = presente.
--   pago_semana = weekly_salary − (faltas_de_la_semana × weekly_salary/nº_días_laborales)
--
-- 1) employees.work_days: días laborales esperados por empleado, como arreglo de
--    enteros 0..6 (0=Domingo .. 6=Sábado, igual que JS getDay()). Default Lun–Sáb.
--
-- 2) attendance: un renglón por (empleado, fecha). status 'present' | 'absent';
--    cuando 'absent' se guarda absence_reason. UNIQUE(employee_id, work_date).
--
-- RLS: igual que employees/earned_entries (subsistema de nómina, cliente
-- autenticado del navegador) → RLS habilitado con policy authenticated_all
-- (FOR ALL TO authenticated USING(true)). NO es el patrón server-side/deny-all
-- del CRM; se mantiene la consistencia con la nómina existente. La debilidad de
-- estas policies abiertas está registrada como hardening pendiente aparte.

alter table public.employees
  add column if not exists work_days smallint[] not null default '{1,2,3,4,5,6}';

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date date not null,
  status text not null default 'present' check (status in ('present', 'absent')),
  absence_reason text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, work_date)
);

create index if not exists idx_attendance_employee_date on public.attendance(employee_id, work_date desc);
create index if not exists idx_attendance_date on public.attendance(work_date);

create trigger trg_attendance_updated_at
before update on public.attendance
for each row execute function public.touch_updated_at();

alter table public.attendance enable row level security;
create policy authenticated_all on public.attendance
  for all to authenticated using (true) with check (true);
