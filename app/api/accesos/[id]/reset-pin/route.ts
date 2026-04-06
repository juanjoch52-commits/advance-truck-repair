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

type ResetPinBody = {
  pin?: string;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession();
    const canManageAccesses = Boolean(session && (session.role === 'owner' || isJuanSuperUser(session) || session.effective_role === 'owner'));

    if (!canManageAccesses) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({})) as ResetPinBody;
    const requestedPin = String(body.pin ?? '').trim();

    if (requestedPin && !/^\d{4,6}$/.test(requestedPin)) {
      return NextResponse.json({ error: 'El PIN debe tener entre 4 y 6 digitos.' }, { status: 400 });
    }

    const temporaryPin = requestedPin || generateTemporaryPin();

    const supabase = getClient();

    const primary = await supabase
      .from('employees')
      .update({
        access_pin: temporaryPin,
        is_temporary_pin: !requestedPin,
        temporary_pin_plain: requestedPin ? null : temporaryPin,
      })
      .eq('id', id);

    let error: { message: string } | null = null;

    if (!primary.error) {
      error = null;
    } else if (primary.error.code === 'PGRST205') {
      const fallback = await supabase
        .from('empleados')
        .update({
          pin: temporaryPin,
          pin_temporal: !requestedPin,
        })
        .eq('id', id);

      if (fallback.error) {
        error = { message: fallback.error.message };
      }
    } else {
      error = { message: primary.error.message };
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, temporary_pin: temporaryPin, custom: Boolean(requestedPin) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
