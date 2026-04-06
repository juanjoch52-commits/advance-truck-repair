import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getEffectiveRole, getServerSession } from '@/lib/authSession';
import { hashPin } from '@/lib/pinSecurity';

type UpdateEmployeeBody = {
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  access_pin?: string | null;
  notes?: string | null;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession();
  if (!session || getEffectiveRole(session) !== 'owner') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { id } = await params;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.json({ error: 'Supabase no configurado' }, { status: 500 });
  }

  const body = await request.json() as UpdateEmployeeBody;

  const phone = body.phone?.trim() || null;
  const email = body.email?.trim() || null;
  const address = body.address?.trim() || null;
  const notes = body.notes?.trim() || null;
  const accessPin = body.access_pin?.trim() || null;

  if (accessPin && !/^\d{4,}$/.test(accessPin)) {
    return NextResponse.json({ error: 'El PIN debe tener al menos 4 dígitos.' }, { status: 400 });
  }

  const updatePayload: {
    phone: string | null;
    email: string | null;
    address: string | null;
    notes: string | null;
    access_pin?: string;
    is_temporary_pin?: boolean;
    temporary_pin_plain?: string | null;
  } = {
    phone,
    email,
    address,
    notes,
  };

  if (accessPin) {
    updatePayload.access_pin = hashPin(accessPin);
    updatePayload.is_temporary_pin = true;
    updatePayload.temporary_pin_plain = accessPin;
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await supabase
    .from('employees')
    .update(updatePayload)
    .eq('id', id)
    .select('id,full_name,phone,email,address,notes')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, employee: data });
}
