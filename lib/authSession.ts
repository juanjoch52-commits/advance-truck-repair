import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'crypto';

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

function getSigningSecret(): string {
  const secret = process.env.SESSION_SIGNING_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SIGNING_SECRET no configurado o demasiado corto (mínimo 32 chars)');
  }
  return secret;
}

function base64urlEncode(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function base64urlDecode(input: string): Buffer | null {
  try {
    return Buffer.from(input, 'base64url');
  } catch {
    return null;
  }
}

function sign(payload: string): string {
  return createHmac('sha256', getSigningSecret()).update(payload).digest('base64url');
}

function verifySignature(payload: string, signature: string): boolean {
  const expected = sign(payload);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function serializeSession(user: SessionUser): string {
  const payload = base64urlEncode(JSON.stringify(user));
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

export function parseSession(rawValue: string | undefined): SessionUser | null {
  if (!rawValue) return null;

  const parts = rawValue.split('.');
  if (parts.length !== 2) return null;

  const [payload, signature] = parts;
  if (!payload || !signature) return null;

  try {
    if (!verifySignature(payload, signature)) return null;
  } catch {
    return null;
  }

  const decoded = base64urlDecode(payload);
  if (!decoded) return null;

  try {
    const parsed = JSON.parse(decoded.toString('utf8')) as Partial<SessionUser>;
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
