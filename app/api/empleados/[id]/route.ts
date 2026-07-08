import { NextResponse } from 'next/server';
import { authErrorResponse } from '@/lib/apiAuth';
import { requirePayrollAccess, requireOwnerAccess, isPrivilegedSession, sanitizeDbError } from '@/lib/payrollApi';

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

// Editar empleado: solo se actualizan los campos presentes en el body.
// Los montos de salario (weekly_salary, hourly_rate) solo los puede fijar
// owner/super_user; para el rol admin se ignoran silenciosamente.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { session, supabase } = await requirePayrollAccess();
    const privileged = isPrivilegedSession(session);

    const { id } = await params;
    if (!String(id ?? '').trim()) {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const updatePayload: Record<string, unknown> = {};

    if ('full_name' in body) {
      const fullName = String(body.full_name ?? '').trim();
      if (!fullName) return NextResponse.json({ error: 'El nombre no puede quedar vacío' }, { status: 400 });
      updatePayload.full_name = fullName;
    }
    if ('phone' in body) updatePayload.phone = String(body.phone ?? '').trim() || null;
    if ('email' in body) updatePayload.email = String(body.email ?? '').trim() || null;
    if ('hire_date' in body) {
      const hireDate = String(body.hire_date ?? '').trim();
      if (!ISO_DATE.test(hireDate)) return NextResponse.json({ error: 'Fecha de contratación inválida' }, { status: 400 });
      updatePayload.hire_date = hireDate;
    }
    if ('notes' in body) updatePayload.notes = String(body.notes ?? '').trim() || null;
    if ('role' in body) updatePayload.role = String(body.role ?? '').trim() || 'mechanic';
    if ('payment_type' in body) {
      const paymentType = String(body.payment_type ?? '');
      if (!PAYMENT_TYPES.includes(paymentType as (typeof PAYMENT_TYPES)[number])) {
        return NextResponse.json({ error: 'Tipo de pago inválido' }, { status: 400 });
      }
      updatePayload.payment_type = paymentType;
    }
    if ('is_active' in body) updatePayload.is_active = Boolean(body.is_active);
    if ('work_days' in body) {
      const workDays = Array.isArray(body.work_days)
        ? body.work_days.map((d: unknown) => Number(d)).filter((d: number) => Number.isInteger(d) && d >= 0 && d <= 6)
        : null;
      if (!workDays || workDays.length === 0) {
        return NextResponse.json({ error: 'Días laborales inválidos' }, { status: 400 });
      }
      updatePayload.work_days = workDays;
    }
    // Montos de salario: SOLO owner/super_user pueden fijarlos.
    if (privileged) {
      if ('weekly_salary' in body) updatePayload.weekly_salary = parseSalary(body.weekly_salary);
      if ('hourly_rate' in body) updatePayload.hourly_rate = parseSalary(body.hourly_rate);
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ ok: true });
    }

    const { error } = await supabase
      .from('employees')
      .update(updatePayload)
      .eq('id', id);

    if (error) return NextResponse.json({ error: sanitizeDbError('empleados', error.message) }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const resp = authErrorResponse(error);
    if (resp) return resp;
    throw error;
  }
}

// Eliminar empleado: destruye historial de nómina, SOLO owner/super_user.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase } = await requireOwnerAccess();

    const { id } = await params;
    if (!String(id ?? '').trim()) {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
    }

    const { error } = await supabase
      .from('employees')
      .delete()
      .eq('id', id);

    if (error) return NextResponse.json({ error: sanitizeDbError('empleados', error.message) }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const resp = authErrorResponse(error);
    if (resp) return resp;
    throw error;
  }
}
