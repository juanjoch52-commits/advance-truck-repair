import { NextResponse } from 'next/server';
import { getSessionCookieName } from '@/lib/authSession';

export async function POST() {
  const response = NextResponse.json({ success: true });
  // Clear the server session cookie. The browser-side Supabase session is
  // cleared separately by the client (supabase.auth.signOut()).
  response.cookies.set(getSessionCookieName(), '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return response;
}
