import { getSupabaseServerClient } from '@/lib/supabaseServer';
import Link from 'next/link';

export default async function OrdenesPage() {
  const supabase = getSupabaseServerClient();

  const { data: orders } = await supabase
    .from('work_orders')
    .select(`
      id, truck_number, unit, company, invoice_number,
      work_date, labor_amount, status, created_at,
      employees!work_orders_employee_id_fkey(full_name)
    `)
    .order('created_at', { ascending: false })
    .limit(100);

  const statusLabel: Record<string, string> = {
    pending: 'Pendiente',
    approved: 'Aprobada',
    paid: 'Pagada',
    rejected: 'Rechazada',
    pending_approval: 'En revision',
  };
  const statusColor: Record<string, string> = {
    pending: 'bg-amber-500/20 text-amber-400',
    approved: 'bg-emerald-500/20 text-emerald-400',
    paid: 'bg-sky-500/20 text-sky-400',
    rejected: 'bg-red-500/20 text-red-400',
    pending_approval: 'bg-violet-500/20 text-violet-400',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="display-font text-3xl font-bold text-slate-100 tracking-wide">ORDENES DE TRABAJO</h1>
          <p className="text-slate-400 mt-1">{orders?.length ?? 0} ordenes registradas</p>
        </div>
        <Link
          href="/ordenes/nueva"
          className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 px-5 rounded-lg transition display-font tracking-wide flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          NUEVA ORDEN
        </Link>
      </div>

      {!orders || orders.length === 0 ? (
        <div className="bg-slate-900/60 border border-white/5 rounded-xl p-12 text-center">
          <p className="text-slate-500">No hay ordenes registradas aun.</p>
          <Link href="/ordenes/nueva" className="text-amber-400 hover:text-amber-300 text-sm mt-2 inline-block">
            Crear primera orden
          </Link>
        </div>
      ) : (
        <div className="bg-slate-900/60 border border-white/5 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-5 py-3 text-slate-500 font-medium">Camion</th>
                <th className="text-left px-5 py-3 text-slate-500 font-medium">Empresa</th>
                <th className="text-left px-5 py-3 text-slate-500 font-medium">Mecanico Principal</th>
                <th className="text-left px-5 py-3 text-slate-500 font-medium">Fecha</th>
                <th className="text-right px-5 py-3 text-slate-500 font-medium">Monto</th>
                <th className="text-center px-5 py-3 text-slate-500 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o: any) => (
                <tr key={o.id} className="border-b border-white/5 hover:bg-white/2 transition-colors">
                  <td className="px-5 py-3.5 text-slate-200 font-medium">
                    {o.truck_number || o.unit || '—'}
                  </td>
                  <td className="px-5 py-3.5 text-slate-400">{o.company || '—'}</td>
                  <td className="px-5 py-3.5 text-slate-400">
                    {(o.employees as any)?.full_name ?? '—'}
                  </td>
                  <td className="px-5 py-3.5 text-slate-500">
                    {new Date(o.work_date + 'T12:00:00').toLocaleDateString('es-MX')}
                  </td>
                  <td className="px-5 py-3.5 text-right text-emerald-400 font-medium">
                    ${Number(o.labor_amount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <span className={`text-xs px-2.5 py-1 rounded-full ${statusColor[o.status] ?? 'bg-slate-700 text-slate-400'}`}>
                      {statusLabel[o.status] ?? o.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
