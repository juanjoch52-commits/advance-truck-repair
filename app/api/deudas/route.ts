import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireRole, authErrorResponse } from '@/lib/apiAuth';

export async function GET() {
  try {
    await requireRole('owner', 'admin', 'super_user');
  } catch (e) {
    const resp = authErrorResponse(e);
    if (resp) return resp;
    throw e;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.json({ debts: [] });
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await supabase
    .from('debts')
    .select('id,employee_id,total_amount,remaining_balance,description,weekly_installment,is_active,created_at,employees(full_name)')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ debts: [], error: error.message }, { status: 500 });
  }

  return NextResponse.json({ debts: data ?? [] });
}

export async function POST(request: Request) {
  try {
    await requireRole('owner', 'super_user');
  } catch (e) {
    const resp = authErrorResponse(e);
    if (resp) return resp;
    throw e;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.json({ error: 'Supabase no configurado' }, { status: 500 });
  }

  const body = await request.json() as {
    employee_id: string;
    total_amount: number;
    description: string;
    weekly_installment: number;
  };

  const { employee_id, total_amount, description, weekly_installment } = body;

  if (!employee_id || !total_amount || !description) {
    return NextResponse.json({ error: 'Empleado, monto y descripcion son requeridos' }, { status: 400 });
  }

  if (total_amount <= 0) {
    return NextResponse.json({ error: 'El monto debe ser mayor a cero' }, { status: 400 });
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await supabase
    .from('debts')
    .insert({
      employee_id,
      total_amount,
      description,
      weekly_installment: weekly_installment ?? 25,
      remaining_balance: total_amount,
      is_active: true,
    })
    .select('id,remaining_balance')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, debt: data }, { status: 201 });
}
