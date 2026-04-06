import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase no configurado');
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const unit = searchParams.get('unit')?.trim();

    if (!unit || unit.length < 1) {
      return NextResponse.json({ error: 'Parámetro "unit" es requerido.' }, { status: 400 });
    }

    const supabase = getClient();

    const { data, error } = await supabase
      .from('work_orders')
      .select(`
        id,
        work_date,
        company,
        unit,
        invoice_number,
        labor_amount,
        mechanic_share,
        status,
        paperwork_path,
        part_photo_path,
        created_at,
        work_order_assignments(
          approved_amount,
          employees(full_name)
        )
      `)
      .ilike('unit', `%${unit}%`)
      .order('work_date', { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ work_orders: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
