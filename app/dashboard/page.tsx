import { EmployeeManagementTable } from '@/components/dashboard/EmployeeManagementTable';
import { SuperViewSelector } from '@/components/SuperViewSelector';
import { DashboardAutoRefresh } from '@/components/dashboard/DashboardAutoRefresh';
import { OwnerSidebar } from '@/components/dashboard/OwnerSidebar';
import { getEffectiveRole, getServerSession, isJuanSuperUser } from '@/lib/authSession';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { redirect } from 'next/navigation';

type Employee = {
  id: string;
  full_name: string;
  phone: string | null;
  role: 'mechanic' | 'admin';
  hire_date: string;
};

type GenericRow = Record<string, unknown>;

type WorkOrder = {
  employee_id: string;
  labor_amount: number;
  mechanic_share: number;
  work_date: string;
};

type Debt = {
  employee_id: string;
  remaining_balance: number;
};

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

function getWorkshopWeekRange(today = new Date()) {
  const end = new Date(today);
  end.setHours(23, 59, 59, 999);

  const start = new Date(end);
  const day = start.getDay(); // 0=Sun, 6=Sat
  const daysSinceSaturday = (day + 1) % 7;
  start.setDate(start.getDate() - daysSinceSaturday);
  start.setHours(0, 0, 0, 0);

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function resolveRange(inputStart?: string, inputEnd?: string) {
  const fallback = getWorkshopWeekRange();

  if (!inputStart || !inputEnd) {
    return fallback;
  }

  if (Number.isNaN(Date.parse(inputStart)) || Number.isNaN(Date.parse(inputEnd))) {
    return fallback;
  }

  if (inputStart > inputEnd) {
    return { start: inputEnd, end: inputStart };
  }

  return { start: inputStart, end: inputEnd };
}

function mapRole(value: unknown): Employee['role'] {
  const role = String(value ?? '').trim().toLowerCase();
  if (role === 'mechanic' || role === 'mecanico') return 'mechanic';
  return 'admin';
}

function mapEmployeeRow(row: GenericRow): Employee | null {
  const id = String(row.id ?? row.employee_id ?? row.empleado_id ?? '').trim();
  const fullName = String(row.full_name ?? row.nombre_completo ?? row.nombre ?? '').trim();
  const hireDate = String(row.hire_date ?? row.fecha_contratacion ?? new Date().toISOString().slice(0, 10)).trim();

  if (!id || !fullName) return null;

  return {
    id,
    full_name: fullName,
    phone: String(row.phone ?? row.telefono ?? '').trim() || null,
    role: mapRole(row.role ?? row.rol ?? row.tipo),
    hire_date: hireDate,
  };
}

function mapDebtRow(row: GenericRow): Debt | null {
  const employeeId = String(row.employee_id ?? row.empleado_id ?? '').trim();
  if (!employeeId) return null;

  const remainingBalance = Number(row.remaining_balance ?? row.saldo_pendiente ?? row.balance_pendiente ?? 0);

  return {
    employee_id: employeeId,
    remaining_balance: Number.isFinite(remainingBalance) ? remainingBalance : 0,
  };
}

async function loadEmployeesWithFallback(supabase: ReturnType<typeof getSupabaseServerClient>) {
  const primary = await supabase
    .from('employees')
    .select('id,full_name,phone,role,hire_date')
    .order('full_name', { ascending: true })
    .returns<Employee[]>();

  if (!primary.error) {
    return { data: primary.data ?? [], error: null as { message: string } | null };
  }

  if (primary.error.code !== 'PGRST205') {
    return { data: [] as Employee[], error: { message: primary.error.message } };
  }

  const fallback = await supabase
    .from('empleados')
    .select('*')
    .returns<GenericRow[]>();

  if (fallback.error) {
    return { data: [] as Employee[], error: { message: fallback.error.message } };
  }

  const mapped = (fallback.data ?? [])
    .map((row) => mapEmployeeRow(row))
    .filter((row): row is Employee => row !== null)
    .sort((a, b) => a.full_name.localeCompare(b.full_name, 'es'));

  return { data: mapped, error: null as { message: string } | null };
}

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<{ start?: string; end?: string }>;
}) {
  const session = await getServerSession();

  if (!session) {
    redirect('/');
  }

  const currentRole = getEffectiveRole(session);

  if (currentRole === 'mechanic') {
    redirect('/taller');
  }

  const isOwner = currentRole === 'owner';

  const params = (await searchParams) ?? {};
  const weekRange = resolveRange(params.start, params.end);

  try {
    const supabase = getSupabaseServerClient();

    const employeesQuery = loadEmployeesWithFallback(supabase);

    const debtsQuery = supabase
      .from('debts')
      .select('employee_id,remaining_balance')
      .gt('remaining_balance', 0)
      .returns<Debt[]>();

    const pendingCountQuery = supabase
      .from('work_orders')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    const [{ data: employees, error: employeesError }, { data: debts, error: debtsError }, { count: pendingApprovals }] =
      await Promise.all([employeesQuery, debtsQuery, pendingCountQuery]);

    let safeDebts = debts ?? [];
    let safeDebtsError: { message: string } | null = debtsError ? { message: debtsError.message } : null;

    if (debtsError?.code === 'PGRST205') {
      const legacyDebts = await supabase
        .from('deudas')
        .select('*')
        .returns<GenericRow[]>();

      if (!legacyDebts.error) {
        safeDebts = (legacyDebts.data ?? [])
          .map((row) => mapDebtRow(row))
          .filter((row): row is Debt => row !== null)
          .filter((row) => row.remaining_balance > 0);
        safeDebtsError = null;
      } else if (legacyDebts.error.code === 'PGRST205') {
        safeDebts = [];
        safeDebtsError = null;
      } else {
        safeDebtsError = { message: legacyDebts.error.message };
      }
    }

    // Prefer approved-only totals, but gracefully support older schemas
    // where work_orders.status does not exist yet.
    let workOrders: WorkOrder[] = [];
    let workOrdersError: { message: string } | null = null;

    const approvedOnly = await supabase
      .from('work_orders')
      .select('employee_id,labor_amount,mechanic_share,work_date')
      .eq('status', 'approved')
      .gte('work_date', weekRange.start)
      .lte('work_date', weekRange.end)
      .returns<WorkOrder[]>();

    if (!approvedOnly.error) {
      workOrders = approvedOnly.data ?? [];
    } else if (approvedOnly.error.message.includes('column work_orders.status does not exist')) {
      const legacy = await supabase
        .from('work_orders')
        .select('employee_id,labor_amount,mechanic_share,work_date')
        .gte('work_date', weekRange.start)
        .lte('work_date', weekRange.end)
        .returns<WorkOrder[]>();

      workOrders = legacy.data ?? [];
      workOrdersError = legacy.error ? { message: legacy.error.message } : null;
    } else if (approvedOnly.error.code === 'PGRST205') {
      // Legacy projects may not have work_orders/trabajos yet.
      workOrders = [];
      workOrdersError = null;
    } else {
      workOrdersError = { message: approvedOnly.error.message };
    }

    if (employeesError) {
      throw new Error(employeesError.message);
    }

    if (workOrdersError) {
      throw new Error(workOrdersError.message);
    }

    if (safeDebtsError) {
      throw new Error(safeDebtsError.message);
    }

    const weeklyByEmployee = new Map<string, { jobs: number; labor: number; mechanicShare: number }>();
    for (const order of workOrders) {
      const current = weeklyByEmployee.get(order.employee_id) ?? { jobs: 0, labor: 0, mechanicShare: 0 };
      current.jobs += 1;
      current.labor += Number(order.labor_amount);
      current.mechanicShare += Number(order.mechanic_share);
      weeklyByEmployee.set(order.employee_id, current);
    }

    const pendingDebtByEmployee = new Map<string, number>();
    for (const debt of safeDebts) {
      const current = pendingDebtByEmployee.get(debt.employee_id) ?? 0;
      pendingDebtByEmployee.set(debt.employee_id, current + Number(debt.remaining_balance));
    }

    const employeeRows = (employees ?? []).map((employee) => {
      const weekly = weeklyByEmployee.get(employee.id) ?? { jobs: 0, labor: 0, mechanicShare: 0 };

      return {
        ...employee,
        weekly_jobs: weekly.jobs,
        weekly_labor: weekly.labor,
        weekly_mechanic_share: weekly.mechanicShare,
        pending_debt: pendingDebtByEmployee.get(employee.id) ?? 0,
      };
    });

    const totalWeeklyLabor = employeeRows.reduce((sum, employee) => sum + employee.weekly_labor, 0);
    const totalWeeklyMechanics = employeeRows.reduce((sum, employee) => sum + employee.weekly_mechanic_share, 0);
    const activeMechanics = employeeRows.filter((employee) => employee.role === 'mechanic').length;

    return (
      <main className="brand-bg min-h-screen px-4 py-4 text-slate-100 sm:px-6 sm:py-6">
        <DashboardAutoRefresh intervalMs={10000} />
        <section className="mx-auto grid max-w-7xl gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <OwnerSidebar
            role={currentRole}
            displayName={session.full_name}
            canManageAccesses={session.role === 'owner' || isJuanSuperUser(session)}
            pendingApprovals={pendingApprovals ?? 0}
            selfEmployeeId={session.id}
          />

          <div className="space-y-6">
            <section className="rounded-[28px] border border-white/10 bg-slate-950/60 p-6 shadow-2xl shadow-black/20 backdrop-blur">
              {session.is_super_user && (
                <div className="mb-3 flex justify-end">
                  <SuperViewSelector />
                </div>
              )}
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">Dashboard Principal</p>
                  <h1 className="display-font mt-3 text-4xl font-bold uppercase tracking-tight text-white sm:text-5xl">
                    Vista general del taller
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm text-slate-300 sm:text-base">
                    {isOwner
                      ? 'Seguimiento semanal del taller con foco en produccion, participacion de mecanicos y acceso directo a perfiles del equipo.'
                      : 'Vista de equipo para administración: control de operaciones, aprobaciones y nómina.'}
                  </p>
                </div>

                <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
                  Corte actual: <span className="font-semibold">{weekRange.start}</span> al <span className="font-semibold">{weekRange.end}</span>
                </div>
              </div>

              <form method="GET" className="mt-5 grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 sm:grid-cols-3">
                <label className="text-sm text-slate-300">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Inicio</span>
                  <input
                    type="date"
                    name="start"
                    defaultValue={weekRange.start}
                    className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-amber-300/60"
                  />
                </label>
                <label className="text-sm text-slate-300">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Fin</span>
                  <input
                    type="date"
                    name="end"
                    defaultValue={weekRange.end}
                    className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-amber-300/60"
                  />
                </label>
                <button
                  type="submit"
                  className="rounded-xl bg-amber-400 px-5 py-3 text-sm font-bold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-amber-300"
                >
                  Aplicar filtro
                </button>
              </form>

              {isOwner ? (
                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Produccion Semanal</p>
                    <p className="mt-2 text-3xl font-bold text-white">{money.format(totalWeeklyLabor)}</p>
                    <p className="mt-2 text-sm text-slate-400">Total de labor registrada en la semana actual.</p>
                  </article>

                  <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Total Mecanicos</p>
                    <p className="mt-2 text-3xl font-bold text-emerald-300">{money.format(totalWeeklyMechanics)}</p>
                    <p className="mt-2 text-sm text-slate-400">Suma del 50% correspondiente a mecanicos esta semana.</p>
                  </article>

                  <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Mecanicos Activos</p>
                    <p className="mt-2 text-3xl font-bold text-sky-300">{activeMechanics}</p>
                    <p className="mt-2 text-sm text-slate-400">Cantidad de perfiles mecanicos disponibles en el sistema.</p>
                  </article>
                </div>
              ) : (
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Mecanicos Activos</p>
                    <p className="mt-2 text-3xl font-bold text-sky-300">{activeMechanics}</p>
                    <p className="mt-2 text-sm text-slate-400">Cantidad de mecánicos registrados en el sistema.</p>
                  </article>

                  <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Trabajos de la Semana</p>
                    <p className="mt-2 text-3xl font-bold text-white">{workOrders.length}</p>
                    <p className="mt-2 text-sm text-slate-400">Control operativo de órdenes registradas.</p>
                  </article>
                </div>
              )}
            </section>

            <EmployeeManagementTable employees={employeeRows} canManageTeam={isOwner} />
          </div>
        </section>
      </main>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';

    return (
      <main className="brand-bg min-h-screen px-6 py-10 text-slate-100">
        <section className="mx-auto max-w-3xl rounded-[28px] border border-red-500/20 bg-red-950/20 p-6 backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-300">Dashboard Principal</p>
          <h1 className="display-font mt-3 text-4xl font-bold uppercase text-white">No se pudo cargar el panel</h1>
          <p className="mt-4 text-sm text-red-100/90">{message}</p>
          <p className="mt-3 text-sm text-slate-300">
            Verifica que `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` esten configuradas y que las tablas de Supabase tengan datos.
          </p>
        </section>
      </main>
    );
  }
}
