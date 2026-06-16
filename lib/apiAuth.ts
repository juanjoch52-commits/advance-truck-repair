import { NextResponse } from 'next/server';
import { getServerSession, SessionUser, getEffectiveRole, EffectiveRole } from '@/lib/authSession';

export class AuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export async function requireSession(): Promise<SessionUser> {
  const session = await getServerSession();
  if (!session) {
    throw new AuthError(401, 'No autenticado');
  }
  return session;
}

export async function requireRole(
  ...allowedRoles: Array<EffectiveRole | 'super_user'>
): Promise<SessionUser> {
  const session = await requireSession();
  const effective = getEffectiveRole(session);

  if (session.is_super_user && allowedRoles.includes('super_user')) {
    return session;
  }

  if (allowedRoles.includes(effective)) {
    return session;
  }

  throw new AuthError(403, 'No autorizado para esta acción');
}

export async function requireSelfOrAdmin(targetEmployeeId: string): Promise<SessionUser> {
  const session = await requireSession();
  const effective = getEffectiveRole(session);

  if (effective === 'owner' || effective === 'admin' || session.is_super_user) {
    return session;
  }

  if (effective === 'mechanic' && session.id === targetEmployeeId) {
    return session;
  }

  throw new AuthError(403, 'No autorizado para acceder a estos datos');
}

export function authErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return null;
}
