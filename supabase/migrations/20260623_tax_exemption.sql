-- Exención de sales tax por certificado (resale / exemption certificate, FL).
--
-- Algunas empresas presentan un certificado que las exime de pagar sales tax.
-- Se guarda en el CLIENTE (maestro: si está exento y con qué número de certificado)
-- y se "fotografía" en cada FACTURA emitida para ese cliente, porque la ley exige
-- registrar el # de certificado en la venta exenta (el cliente podría cambiar de
-- estado de exención con el tiempo, pero la factura debe conservar lo que aplicó).
--
-- Comportamiento: si el cliente está exento, el sales tax de sus facturas se fija
-- en $0 y la factura guarda tax_exempt=true + el número de certificado.
alter table public.clients
  add column if not exists tax_exempt boolean not null default false,
  add column if not exists tax_exempt_certificate text;

alter table public.invoices
  add column if not exists tax_exempt boolean not null default false,
  add column if not exists tax_exempt_certificate text;
