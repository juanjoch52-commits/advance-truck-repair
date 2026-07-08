import { NextResponse } from 'next/server';
import { authErrorResponse } from '@/lib/apiAuth';
import { requireOwnerAccess, sanitizeDbError } from '@/lib/payrollApi';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ADMIN_ENTRY_TYPES = ['admin_fixed', 'admin_hourly', 'admin_manual'];

// Nómina administrativa (owner/super_user solamente): empleados no comisionados,
// faltas con auditoría, entradas admin de la semana y deducciones por deuda.

type EntryRow = {
  employee_id: string;
  amount: number;
  hours_worked: number | null;
  description: string | null;
  work_date: string;
  week_start: string;
  week_end: string;
  entry_type: string;
  mechanic_role: string;
};

// Valida y normaliza una entrada admin enviada por el cliente.
// mechanic_role se estampa siempre en el servidor.
function parseEntry(raw: unknown): EntryRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const employeeId = String(r.employee_id ?? '').trim();
  const entryType = String(r.entry_type ?? '').trim();
  const amount = Number(r.amount);
  const workDate = String(r.work_date ?? '').trim();
  const weekStart = String(r.week_start ?? '').trim();
  const weekEnd = String(r.week_end ?? '').trim();
  const hours = r.hours_worked == null ? null : Number(r.hours_worked);
  const description = typeof r.description === 'string' && r.description.trim() ? r.description.trim() : null;

  if (!employeeId) return null;
  if (!ADMIN_ENTRY_TYPES.includes(entryType)) return null;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (hours !== null && (!Number.isFinite(hours) || hours < 0)) return null;
  if (!ISO_DATE.test(workDate) || !ISO_DATE.test(weekStart) || !ISO_DATE.test(weekEnd)) return null;

  return {
    employee_id: employeeId,
    amount: Math.round(amount * 100) / 100,
    hours_worked: hours,
    description,
    work_date: workDate,
    week_start: weekStart,
    week_end: weekEnd,
    entry_type: entryType,
    mechanic_role: 'admin',
  };
}

// GET ?start=YYYY-MM-DD&end=YYYY-MM-DD
// → { employees, absences, entries, debtPayments }
export async function GET(request: Request) {
  try {
    const { supabase } = await requireOwnerAccess();

    const { searchParams } = new URL(request.url);
    const start = searchParams.get('start') ?? '';
    const end = searchParams.get('end') ?? '';
    if (!ISO_DATE.test(start) || !ISO_DATE.test(end)) {
      return NextResponse.json({ error: 'Rango de fechas inválido' }, { status: 400 });
    }

    const [emp, att, ent, dp] = await Promise.all([
      supabase
        .from('employees')
        .select('id, full_name, payment_type, weekly_salary, hourly_rate, work_days')
        .neq('payment_type', 'mechanic_commission')
        .order('full_name'),
      // Faltas de la semana con auditoría (quién marcó/modificó y cuándo).
      supabase
        .from('attendance')
        .select('employee_id, work_date, absence_reason, created_by_name, updated_by_name, created_at, updated_at, status')
        .eq('status', 'absent')
        .gte('work_date', start)
        .lte('work_date', end)
        .order('work_date'),
      supabase
        .from('earned_entries')
        .select('id, employee_id, amount, hours_worked, description, work_date, week_start, week_end, entry_type')
        .gte('work_date', start)
        .lte('work_date', end)
        .in('entry_type', ADMIN_ENTRY_TYPES),
      // Cuotas de deuda aplicadas en la semana (join a la deuda para saber empleado).
      supabase
        .from('debt_payments')
        .select('debt_id, amount, debts!inner(employee_id, description)')
        .gte('week_ending', start)
        .lte('week_ending', end),
    ]);

    if (emp.error) return NextResponse.json({ error: sanitizeDbError('nomina', emp.error.message) }, { status: 500 });
    if (att.error) return NextResponse.json({ error: sanitizeDbError('nomina', att.error.message) }, { status: 500 });
    if (ent.error) return NextResponse.json({ error: sanitizeDbError('nomina', ent.error.message) }, { status: 500 });
    if (dp.error) return NextResponse.json({ error: sanitizeDbError('nomina', dp.error.message) }, { status: 500 });

    return NextResponse.json({
      employees: emp.data ?? [],
      absences: att.data ?? [],
      entries: ent.data ?? [],
      debtPayments: dp.data ?? [],
    });
  } catch (error) {
    const resp = authErrorResponse(error);
    if (resp) return resp;
    throw error;
  }
}

// POST { entries: [...] } o una entrada suelta
// → inserta entradas admin (admin_fixed / admin_hourly / admin_manual).
export async function POST(request: Request) {
  try {
    const { supabase } = await requireOwnerAccess();
    const body = await request.json().catch(() => ({}));

    const rawList: unknown[] = Array.isArray(body.entries) ? body.entries : [body];
    if (rawList.length === 0) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });

    const rows: EntryRow[] = [];
    for (const raw of rawList) {
      const row = parseEntry(raw);
      if (!row) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
      rows.push(row);
    }

    const { error } = await supabase.from('earned_entries').insert(rows);
    if (error) return NextResponse.json({ error: sanitizeDbError('nomina', error.message) }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const resp = authErrorResponse(error);
    if (resp) return resp;
    throw error;
  }
}

// DELETE ?id= → borra una entrada admin (solo tipos admin_*).
export async function DELETE(request: Request) {
  try {
    const { supabase } = await requireOwnerAccess();
    const { searchParams } = new URL(request.url);
    const id = String(searchParams.get('id') ?? '').trim();
    if (!id) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });

    const { error } = await supabase
      .from('earned_entries')
      .delete()
      .eq('id', id)
      .in('entry_type', ADMIN_ENTRY_TYPES);

    if (error) return NextResponse.json({ error: sanitizeDbError('nomina', error.message) }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const resp = authErrorResponse(error);
    if (resp) return resp;
    throw error;
  }
}

// PATCH { employee_id, weekly_salary } → actualiza el sueldo fijo semanal.
export async function PATCH(request: Request) {
  try {
    const { supabase } = await requireOwnerAccess();
    const body = await request.json().catch(() => ({}));
    const employeeId = String(body.employee_id ?? '').trim();
    const salary = Number(body.weekly_salary);
    if (!employeeId || !Number.isFinite(salary) || salary < 0) {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
    }

    const { error } = await supabase
      .from('employees')
      .update({ weekly_salary: salary })
      .eq('id', employeeId);

    if (error) return NextResponse.json({ error: sanitizeDbError('nomina', error.message) }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const resp = authErrorResponse(error);
    if (resp) return resp;
    throw error;
  }
}
