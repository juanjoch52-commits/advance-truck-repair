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

  // Stats generales
  const [ordersRes, employeesRes, earnedRes] = await Promise.all([
    supabase.from('work_orders').select('id, status, created_at', { count: 'exact' }),
    supabase.from('employees').select('id', { count: 'exact' }),
    supabase
      .from('earned_entries')
      .select('amount, work_date')
      .gte('work_date', start)
      .lte('work_date', end),
  ]);

  const totalOrders = ordersRes.count ?? 0;
  const totalEmployees = employeesRes.count ?? 0;
  const weeklyEarned = (earnedRes.data ?? []).reduce((s, r) => s + Number(r.amount), 0);

  const recentOrders = (ordersRes.data ?? [])
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)
    .map(o => ({ id: o.id as string, status: o.status as string, created_at: o.created_at as string }));

  return (
    <DashboardContent
      totalOrders={totalOrders}
      totalEmployees={totalEmployees}
      weeklyEarned={weeklyEarned}
      start={start}
      end={end}
      recentOrders={recentOrders}
    />
  );
}
