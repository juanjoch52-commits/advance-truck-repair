-- Fase 1 — Base de datos de clientes (CRM)
-- Crea la jerarquía Corporación → Distritos/Sucursales → Camiones, más soporte
-- para clientes que llegan sin cita (walk-in, client_type='individual').
-- Enlaza work_reports con los nuevos FKs (nullable) MANTENIENDO las columnas de
-- texto company/truck_number (compatibilidad + walk-ins + snapshot denormalizado).
--
-- SEGURIDAD / RLS: estas tablas tienen PII y datos financieros. A diferencia del
-- resto del esquema (policies `authenticated_all USING(true)`, ver
-- [[auth-architecture-weakness]]), aquí se habilita RLS SIN ninguna policy
-- permisiva: solo el service_role (que bypasa RLS) puede leerlas/escribirlas.
-- Todo el acceso del frontend pasa por rutas API server-side (app/api/clientes/*).

-- ─── Enums ──────────────────────────────────────────────────────────────────
do $$ begin
  create type client_type as enum ('corporate', 'individual');
exception when duplicate_object then null; end $$;

do $$ begin
  create type client_payment_method as enum ('cash', 'check', 'card', 'transfer', 'credit');
exception when duplicate_object then null; end $$;

-- ─── clients ────────────────────────────────────────────────────────────────
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client_type client_type not null default 'corporate',
  contact_name text,
  phone text,
  email text,
  billing_address_line text,
  city text,
  state text,
  zip text,
  tax_id text,                       -- EIN, opcional
  default_payment_method client_payment_method not null default 'cash',
  payment_terms_days integer not null default 0 check (payment_terms_days >= 0), -- 0 = contado, 30 = net-30
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_clients_active_name on public.clients(is_active, name);

-- ─── client_locations (distritos / sucursales) ──────────────────────────────
create table if not exists public.client_locations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  billing_address_line text,
  city text,
  state text,
  zip text,
  contact_name text,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_client_locations_client on public.client_locations(client_id);

-- ─── trucks (camiones / unidades) ───────────────────────────────────────────
-- Para corporativos pueden colgar de un distrito; para walk-ins cuelgan directo
-- del client con location_id null.
create table if not exists public.trucks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  location_id uuid references public.client_locations(id) on delete set null,
  unit_number text,
  plate text,
  make text,
  model text,
  year integer,
  vin text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_trucks_client on public.trucks(client_id);
create index if not exists idx_trucks_location on public.trucks(location_id);

-- ─── Triggers updated_at (reutiliza touch_updated_at() existente) ────────────
create trigger trg_clients_updated_at
before update on public.clients
for each row execute function public.touch_updated_at();

create trigger trg_client_locations_updated_at
before update on public.client_locations
for each row execute function public.touch_updated_at();

create trigger trg_trucks_updated_at
before update on public.trucks
for each row execute function public.touch_updated_at();

-- ─── Enlace con work_reports ────────────────────────────────────────────────
-- FKs nullable. Se MANTIENEN company/truck_number (texto) por compatibilidad,
-- walk-ins y snapshot denormalizado.
alter table public.work_reports
  add column if not exists client_id   uuid references public.clients(id)          on delete set null,
  add column if not exists location_id uuid references public.client_locations(id) on delete set null,
  add column if not exists truck_id    uuid references public.trucks(id)           on delete set null;

create index if not exists idx_work_reports_client   on public.work_reports(client_id);
create index if not exists idx_work_reports_location on public.work_reports(location_id);
create index if not exists idx_work_reports_truck    on public.work_reports(truck_id);

-- ─── RLS: enable + deny-all (solo service_role accede) ──────────────────────
alter table public.clients          enable row level security;
alter table public.client_locations enable row level security;
alter table public.trucks           enable row level security;

-- Forzar RLS incluso para el owner de la tabla (defensa en profundidad). El
-- service_role sigue bypaseando RLS, que es como el frontend accede vía API.
alter table public.clients          force row level security;
alter table public.client_locations force row level security;
alter table public.trucks           force row level security;
