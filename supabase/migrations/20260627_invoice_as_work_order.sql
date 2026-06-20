-- Facturar estilo "orden de trabajo": cliente esporádico (walk-in) + hasta 2
-- mecánicos por tarea + crear la orden de trabajo al EMITIR.
--
-- Contexto: el dueño quiere que crear una factura se sienta como crear una orden
-- de trabajo (/ordenes/nueva, ReportForm): cliente (registrado o esporádico),
-- tareas con quién trabajó, y al emitir que nazca automáticamente una orden de
-- trabajo amarrada para que las comisiones caigan en la planilla — UNA sola vez.
--
-- 1) invoices.customer_name: cliente esporádico/walk-in escrito a mano, sin ficha
--    en el CRM (espejo de work_reports.company para clientes no registrados).
--    client_id ya es nullable, así que una factura puede ir solo con customer_name.
--
-- 2) invoice_item_assignments: hasta 2 mecánicos por renglón de mano de obra, cada
--    uno con su % de comisión. Es el espejo de task_assignments de la orden de
--    trabajo; permite guardar los mecánicos en el BORRADOR y mapearlos 1:1 a
--    task_assignments + earned_entries al emitir. Reemplaza el modelo viejo de
--    un-solo-mecánico por renglón (invoice_items.mechanic_id/commission_pct), que
--    queda sin uso pero se conserva por compatibilidad.
--
-- SEGURIDAD / RLS: deny-all + force como el resto del módulo de facturación; el
-- acceso es solo server-side por las rutas API. Ver [[auth-architecture-weakness]].

alter table public.invoices
  add column if not exists customer_name text;

create table if not exists public.invoice_item_assignments (
  id uuid primary key default gen_random_uuid(),
  invoice_item_id uuid not null references public.invoice_items(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  commission_pct numeric(5,2) not null default 50 check (commission_pct >= 0 and commission_pct <= 100),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_invoice_item_assignments_item
  on public.invoice_item_assignments(invoice_item_id, sort_order);
create index if not exists idx_invoice_item_assignments_employee
  on public.invoice_item_assignments(employee_id);

alter table public.invoice_item_assignments enable row level security;
alter table public.invoice_item_assignments force  row level security;
