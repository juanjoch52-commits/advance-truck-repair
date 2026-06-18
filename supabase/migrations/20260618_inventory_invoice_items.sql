-- Inventario de bodega (compartido) + renglones de factura con piezas.
--
-- Decisiones (2026-06-18):
-- - Bodega ÚNICA compartida por ambos talleres (sin shop_id).
-- - Gasto = al COMPRAR (restock a bodega o pieza one-off para un trabajo).
--   Vender de bodega NO es gasto nuevo (su costo es COGS para la ganancia).
--
-- SEGURIDAD/RLS: deny-all + force como el resto; acceso solo server-side. Ver [[auth-architecture-weakness]].

do $$ begin create type inventory_movement_type as enum ('purchase','sale','adjustment','return'); exception when duplicate_object then null; end $$;
do $$ begin create type invoice_line_type as enum ('labor','part','fee'); exception when duplicate_object then null; end $$;
do $$ begin create type part_source as enum ('new_purchased','used','warehouse'); exception when duplicate_object then null; end $$;

-- Catálogo de piezas en bodega.
create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  part_number text,                                  -- SKU / # de parte
  name text not null,
  description text,
  unit_cost numeric(12,2) not null default 0,        -- costo actual de la pieza
  sale_price numeric(12,2) not null default 0,       -- precio sugerido de venta
  quantity_on_hand numeric(12,2) not null default 0, -- stock actual
  reorder_level numeric(12,2) not null default 0,    -- alerta de bajo stock (0 = sin alerta)
  location text,                                     -- ubicación / estante
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_inventory_items_active on public.inventory_items(is_active, name);

-- Kárdex: entradas (compras/ajustes) y salidas (ventas en facturas).
create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  movement_type inventory_movement_type not null,
  quantity numeric(12,2) not null,                   -- + entra / - sale
  unit_cost numeric(12,2) not null default 0,
  reference text,
  invoice_id uuid references public.invoices(id) on delete set null,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_inventory_movements_item on public.inventory_movements(inventory_item_id, created_at desc);
create index if not exists idx_inventory_movements_invoice on public.inventory_movements(invoice_id);

-- Renglones de factura (mano de obra / piezas / cargos). Las piezas pueden venir
-- de bodega (inventory_item_id) o ser one-off (con costo escrito a mano).
create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  line_type invoice_line_type not null default 'part',
  description text,
  qty numeric(12,2) not null default 1,
  unit_price numeric(12,2) not null default 0,       -- precio cobrado al cliente (unitario)
  amount numeric(12,2) not null default 0,           -- = qty * unit_price
  cost numeric(12,2) not null default 0,             -- costo unitario (para ganancia / gasto)
  part_source part_source,                           -- origen de la pieza (si line_type='part')
  inventory_item_id uuid references public.inventory_items(id) on delete set null,
  taxable boolean not null default false,            -- piezas suelen ir gravadas; mano de obra no
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_invoice_items_invoice on public.invoice_items(invoice_id, sort_order);

create trigger trg_inventory_items_updated_at
before update on public.inventory_items
for each row execute function public.touch_updated_at();

alter table public.inventory_items    enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.invoice_items       enable row level security;
alter table public.inventory_items    force row level security;
alter table public.inventory_movements force row level security;
alter table public.invoice_items       force row level security;
