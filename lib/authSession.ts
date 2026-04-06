import { cookies } from 'next/headers';

export type EffectiveRole = 'owner' | 'admin' | 'mechanic';
export type BaseRole = EffectiveRole | 'super_user';

export type SessionUser = {
  id: string;
  full_name: string;
  role: BaseRole;
  effective_role: EffectiveRole;
  requires_pin_update: boolean;
  is_super_user: boolean;
};

const SESSION_COOKIE = 'atr_session';

function safeDecode(value: string) {
  try {
    return Buffer.from(value, 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

function safeEncode(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

export function serializeSession(user: SessionUser) {
  return safeEncode(JSON.stringify(user));
}

export function parseSession(rawValue: string | undefined): SessionUser | null {
  if (!rawValue) return null;
  const decoded = safeDecode(rawValue);
  if (!decoded) return null;

  try {
    const parsed = JSON.parse(decoded) as Partial<SessionUser>;
    if (!parsed || !parsed.id || !parsed.full_name || !parsed.role || !parsed.effective_role) return null;
    if (!['owner', 'admin', 'mechanic', 'super_user'].includes(parsed.role)) return null;
    if (!['owner', 'admin', 'mechanic'].includes(parsed.effective_role)) return null;
    return {
      id: parsed.id,
      full_name: parsed.full_name,
      role: parsed.role as BaseRole,
      effective_role: parsed.effective_role as EffectiveRole,
      requires_pin_update: Boolean(parsed.requires_pin_update),
      is_super_user: Boolean(parsed.is_super_user),
    };
  } catch {
    return null;
  }
}

export function getEffectiveRole(session: SessionUser) {
  return session.is_super_user ? session.effective_role : (session.role as EffectiveRole);
}

export function getDefaultHomeForRole(role: EffectiveRole) {
  return role === 'mechanic' ? '/taller' : '/dashboard';
}

export function isJuanSuperUser(session: SessionUser) {
  return session.is_super_user;
}

export async function getServerSession() {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  return parseSession(raw);
}

export function getSessionCookieName() {
  return SESSION_COOKIE;
}
