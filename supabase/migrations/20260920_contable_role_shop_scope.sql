-- Rol 'contable' (asistente contable) + alcance por taller.
--
-- Contexto: hasta ahora los roles de profiles eran super_admin / owner / admin,
-- y NINGÚN usuario estaba limitado a un taller (todos ven ambos negocios). Este
-- rol nuevo es de SOLO LECTURA y queda restringido a un único taller (shop_id):
--   - Facturación + cuentas por cobrar + reporte por taller → filtrados a SU taller.
--   - Nómina → completa (los empleados no están asignados a un taller; la nómina
--     es a nivel de empresa). Decisión del dueño: ver [[next-phase-crm-invoicing]].
-- La restricción de "solo su taller" se hace SERVER-SIDE en cada endpoint de
-- lectura (shop_id de la sesión); las tablas siguen con RLS deny-all + service_role.
-- El bloqueo de escritura se logra NO otorgando el rol 'contable' en ningún
-- endpoint de escritura (default-deny). Ver [[auth-architecture-weakness]].

-- 1) Taller asignado. Nullable: null para roles globales (owner/admin/super_admin);
--    obligatorio para 'contable' (se fuerza con el CHECK de abajo).
alter table public.profiles
  add column if not exists shop_id uuid references public.shops(id) on delete set null;

-- 2) Ampliar el CHECK de role para admitir 'contable'.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role = any (array['super_admin'::text, 'owner'::text, 'admin'::text, 'contable'::text]));

-- 3) Integridad: un 'contable' SIEMPRE debe tener un taller asignado.
alter table public.profiles drop constraint if exists profiles_contable_shop_chk;
alter table public.profiles
  add constraint profiles_contable_shop_chk
  check (role <> 'contable' or shop_id is not null);

comment on column public.profiles.shop_id is
  'Taller asignado. Obligatorio para role=contable (usuario de solo lectura limitado a un taller); null para roles globales.';
