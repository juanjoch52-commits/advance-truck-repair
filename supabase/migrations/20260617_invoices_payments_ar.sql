-- Facturación + pagos + cuentas por cobrar.
-- Factura con método de pago (cash/check/card/deposit/credit). Si es 'credit'
-- (préstamo / a crédito), la factura queda abierta y entra a cuentas por cobrar;
-- los pagos parciales se registran en invoice_payments y bajan el saldo.
--
-- shop_id es nullable: el modelo de DOS negocios (intercompany) se completa en
-- una fase posterior, tras validación del CPA. Aquí solo es la referencia.
--
-- SEGURIDAD / RLS: deny-all como el resto (clients/shops): solo service_role;
-- el frontend pasa por rutas API server-side. Ver [[auth-architecture-weakness]].

do $$ begin
  create type invoice_payment_method as enum ('cash', 'check', 'card', 'deposit', 'credit');
exception when duplicate_object then null; end $$;

do $$ begin
  create type invoice_status as enum ('draft', 'open', 'partial', 'paid', 'void');
exception when duplicate_object then null; end $$;

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references public.shops(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  location_id uuid references public.client_locations(id) on delete set null,
  document_number text,
  issue_date date not null default current_date,
  due_date date,
  payment_method invoice_payment_method not null default 'cash',
  status invoice_status not null default 'open',
  subtotal numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  amount_paid numeric(12,2) not null default 0,
  balance numeric(12,2) not null default 0,
  description text,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_invoices_status on public.invoices(status);
create index if not exists idx_invoices_client on public.invoices(client_id);
create index if not exists idx_invoices_due on public.invoices(due_date);
create index if not exists idx_invoices_shop on public.invoices(shop_id);

create table if not exists public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  method invoice_payment_method not null,
  reference text,                            -- # de cheque, referencia de depósito, etc.
  paid_at date not null default current_date,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_invoice_payments_invoice on public.invoice_payments(invoice_id, paid_at desc);

create trigger trg_invoices_updated_at
before update on public.invoices
for each row execute function public.touch_updated_at();

alter table public.invoices         enable row level security;
alter table public.invoice_payments enable row level security;
alter table public.invoices         force row level security;
alter table public.invoice_payments force row level security;
