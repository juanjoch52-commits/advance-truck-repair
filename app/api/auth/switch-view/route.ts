import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { EffectiveRole, getDefaultHomeForRole, getSessionCookieName, isJuanSuperUser, parseSession, serializeSession } from '@/lib/authSession';

type SwitchBody = {
  view_as: EffectiveRole;
};

export async function POST(request: Request) {
  const store = await cookies();
  const raw = store.get(getSessionCookieName())?.value;
  const session = parseSession(raw);

  if (!session) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  if (!isJuanSuperUser(session)) {
    return NextResponse.json({ error: 'Solo super-user puede cambiar vista' }, { status: 403 });
  }

  const body = await request.json() as SwitchBody;

  if (!body.view_as || !['owner', 'admin', 'mechanic'].includes(body.view_as)) {
    return NextResponse.json({ error: 'Vista inválida' }, { status: 400 });
  }

  const updated = { ...session, effective_role: body.view_as };
  const response = NextResponse.json({ ok: true, redirectTo: getDefaultHomeForRole(body.view_as), user: updated });
  response.cookies.set(getSessionCookieName(), serializeSession(updated), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 12,
  });
  return response;
}
