import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServerSession, isJuanSuperUser } from '@/lib/authSession';

type CredentialRow = {
  id: string;
  full_name: string;
  role: 'mechanic' | 'admin' | 'SUPER_USER';
  is_temporary_pin: boolean;
  temporary_pin_plain: string | null;
};

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase no configurado');
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET() {
  try {
    const session = await getServerSession();
    const canManageAccesses = Boolean(session && (session.role === 'owner' || isJuanSuperUser(session)));

    if (!canManageAccesses) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const supabase = getClient();
    const { data, error } = await supabase
      .from('employees')
      .select('id,full_name,role,is_temporary_pin,temporary_pin_plain')
      .in('role', ['mechanic', 'admin', 'SUPER_USER'])
      .order('full_name', { ascending: true })
      .returns<CredentialRow[]>();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []).map((row) => ({
      ...row,
      pin_display: row.is_temporary_pin
        ? row.temporary_pin_plain ?? 'Temporal (no visible)'
        : 'Personalizado (oculto)',
    }));

    return NextResponse.json({ credentials: rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
