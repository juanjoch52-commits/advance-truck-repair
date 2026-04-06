import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';


type LoginBody = {
  employee_id: string;
  pin: string;
};

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase no configurado');
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as LoginBody;

    if (!body.employee_id || !body.pin) {
      return NextResponse.json({ error: 'Empleado y PIN son requeridos' }, { status: 400 });
    }

    // Validate PIN length
    if (body.pin.length < 4) {
      return NextResponse.json({ error: 'PIN inválido' }, { status: 401 });
    }

    const supabase = getClient();

    const { data, error } = await supabase
      .from('employees')
      .select('id,full_name,role,access_pin')
      .eq('id', body.employee_id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 });
    }

    if (body.pin !== data.access_pin) {
      return NextResponse.json({ error: 'PIN incorrecto' }, { status: 401 });
    }

    return NextResponse.json({
      ok: true,
      employee: {
        id: data.id,
        full_name: data.full_name,
        role: data.role,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
