import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type WorkOrderRow = {
  id: string;
  work_date: string;
  company: string;
  unit: string;
  invoice_number: string | null;
  labor_amount: number;
  status: string;
  rejection_reason: string | null;
  work_order_assignments: {
    approved_amount: number;
  }[];
};

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase no configurado');
  return createClient(url, key, { auth: { persistSession: false } });
}

function getCurrentWeekRange() {
  const today = new Date();
  const day = today.getDay(); // 0 = Sunday
  // Week runs Friday → Thursday
  const daysBackToFriday = (day - 5 + 7) % 7;
  const start = new Date(today);
  start.setDate(today.getDate() - daysBackToFriday);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ employeeId: string }> },
) {
  try {
    const { employeeId } = await params;
    const { searchParams } = new URL(request.url);

    // Allow caller to override week range
    let weekStart = searchParams.get('start');
    let weekEnd = searchParams.get('end');

    if (!weekStart || !weekEnd) {
      const range = getCurrentWeekRange();
      weekStart = range.start;
      weekEnd = range.end;
    }

    const supabase = getClient();

    const { data, error } = await supabase
      .from('work_orders')
      .select('id,work_date,company,unit,invoice_number,labor_amount,status,rejection_reason,work_order_assignments(approved_amount)')
      .eq('employee_id', employeeId)
      .gte('work_date', weekStart)
      .lte('work_date', weekEnd)
      .order('work_date', { ascending: false })
      .returns<WorkOrderRow[]>();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const orders = (data ?? []).map((o) => ({
      id: o.id,
      work_date: o.work_date,
      company: o.company,
      unit: o.unit,
      invoice_number: o.invoice_number,
      labor_amount: Number(o.labor_amount),
      status: o.status,
      rejection_reason: o.rejection_reason ?? null,
      approved_amount: o.work_order_assignments.reduce((s, a) => s + Number(a.approved_amount), 0),
    }));

    return NextResponse.json({ orders, week: { start: weekStart, end: weekEnd } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
