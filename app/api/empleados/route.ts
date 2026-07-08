import { NextResponse } from 'next/server';
import { authErrorResponse } from '@/lib/apiAuth';
import { requirePayrollAccess, isPrivilegedSession, sanitizeDbError } from '@/lib/payrollApi';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Tipos de pago válidos para un empleado.
const PAYMENT_TYPES = ['mechanic_commission', 'fixed_weekly', 'hourly', 'manual'] as const;

// Normaliza un monto de salario: número >= 0 o null (campo vacío).
function parseSalary(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

// Listado de empleados. Los montos de salario (weekly_salary, hourly_rate)
// solo se envían a owner/super_user: el rol admin gestiona personal sin verlos.
export async function GET() {
  try {
    const { session, supabase } = await requirePayrollAccess();
    const privileged = isPrivilegedSession(session);

    const cols = privileged
      ? 'id, full_name, phone, email, hire_date, notes, role, payment_type, is_active, work_days, weekly_salary, hourly_rate'
      : 'id, full_name, phone, email, hire_date, notes, role, payment_type, is_active, work_days';

    const { data, error } = await supabase
      .from('employees')
      .select(cols)
      .order('full_name');

    if (error) return NextResponse.json({ error: sanitizeDbError('empleados', error.message) }, { status: 500 });
    return NextResponse.json({ privileged, employees: data ?? [] });
  } catch (error) {
    const resp = authErrorResponse(error);
    if (resp) return resp;
    throw error;
  }
}

// Crear empleado. Los montos de salario solo se aplican si la sesión es
// privilegiada (owner/super); para admin se ignoran silenciosamente.
export async function POST(request: Request) {
  try {
    const { session, supabase } = await requirePayrollAccess();
    const privileged = isPrivilegedSession(session);
    const body = await request.json().catch(() => ({}));

    const fullName = String(body.full_name ?? '').trim();
    const hireDate = String(body.hire_date ?? '').trim();
    if (!fullName || !ISO_DATE.test(hireDate)) {
      return NextResponse.json({ error: 'Nombre y fecha de contratación son requeridos' }, { status: 400 });
    }

    const paymentType = body.payment_type != null ? String(body.payment_type) : null;
    if (paymentType !== null && !PAYMENT_TYPES.includes(paymentType as (typeof PAYMENT_TYPES)[number])) {
      return NextResponse.json({ error: 'Tipo de pago inválido' }, { status: 400 });
    }

    const insertPayload: Record<string, unknown> = {
      full_name: fullName,
      phone: String(body.phone ?? '').trim() || null,
      email: String(body.email ?? '').trim() || null,
      hire_date: hireDate,
      notes: String(body.notes ?? '').trim() || null,
      role: String(body.role ?? '').trim() || 'mechanic',
    };
    if (paymentType !== null) insertPayload.payment_type = paymentType;
    if (privileged) {
      insertPayload.weekly_salary = parseSalary(body.weekly_salary);
      insertPayload.hourly_rate = parseSalary(body.hourly_rate);
    }

    const { data, error } = await supabase
      .from('employees')
      .insert(insertPayload)
      .select('id, full_name')
      .single();

    if (error) return NextResponse.json({ error: sanitizeDbError('empleados', error.message) }, { status: 500 });
    return NextResponse.json({ ok: true, employee: data }, { status: 201 });
  } catch (error) {
    const resp = authErrorResponse(error);
    if (resp) return resp;
    throw error;
  }
}
