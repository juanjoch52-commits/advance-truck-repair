-- Security hardening — Fase 1 segura (no rompe el frontend).
-- 1) Storage: bloquear inserts/updates/deletes desde anon en bucket work-evidence.
--    Las subidas via API server siguen funcionando (usan service role que bypasa RLS).
-- 2) Funciones: REVOKE EXECUTE de handle_new_user para anon/authenticated.
-- 3) Funciones: SET search_path = pg_catalog, public para evitar schema hijacking.
--
-- Lo que NO hace esta migración (pendiente para próxima fase):
-- - NO quita las policies `authenticated_all` con USING(true) en tablas porque el
--   frontend usa el cliente browser con anon key y rompería todo. Refactor pendiente:
--   migrar todas las queries directas del frontend a APIs server-side.

-- 1) Storage lockdown
drop policy if exists "work-evidence-anon-insert" on storage.objects;
drop policy if exists "work-evidence-anon-update" on storage.objects;
drop policy if exists "work-evidence-anon-delete" on storage.objects;

-- 2) Revocar EXECUTE en handle_new_user para anon/authenticated/public
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.handle_new_user() from public;

-- 3) Fijar search_path en funciones (anti-hijacking)
alter function public.get_weekly_cutoff(p_week_start date, p_week_end date) set search_path = pg_catalog, public;
alter function public.process_weekly_debt_deductions(p_week_ending date) set search_path = pg_catalog, public;
alter function public.sync_debt_status() set search_path = pg_catalog, public;
alter function public.sync_earned_on_assignment() set search_path = pg_catalog, public;
alter function public.touch_updated_at() set search_path = pg_catalog, public;
