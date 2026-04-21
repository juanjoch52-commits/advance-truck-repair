import { getSupabaseServerClient } from '@/lib/supabaseServer';

export default async function NominaPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const params = await searchParams;
  const supabase = getSupabaseServerClient();

  const now = new Date();
  const defaultDesde = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const defaultHasta = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  const desde = params.desde ?? defaultDesde;
  const hasta = params.hasta ?? defaultHasta;

  const { data: entries } = await supabase
    .from('earned_entries')
    .select(`
      id, amount, work_date, truck_number, mechanic_role,
      employees!earned_entries_employee_id_fkey(full_name),
      work_orders!earned_entries_work_order_id_fkey(company, invoice_number)
    `)
    .gte('work_date', desde)
    .lte('work_date', hasta)
    .order('work_date', { ascending: false });

  const data = entries ?? [];
  const totalGeneral = data.reduce((s, r) => s + Number(r.amount), 0);

  const byEmployee: Record<string, { name: string; total: number; entries: typeof data }> = {};
  for (const e of data) {
    const empName = (e.employees as any)?.full_name ?? 'Sin nombre';
    if (!byEmployee[empName]) byEmployee[empName] = { name: empName, total: 0, entries: [] };
    byEmployee[empName].total += Number(e.amount);
    byEmployee[empName].entries.push(e);
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="display-font text-3xl font-bold text-slate-100 tracking-wide">DEVENGADOS</h1>
        <p className="text-slate-400 mt-1">Historial de montos asignados por orden de trabajo</p>
      </div>

      <form method="GET" className="flex items-end gap-4 mb-6 flex-wrap">
        <div>
          <label className="block text-slate-500 text-xs mb-1.5">Desde</label>
          <input type="date" name="desde" defaultValue={desde}
            className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-amber-400/50 transition" />
        </div>
        <div>
          <label className="block text-slate-500 text-xs mb-1.5">Hasta</label>
          <input type="date" name="hasta" defaultValue={hasta}
            className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-amber-400/50 transition" />
        </div>
        <button type="submit" className="bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-400 text-sm px-4 py-2 rounded-lg transition">
          Filtrar
        </button>
        <a href="/nomina" className="text-slate-500 hover:text-slate-300 text-sm py-2">Limpiar</a>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-5">
          <p className="text-slate-400 text-sm mb-1">Total Devengado</p>
          <p className="display-font text-2xl font-bold text-amber-400">
            ${totalGeneral.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="bg-slate-900/60 border border-white/5 rounded-xl p-5">
          <p className="text-slate-400 text-sm mb-1">Registros</p>
          <p className="display-font text-2xl font-bold text-slate-200">{data.length}</p>
        </div>
        <div className="bg-slate-900/60 border border-white/5 rounded-xl p-5">
          <p className="text-slate-400 text-sm mb-1">Mecanicos con pago</p>
          <p className="display-font text-2xl font-bold text-slate-200">{Object.keys(byEmployee).length}</p>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="bg-slate-900/60 border border-white/5 rounded-xl p-12 text-center">
          <p className="text-slate-500">No hay registros para el periodo seleccionado.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.values(byEmployee).sort((a, b) => b.total - a.total).map(({ name, total, entries }) => (
            <div key={name} className="bg-slate-900/60 border border-white/5 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 bg-white/2">
                <span className="display-font text-slate-200 font-semibold tracking-wide">{name}</span>
                <span className="display-font text-emerald-400 font-bold text-lg">
                  ${total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="text-left px-5 py-2 text-slate-600 font-normal">Fecha</th>
                    <th className="text-left px-5 py-2 text-slate-600 font-normal">Camion</th>
                    <th className="text-left px-5 py-2 text-slate-600 font-normal">Empresa</th>
                    <th className="text-left px-5 py-2 text-slate-600 font-normal">Rol</th>
                    <th className="text-right px-5 py-2 text-slate-600 font-normal">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e: any) => (
                    <tr key={e.id} className="border-b border-white/5 last:border-0">
                      <td className="px-5 py-2.5 text-slate-500">
                        {new Date(e.work_date + 'T12:00:00').toLocaleDateString('es-MX')}
                      </td>
                      <td className="px-5 py-2.5 text-slate-300">{e.truck_number ?? '—'}</td>
                      <td className="px-5 py-2.5 text-slate-400">{e.work_orders?.company ?? '—'}</td>
                      <td className="px-5 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          e.mechanic_role === 'principal'
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-slate-700 text-slate-400'
                        }`}>
                          {e.mechanic_role === 'principal' ? 'Principal' : 'Ayudante'}
                        </span>
                      </td>
                      <td className="px-5 py-2.5 text-right text-emerald-400 font-medium">
                        ${Number(e.amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
