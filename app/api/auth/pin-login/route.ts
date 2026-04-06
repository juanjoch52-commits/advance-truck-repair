import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSessionCookieName, serializeSession, SessionUser } from '@/lib/authSession';


type LoginBody = { pin: string };

type EmployeePinLookup = {
  id: string;
  full_name: string;
  role: 'mechanic' | 'admin' | 'SUPER_USER';
  access_pin: string;
  is_temporary_pin: boolean;
};

type GenericRow = Record<string, unknown>;

function coerceRole(raw: unknown): EmployeePinLookup['role'] {
  const normalized = String(raw ?? '').trim().toLowerCase();
  if (normalized === 'super_user' || normalized === 'superuser') return 'SUPER_USER';
  if (normalized === 'mechanic' || normalized === 'mecanico') return 'mechanic';
  return 'admin';
}

function fromGenericRow(row: GenericRow): EmployeePinLookup | null {
  const id = String(row.id ?? row.employee_id ?? row.empleado_id ?? '').trim();
  const fullName = String(row.full_name ?? row.nombre_completo ?? row.nombre ?? '').trim();
  const accessPin = String(row.access_pin ?? row.pin_acceso ?? row.pin ?? '').trim();
  const role = coerceRole(row.role ?? row.rol ?? row.tipo ?? row.cargo);
  const isTemporaryPin = Boolean(
    row.is_temporary_pin ?? row.pin_temporal ?? row.requiere_cambio_pin ?? false,
  );

  if (!id || !fullName || !accessPin) return null;

  return {
    id,
    full_name: fullName,
    role,
    access_pin: accessPin,
    is_temporary_pin: isTemporaryPin,
  };
}

async function getEmployeeRows(supabase: ReturnType<typeof getClient>) {
  const primary = await supabase
    .from('employees')
    .select('id,full_name,role,access_pin,is_temporary_pin')
    .returns<EmployeePinLookup[]>();

  if (!primary.error) {
    return { data: primary.data ?? [], error: null as string | null };
  }

  if (primary.error.code !== 'PGRST205') {
    return { data: [] as EmployeePinLookup[], error: primary.error.message };
  }

  const fallback = await supabase
    .from('empleados')
    .select('*')
    .returns<GenericRow[]>();

  if (fallback.error) {
    return { data: [] as EmployeePinLookup[], error: fallback.error.message };
  }

  const mapped = (fallback.data ?? [])
    .map((row) => fromGenericRow(row))
    .filter((row): row is EmployeePinLookup => row !== null);

  return { data: mapped, error: null as string | null };
}

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase no configurado');
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as LoginBody;
    const pin = String(body.pin ?? '').trim();

    if (!/^\d{4,6}$/.test(pin)) {
      return NextResponse.json({ error: 'PIN inválido' }, { status: 401 });
    }

    const ownerPin = process.env.OWNER_PIN?.trim();
    let sessionUser: SessionUser | null = null;

    if (ownerPin && pin === ownerPin) {
      sessionUser = {
        id: 'owner',
        full_name: process.env.OWNER_NAME?.trim() || 'Owner',
        role: 'owner',
        effective_role: 'owner',
        requires_pin_update: false,
        is_super_user: false,
      };
    } else {
      const supabase = getClient();
      const { data, error } = await getEmployeeRows(supabase);

      if (error || !data || data.length === 0) {
        return NextResponse.json({ error: 'PIN incorrecto' }, { status: 401 });
      }

      const employee = data.find((row) => pin === row.access_pin);

      if (!employee) {
        return NextResponse.json({ error: 'PIN incorrecto' }, { status: 401 });
      }

      const isSuperUser = employee.role === 'SUPER_USER';
      const mappedRole = isSuperUser
        ? 'super_user'
        : employee.role === 'mechanic'
          ? 'mechanic'
          : 'admin';
      const effectiveRole = isSuperUser
        ? 'owner'
        : mappedRole === 'mechanic'
          ? 'mechanic'
          : 'admin';

      sessionUser = {
        id: employee.id,
        full_name: employee.full_name,
        role: mappedRole,
        effective_role: effectiveRole,
        requires_pin_update: Boolean(employee.is_temporary_pin),
        is_super_user: isSuperUser,
      };
    }

    const response = NextResponse.json({ ok: true, user: sessionUser });
    response.cookies.set(getSessionCookieName(), serializeSession(sessionUser), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 12,
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
