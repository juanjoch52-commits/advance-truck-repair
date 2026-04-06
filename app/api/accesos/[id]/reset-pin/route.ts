import { randomInt } from 'crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServerSession, isJuanSuperUser } from '@/lib/authSession';


function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase no configurado');
  return createClient(url, key, { auth: { persistSession: false } });
}

function generateTemporaryPin() {
  return String(randomInt(1000, 10000));
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession();
    const canManageAccesses = Boolean(session && (session.role === 'owner' || isJuanSuperUser(session)));

    if (!canManageAccesses) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const { id } = await params;
    const temporaryPin = generateTemporaryPin();

    const supabase = getClient();

    const { error } = await supabase
      .from('employees')
      .update({
        access_pin: temporaryPin,
        is_temporary_pin: true,
        temporary_pin_plain: temporaryPin,
      })
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, temporary_pin: temporaryPin });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
