-- Envío de facturas por correo — auditoría (OPCIONAL, aplicar al activar el envío).
--
-- El código de /api/facturas/[id]/enviar actualiza estas dos columnas de forma
-- "best-effort": si no existen, el envío funciona igual (solo se pierde el rastro
-- de cuándo/ a quién se envió). Aplicar esta migración cuando se encienda el
-- correo para conservar la auditoría. NO aplicada aún (el envío está apagado).

alter table public.invoices
  add column if not exists last_emailed_at timestamptz,
  add column if not exists last_emailed_to text;

comment on column public.invoices.last_emailed_at is 'Última vez que se envió la factura por correo al cliente.';
comment on column public.invoices.last_emailed_to is 'Correo destino del último envío de la factura.';
