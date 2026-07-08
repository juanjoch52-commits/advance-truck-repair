-- Security hardening — Fase final: cerrar el acceso directo del navegador.
--
-- Prerrequisito: el frontend ya NO consulta ninguna tabla con el cliente
-- browser (todas las páginas de nómina/asistencia/órdenes/reportes pasan por
-- rutas API server-side con requireRole + service_role). Aplicar esta
-- migración ANTES de desplegar ese código rompería la app en producción.
--
-- Tras esta migración, el rol authenticated queda deny-all en todas las
-- tablas (igual que ya lo estaban clients/invoices/etc.), y el service_role
-- (solo servidor) sigue operando porque bypasa RLS.

-- 1) Nómina/asistencia: quitar las policies abiertas USING(true).
drop policy if exists authenticated_all on public.attendance;
drop policy if exists authenticated_all on public.debt_payments;
drop policy if exists authenticated_all on public.debts;
drop policy if exists authenticated_all on public.earned_entries;
drop policy if exists authenticated_all on public.employees;
drop policy if exists authenticated_all on public.loans;
drop policy if exists authenticated_all on public.one_time_deductions;
drop policy if exists authenticated_all on public.profiles;
drop policy if exists authenticated_all on public.report_logs;
drop policy if exists authenticated_all on public.report_tasks;
drop policy if exists authenticated_all on public.task_assignments;
drop policy if exists authenticated_all on public.work_reports;

-- 2) profiles: quitar las policies de "fila propia". profiles_update_own no
--    restringía columnas: cualquier usuario podía auto-asignarse role='owner'
--    (escalada de privilegios). El único write propio que usaba el frontend
--    (must_change_password) ahora pasa por /api/auth/password-changed.
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;

-- 3) Storage (bucket work-evidence): quitar escritura de anon y authenticated.
--    Se conserva la lectura pública (work-evidence-public-read-compatible)
--    para que las fotos ya enlazadas sigan visibles; las subidas van por API
--    server-side (service_role).
drop policy if exists "Give anon users access to JPG images in folder 1ih21lf_0" on storage.objects;
drop policy if exists "Give anon users access to JPG images in folder 1ih21lf_1" on storage.objects;
drop policy if exists "Give anon users access to JPG images in folder 1ih21lf_2" on storage.objects;
drop policy if exists "Give anon users access to JPG images in folder 1ih21lf_3" on storage.objects;
drop policy if exists "work-evidence-authenticated-insert" on storage.objects;
drop policy if exists "work-evidence-authenticated-update" on storage.objects;
drop policy if exists "work-evidence-authenticated-delete" on storage.objects;

-- 4) Funciones: cerrar la superficie RPC de PostgREST. Los triggers siguen
--    funcionando (corren como dueño de la tabla, no necesitan estos grants).
revoke execute on function public.get_weekly_cutoff(date, date) from public, anon, authenticated;
revoke execute on function public.next_shop_invoice_number(uuid, date) from public, anon, authenticated;
revoke execute on function public.process_weekly_debt_deductions(date) from public, anon, authenticated;
revoke execute on function public.sync_debt_status() from public, anon, authenticated;
revoke execute on function public.sync_earned_on_assignment() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;

-- El servidor (rutas API de facturación) llama next_shop_invoice_number via
-- .rpc() con service_role; al revocar de PUBLIC hay que devolverle el grant
-- explícito. Los triggers no lo necesitan (corren como dueño de la tabla).
grant execute on function public.next_shop_invoice_number(uuid, date) to service_role;
grant execute on function public.get_weekly_cutoff(date, date) to service_role;
grant execute on function public.process_weekly_debt_deductions(date) to service_role;

-- Evitar que futuras funciones nazcan ejecutables por anon/authenticated.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
