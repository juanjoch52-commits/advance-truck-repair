import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireRole, authErrorResponse } from '@/lib/apiAuth';

type DeductionBody = {
  employee_id: string;
  deduction_type: 'warranty' | 'advance' | 'other';
  description: string;
  amount: number;
  report_week_ending: string;
};

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Supabase no configurado');
  }

  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(request: Request) {
  try {
    try {
      await requireRole('owner', 'super_user');
    } catch (e) {
      const resp = authErrorResponse(e);
      if (resp) return resp;
      throw e;
    }

    const body = await request.json() as DeductionBody;

    if (!body.employee_id || !body.deduction_type || !body.description || !body.report_week_ending) {
      return NextResponse.json({ error: 'Empleado, tipo, descripción y semana son requeridos' }, { status: 400 });
    }

    if (!body.amount || body.amount <= 0) {
      return NextResponse.json({ error: 'El monto debe ser mayor a cero' }, { status: 400 });
    }

    const supabase = getClient();

    const { data, error } = await supabase
      .from('one_time_deductions')
      .insert({
        employee_id: body.employee_id,
        deduction_type: body.deduction_type,
        description: body.description,
        amount: body.amount,
        report_week_ending: body.report_week_ending,
        applied: true,
        applied_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, deduction_id: data.id }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
