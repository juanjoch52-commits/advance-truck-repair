import { getSupabaseServerClient } from '@/lib/supabaseServer';
import NominaContent from './NominaContent';

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

  const { data: entries } = await (supabase as any)
    .from('earned_entries')
    .select(`
      id, amount, work_date, truck_number, description,
      employees!earned_entries_employee_id_fkey(full_name),
      work_reports!earned_entries_work_report_id_fkey(company, external_order_number)
    `)
    .eq('entry_type', 'mechanic')
    .gte('work_date', desde)
    .lte('work_date', hasta)
    .order('work_date', { ascending: false });

  const data = entries ?? [];
  const totalGeneral = data.reduce((s: number, r: any) => s + Number(r.amount), 0);

  const byEmployee: Record<string, { name: string; total: number; entries: any[] }> = {};
  for (const e of data) {
    const empName = (e as any).employees?.full_name ?? 'Sin nombre';
    if (!byEmployee[empName]) byEmployee[empName] = { name: empName, total: 0, entries: [] };
    byEmployee[empName].total += Number(e.amount);
    byEmployee[empName].entries.push({
      id: e.id,
      amount: Number(e.amount),
      work_date: e.work_date,
      truck_number: e.truck_number ?? null,
      description: e.description ?? null,
      company: (e as any).work_reports?.company ?? null,
    });
  }

  const groups = Object.values(byEmployee).sort((a, b) => b.total - a.total);

  return (
    <NominaContent
      desde={desde}
      hasta={hasta}
      totalGeneral={totalGeneral}
      totalRecords={data.length}
      groups={groups}
    />
  );
}
