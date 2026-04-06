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
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Empleados', href: '/empleados' },
  { label: 'Gestión de Accesos', href: '/admin/accesos' },
  { label: 'Nuevo Trabajo', href: '/trabajos/nuevo' },
  { label: 'Aprobaciones', href: '/admin/aprobaciones' },
  { label: 'Buscar Unidad', href: '/buscar' },
  { label: 'Deudas', href: '/deudas' },
  { label: 'Nomina', href: '/nomina' },
  { label: 'Ayuda', href: '/ayuda' },
];

const adminNavItems = [
  { label: 'Nuevo Trabajo', href: '/trabajos/nuevo' },
  { label: 'Aprobaciones', href: '/admin/aprobaciones' },
  { label: 'Deudas', href: '/deudas' },
  { label: 'Nomina', href: '/nomina' },
  { label: 'Ayuda', href: '/ayuda' },
];

export function OwnerSidebar({ role, displayName, canManageAccesses = false, pendingApprovals, selfEmployeeId }: OwnerSidebarProps) {
  const baseNavItems = role === 'owner' ? ownerNavItems : adminNavItems;
  const navItems = role === 'owner' && canManageAccesses && !baseNavItems.some((item) => item.href === '/admin/accesos')
    ? [{ label: 'Gestión de Accesos', href: '/admin/accesos' }, ...baseNavItems]
    : baseNavItems;

  return (
    <aside className="rounded-[28px] border border-white/10 bg-slate-950/70 p-5 shadow-2xl shadow-black/20 backdrop-blur xl:sticky xl:top-6 xl:h-[calc(100vh-3rem)]">
      <div className="rounded-2xl border border-amber-300/20 bg-transparent p-4">
        <Image
          src="/logo.png"
          alt="Advance Truck Repair"
          width={640}
          height={640}
          className="h-auto w-full object-contain [mix-blend-mode:multiply]"
          priority
          unoptimized
        />
      </div>

      <div className="mt-6">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">
          {role === 'owner' ? 'Panel del Dueño' : 'Panel de Administración'}
        </p>
        <p className="mt-1 text-sm text-slate-400">{displayName}</p>
        <nav className="mt-4 space-y-2">
          {navItems.map((item) => {
            const content = (
              <>
                <span>{item.label}</span>
                {item.label === 'Aprobaciones' && pendingApprovals != null && pendingApprovals > 0 ? (
                  <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
                    {pendingApprovals}
                  </span>
                ) : (
                  <span className="text-xs text-slate-500">›</span>
                )}
              </>
            );

            const classes = 'flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-amber-300/30 hover:bg-amber-300/10 hover:text-white';

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
          {selfEmployeeId && (
            <Link
              href={`/empleados/${selfEmployeeId}`}
              className="flex items-center justify-between rounded-xl border border-fuchsia-400/20 bg-fuchsia-400/5 px-4 py-3 text-sm font-medium text-fuchsia-200 transition hover:border-fuchsia-400/40 hover:bg-fuchsia-400/10 hover:text-white"
            >
              <span>Mi Perfil</span>
              <span className="text-xs text-slate-500">›</span>
            </Link>
          )}
          <Link
            href="/salir"
            className="flex items-center justify-between rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-200 transition hover:border-red-400/40 hover:bg-red-500/20"
          >
            <span>Salir</span>
            <span className="text-xs text-red-300">00</span>
          </Link>
        </nav>
      </div>
    </aside>
  );
}
