import { NextResponse } from 'next/server';
import { authErrorResponse } from '@/lib/apiAuth';
import { requireOwnerAccess, sanitizeDbError } from '@/lib/payrollApi';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Deudas/deducciones de empleados (owner/super_user solamente).
// Contrato:
//   GET  ?start=YYYY-MM-DD&end=YYYY-MM-DD
//        → { employees, debts, payments }
//          employees: id, full_name (para el selector de nueva deuda)
//          debts: deudas activas con nombre del empleado
//          payments: cuotas (debt_payments) con week_ending dentro del rango
//   POST { employee_id, description, total_amount, weeks, start_week_ending }
//        → crea la deuda; la cuota semanal se calcula EN EL SERVIDOR como
//          round(total/weeks, 2) y remaining_balance arranca en el total.
//   (aplicar cuota / cancelar viven en /api/nomina/deudas/[id])

export async function GET(request: Request) {
  try {
    const { supabase } = await requireOwnerAccess();

    const { searchParams } = new URL(request.url);
    const start = searchParams.get('start') ?? '';
    const end = searchParams.get('end') ?? '';
    if (!ISO_DATE.test(start) || !ISO_DATE.test(end)) {
      return NextResponse.json({ error: 'Rango de fechas inválido' }, { status: 400 });
    }

    const [emp, debt, pay] = await Promise.all([
      supabase
        .from('employees')
        .select('id, full_name')
        .order('full_name'),
      supabase
        .from('debts')
        .select('id, employee_id, description, total_amount, remaining_balance, weekly_installment, is_active, created_at, start_week_ending, employees(full_name)')
        .eq('is_active', true)
        .order('created_at', { ascending: false }),
      supabase
        .from('debt_payments')
        .select('debt_id, week_ending, amount')
        .gte('week_ending', start)
        .lte('week_ending', end),
    ]);

    if (emp.error) return NextResponse.json({ error: sanitizeDbError('deudas', emp.error.message) }, { status: 500 });
    if (debt.error) return NextResponse.json({ error: sanitizeDbError('deudas', debt.error.message) }, { status: 500 });
    if (pay.error) return NextResponse.json({ error: sanitizeDbError('deudas', pay.error.message) }, { status: 500 });

    return NextResponse.json({
      employees: emp.data ?? [],
      debts: debt.data ?? [],
      payments: pay.data ?? [],
    });
  } catch (error) {
    const resp = authErrorResponse(error);
    if (resp) return resp;
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    const { supabase } = await requireOwnerAccess();
    const body = await request.json().catch(() => ({}));

    const employeeId = String(body.employee_id ?? '').trim();
    const description = String(body.description ?? '').trim();
    const total = Number(body.total_amount);
    const weeks = Number(body.weeks);
    const startWeekEnding = String(body.start_week_ending ?? '').trim();

    if (!employeeId || !description) {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
    }
    if (!Number.isFinite(total) || total <= 0) {
      return NextResponse.json({ error: 'Monto inválido' }, { status: 400 });
    }
    if (!Number.isInteger(weeks) || weeks < 1) {
      return NextResponse.json({ error: 'Número de semanas inválido' }, { status: 400 });
    }
    if (!ISO_DATE.test(startWeekEnding)) {
      return NextResponse.json({ error: 'Semana de inicio inválida' }, { status: 400 });
    }

    // Cuota semanal = total / semanas, a 2 decimales (misma fórmula de la página).
    const installment = Math.round((total / weeks) * 100) / 100;

    const { error } = await supabase.from('debts').insert({
      employee_id: employeeId,
      description,
      total_amount: total,
      weekly_installment: installment,
      remaining_balance: total,
      is_active: true,
      start_week_ending: startWeekEnding,
    });

    if (error) return NextResponse.json({ error: sanitizeDbError('deudas', error.message) }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const resp = authErrorResponse(error);
    if (resp) return resp;
    throw error;
  }
}
