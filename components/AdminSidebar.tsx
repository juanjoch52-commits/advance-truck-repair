'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase';
import { useLanguage } from '@/contexts/LanguageContext';

const NAV_ITEMS = [
  {
    labelKey: 'nav.dashboard',
    href: '/dashboard',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    labelKey: 'nav.workReports',
    href: '/ordenes',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
  },
  {
    labelKey: 'nav.clients',
    href: '/clientes',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0H5m14 0h2M5 21H3m4-14h2m-2 4h2m6-4h2m-2 4h2M9 21v-4a1 1 0 011-1h4a1 1 0 011 1v4" />
      </svg>
    ),
  },
  {
    labelKey: 'nav.invoices',
    href: '/facturacion',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    labelKey: 'nav.receivables',
    href: '/cuentas-por-cobrar',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 7h6m-6 4h6m-6 4h4M3 5a2 2 0 012-2h14a2 2 0 012 2v16l-3-2-2 2-2-2-2 2-2-2-3 2V5z" />
      </svg>
    ),
  },
  {
    labelKey: 'nav.weeklyCut',
    href: '/corte-semanal',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    labelKey: 'nav.payroll',
    href: '/nomina',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    labelKey: 'nav.adminPayroll',
    href: '/nomina-admin',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 17v-2a4 4 0 014-4h3M9 17a4 4 0 01-4-4V7a4 4 0 014-4h6a4 4 0 014 4v6a4 4 0 01-4 4M9 17l-2 4m10-4l2 4M12 7h.01M12 11h.01" />
      </svg>
    ),
  },
  {
    labelKey: 'nav.deductions',
    href: '/deducciones',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    labelKey: 'nav.staff',
    href: '/mecanicos',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    labelKey: 'nav.reports',
    href: '/reportes',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    labelKey: 'nav.users',
    href: '/admin',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
      </svg>
    ),
  },
  {
    labelKey: 'nav.settings',
    href: '/configuracion',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

// Items only visible to owner / super-admin / super-user
const PRIVILEGED_ONLY_HREFS = new Set<string>(['/nomina-admin', '/deducciones', '/configuracion']);

export default function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const { t, lang, setLang } = useLanguage();
  const [role, setRole] = useState<string>('');
  const [mobileOpen, setMobileOpen] = useState(false);

  // Cerrar sidebar al cambiar de página
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const j = await res.json();
          if (j?.authenticated && j.user?.role) {
            setRole(String(j.user.role).toLowerCase());
            return;
          }
        }
      } catch {}
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data } = await (supabase as any)
            .from('profiles').select('role').eq('id', user.id).single();
          if ((data as any)?.role) setRole(String((data as any).role).toLowerCase());
        }
      } catch {}
    })();
  }, []);

  const isPrivileged = role === 'super_user' || role === 'super_admin' || role === 'owner';
  const visibleNavItems = NAV_ITEMS.filter(it => !PRIVILEGED_ONLY_HREFS.has(it.href) || isPrivileged);

  async function handleLogout() {
    await supabase.auth.signOut();
    // Limpiar la cookie de sesión firmada (httpOnly) en el servidor.
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.push('/login');
    router.refresh();
  }

  const sidebarContent = (
    <aside className={`
      fixed top-0 left-0 h-full w-72 bg-slate-950 border-r border-white/5 flex flex-col z-50
      transition-transform duration-300 ease-in-out
      ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
      lg:static lg:w-64 lg:min-h-screen lg:translate-x-0 lg:transition-none lg:z-auto
    `}>
      {/* Logo + close button */}
      <div className="flex items-center justify-between px-5 py-5 border-b border-white/5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 relative flex-shrink-0">
            <Image src="/logo.png" alt="ATR" fill className="object-contain" />
          </div>
          <div className="min-w-0">
            <p className="display-font text-amber-400 font-bold text-sm leading-tight tracking-wide">
              ADVANCE TRUCK
            </p>
            <p className="display-font text-amber-400 font-bold text-sm leading-tight tracking-wide">
              REPAIR
            </p>
            <p className="text-slate-500 text-xs">{t('sidebar.subtitle')}</p>
          </div>
        </div>
        {/* Close button — solo en móvil */}
        <button
          onClick={() => setMobileOpen(false)}
          className="lg:hidden p-2 text-slate-500 hover:text-white hover:bg-white/10 rounded-lg transition flex-shrink-0"
          aria-label="Cerrar menú"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Navegación */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {visibleNavItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all duration-150 group ${
                isActive
                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
            >
              <span className={isActive ? 'text-amber-400' : 'text-slate-500 group-hover:text-slate-300'}>
                {item.icon}
              </span>
              <span className="truncate">{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </nav>

      {/* Language toggle */}
      <div className="px-3 pb-2 border-t border-white/5 pt-3">
        <p className="text-slate-600 text-xs px-1 mb-2">{t('nav.language')}</p>
        <div className="flex gap-1">
          <button
            onClick={() => setLang('es')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-sm font-medium transition-all ${
              lang === 'es'
                ? 'bg-amber-500/20 border border-amber-500/40 text-amber-400'
                : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'
            }`}
          >
            <span>🇪🇸</span> ES
          </button>
          <button
            onClick={() => setLang('en')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-sm font-medium transition-all ${
              lang === 'en'
                ? 'bg-sky-500/20 border border-sky-500/40 text-sky-400'
                : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'
            }`}
          >
            <span>🇺🇸</span> EN
          </button>
        </div>
      </div>

      {/* Cerrar sesión */}
      <div className="px-3 py-3 border-t border-white/5">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-3 rounded-lg text-sm text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all duration-150"
        >
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          {t('nav.logout')}
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Barra superior móvil (solo visible en pantallas < lg) */}
      <div className="lg:hidden fixed top-0 inset-x-0 h-14 bg-slate-950 border-b border-white/5 z-40 flex items-center justify-between px-4">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition"
          aria-label="Abrir menú"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <div className="flex items-center gap-2">
          <div className="w-7 h-7 relative">
            <Image src="/logo.png" alt="ATR" fill className="object-contain" />
          </div>
          <span className="display-font text-amber-400 font-bold text-sm tracking-wide">ATR</span>
        </div>

        {/* Indicador de página actual en móvil */}
        <div className="w-10" />
      </div>

      {/* Overlay backdrop cuando el menú está abierto en móvil */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {sidebarContent}
    </>
  );
}
