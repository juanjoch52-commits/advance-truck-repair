import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Rutas públicas que no requieren autenticación
const PUBLIC_ROUTES = ['/login'];

// Rutas permitidas cuando must_change_password está activo
const CHANGE_PASSWORD_ROUTE = '/cambiar-contrasena';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Permitir rutas públicas y assets
  if (
    PUBLIC_ROUTES.includes(pathname) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/auth') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Verificar cookie de sesión
  const hasAuthCookie = request.cookies.get('atr_auth')?.value === '1';

  if (!hasAuthCookie) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Si el usuario tiene contraseña temporal, forzar cambio antes de acceder a cualquier otra ruta
  const mustChangePassword = request.cookies.get('atr_force_change')?.value === '1';
  if (mustChangePassword && pathname !== CHANGE_PASSWORD_ROUTE) {
    return NextResponse.redirect(new URL(CHANGE_PASSWORD_ROUTE, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|logo.png).*)',
  ],
};
