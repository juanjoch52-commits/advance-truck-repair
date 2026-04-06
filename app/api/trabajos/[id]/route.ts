import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServerSession, isJuanSuperUser } from '@/lib/authSession';

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase no configurado');
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession();

    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const canDelete =
      session.role === 'owner' ||
      isJuanSuperUser(session);

    if (!canDelete) {
      return NextResponse.json({ error: 'Solo el super-usuario o dueño puede eliminar órdenes aprobadas.' }, { status: 403 });
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'ID de orden requerido' }, { status: 400 });
    }

    const supabase = getClient();

    // Remove assignments first (FK constraint)
    const { error: assignmentsError } = await supabase
      .from('work_order_assignments')
      .delete()
      .eq('work_order_id', id);

    if (assignmentsError) {
      return NextResponse.json({ error: `Error al eliminar asignaciones: ${assignmentsError.message}` }, { status: 500 });
    }

    // Now delete the work order itself
    const { error: orderError } = await supabase
      .from('work_orders')
      .delete()
      .eq('id', id);

    if (orderError) {
      return NextResponse.json({ error: `Error al eliminar orden: ${orderError.message}` }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
