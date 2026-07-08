import { NextResponse } from 'next/server';
import { authErrorResponse } from '@/lib/apiAuth';
import { requirePayrollAccess, isPrivilegedSession, sanitizeDbError } from '@/lib/payrollApi';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Empleados de salario fijo + faltas de la semana. El monto del salario solo
// se envía a owner/super_user (el rol admin registra asistencia sin verlo).
export async function GET(request: Request) {
  try {
    const { session, supabase } = await requirePayrollAccess();
    const privileged = isPrivilegedSession(session);

    const { searchParams } = new URL(request.url);
    const start = searchParams.get('start') ?? '';
    const end = searchParams.get('end') ?? '';
    if (!ISO_DATE.test(start) || !ISO_DATE.test(end)) {
      return NextResponse.json({ error: 'Rango de fechas inválido' }, { status: 400 });
    }

    const employeeCols = privileged
      ? 'id, full_name, weekly_salary, work_days'
      : 'id, full_name, work_days';

    const [emp, att] = await Promise.all([
      supabase
        .from('employees')
        .select(employeeCols)
        .eq('payment_type', 'fixed_weekly')
        .order('full_name'),
      supabase
        .from('attendance')
        .select('id, employee_id, work_date, status, absence_reason, created_by_name, updated_by_name, created_at, updated_at')
        .eq('status', 'absent')
        .gte('work_date', start)
        .lte('work_date', end),
    ]);

    if (emp.error) return NextResponse.json({ error: sanitizeDbError('asistencia', emp.error.message) }, { status: 500 });
    if (att.error) return NextResponse.json({ error: sanitizeDbError('asistencia', att.error.message) }, { status: 500 });

    return NextResponse.json({ privileged, employees: emp.data ?? [], absences: att.data ?? [] });
  } catch (error) {
    const resp = authErrorResponse(error);
    if (resp) return resp;
    throw error;
  }
}

// Marcar FALTA (upsert). Los campos de auditoría se estampan con la sesión
// del servidor: el cliente no puede suplantar quién registró la falta.
export async function POST(request: Request) {
  try {
    const { session, supabase } = await requirePayrollAccess();
    const body = await request.json().catch(() => ({}));
    const employeeId = String(body.employee_id ?? '').trim();
    const workDate = String(body.work_date ?? '').trim();
    if (!employeeId || !ISO_DATE.test(workDate)) {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('attendance')
      .upsert(
        {
          employee_id: employeeId,
          work_date: workDate,
          status: 'absent',
          absence_reason: '',
          created_by_name: session.full_name,
          updated_by_name: session.full_name,
        },
        { onConflict: 'employee_id,work_date' }
      )
      .select('id')
      .single();

    if (error) return NextResponse.json({ error: sanitizeDbError('asistencia', error.message) }, { status: 500 });
    return NextResponse.json({ ok: true, id: data?.id });
  } catch (error) {
    const resp = authErrorResponse(error);
    if (resp) return resp;
    throw error;
  }
}

// Actualizar la razón de una falta.
export async function PATCH(request: Request) {
  try {
    const { session, supabase } = await requirePayrollAccess();
    const body = await request.json().catch(() => ({}));
    const id = String(body.id ?? '').trim();
    if (!id) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
    const reason = String(body.absence_reason ?? '').trim();

    const { error } = await supabase
      .from('attendance')
      .update({ absence_reason: reason, updated_by_name: session.full_name })
      .eq('id', id);

    if (error) return NextResponse.json({ error: sanitizeDbError('asistencia', error.message) }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const resp = authErrorResponse(error);
    if (resp) return resp;
    throw error;
  }
}

// Volver a PRESENTE: borra una o varias faltas por id.
export async function DELETE(request: Request) {
  try {
    const { supabase } = await requirePayrollAccess();
    const body = await request.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body.ids)
      ? body.ids.map((x: unknown) => String(x).trim()).filter(Boolean)
      : [];
    if (ids.length === 0) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });

    const { error } = await supabase.from('attendance').delete().in('id', ids);
    if (error) return NextResponse.json({ error: sanitizeDbError('asistencia', error.message) }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const resp = authErrorResponse(error);
    if (resp) return resp;
    throw error;
  }
}
