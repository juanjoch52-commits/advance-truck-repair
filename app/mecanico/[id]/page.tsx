import Link from 'next/link';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

type Employee = {
  id: string;
  full_name: string;
  role: 'mechanic' | 'admin';
};

type Assignment = {
  id: string;
  approved_amount: number;
  work_orders: {
    id: string;
    work_date: string;
    company: string;
    unit: string;
    invoice_number: string | null;
    labor_amount: number;
    status: 'pending_approval' | 'approved' | 'rejected';
  } | null;
};

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function getWeekRange(today = new Date()) {
  const day = today.getDay();
  const daysBackToThursday = (day - 4 + 7) % 7;
  const end = new Date(today);
  end.setDate(today.getDate() - daysBackToThursday);

  const start = new Date(end);
  start.setDate(end.getDate() - 6);

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export default async function MecanicoViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const week = getWeekRange();

  try {
    const supabase = getSupabaseServerClient();

    const [
      { data: employee, error: employeeError },
      { data: assignments, error: assignmentsError },
    ] = await Promise.all([
      supabase.from('employees').select('id,full_name,role').eq('id', id).single<Employee>(),
      supabase.from('work_order_assignments').select('id,approved_amount,work_orders!inner(id,work_date,company,unit,invoice_number,labor_amount,status)')
        .eq('employee_id', id)
        .eq('work_orders.status', 'approved')
        .gte('work_orders.work_date', week.start)
        .lte('work_orders.work_date', week.end)
        .order('created_at', { ascending: false })
        .returns<Assignment[]>(),
    ]);

    if (employeeError || !employee) {
      throw new Error(employeeError?.message ?? 'Mecánico no encontrado');
    }

    if (assignmentsError) {
      throw new Error(assignmentsError.message);
    }

    const weekTotal = (assignments ?? []).reduce((sum, row) => sum + Number(row.approved_amount), 0);

    return (
      <main className="brand-bg min-h-screen px-4 py-8 text-slate-100 sm:px-6">
        <section className="mx-auto max-w-5xl space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">Vista del Mecánico</p>
              <h1 className="display-font mt-2 text-4xl font-bold uppercase text-white">{employee.full_name}</h1>
              <p className="mt-2 text-sm text-slate-300">Transparencia semanal: {week.start} a {week.end}</p>
            </div>
            <Link href="/dashboard" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300 transition hover:border-amber-300/30 hover:text-white">← Dashboard</Link>
          </div>

          <section className="rounded-[28px] border border-white/10 bg-slate-950/60 p-6 shadow-2xl backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Acumulado semanal</p>
            <p className="mt-2 text-4xl font-bold text-emerald-300">{money.format(weekTotal)}</p>
            <p className="mt-2 text-sm text-slate-300">Suma de cheques aprobados por el mánager durante el corte actual.</p>
          </section>

          <section className="rounded-[28px] border border-white/10 bg-slate-950/60 p-6 shadow-2xl backdrop-blur">
            <h2 className="display-font text-2xl font-bold uppercase text-white">Trabajos de la semana</h2>

            {(assignments ?? []).length === 0 ? (
              <p className="mt-4 text-sm text-slate-400">No hay trabajos aprobados para este corte.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-xs uppercase tracking-[0.16em] text-slate-400">
                      <th className="py-2 pr-4">Fecha</th>
                      <th className="py-2 pr-4">Compañía</th>
                      <th className="py-2 pr-4">Unidad</th>
                      <th className="py-2 pr-4">Invoice</th>
                      <th className="py-2 pr-4">Labor</th>
                      <th className="py-2">Tu cheque</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(assignments ?? []).map((row) => (
                      <tr key={row.id} className="border-b border-white/5 text-slate-200">
                        <td className="py-2 pr-4">{row.work_orders?.work_date}</td>
                        <td className="py-2 pr-4">{row.work_orders?.company}</td>
                        <td className="py-2 pr-4">{row.work_orders?.unit}</td>
                        <td className="py-2 pr-4">{row.work_orders?.invoice_number ?? 'N/A'}</td>
                        <td className="py-2 pr-4">{money.format(Number(row.work_orders?.labor_amount ?? 0))}</td>
                        <td className="py-2 font-semibold text-emerald-300">{money.format(row.approved_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </section>
      </main>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return (
      <main className="brand-bg min-h-screen px-6 py-10 text-slate-100">
        <section className="mx-auto max-w-3xl rounded-[28px] border border-red-500/20 bg-red-950/20 p-6 backdrop-blur">
          <h1 className="display-font mt-3 text-3xl font-bold uppercase text-white">Error en vista de mecánico</h1>
          <p className="mt-4 text-sm text-red-100/90">{message}</p>
          <Link href="/dashboard" className="mt-5 inline-block text-sm text-amber-300 hover:underline">← Volver al dashboard</Link>
        </section>
      </main>
    );
  }
}
