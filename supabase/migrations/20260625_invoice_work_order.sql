-- Enlace factura → orden de trabajo (work_reports) para compartir el número de orden.
--
-- El dueño crea órdenes de trabajo en /ordenes (tabla work_reports) con su número
-- de orden (external_order_number). Al facturar quiere que la factura lleve EL MISMO
-- número de orden que esa orden de trabajo. Guardamos:
--   work_report_id → enlace a la orden de trabajo
--   order_number   → "foto" del número de orden (external_order_number) en la factura,
--                    para que se conserve aunque la orden cambie o se borre.
--
-- FK on delete set null: si se borra la orden, la factura conserva el número en
-- order_number y solo pierde el enlace.
alter table public.invoices
  add column if not exists work_report_id uuid references public.work_reports(id) on delete set null,
  add column if not exists order_number text;

create index if not exists idx_invoices_work_report on public.invoices(work_report_id);
