-- Auditoría de asistencia: quién registró / quién modificó cada falta.
--
-- Contexto: la administración registra la asistencia (marca faltas) pero NO ve
-- los salarios. El dueño necesita saber QUIÉN marcó cada falta y CUÁNDO, y quién
-- la modificó por última vez, para confiar en los datos al armar la planilla
-- administrativa (las faltas prorratean el sueldo fijo).
--
-- Patrón: snapshot de NOMBRE (igual que work_reports.created_by_name e
-- invoice_payments.created_by_name), no FK. Se guarda el nombre tal cual estaba
-- al momento del registro/modificación.
--
-- created_at / updated_at ya existen en la tabla (20260619). updated_at se
-- actualiza solo con el trigger trg_attendance_updated_at en cada UPDATE.

alter table public.attendance
  add column if not exists created_by_name text,
  add column if not exists updated_by_name text;
