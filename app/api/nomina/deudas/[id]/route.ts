import { NextResponse } from 'next/server';
import { authErrorResponse } from '@/lib/apiAuth';
import { requireOwnerAccess, sanitizeDbError } from '@/lib/payrollApi';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Operaciones sobre una deuda concreta (owner/super_user solamente).
// Contrato:
//   POST   /api/nomina/deudas/[id]  { week_ending: YYYY-MM-DD }
//          → aplica la cuota de la semana: inserta debt_payments con
//            amount = min(cuota, saldo) y actualiza remaining_balance /
//            is_active (misma lógica que tenía la página, con saldo fresco de BD).
//   DELETE /api/nomina/deudas/[id]
//          → cancela la deuda (is_active = false).

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase } = await requireOwnerAccess();
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const weekEnding = String(body.week_ending ?? '').trim();
    if (!id || !ISO_DATE.test(weekEnding)) {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
    }

    // Leer la deuda con saldo actual (no confiar en montos del cliente).
    const { data: debt, error: debtErr } = await supabase
      .from('debts')
      .select('id, weekly_installment, remaining_balance, is_active')
      .eq('id', id)
      .maybeSingle();

    if (debtErr) return NextResponse.json({ error: sanitizeDbError('deudas', debtErr.message) }, { status: 500 });
    if (!debt) return NextResponse.json({ error: 'Deuda no encontrada' }, { status: 404 });
    if (!debt.is_active) return NextResponse.json({ error: 'La deuda ya no está activa' }, { status: 400 });

    const amount = Math.min(Number(debt.weekly_installment), Number(debt.remaining_balance));
    const newBalance = Math.max(0, Number(debt.remaining_balance) - amount);

    // Insertar la cuota de la semana.
    const { error: payErr } = await supabase.from('debt_payments').insert({
      debt_id: id,
      week_ending: weekEnding,
      amount,
    });
    if (payErr) return NextResponse.json({ error: sanitizeDbError('deudas', payErr.message) }, { status: 500 });

    // Actualizar saldo y marcar inactiva si quedó en cero.
    const { error: updErr } = await supabase
      .from('debts')
      .update({ remaining_balance: newBalance, is_active: newBalance > 0 })
      .eq('id', id);
    if (updErr) return NextResponse.json({ error: sanitizeDbError('deudas', updErr.message) }, { status: 500 });

    return NextResponse.json({ ok: true, amount, remaining_balance: newBalance });
  } catch (error) {
    const resp = authErrorResponse(error);
    if (resp) return resp;
    throw error;
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase } = await requireOwnerAccess();
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });

    const { error } = await supabase
      .from('debts')
      .update({ is_active: false })
      .eq('id', id);

    if (error) return NextResponse.json({ error: sanitizeDbError('deudas', error.message) }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const resp = authErrorResponse(error);
    if (resp) return resp;
    throw error;
  }
}
