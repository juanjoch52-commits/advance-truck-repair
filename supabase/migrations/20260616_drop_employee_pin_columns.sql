-- Elimina el subsistema de login por PIN (ya no se usa: el acceso es 100% por
-- correo + contraseña vía Supabase Auth). Quita las columnas de PIN de
-- employees, incluyendo el PIN en texto plano (`access_pin`,
-- `temporary_pin_plain`) que era un riesgo de seguridad.
--
-- Endpoints/archivos eliminados junto con esta migración:
--   /api/auth/pin-login, /api/mecanico/login, /api/auth/update-pin,
--   /api/accesos/credenciales, /api/accesos/[id]/reset-pin,
--   /api/debug/pin-check, lib/pinSecurity.ts

alter table public.employees drop column if exists access_pin;
alter table public.employees drop column if exists is_temporary_pin;
alter table public.employees drop column if exists temporary_pin_plain;
