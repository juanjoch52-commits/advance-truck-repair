export const dynamic = 'force-dynamic';

import { getSupabaseServerClient } from '@/lib/supabaseServer';
import DashboardContent from './DashboardContent';

function getWeekRange() {
  const now = new Date();
  const day = now.getDay(); // 0=Dom, 6=Sáb
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - day); // retroceder al domingo
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  return {
    start: sunday.toISOString().split('T')[0],
    end: saturday.toISOString().split('T')[0],
  };
}

export default async function DashboardPage() {
  const supabase = getSupabaseServerClient();
  const { start, end } = getWeekRange();

  // Pulled from the new schema:
  //  - work_reports for total reports count + recent activity
  //  - employees filtered by role='mechanic' for active mechanics
  //  - earned_entries for weekly earned (mechanic-only)
  const [reportsRes, mechanicsRes, earnedRes, adminEarnedRes] = await Promise.all([
    (supabase as any)
      .from('work_reports')
      .select('id, work_date, company, truck_number, external_order_number, created_at', { count: 'exact' })
      .order('work_date', { ascending: false })
      .order('created_at', { ascending: false }),
    (supabase as any).from('employees').select('id', { count: 'exact' }).eq('role', 'mechanic').eq('is_active', true),
    (supabase as any)
      .from('earned_entries')
      .select('amount, entry_type')
      .gte('work_date', start)
      .lte('work_date', end)
      .eq('entry_type', 'mechanic'),
    (supabase as any)
      .from('earned_entries')
      .select('amount')
      .gte('work_date', start)
      .lte('work_date', end)
      .in('entry_type', ['admin_fixed', 'admin_hourly', 'admin_manual']),
  ]);

  const totalOrders = reportsRes.count ?? 0;
  const totalEmployees = mechanicsRes.count ?? 0;
  const weeklyEarned = ((earnedRes.data ?? []) as any[])
    .reduce((s: number, r: any) => s + Number(r.amount), 0);
  const weeklyAdminEarned = ((adminEarnedRes.data ?? []) as any[])
    .reduce((s: number, r: any) => s + Number(r.amount), 0);

  // Ingresos esta semana: suma de amount_charged_to_client de las tareas
  // cuyo work_report cae en el rango de la semana actual.
  // Reutilizamos reportsRes.data (ya traído) para filtrar IDs en memoria.
  const weekReportIds = ((reportsRes.data ?? []) as any[])
    .filter((r: any) => r.work_date >= start && r.work_date <= end)
    .map((r: any) => r.id as string);

  let weeklyRevenue = 0;
  if (weekReportIds.length > 0) {
    const { data: taskData } = await (supabase as any)
      .from('report_tasks')
      .select('amount_charged_to_client')
      .in('report_id', weekReportIds);
    weeklyRevenue = ((taskData ?? []) as any[])
      .reduce((s: number, t: any) => s + Number(t.amount_charged_to_client), 0);
  }

  const recentOrders = ((reportsRes.data ?? []) as any[])
    .slice(0, 5)
    .map((r: any) => ({
      id: r.id as string,
      externalOrderNumber: (r.external_order_number ?? '') as string,
      truckNumber: (r.truck_number ?? '—') as string,
      company: (r.company ?? '—') as string,
      workDate: r.work_date as string,
      createdAt: (r.created_at ?? '') as string,
    }));

  return (
    <DashboardContent
      totalOrders={totalOrders}
      totalEmployees={totalEmployees}
      weeklyEarned={weeklyEarned}
      weeklyAdminEarned={weeklyAdminEarned}
      weeklyRevenue={weeklyRevenue}
      start={start}
      end={end}
      recentOrders={recentOrders}
    />
  );
}
