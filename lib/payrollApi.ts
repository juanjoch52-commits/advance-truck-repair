import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { requireRole } from '@/lib/apiAuth';
import { getEffectiveRole, SessionUser } from '@/lib/authSession';

// Acceso a las tablas de nómina/asistencia/órdenes (employees, attendance,
// earned_entries, work_reports, report_tasks, task_assignments, debts,
// debt_payments, report_logs, profiles). Estas tablas tienen RLS deny-all:
// solo el service_role accede, y solo tras validar sesión y rol en el servidor.

// Operación general del taller: owner / admin / super_user.
export async function requirePayrollAccess() {
  const session = await requireRole('owner', 'admin', 'super_user');
  return { session, supabase: getSupabaseServerClient() };
}

// Datos sensibles (salarios, deudas, nómina administrativa, usuarios):
// SOLO owner / super_user. El rol admin no debe ver salarios.
export async function requireOwnerAccess() {
  const session = await requireRole('owner', 'super_user');
  return { session, supabase: getSupabaseServerClient() };
}

// ¿La sesión puede ver montos de salario? (owner o super_user)
export function isPrivilegedSession(session: SessionUser): boolean {
  return session.is_super_user || getEffectiveRole(session) === 'owner';
}

// No exponer detalles internos de Postgres al cliente; loguear en servidor.
export function sanitizeDbError(scope: string, message: string) {
  console.error(`[${scope}] Supabase error:`, message);
  return 'No se pudo completar la operación. Intenta de nuevo.';
}
