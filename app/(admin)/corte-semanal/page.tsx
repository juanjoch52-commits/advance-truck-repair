import { getSupabaseServerClient } from '@/lib/supabaseServer';
import CorteContent from './CorteContent';

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

  const { data: entries } = await (supabase as any)
    .from('earned_entries')
    .select(`
      id, amount, work_date, truck_number,
      employee_id,
      employees!earned_entries_employee_id_fkey(id, full_name)
    `)
    .gte('work_date', weekStart)
    .lte('work_date', weekEnd);

  const byEmployee: Record<string, { id: string; name: string; total: number; orderCount: number }> = {};
  for (const e of entries ?? []) {
    const emp = (e.employees as any);
    const empId = emp?.id ?? e.employee_id;
    const empName = emp?.full_name ?? 'Sin nombre';
    if (!byEmployee[empId]) {
      byEmployee[empId] = { id: empId, name: empName, total: 0, orderCount: 0 };
    }
    byEmployee[empId].total += Number(e.amount);
    byEmployee[empId].orderCount += 1;
  }

  const mechanics = Object.values(byEmployee).sort((a, b) => b.total - a.total);
  const totalGeneral = mechanics.reduce((s, m) => s + m.total, 0);

  const { start: prevStart, end: prevEnd } = getWeekRange(-1);
  const { start: nextStart, end: nextEnd } = getWeekRange(1);

  return (
    <CorteContent
      weekStart={weekStart}
      weekEnd={weekEnd}
      prevStart={prevStart}
      prevEnd={prevEnd}
      nextStart={nextStart}
      nextEnd={nextEnd}
      mechanics={mechanics}
      totalGeneral={totalGeneral}
    />
  );
}
