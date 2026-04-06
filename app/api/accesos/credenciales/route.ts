import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServerSession, isJuanSuperUser } from '@/lib/authSession';

type CredentialRow = {
  id: string;
  full_name: string;
  role: 'mechanic' | 'admin' | 'SUPER_USER' | 'owner';
  is_temporary_pin: boolean;
  temporary_pin_plain: string | null;
  access_pin: string;
};

type GenericRow = Record<string, unknown>;

function mapRole(value: unknown): CredentialRow['role'] {
  const role = String(value ?? '').trim().toLowerCase();
  if (role === 'super_user' || role === 'superuser') return 'SUPER_USER';
  if (role === 'mechanic' || role === 'mecanico') return 'mechanic';
  if (role === 'owner' || role === 'dueno' || role === 'dueño') return 'owner';
  return 'admin';
}

function mapCredentialRow(row: GenericRow): CredentialRow | null {
  const id = String(row.id ?? row.employee_id ?? row.empleado_id ?? '').trim();
  const fullName = String(row.full_name ?? row.nombre_completo ?? row.nombre ?? '').trim();
  const accessPin = String(row.access_pin ?? row.pin_acceso ?? row.pin ?? '').trim();

  if (!id || !fullName || !accessPin) return null;

  return {
    id,
    full_name: fullName,
    role: mapRole(row.role ?? row.rol ?? row.tipo),
    is_temporary_pin: Boolean(row.is_temporary_pin ?? row.pin_temporal ?? row.requiere_cambio_pin ?? false),
    temporary_pin_plain: row.temporary_pin_plain ? String(row.temporary_pin_plain) : null,
    access_pin: accessPin,
  };
}

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase no configurado');
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET() {
  try {
    const session = await getServerSession();
    const canManageAccesses = Boolean(session && (session.role === 'owner' || isJuanSuperUser(session) || session.effective_role === 'owner'));

    if (!canManageAccesses) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const supabase = getClient();
    const primary = await supabase
      .from('employees')
      .select('id,full_name,role,is_temporary_pin,temporary_pin_plain,access_pin')
      .in('role', ['mechanic', 'admin', 'SUPER_USER', 'owner'])
      .order('full_name', { ascending: true })
      .returns<CredentialRow[]>();

    let data: CredentialRow[] = [];
    let error: { message: string } | null = null;

    if (!primary.error) {
      data = primary.data ?? [];
    } else if (primary.error.code === 'PGRST205') {
      const fallback = await supabase
        .from('empleados')
        .select('*')
        .returns<GenericRow[]>();

      if (fallback.error) {
        error = { message: fallback.error.message };
      } else {
        data = (fallback.data ?? [])
          .map((row) => mapCredentialRow(row))
          .filter((row): row is CredentialRow => row !== null)
          .sort((a, b) => a.full_name.localeCompare(b.full_name, 'es'));
      }
    } else {
      error = { message: primary.error.message };
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []).map((row) => ({
      ...row,
      pin_display: row.access_pin,
    }));

    return NextResponse.json({ credentials: rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
