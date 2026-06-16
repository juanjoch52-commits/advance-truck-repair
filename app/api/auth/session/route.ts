import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { getSessionCookieName, serializeSession, SessionUser, BaseRole, EffectiveRole } from '@/lib/authSession';

type SessionBody = { access_token?: string };

function mapProfileRole(raw: unknown): { role: BaseRole; effective: EffectiveRole; isSuper: boolean } {
  const value = String(raw ?? '').trim().toLowerCase();
  if (value === 'super_admin' || value === 'super_user' || value === 'superuser') {
    return { role: 'super_user', effective: 'owner', isSuper: true };
  }
  if (value === 'owner' || value === 'dueno' || value === 'dueño') {
    return { role: 'owner', effective: 'owner', isSuper: false };
  }
  // Default: admin (the only remaining interactive role).
  return { role: 'admin', effective: 'admin', isSuper: false };
}

/**
 * Issues the signed, httpOnly server session cookie (`atr_session`) from a
 * verified Supabase Auth access token. The browser obtains the token via
 * `supabase.auth.signInWithPassword` and posts it here; we re-verify it
 * server-side so the cookie cannot be forged.
 */
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ error: 'Supabase no configurado' }, { status: 500 });
  }

  const body = (await request.json().catch(() => ({}))) as SessionBody;
  const accessToken = String(body.access_token ?? '').trim();
  if (!accessToken) {
    return NextResponse.json({ error: 'Token requerido' }, { status: 400 });
  }

  // Verify the JWT against Supabase Auth (validates signature + expiry).
  const authClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: userData, error: userError } = await authClient.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 });
  }

  const authUser = userData.user;

  // Load the profile (role + must_change_password) with the service role.
  const admin = getSupabaseServerClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('full_name, role, must_change_password')
    .eq('id', authUser.id)
    .maybeSingle<{ full_name: string | null; role: string | null; must_change_password: boolean | null }>();

  const { role, effective, isSuper } = mapProfileRole(profile?.role);

  const sessionUser: SessionUser = {
    id: authUser.id,
    full_name: (profile?.full_name ?? authUser.email ?? 'Usuario').trim(),
    role,
    effective_role: effective,
    requires_pin_update: Boolean(profile?.must_change_password),
    is_super_user: isSuper,
  };

  const response = NextResponse.json({
    ok: true,
    user: sessionUser,
    mustChangePassword: sessionUser.requires_pin_update,
  });
  response.cookies.set(getSessionCookieName(), serializeSession(sessionUser), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 12,
  });
  return response;
}
