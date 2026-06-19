-- Camión / unidad en la factura → historial de trabajo por cliente y por camión.
--
-- La factura ya apunta a cliente (client_id) y distrito (location_id). Faltaba el
-- CAMIÓN: con truck_id podemos armar el historial de qué se le hizo a cada unidad
-- y mostrarlo en la ficha del cliente y en el PDF.
--
-- FK nullable + on delete set null: hay clientes walk-in / individuales sin camión
-- registrado (campo opcional), y si se borra el camión del CRM la factura no se
-- pierde, solo queda sin la referencia.
alter table public.invoices
  add column if not exists truck_id uuid references public.trucks(id) on delete set null;

create index if not exists idx_invoices_truck on public.invoices(truck_id);
