import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Rutas públicas que no requieren autenticación
const PUBLIC_ROUTES = ['/login', '/recuperar-contrasena', '/nueva-contrasena'];

// Ruta permitida cuando must_change_password está activo
const CHANGE_PASSWORD_ROUTE = '/cambiar-contrasena';

const SESSION_COOKIE = 'atr_session';

/**
 * Reads `requires_pin_update` from the session cookie WITHOUT verifying its
 * signature. This is only used for the change-password redirect (UX). The
 * actual security gate (rejecting forged/unsigned cookies) is enforced
 * server-side in the (admin) layout via getServerSession().
 */
function decodeRequiresPinUpdate(rawValue: string | undefined): boolean {
  if (!rawValue) return false;
  const [payload] = rawValue.split('.');
  if (!payload) return false;
  try {
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Boolean(json?.requires_pin_update);
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Permitir rutas públicas, assets, endpoints de auth y el cron (se protege
  // a sí mismo con CRON_SECRET).
  if (
    PUBLIC_ROUTES.includes(pathname) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/reportes') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Verificar presencia de la cookie de sesión firmada. La validación real de
  // la firma ocurre en el servidor (layout/API), aquí solo se decide el gate.
  const sessionCookie = request.cookies.get(SESSION_COOKIE)?.value;

  if (!sessionCookie) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Si el usuario tiene contraseña temporal, forzar cambio antes de continuar.
  if (decodeRequiresPinUpdate(sessionCookie) && pathname !== CHANGE_PASSWORD_ROUTE) {
    return NextResponse.redirect(new URL(CHANGE_PASSWORD_ROUTE, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|logo.png).*)',
  ],
};
