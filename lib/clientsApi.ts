import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { requireRole } from '@/lib/apiAuth';

// Acceso a las tablas CRM (clients/client_locations/trucks). Estas tablas tienen
// RLS deny-all: solo el service_role accede, y solo tras validar la sesión y el
// rol en el servidor. Permitido para owner / admin / super_user.
export async function requireClientsAccess() {
  await requireRole('owner', 'admin', 'super_user');
  return getSupabaseServerClient();
}

// No exponer detalles internos de Postgres al cliente; loguear en servidor.
export function sanitizeDbError(scope: string, message: string) {
  console.error(`[${scope}] Supabase error:`, message);
  return 'No se pudo completar la operación. Intenta de nuevo.';
}
