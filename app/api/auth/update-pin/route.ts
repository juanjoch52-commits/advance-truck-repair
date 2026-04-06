import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { getSessionCookieName, parseSession, serializeSession } from '@/lib/authSession';


type UpdatePinBody = {
  new_pin: string;
};

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase no configurado');
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(request: Request) {
  const store = await cookies();
  const raw = store.get(getSessionCookieName())?.value;
  const session = parseSession(raw);

  if (!session) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const body = await request.json() as UpdatePinBody;
  const newPin = String(body.new_pin ?? '').trim();

  if (!/^\d{4,}$/.test(newPin)) {
    return NextResponse.json({ error: 'El nuevo PIN debe tener al menos 4 dígitos.' }, { status: 400 });
  }

  if (session.role === 'owner') {
    // Owner env-based access is not employee-backed.
    const updated = { ...session, requires_pin_update: false };
    const response = NextResponse.json({ ok: true });
    response.cookies.set(getSessionCookieName(), serializeSession(updated), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 12,
    });
    return response;
  }

  const supabase = getClient();
  const { error } = await supabase
    .from('employees')
    .update({
      access_pin: newPin,
      is_temporary_pin: false,
      temporary_pin_plain: null,
    })
    .eq('id', session.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const updated = { ...session, requires_pin_update: false };
  const response = NextResponse.json({ ok: true });
  response.cookies.set(getSessionCookieName(), serializeSession(updated), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 12,
  });
  return response;
}
