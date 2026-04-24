import Image from 'next/image';
import Link from 'next/link';

type OwnerSidebarProps = {
  role: 'owner' | 'admin';
  displayName: string;
  canManageAccesses?: boolean;
  pendingApprovals?: number;
  selfEmployeeId?: string;
};

const ownerNavItems = [
  { label: 'Dashboard', href: '/dashboard', icon: '🏠' },
  { label: 'Empleados', href: '/empleados', icon: '👥' },
  { label: 'Accesos', href: '/admin/accesos', icon: '🔑' },
  { label: 'Órdenes', href: '/admin/ordenes', icon: '📋' },
  { label: 'Nuevo Trabajo', href: '/trabajos/nuevo', icon: '➕' },
  { label: 'Aprobaciones', href: '/admin/aprobaciones', icon: '✅' },
  { label: 'Buscar Unidad', href: '/buscar', icon: '🔍' },
  { label: 'Deudas', href: '/deudas', icon: '💳' },
  { label: 'Nomina', href: '/nomina', icon: '💰' },
  { label: 'Ayuda', href: '/ayuda', icon: '❓' },
];

const adminNavItems = [
  { label: 'Nuevo Trabajo', href: '/trabajos/nuevo', icon: '➕' },
  { label: 'Aprobaciones', href: '/admin/aprobaciones', icon: '✅' },
  { label: 'Deudas', href: '/deudas', icon: '💳' },
  { label: 'Nomina', href: '/nomina', icon: '💰' },
  { label: 'Ayuda', href: '/ayuda', icon: '❓' },
];

export function OwnerSidebar({ role, displayName, canManageAccesses = false, pendingApprovals, selfEmployeeId }: OwnerSidebarProps) {
  const baseNavItems = role === 'owner' ? ownerNavItems : adminNavItems;
  const navItems = role === 'owner' && canManageAccesses && !baseNavItems.some((item) => item.href === '/admin/accesos')
    ? [{ label: 'Accesos', href: '/admin/accesos', icon: '🔑' }, ...baseNavItems]
    : baseNavItems;

  return (
    <aside className="flex flex-col rounded-[20px] border border-white/10 bg-slate-950/70 p-3 shadow-2xl shadow-black/20 backdrop-blur xl:sticky xl:top-4 xl:h-[calc(100vh-2rem)] xl:overflow-y-auto">
      {/* Header: logo + nombre */}
      <div className="flex items-center gap-2.5 rounded-xl border border-white/5 bg-white/5 px-3 py-2.5">
        <div className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-lg">
          <Image
            src="/logo.png"
            alt="Advance Truck Repair"
            width={72}
            height={72}
            className="h-full w-full object-contain"
            priority
            unoptimized
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-bold uppercase tracking-wider text-amber-300 leading-tight">
            Advance Truck Repair
          </p>
          <p className="truncate text-[11px] text-slate-400 leading-tight mt-0.5">{displayName}</p>
          <span className="mt-1 inline-block rounded-full bg-amber-400/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-300">
            {role === 'owner' ? 'Dueño' : 'Admin'}
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="mt-3 flex-1 space-y-1">
        {navItems.map((item) => {
          const hasBadge = item.label === 'Aprobaciones' && pendingApprovals != null && pendingApprovals > 0;

          const content = (
            <>
              <span className="flex items-center gap-2">
                <span className="text-sm leading-none">{item.icon}</span>
                <span className="text-[12px] font-medium">{item.label}</span>
              </span>
              {hasBadge ? (
                <span className="flex h-4.5 min-w-[1.1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {pendingApprovals}
                </span>
              ) : (
                <span className="text-[10px] text-slate-600">›</span>
              )}
            </>
          );

          const classes = 'flex items-center justify-between rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-slate-200 transition hover:border-amber-300/30 hover:bg-amber-300/10 hover:text-white';

          if (item.href === '/dashboard') {
            return (
              <a key={item.label} href="/dashboard" className={classes}>
                {content}
              </a>
            );
          }

          return (
            <Link key={item.label} href={item.href} className={classes}>
              {content}
            </Link>
          );
        })}

        {selfEmployeeId && selfEmployeeId !== 'owner' && (
          <Link
            href={`/empleados/${selfEmployeeId}`}
            className="flex items-center justify-between rounded-lg border border-fuchsia-400/20 bg-fuchsia-400/5 px-3 py-2 text-[12px] font-medium text-fuchsia-200 transition hover:border-fuchsia-400/40 hover:bg-fuchsia-400/10 hover:text-white"
          >
            <span className="flex items-center gap-2">
              <span className="text-sm">👤</span>
              <span>Mi Perfil</span>
            </span>
            <span className="text-[10px] text-slate-600">›</span>
          </Link>
        )}

        <a
          href="/salir"
          className="flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] font-medium text-red-200 transition hover:border-red-400/40 hover:bg-red-500/20"
        >
          <span className="flex items-center gap-2">
            <span className="text-sm">🚪</span>
            <span>Salir</span>
          </span>
          <span className="text-[10px] text-red-400">⏎</span>
        </a>
      </nav>

      {/* Footer */}
      <p className="mt-3 text-center text-[9px] text-slate-700 uppercase tracking-widest">JRC Smart Systems</p>
    </aside>
  );
}
