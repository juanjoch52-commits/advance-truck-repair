-- Datos de facturación por taller (negocio).
-- Soporta los DOS negocios distintos del esquema intercompany: cada fila = un
-- taller con su identidad fiscal (EIN, certificado de sales tax), su condado,
-- su tasa de impuesto y su numeración de factura propia.
--
-- En EE.UU. no hay folio fiscal validado por el gobierno: los "números legales"
-- de la factura son el EIN (Federal Tax ID), el Sales Tax Certificate (FL DOR) y
-- el número correlativo que pone el propio negocio.
--
-- SEGURIDAD / RLS: igual que el CRM (clients/trucks), RLS deny-all: solo el
-- service_role accede; el frontend pasa por rutas API server-side
-- (app/api/shops/*) restringidas a owner / super_user. Ver [[auth-architecture-weakness]].

create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,                          -- nombre corto para identificar el taller
  legal_name text,                             -- razón social / legal business name
  ein text,                                    -- Federal Tax ID (EIN) — IRS
  sales_tax_certificate text,                  -- FL Sales Tax Certificate Number (FL DOR)
  county text,                                 -- condado (determina la sobretasa de sales tax)
  billing_address_line text,
  city text,
  state text default 'FL',
  zip text,
  phone text,
  email text,
  tax_rate numeric(6,4) not null default 0 check (tax_rate >= 0 and tax_rate <= 100), -- % sales tax (ej. 7.0000 = 7%)
  invoice_prefix text,                         -- ej. "ATR-"
  next_invoice_number integer not null default 1 check (next_invoice_number >= 1),
  logo_url text,
  notes text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_shops_active on public.shops(is_active, sort_order);

create trigger trg_shops_updated_at
before update on public.shops
for each row execute function public.touch_updated_at();

alter table public.shops enable row level security;
alter table public.shops force row level security;
