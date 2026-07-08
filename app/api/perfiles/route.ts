import { NextResponse } from 'next/server';
import { authErrorResponse } from '@/lib/apiAuth';
import { requireOwnerAccess, sanitizeDbError } from '@/lib/payrollApi';

// Gestión de usuarios/perfiles (owner/super_user solamente).
// Contrato:
//   GET   → { users, me: { id, role } }
//           users: perfiles ordenados por created_at; me.role es el rol del
//           perfil del solicitante en BD ('super_admin' | 'owner' | 'admin').
//   PATCH { id, role } → cambia el rol de un usuario. Reglas (en servidor):
//           - solo roles asignables: 'admin' | 'owner'
//           - nadie puede tocar a un usuario con rol 'super_admin'
//           - nadie puede cambiarse el rol a sí mismo

const ASSIGNABLE_ROLES = ['admin', 'owner'];

export async function GET() {
  try {
    const { session, supabase } = await requireOwnerAccess();

    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, created_at')
      .order('created_at');

    if (error) return NextResponse.json({ error: sanitizeDbError('perfiles', error.message) }, { status: 500 });

    const users = data ?? [];
    const meRole = users.find((u: { id: string }) => u.id === session.id)?.role ?? '';
    return NextResponse.json({ users, me: { id: session.id, role: meRole } });
  } catch (error) {
    const resp = authErrorResponse(error);
    if (resp) return resp;
    throw error;
  }
}

export async function PATCH(request: Request) {
  try {
    const { session, supabase } = await requireOwnerAccess();
    const body = await request.json().catch(() => ({}));
    const id = String(body.id ?? '').trim();
    const role = String(body.role ?? '').trim();

    if (!id || !ASSIGNABLE_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
    }
    // No puedes cambiarte el rol a ti mismo.
    if (id === session.id) {
      return NextResponse.json({ error: 'No puedes cambiar tu propio rol' }, { status: 403 });
    }

    // Verificar el rol actual del usuario objetivo: al super_admin nadie lo toca.
    const { data: target, error: targetErr } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', id)
      .maybeSingle();

    if (targetErr) return NextResponse.json({ error: sanitizeDbError('perfiles', targetErr.message) }, { status: 500 });
    if (!target) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    if (target.role === 'super_admin') {
      return NextResponse.json({ error: 'No autorizado para esta acción' }, { status: 403 });
    }

    const { error } = await supabase
      .from('profiles')
      .update({ role })
      .eq('id', id);

    if (error) return NextResponse.json({ error: sanitizeDbError('perfiles', error.message) }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const resp = authErrorResponse(error);
    if (resp) return resp;
    throw error;
  }
}
