import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getEffectiveRole, getServerSession } from '@/lib/authSession';
import { hashPin } from '@/lib/pinSecurity';

type CreateEmployeeBody = {
  full_name: string;
  phone?: string | null;
  access_pin: string;
  hire_date: string;
  notes?: string | null;
  role?: 'mechanic' | 'admin' | 'SUPER_USER';
};

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.json({ employees: [] });
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await supabase
    .from('employees')
    .select('id,full_name,phone,hire_date,role,notes')
    .order('full_name', { ascending: true });

  if (error) {
    return NextResponse.json({ employees: [], error: error.message }, { status: 500 });
  }

  return NextResponse.json({ employees: data ?? [] });
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session || getEffectiveRole(session) !== 'owner') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.json({ error: 'Supabase no configurado' }, { status: 500 });
  }

  const body = await request.json() as CreateEmployeeBody;
  const full_name = body.full_name?.trim();
  const phone = body.phone?.trim() || null;
  const access_pin = body.access_pin?.trim();
  const hire_date = body.hire_date;
  const notes = body.notes?.trim() || null;
  const role = body.role ?? 'mechanic';

  if (!full_name || !access_pin || !hire_date) {
    return NextResponse.json({ error: 'Nombre, PIN y fecha de contratación son requeridos' }, { status: 400 });
  }

  if (!/^\d{4,}$/.test(access_pin)) {
    return NextResponse.json({ error: 'El PIN debe tener al menos 4 dígitos' }, { status: 400 });
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: existingEmployee } = await supabase
    .from('employees')
    .select('id')
    .eq('full_name', full_name)
    .maybeSingle();

  if (existingEmployee) {
    return NextResponse.json({ error: 'Ese empleado ya existe' }, { status: 409 });
  }

  const { data, error } = await supabase
    .from('employees')
    .insert({
      full_name,
      phone,
      access_pin: hashPin(access_pin),
      is_temporary_pin: true,
      temporary_pin_plain: access_pin,
      hire_date,
      notes,
      role,
    })
    .select('id,full_name,phone,hire_date,role,notes')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, employee: data }, { status: 201 });
}
