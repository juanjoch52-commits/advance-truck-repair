import { NextResponse } from 'next/server';
import { authErrorResponse } from '@/lib/apiAuth';
import { requirePayrollAccess, sanitizeDbError } from '@/lib/payrollApi';

// Actualizar los días laborales (work_days) de un empleado.
export async function POST(request: Request) {
  try {
    const { supabase } = await requirePayrollAccess();
    const body = await request.json().catch(() => ({}));
    const employeeId = String(body.employee_id ?? '').trim();
    const rawDays: unknown[] = Array.isArray(body.work_days) ? body.work_days : [];
    const workDays = Array.from(new Set(rawDays.map((d) => Number(d))))
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      .sort((a, b) => a - b);

    if (!employeeId || workDays.length === 0) {
      return NextResponse.json({ error: 'Datos inválidos (mínimo un día laboral)' }, { status: 400 });
    }

    const { error } = await supabase
      .from('employees')
      .update({ work_days: workDays })
      .eq('id', employeeId);

    if (error) return NextResponse.json({ error: sanitizeDbError('asistencia', error.message) }, { status: 500 });
    return NextResponse.json({ ok: true, work_days: workDays });
  } catch (error) {
    const resp = authErrorResponse(error);
    if (resp) return resp;
    throw error;
  }
}
