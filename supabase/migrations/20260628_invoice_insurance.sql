-- Facturación a SEGUROS: aseguradora + número de reclamo/póliza.
--
-- Contexto: muchos trabajos se cobran a la compañía de seguros del cliente. La
-- factura se envía ANTES del pago (forma de pago "a crédito" → queda abierta en
-- CxC) y el seguro paga después. Estos campos identifican a quién se le cobra y
-- bajo qué reclamo, y salen impresos en la factura/PDF.
--
-- Aplican a cualquier factura (cliente registrado u ocasional). Opcionales.

alter table public.invoices
  add column if not exists insurance_company text,
  add column if not exists insurance_claim text;
