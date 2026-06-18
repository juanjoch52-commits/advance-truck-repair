-- Facturas con flujo borrador → emisión → comisiones de mecánicos.
--
-- Flujo (confirmado con el dueño):
--   1. Se crea la factura como BORRADOR (status 'draft'): renglones de trabajo,
--      cada renglón de mano de obra puede llevar un mecánico asignado y un check
--      hecho/pendiente. Un borrador NO consume número fiscal ni descuenta stock.
--   2. Mientras hay tareas pendientes, la factura queda pendiente.
--   3. Al EMITIR: se asigna el número fiscal atómico, se descuenta inventario y
--      se generan las COMISIONES (50% por defecto de cada renglón de labor que
--      tenga mecánico) como earned_entries entry_type='mechanic' → entran a la
--      nómina de mecánicos igual que las órdenes de trabajo.
--
-- Convivencia con órdenes de trabajo: la comisión desde factura es OPT-IN por
-- renglón (solo el renglón de labor con mecánico asignado genera comisión). Los
-- renglones sin mecánico no generan nada → ese trabajo sigue por orden de
-- trabajo, hasta que migren del todo al sistema de facturas. Sin doble pago.

alter table public.invoice_items
  add column if not exists mechanic_id uuid references public.employees(id) on delete set null,
  add column if not exists commission_pct numeric(5,2) not null default 50,
  add column if not exists done boolean not null default false;

alter table public.invoices
  add column if not exists emitted_at timestamptz,
  add column if not exists commissions_generated boolean not null default false;

-- Trazabilidad / anti-duplicado: el devengado de comisión apunta al renglón que
-- lo generó. earned_entries tiene RLS authenticated_all (subsistema de nómina).
alter table public.earned_entries
  add column if not exists invoice_item_id uuid references public.invoice_items(id) on delete set null;

create index if not exists idx_invoice_items_mechanic on public.invoice_items(mechanic_id);
create index if not exists idx_earned_entries_invoice_item on public.earned_entries(invoice_item_id);
