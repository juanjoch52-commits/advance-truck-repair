import { NextResponse } from 'next/server';
import { getSessionCookieName } from '@/lib/authSession';

export async function GET(request: Request) {
  const purpose = request.headers.get('purpose');
  const nextPrefetch = request.headers.get('next-router-prefetch');

  // Avoid accidental logouts triggered by client-side prefetch.
  if (purpose === 'prefetch' || nextPrefetch !== null) {
    return NextResponse.json({ ok: true, prefetched: true });
  }

  const response = NextResponse.redirect(new URL('/', request.url));
  response.cookies.set(getSessionCookieName(), '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return response;
}
