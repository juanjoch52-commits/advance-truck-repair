import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getEffectiveRole, getServerSession } from '@/lib/authSession';

type UpdateEmployeeBody = {
  phone?: string | null;
  email?: string | null;
  address?: string | null;
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

  const updatePayload: {
    phone: string | null;
    email: string | null;
    address: string | null;
    notes: string | null;
  } = {
    phone,
    email,
    address,
    notes,
  };

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const primary = await supabase
    .from('employees')
    .update(updatePayload)
    .eq('id', id)
    .select('id,full_name,phone,email,address,notes')
    .single();

  if (!primary.error) {
    return NextResponse.json({ ok: true, employee: primary.data });
  }

  return NextResponse.json({ error: primary.error.message }, { status: 500 });
}
