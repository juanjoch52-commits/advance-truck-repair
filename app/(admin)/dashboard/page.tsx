import { getSupabaseServerClient } from '@/lib/supabaseServer';
import DashboardContent from './DashboardContent';

function getWeekRange() {
  const now = new Date();
  const day = now.getDay(); // 0=Dom, 1=Lun...
  const diffToMon = (day === 0 ? -6 : 1 - day);
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMon);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday.toISOString().split('T')[0],
    end: sunday.toISOString().split('T')[0],
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

  const recentOrders = ((reportsRes.data ?? []) as any[])
    .slice(0, 5)
    .map((r: any) => ({
      id: r.id as string,
      externalOrderNumber: (r.external_order_number ?? '') as string,
      truckNumber: (r.truck_number ?? '—') as string,
      company: (r.company ?? '—') as string,
      workDate: r.work_date as string,
    }));

  return (
    <DashboardContent
      totalOrders={totalOrders}
      totalEmployees={totalEmployees}
      weeklyEarned={weeklyEarned}
      weeklyAdminEarned={weeklyAdminEarned}
      start={start}
      end={end}
      recentOrders={recentOrders}
    />
  );
}
