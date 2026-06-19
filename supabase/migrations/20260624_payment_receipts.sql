-- Comprobantes de pago + tipo de pago + auditoría de quién lo registró.
--
-- En facturas abiertas se reciben pagos parciales que el dueño clasifica como:
--   deposit    = depósito
--   advance    = adelanto
--   settlement = cancelación (liquida el saldo)
-- (el método —efectivo/cheque/tarjeta/depósito— es independiente del tipo).
--
-- Cada pago genera un COMPROBANTE imprimible para el cliente que queda guardado
-- en el sistema para reimprimirlo después. Guardamos:
--   receipt_number  → folio del comprobante (por factura: <doc>-R<n>)
--   created_by_name → nombre de quien registró el pago (auditoría; snapshot,
--                     porque created_by es solo el id y la sesión trae el nombre)
alter table public.invoice_payments
  add column if not exists payment_type text not null default 'payment',
  add column if not exists receipt_number text,
  add column if not exists created_by_name text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'invoice_payments_payment_type_check') then
    alter table public.invoice_payments
      add constraint invoice_payments_payment_type_check
      check (payment_type in ('payment', 'deposit', 'advance', 'settlement'));
  end if;
end $$;
