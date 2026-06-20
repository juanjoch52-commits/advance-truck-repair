-- Anulación / reversa de pagos (corrección de pagos mal registrados o devueltos).
--
-- En vez de borrar el pago (se perdería el rastro), se marca como anulado y se
-- recalcula el saldo de la factura sumando solo los pagos NO anulados. Queda la
-- auditoría: quién lo anuló, cuándo y por qué. El comprobante de un pago anulado
-- ya no es válido.
alter table public.invoice_payments
  add column if not exists voided boolean not null default false,
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by_name text,
  add column if not exists void_reason text;
