import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireSelfOrAdmin, authErrorResponse } from '@/lib/apiAuth';

type LoanRow = {
  id: string;
  amount: number;
  description: string;
  date: string;
  status: 'pending' | 'paid';
};

type AssignmentRow = {
  approved_amount: number;
  work_orders: {
    work_date: string;
    status: string;
  } | null;
};

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase no configurado');
  return createClient(url, key, { auth: { persistSession: false } });
}

function isMissingRelationError(message: string | undefined) {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return normalized.includes('relation') && normalized.includes('does not exist');
}

function getCurrentWeekRange() {
  const today = new Date();
  const day = today.getDay();
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

    try {
      await requireSelfOrAdmin(employeeId);
    } catch (e) {
      const resp = authErrorResponse(e);
      if (resp) return resp;
      throw e;
    }

    const { searchParams } = new URL(request.url);

    let start = searchParams.get('start');
    let end = searchParams.get('end');

    if (!start || !end) {
      const week = getCurrentWeekRange();
      start = week.start;
      end = week.end;
    }

    const supabase = getClient();

    const [{ data: assignmentRows, error: assignmentsError }, loansResult] = await Promise.all([
      supabase
        .from('work_order_assignments')
        .select('approved_amount,work_orders!inner(work_date,status)')
        .eq('employee_id', employeeId)
        .eq('work_orders.status', 'approved')
        .gte('work_orders.work_date', start)
        .lte('work_orders.work_date', end)
        .returns<AssignmentRow[]>(),
      supabase
        .from('loans')
        .select('id,amount,description,date,status')
        .eq('employee_id', employeeId)
        .eq('status', 'pending')
        .order('date', { ascending: false })
        .returns<LoanRow[]>(),
    ]);

    if (assignmentsError) {
      return NextResponse.json({ error: assignmentsError.message }, { status: 500 });
    }

    let pendingLoans: LoanRow[] = loansResult.data ?? [];

    if (loansResult.error) {
      if (!isMissingRelationError(loansResult.error.message)) {
        return NextResponse.json({ error: loansResult.error.message }, { status: 500 });
      }

      // Fallback for instances where legacy debts table is still used.
      const { data: legacyDebts, error: legacyDebtsError } = await supabase
        .from('debts')
        .select('id,remaining_balance,description,created_at')
        .eq('employee_id', employeeId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (legacyDebtsError) {
        return NextResponse.json({ error: legacyDebtsError.message }, { status: 500 });
      }

      pendingLoans = (legacyDebts || []).map((debt: any) => ({
        id: debt.id,
        amount: Number(debt.remaining_balance ?? 0),
        description: String(debt.description ?? 'Deuda activa'),
        date: String(debt.created_at ?? new Date().toISOString()),
        status: 'pending',
      }));
    }

    const approvedProduction = Number(
      (assignmentRows ?? []).reduce((sum, row) => sum + Number(row.approved_amount ?? 0), 0).toFixed(2),
    );

    const normalizedLoans = pendingLoans.map((loan) => ({
      id: loan.id,
      amount: Number(loan.amount ?? 0),
      description: loan.description,
      date: loan.date,
      status: loan.status,
    }));

    const pendingLoansTotal = Number(
      normalizedLoans.reduce((sum, loan) => sum + Number(loan.amount), 0).toFixed(2),
    );

    const netEstimated = Number((approvedProduction - pendingLoansTotal).toFixed(2));

    return NextResponse.json({
      week: { start, end },
      approvedProduction,
      pendingLoansTotal,
      netEstimated,
      pendingLoans: normalizedLoans,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
