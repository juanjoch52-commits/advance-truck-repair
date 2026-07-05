-- Facturación ronda 2: seguimiento de seguros, cotización→factura y notas de crédito.
--
-- 1) invoices.insurance_status: seguimiento del reclamo al seguro. Texto libre
--    controlado por la app: 'sent' | 'approved' | 'partial' | 'paid' | 'denied'
--    (null = sin seguimiento). Solo informativo; el dinero real entra por pagos.
--
-- 2) invoices.converted_to_invoice_id: en una COTIZACIÓN (document_type='estimate'),
--    apunta a la factura borrador creada al convertirla. Evita convertir dos veces
--    y deja el rastro cotización→factura.
--
-- 3) invoice_credits: NOTAS DE CRÉDITO contra una factura emitida (corrección de
--    monto / devolución parcial sin anular toda la factura). Reducen el saldo:
--    balance = total − pagado − créditos. Numeradas <número de factura>-NC<n>.
--    El dinero pagado NO se toca (no es un reembolso); si la factura ya está
--    totalmente pagada no aplica (amount ≤ balance).
--
-- RLS: deny-all + force (igual que el resto del módulo de facturación server-side).

alter table public.invoices
  add column if not exists insurance_status text,
  add column if not exists converted_to_invoice_id uuid references public.invoices(id) on delete set null;

create table if not exists public.invoice_credits (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  credit_number text not null,
  amount numeric(12,2) not null check (amount > 0),
  reason text,
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists idx_invoice_credits_invoice on public.invoice_credits(invoice_id, created_at desc);

alter table public.invoice_credits enable row level security;
alter table public.invoice_credits force  row level security;
