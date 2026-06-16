import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireRole, authErrorResponse } from '@/lib/apiAuth';

type AssignmentInput = {
  employee_id: string;
  mode: 'percent' | 'manual';
  value: number;
};

type ApproveBody = {
  approval_mode: 'auto_percent' | 'manual_amount';
  manager_labor_amount: number;
  approved_by?: string;
  assignments: AssignmentInput[];
};

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Supabase no configurado');
  }

  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    try {
      await requireRole('owner', 'super_user');
    } catch (e) {
      const resp = authErrorResponse(e);
      if (resp) return resp;
      throw e;
    }

    const { id } = await params;
    const body = await request.json() as ApproveBody;

    if (!body.approval_mode || !body.manager_labor_amount || body.manager_labor_amount < 0) {
      return NextResponse.json({ error: 'Modo y monto del manager son requeridos' }, { status: 400 });
    }

    if (!Array.isArray(body.assignments) || body.assignments.length === 0 || body.assignments.length > 2) {
      return NextResponse.json({ error: 'Debes enviar 1 o 2 asignaciones de mecánicos' }, { status: 400 });
    }

    const supabase = getClient();

    const { data: order, error: orderError } = await supabase
      .from('work_orders')
      .select('id,status')
      .eq('id', id)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: orderError?.message ?? 'Orden no encontrada' }, { status: 404 });
    }

    const approvedAssignments = body.assignments.map((assignment) => {
      if (body.approval_mode === 'auto_percent') {
        const percentShare = Math.max(0, Number(assignment.value));
        return {
          work_order_id: id,
          employee_id: assignment.employee_id,
          assignment_mode: 'percent',
          percent_share: percentShare,
          manual_amount: null,
          approved_amount: Number(((body.manager_labor_amount * percentShare) / 100).toFixed(2)),
        };
      }

      const manualAmount = Math.max(0, Number(assignment.value));
      return {
        work_order_id: id,
        employee_id: assignment.employee_id,
        assignment_mode: 'manual',
        percent_share: null,
        manual_amount: manualAmount,
        approved_amount: manualAmount,
      };
    });

    const { error: deleteError } = await supabase
      .from('work_order_assignments')
      .delete()
      .eq('work_order_id', id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    const { error: assignmentsError } = await supabase
      .from('work_order_assignments')
      .insert(approvedAssignments);

    if (assignmentsError) {
      return NextResponse.json({ error: assignmentsError.message }, { status: 500 });
    }

    const { error: updateError } = await supabase
      .from('work_orders')
      .update({
        status: 'approved',
        approval_mode: body.approval_mode,
        manager_labor_amount: body.manager_labor_amount,
        approved_at: new Date().toISOString(),
        approved_by: body.approved_by ?? 'manager',
      })
      .eq('id', id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, status: 'approved' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
