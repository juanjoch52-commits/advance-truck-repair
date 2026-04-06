import { NextRequest, NextResponse } from 'next/server';

type EffectiveRole = 'owner' | 'admin' | 'mechanic';
type BaseRole = EffectiveRole | 'super_user';

type SessionUser = {
  id: string;
  full_name: string;
  role: BaseRole;
  effective_role: EffectiveRole;
  requires_pin_update: boolean;
  is_super_user: boolean;
};

const SESSION_COOKIE = 'atr_session';

function getCookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return undefined;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const [rawKey, ...rest] = pair.trim().split('=');
    if (rawKey === name) {
      const rawValue = rest.join('=');
      try {
        return decodeURIComponent(rawValue);
      } catch {
        return rawValue;
      }
    }
  }
  return undefined;
}

function decodeBase64Url(value: string) {
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    return atob(padded);
  } catch {
    return null;
  }
}

function parseSession(rawValue: string | undefined): SessionUser | null {
  if (!rawValue) return null;
  const decoded = decodeBase64Url(rawValue);
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

function getEffectiveRole(session: SessionUser) {
  return session.is_super_user ? session.effective_role : (session.role as EffectiveRole);
}

function getDefaultHomeForRole(role: EffectiveRole) {
  return role === 'mechanic' ? '/taller' : '/dashboard';
}

function isJuanSuperUser(session: SessionUser) {
  return session.is_super_user;
}

function startsWithAny(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/public') ||
    /\.[a-zA-Z0-9]+$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  const raw = getCookieValue(request.headers.get('cookie'), SESSION_COOKIE);
  const session = parseSession(raw);
  const effectiveRole = session ? getEffectiveRole(session) : null;

  if (pathname === '/') {
    if (session) {
      if (session.requires_pin_update) {
        return NextResponse.redirect(new URL('/actualizar-pin', request.url));
      }
      return NextResponse.redirect(new URL(getDefaultHomeForRole(effectiveRole ?? 'admin'), request.url));
    }
    return NextResponse.next();
  }

  if (!session) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  if (pathname === '/actualizar-pin') {
    if (session.requires_pin_update) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL(getDefaultHomeForRole(effectiveRole ?? 'admin'), request.url));
  }

  if (session.requires_pin_update) {
    return NextResponse.redirect(new URL('/actualizar-pin', request.url));
  }

  if (effectiveRole === 'mechanic') {
    const forbidden = startsWithAny(pathname, [
      '/nomina',
      '/deudas',
      '/empleados',
      '/admin',
      '/trabajos/aprobacion',
      '/trabajos/nuevo',
    ]);

    if (forbidden) {
      return NextResponse.redirect(new URL('/taller', request.url));
    }
  }

  if (effectiveRole === 'admin') {
    const forbidden = startsWithAny(pathname, ['/empleados', '/taller', '/admin/accesos']);
    if (forbidden) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  const canManageAccesses = session.role === 'owner' || isJuanSuperUser(session);
  if (startsWithAny(pathname, ['/admin/accesos']) && !canManageAccesses) {
    return NextResponse.redirect(new URL(getDefaultHomeForRole(effectiveRole ?? 'admin'), request.url));
  }

  if (effectiveRole === 'owner' && startsWithAny(pathname, ['/taller'])) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};