import Link from 'next/link';
import { BackButton } from '@/components/BackButton';
import { EmployeeProfileEditModal } from '@/components/EmployeeProfileEditModal';
import { PhotoEvidenceButton } from '@/components/PhotoEvidenceButton';
import { getServerSession } from '@/lib/authSession';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

type Employee = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  hire_date: string;
  role: 'mechanic' | 'admin';
  notes: string | null;
};

type WorkOrder = {
  id: string;
  work_date: string;
  company: string;
  unit: string;
  invoice_number: string;
  labor_amount: number;
  mechanic_share: number;
  paperwork_path: string | null;
  part_photo_path: string | null;
  created_at: string;
};

type Debt = {
  id: string;
  description: string;
  total_amount: number;
  weekly_installment: number;
  remaining_balance: number;
  is_active: boolean;
};

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

export default async function EmployeeProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (id === 'owner') {
    const session = await getServerSession();

    return (
      <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
        <section className="mx-auto max-w-4xl space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BackButton fallbackHref="/dashboard" label="Volver" />
              <h1 className="text-3xl font-bold tracking-tight">Perfil del Dueño</h1>
            </div>
            <Link className="rounded-md border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800" href="/dashboard">
              Dashboard
            </Link>
          </div>

          <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
            <h2 className="text-xl font-semibold">{session?.full_name ?? 'Owner'}</h2>
            <p className="mt-2 text-sm text-slate-300">Rol: Dueño</p>
            <p className="mt-2 text-sm text-slate-400">
              Este perfil es de sesión (OWNER_PIN) y no depende de la tabla de empleados.
            </p>
          </article>
        </section>
      </main>
    );
  }

  try {
    const supabase = getSupabaseServerClient();

    const employeeQuery = supabase
      .from('employees')
      .select('id,full_name,phone,email,address,hire_date,role,notes')
      .eq('id', id)
      .single<Employee>();

    const workOrdersQuery = supabase
      .from('work_orders')
      .select('id,work_date,company,unit,invoice_number,labor_amount,mechanic_share,paperwork_path,part_photo_path,created_at')
      .eq('employee_id', id)
      .order('work_date', { ascending: false })
      .limit(30)
      .returns<WorkOrder[]>();

    const debtsQuery = supabase
      .from('debts')
      .select('id,description,total_amount,weekly_installment,remaining_balance,is_active')
      .eq('employee_id', id)
      .order('created_at', { ascending: false })
      .returns<Debt[]>();

    const [{ data: employee, error: employeeError }, { data: workOrders, error: workOrdersError }, { data: debts, error: debtsError }] =
      await Promise.all([employeeQuery, workOrdersQuery, debtsQuery]);

    if (employeeError || !employee) {
      throw new Error(employeeError?.message ?? 'Empleado no encontrado');
    }

    if (workOrdersError) {
      throw new Error(workOrdersError.message);
    }

    if (debtsError) {
      throw new Error(debtsError.message);
    }

    const totalLabor = (workOrders ?? []).reduce((acc, row) => acc + Number(row.labor_amount), 0);
    const totalMechanicShare = (workOrders ?? []).reduce((acc, row) => acc + Number(row.mechanic_share), 0);
    const totalPendingDebt = (debts ?? []).reduce((acc, row) => acc + Number(row.remaining_balance), 0);

    return (
      <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
        <section className="mx-auto max-w-6xl space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BackButton fallbackHref="/dashboard" label="Volver" />
              <h1 className="text-3xl font-bold tracking-tight">Perfil del Empleado</h1>
            </div>
            <div className="flex items-center gap-3">
              <EmployeeProfileEditModal
                employeeId={employee.id}
                initialPhone={employee.phone}
                initialEmail={employee.email}
                initialAddress={employee.address}
                initialNotes={employee.notes}
              />
              <Link className="rounded-md border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800" href={`/mecanico/${id}`}>
                Vista mecanico
              </Link>
              <Link className="rounded-md border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800" href="/empleados">
                Gestion de empleados
              </Link>
              <Link className="rounded-md border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800" href="/dashboard">
                Dashboard
              </Link>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 md:col-span-2">
              <h2 className="text-xl font-semibold">{employee.full_name}</h2>
              <p className="mt-2 text-sm text-slate-300">Rol: {employee.role === 'admin' ? 'Admin' : 'Mecanico'}</p>
              <p className="text-sm text-slate-300">Telefono: {employee.phone ?? 'N/A'}</p>
              <p className="text-sm text-slate-300">Correo: {employee.email ?? 'N/A'}</p>
              <p className="text-sm text-slate-300">Direccion: {employee.address ?? 'N/A'}</p>
              <p className="text-sm text-slate-300">Fecha contratacion: {employee.hire_date}</p>
              <p className="mt-3 rounded-md bg-slate-800/60 p-3 text-sm text-slate-200">Notas: {employee.notes ?? 'Sin notas'}</p>
            </article>

            <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
              <h3 className="font-semibold">Resumen</h3>
              <p className="mt-2 text-sm text-slate-300">Labor total: {money.format(totalLabor)}</p>
              <p className="text-sm text-slate-300">50% mecanico: {money.format(totalMechanicShare)}</p>
              <p className="text-sm text-amber-300">Deuda pendiente: {money.format(totalPendingDebt)}</p>
            </article>
          </div>

          <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <h3 className="mb-3 text-lg font-semibold">Historial de Trabajos</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-slate-300">
                  <tr>
                    <th className="py-2 pr-3">Fecha</th>
                    <th className="py-2 pr-3">Compania</th>
                    <th className="py-2 pr-3">Unidad</th>
                    <th className="py-2 pr-3">Invoice</th>
                    <th className="py-2 pr-3">Labor</th>
                    <th className="py-2 pr-3">50%</th>
                    <th className="py-2 pr-3">Fotos</th>
                  </tr>
                </thead>
                <tbody>
                  {(workOrders ?? []).map((row) => (
                    <tr key={row.id} className="border-t border-slate-800">
                      <td className="py-2 pr-3">{row.work_date}</td>
                      <td className="py-2 pr-3">{row.company}</td>
                      <td className="py-2 pr-3">{row.unit}</td>
                      <td className="py-2 pr-3">{row.invoice_number}</td>
                      <td className="py-2 pr-3">{money.format(row.labor_amount)}</td>
                      <td className="py-2 pr-3 text-emerald-300">{money.format(row.mechanic_share)}</td>
                      <td className="py-2 pr-3">
                        <PhotoEvidenceButton
                          paperworkPath={row.paperwork_path}
                          partPhotoPath={row.part_photo_path}
                          uploadedAt={row.created_at}
                        />
                      </td>
                    </tr>
                  ))}
                  {(workOrders ?? []).length === 0 && (
                    <tr>
                      <td className="py-3 text-slate-400" colSpan={7}>
                        Sin trabajos registrados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>



          <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <h3 className="mb-3 text-lg font-semibold">Deudas Pendientes</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {(debts ?? []).map((debt) => (
                <article key={debt.id} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                  <p className="font-medium text-slate-100">{debt.description}</p>
                  <p className="text-sm text-slate-300">Monto total: {money.format(debt.total_amount)}</p>
                  <p className="text-sm text-slate-300">Cuota semanal: {money.format(debt.weekly_installment)}</p>
                  <p className="text-sm text-amber-300">Saldo pendiente: {money.format(debt.remaining_balance)}</p>
                  <p className="text-xs text-slate-400">Estado: {debt.is_active ? 'Activa' : 'Pagada'}</p>
                </article>
              ))}
              {(debts ?? []).length === 0 && <p className="text-sm text-slate-400">Sin deudas registradas.</p>}
            </div>
          </section>
        </section>
      </main>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';

    return (
      <main className="min-h-screen bg-slate-950 p-8 text-slate-100">
        <section className="mx-auto max-w-2xl rounded-xl border border-red-900 bg-red-950/20 p-5">
          <h1 className="text-xl font-semibold text-red-300">Error al cargar perfil</h1>
          <p className="mt-2 text-sm text-red-200">{message}</p>
        </section>
      </main>
    );
  }
}
