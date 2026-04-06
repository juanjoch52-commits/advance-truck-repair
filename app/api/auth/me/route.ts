import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSessionCookieName, parseSession } from '@/lib/authSession';

export async function GET() {
  const store = await cookies();
  const raw = store.get(getSessionCookieName())?.value;
  const user = parseSession(raw);

  if (!user) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({ authenticated: true, user });
}
