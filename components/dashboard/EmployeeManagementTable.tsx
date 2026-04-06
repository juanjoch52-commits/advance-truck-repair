import Link from 'next/link';

type EmployeeRow = {
  id: string;
  full_name: string;
  phone: string | null;
  role: 'mechanic' | 'admin';
  weekly_jobs: number;
  weekly_labor: number;
  weekly_mechanic_share: number;
  pending_debt: number;
};

type EmployeeManagementTableProps = {
  employees: EmployeeRow[];
  canManageTeam?: boolean;
};

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

export function EmployeeManagementTable({ employees, canManageTeam = true }: EmployeeManagementTableProps) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-slate-950/60 p-5 shadow-2xl shadow-black/20 backdrop-blur">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-slate-400">Gestion de empleados</p>
          <h2 className="display-font mt-2 text-3xl font-bold text-white">Equipo del taller</h2>
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end">
          <p className="max-w-md text-sm text-slate-400">
            Vista central para el dueño con acceso al perfil, estado semanal y deuda pendiente por mecanico.
          </p>
          {canManageTeam ? (
            <Link
              href="/empleados"
              className="inline-flex rounded-full border border-sky-300/30 bg-sky-300/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-sky-200 transition hover:bg-sky-300 hover:text-slate-950"
            >
              Gestionar equipo
            </Link>
          ) : (
            <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
              Vista de equipo (solo lectura)
            </span>
          )}
        </div>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase tracking-[0.2em] text-slate-400">
              <th className="px-3 py-3">Empleado</th>
              <th className="px-3 py-3">Rol</th>
              <th className="px-3 py-3">Telefono</th>
              <th className="px-3 py-3">Trabajos (rango)</th>
              <th className="px-3 py-3">Producción (rango)</th>
              <th className="px-3 py-3">Pago Mecánico (rango)</th>
              <th className="px-3 py-3">Saldo Deuda (actual)</th>
              <th className="px-3 py-3">Accion</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((employee) => (
              <tr key={employee.id} className="border-b border-white/5 text-slate-200 transition hover:bg-white/5">
                <td className="px-3 py-4">
                  <div>
                    {canManageTeam ? (
                      <Link href={`/empleados/${employee.id}`} className="font-semibold text-white transition hover:text-amber-300">
                        {employee.full_name}
                      </Link>
                    ) : (
                      <span className="font-semibold text-white">{employee.full_name}</span>
                    )}
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500">ID {employee.id.slice(0, 8)}</p>
                  </div>
                </td>
                <td className="px-3 py-4">
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
                    {employee.role}
                  </span>
                </td>
                <td className="px-3 py-4 text-slate-300">{employee.phone ?? 'N/A'}</td>
                <td className="px-3 py-4 font-semibold text-slate-200">{employee.weekly_jobs}</td>
                <td className="px-3 py-4 font-semibold text-sky-300">{money.format(employee.weekly_labor)}</td>
                <td className="px-3 py-4 font-semibold text-emerald-300">{money.format(employee.weekly_mechanic_share)}</td>
                <td className="px-3 py-4 font-semibold text-amber-300">{money.format(employee.pending_debt)}</td>
                <td className="px-3 py-4">
                  {canManageTeam ? (
                    <Link
                      href={`/empleados/${employee.id}`}
                      className="inline-flex rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-amber-200 transition hover:bg-amber-300 hover:text-slate-950"
                    >
                      Ver perfil
                    </Link>
                  ) : (
                    <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                      Restringido
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {employees.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-400">
                  No hay empleados cargados todavia. Inserta empleados en Supabase para ver la tabla operativa.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
