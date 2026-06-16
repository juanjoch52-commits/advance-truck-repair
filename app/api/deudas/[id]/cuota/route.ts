import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireRole, authErrorResponse } from '@/lib/apiAuth';

function getWeekEndingThursday(date = new Date()) {
  const result = new Date(date);
  const day = result.getDay();
  const daysUntilThursday = (4 - day + 7) % 7;
  result.setDate(result.getDate() + daysUntilThursday);
  return result.toISOString().slice(0, 10);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireRole('owner', 'super_user');
  } catch (e) {
    const resp = authErrorResponse(e);
    if (resp) return resp;
    throw e;
  }

  const { id } = await params;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.json({ error: 'Supabase no configurado' }, { status: 500 });
  }

  const body = await request.json().catch(() => ({})) as { week_ending?: string };
  const weekEnding = body.week_ending ?? getWeekEndingThursday();
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: debt, error: debtError } = await supabase
    .from('debts')
    .select('id,employee_id,description,weekly_installment,remaining_balance,is_active')
    .eq('id', id)
    .single();

  if (debtError || !debt) {
    return NextResponse.json({ error: debtError?.message ?? 'Deuda no encontrada' }, { status: 404 });
  }

  if (!debt.is_active || Number(debt.remaining_balance) <= 0) {
    return NextResponse.json({ error: 'La deuda ya está pagada' }, { status: 400 });
  }

  const { data: existingPayment } = await supabase
    .from('debt_payments')
    .select('id')
    .eq('debt_id', id)
    .eq('week_ending', weekEnding)
    .maybeSingle();

  if (existingPayment) {
    return NextResponse.json({ error: 'La cuota de esta semana ya fue aplicada' }, { status: 409 });
  }

  const amount = Math.min(Number(debt.weekly_installment), Number(debt.remaining_balance));
  const newRemainingBalance = Math.max(0, Number(debt.remaining_balance) - amount);

  const { error: paymentError } = await supabase
    .from('debt_payments')
    .insert({
      debt_id: id,
      week_ending: weekEnding,
      amount,
    });

  if (paymentError) {
    return NextResponse.json({ error: paymentError.message }, { status: 500 });
  }

  const { data: updatedDebt, error: updateError } = await supabase
    .from('debts')
    .update({ remaining_balance: newRemainingBalance })
    .eq('id', id)
    .select('id,remaining_balance,is_active')
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    payment: {
      debt_id: id,
      week_ending: weekEnding,
      amount,
    },
    debt: updatedDebt,
  });
}
