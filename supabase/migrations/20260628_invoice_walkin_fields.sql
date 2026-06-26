-- Datos opcionales del cliente OCASIONAL (walk-in) en la factura.
--
-- Contexto: para un cliente registrado, camión/empresa/teléfono viven en el CRM
-- (truck_id FK, ficha del cliente). Para el cliente ocasional —que se factura
-- solo con customer_name, sin ficha— no había dónde anotar esos datos. El dueño
-- pidió poder capturarlos a mano (todos opcionales), igual que la orden de
-- trabajo guarda truck_number/company a texto para no registrados.
--
-- Solo aplican cuando NO hay client_id (la ruta API los guarda solo en ese caso).

alter table public.invoices
  add column if not exists customer_company text,
  add column if not exists customer_phone text,
  add column if not exists customer_truck text;
