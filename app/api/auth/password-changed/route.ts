import { NextResponse } from 'next/server';
import { requireSession, authErrorResponse } from '@/lib/apiAuth';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

// Marca must_change_password=false para el PROPIO usuario de la sesión.
// No acepta parámetros del cliente: el id sale de la cookie firmada.
// Se llama justo después de que el usuario cambia su contraseña temporal,
// ANTES de re-emitir la cookie en /api/auth/session (que lee esta bandera).
export async function POST() {
  try {
    const session = await requireSession();
    const supabase = getSupabaseServerClient();

    const { error } = await supabase
      .from('profiles')
      .update({ must_change_password: false })
      .eq('id', session.id);

    if (error) {
      return NextResponse.json({ error: 'No se pudo actualizar el perfil' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const resp = authErrorResponse(error);
    if (resp) return resp;
    throw error;
  }
}
