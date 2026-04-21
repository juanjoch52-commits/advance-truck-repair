import { getSupabaseServerClient } from '@/lib/supabaseServer';
import Link from 'next/link';

function getWeekRange(offsetWeeks = 0) {
  const now = new Date();
  const day = now.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMon + offsetWeeks * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday.toISOString().split('T')[0],
    end: sunday.toISOString().split('T')[0],
  };
}

export default async function CorteSemanalPage({
  searchParams,
}: {
  searchParams: Promise<{ semana_inicio?: string; semana_fin?: string }>;
}) {
  const params = await searchParams;
  const supabase = getSupabaseServerClient();

  const { start: defaultStart, end: defaultEnd } = getWeekRange(0);
  const weekStart = params.semana_inicio ?? defaultStart;
  const weekEnd = params.semana_fin ?? defaultEnd;

  const { data: entries } = await supabase
    .from('earned_entries')
    .select(`
      id, amount, work_date, truck_number, mechanic_role,
      employee_id,
      employees!earned_entries_employee_id_fkey(id, full_name)
    `)
    .gte('work_date', weekStart)
    .lte('work_date', weekEnd);

  const byEmployee: Record<string, {
    id: string;
    name: string;
    total: number;
    orderCount: number;
    entries: typeof entries;
  }> = {};

  for (const e of entries ?? []) {
    const emp = (e.employees as any);
    const empId = emp?.id ?? e.employee_id;
    const empName = emp?.full_name ?? 'Sin nombre';
    if (!byEmployee[empId]) {
      byEmployee[empId] = { id: empId, name: empName, total: 0, orderCount: 0, entries: [] };
    }
    byEmployee[empId].total += Number(e.amount);
    byEmployee[empId].orderCount += 1;
    byEmployee[empId].entries!.push(e);
  }

  const mechanics = Object.values(byEmployee).sort((a, b) => b.total - a.total);
  const totalGeneral = mechanics.reduce((s, m) => s + m.total, 0);

  const { start: prevStart, end: prevEnd } = getWeekRange(-1);
  const { start: nextStart, end: nextEnd } = getWeekRange(1);

  const formatFecha = (d: string) =>
    new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div>
      <div className="mb-8">
        <h1 className="display-font text-3xl font-bold text-slate-100 tracking-wide">CORTE SEMANAL</h1>
        <p className="text-slate-400 mt-1">Resumen de pagos para emision de cheques</p>
      </div>

      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <a
          href={`/corte-semanal?semana_inicio=${prevStart}&semana_fin=${prevEnd}`}
          className="bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 px-3 py-2 rounded-lg transition flex items-center gap-1 text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Semana anterior
        </a>

        <div className="flex-1 bg-slate-900/60 border border-white/5 rounded-xl px-5 py-3 text-center min-w-64">
          <p className="text-slate-500 text-xs mb-0.5">SEMANA DE CORTE</p>
          <p className="display-font text-amber-400 font-bold text-lg tracking-wide">
            {formatFecha(weekStart)} — {formatFecha(weekEnd)}
          </p>
        </div>

        <form method="GET" className="flex items-center gap-2">
          <input type="date" name="semana_inicio" defaultValue={weekStart}
            className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-slate-100 text-xs focus:outline-none focus:border-amber-400/50" />
          <span className="text-slate-600 text-xs">—</span>
          <input type="date" name="semana_fin" defaultValue={weekEnd}
            className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-slate-100 text-xs focus:outline-none focus:border-amber-400/50" />
          <button type="submit" className="bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-400 text-xs px-3 py-2 rounded-lg transition">
            Ir
          </button>
        </form>

        <a
          href={`/corte-semanal?semana_inicio=${nextStart}&semana_fin=${nextEnd}`}
          className="bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 px-3 py-2 rounded-lg transition flex items-center gap-1 text-sm"
        >
          Semana siguiente
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </a>
      </div>

      <div className="flex justify-end mb-4">
        <Link
          href={`/reportes?tipo=semanal&desde=${weekStart}&hasta=${weekEnd}`}
          className="flex items-center gap-2 text-sm text-sky-400 hover:text-sky-300 border border-sky-500/20 hover:border-sky-400/30 px-4 py-2 rounded-lg transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          Generar PDF de esta semana
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-5">
          <p className="text-slate-400 text-sm mb-1">Total a Pagar</p>
          <p className="display-font text-2xl font-bold text-amber-400">
            ${totalGeneral.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="bg-slate-900/60 border border-white/5 rounded-xl p-5">
          <p className="text-slate-400 text-sm mb-1">Mecanicos a pagar</p>
          <p className="display-font text-2xl font-bold text-slate-200">{mechanics.length}</p>
        </div>
        <div className="bg-slate-900/60 border border-white/5 rounded-xl p-5">
          <p className="text-slate-400 text-sm mb-1">Trabajos realizados</p>
          <p className="display-font text-2xl font-bold text-slate-200">
            {mechanics.reduce((s, m) => s + m.orderCount, 0)}
          </p>
        </div>
      </div>

      {mechanics.length === 0 ? (
        <div className="bg-slate-900/60 border border-white/5 rounded-xl p-12 text-center">
          <p className="text-slate-500">No hay registros de pago para esta semana.</p>
          <Link href="/ordenes/nueva" className="text-amber-400 hover:text-amber-300 text-sm mt-2 inline-block">
            Registrar una orden
          </Link>
        </div>
      ) : (
        <div className="bg-slate-900/60 border border-white/5 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-white/5 bg-white/2">
            <h2 className="display-font text-slate-400 font-semibold tracking-wide text-sm">TABLA DE CHEQUES</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-5 py-3 text-slate-500 font-medium">#</th>
                <th className="text-left px-5 py-3 text-slate-500 font-medium">Mecanico</th>
                <th className="text-center px-5 py-3 text-slate-500 font-medium">Trabajos</th>
                <th className="text-right px-5 py-3 text-slate-500 font-medium">Total Devengado</th>
                <th className="text-right px-5 py-3 text-slate-500 font-medium">Monto Cheque</th>
              </tr>
            </thead>
            <tbody>
              {mechanics.map((m, idx) => (
                <tr key={m.id} className="border-b border-white/5 hover:bg-white/2 transition-colors">
                  <td className="px-5 py-4 text-slate-600">{idx + 1}</td>
                  <td className="px-5 py-4 text-slate-200 font-semibold">{m.name}</td>
                  <td className="px-5 py-4 text-center text-slate-400">{m.orderCount}</td>
                  <td className="px-5 py-4 text-right text-slate-300">
                    ${m.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <span className="display-font text-lg font-bold text-emerald-400">
                      ${m.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-white/10 bg-white/2">
                <td colSpan={3} className="px-5 py-4 text-slate-400 font-medium text-sm">TOTAL NOMINA SEMANAL</td>
                <td className="px-5 py-4 text-right text-slate-300 font-bold"></td>
                <td className="px-5 py-4 text-right">
                  <span className="display-font text-xl font-bold text-amber-400">
                    ${totalGeneral.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
