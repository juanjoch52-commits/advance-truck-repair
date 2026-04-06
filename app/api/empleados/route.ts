import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getEffectiveRole, getServerSession } from '@/lib/authSession';

type CreateEmployeeBody = {
  full_name: string;
  phone?: string | null;
  access_pin: string;
  hire_date: string;
  notes?: string | null;
  role?: 'mechanic' | 'admin' | 'SUPER_USER';
};

type GenericRow = Record<string, unknown>;

type EmployeeResponse = {
  id: string;
  full_name: string;
  phone: string | null;
  hire_date: string;
  role: 'mechanic' | 'admin' | 'SUPER_USER';
  notes: string | null;
};

function mapRole(value: unknown): EmployeeResponse['role'] {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'super_user' || normalized === 'superuser') return 'SUPER_USER';
  if (normalized === 'admin' || normalized === 'administrador' || normalized === 'administradora') return 'admin';
  return 'mechanic';
}

function mapEmployeeRow(row: GenericRow): EmployeeResponse | null {
  const id = String(row.id ?? row.employee_id ?? row.empleado_id ?? '').trim();
  const fullName = String(row.full_name ?? row.nombre_completo ?? row.nombre ?? '').trim();
  if (!id || !fullName) return null;

  return {
    id,
    full_name: fullName,
    phone: String(row.phone ?? row.telefono ?? '').trim() || null,
    hire_date: String(row.hire_date ?? row.fecha_contratacion ?? row.fecha_ingreso ?? '').trim() || new Date().toISOString().slice(0, 10),
    role: mapRole(row.role ?? row.rol ?? row.tipo),
    notes: String(row.notes ?? row.notas ?? '').trim() || null,
  };
}

function mapRoleToLegacy(role: CreateEmployeeBody['role']) {
  return role === 'admin' ? 'admin' : role === 'SUPER_USER' ? 'SUPER_USER' : 'mechanic';
}

function getMissingColumnFromError(message: string) {
  const match = message.match(/Could not find the '([^']+)' column/);
  return match?.[1] ?? null;
}

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET() {
  const supabase = getClient();
  if (!supabase) {
    return NextResponse.json({ employees: [] });
  }

  const primary = await supabase
    .from('employees')
    .select('id,full_name,phone,hire_date,role,notes')
    .order('full_name', { ascending: true })
    .returns<EmployeeResponse[]>();

  if (!primary.error) {
    return NextResponse.json({ employees: primary.data ?? [] });
  }

  if (primary.error.code !== 'PGRST205') {
    return NextResponse.json({ employees: [], error: primary.error.message }, { status: 500 });
  }

  const fallback = await supabase
    .from('empleados')
    .select('*')
    .returns<GenericRow[]>();

  if (fallback.error) {
    return NextResponse.json({ employees: [], error: fallback.error.message }, { status: 500 });
  }

  const mapped = (fallback.data ?? [])
    .map((row) => mapEmployeeRow(row))
    .filter((row): row is EmployeeResponse => row !== null)
    .sort((a, b) => a.full_name.localeCompare(b.full_name, 'es'));

  return NextResponse.json({ employees: mapped });
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session || getEffectiveRole(session) !== 'owner') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const supabase = getClient();
  if (!supabase) {
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

  const existingPrimary = await supabase
    .from('employees')
    .select('id')
    .eq('full_name', full_name)
    .maybeSingle();

  if (existingPrimary.data) {
    return NextResponse.json({ error: 'Ese empleado ya existe' }, { status: 409 });
  }

  if (existingPrimary.error && existingPrimary.error.code !== 'PGRST205') {
    return NextResponse.json({ error: existingPrimary.error.message }, { status: 500 });
  }

  if (existingPrimary.error?.code === 'PGRST205') {
    const existingFallback = await supabase
      .from('empleados')
      .select('*')
      .returns<GenericRow[]>();

    if (existingFallback.error) {
      return NextResponse.json({ error: existingFallback.error.message }, { status: 500 });
    }

    const duplicate = (existingFallback.data ?? []).some((row) => {
      const name = String(row.nombre_completo ?? row.nombre ?? row.full_name ?? '').trim().toLowerCase();
      return name === full_name.toLowerCase();
    });

    if (duplicate) {
      return NextResponse.json({ error: 'Ese empleado ya existe' }, { status: 409 });
    }
  }

  const primaryInsert = await supabase
    .from('employees')
    .insert({
      full_name,
      phone,
      access_pin,
      is_temporary_pin: true,
      temporary_pin_plain: access_pin,
      hire_date,
      notes,
      role,
    })
    .select('id,full_name,phone,hire_date,role,notes')
    .single<EmployeeResponse>();

  if (!primaryInsert.error) {
    return NextResponse.json({ ok: true, employee: primaryInsert.data }, { status: 201 });
  }

  if (primaryInsert.error.code !== 'PGRST205') {
    return NextResponse.json({ error: primaryInsert.error.message }, { status: 500 });
  }

  const fallbackPayloads: Array<Record<string, unknown>> = [
    {
      nombre_completo: full_name,
      telefono: phone,
      pin: access_pin,
      fecha_contratacion: hire_date,
      notas: notes,
      rol: mapRoleToLegacy(role),
      pin_temporal: true,
    },
    {
      nombre_completo: full_name,
      telefono: phone,
      pin_acceso: access_pin,
      fecha_contratacion: hire_date,
      notas: notes,
      rol: mapRoleToLegacy(role),
      pin_temporal: true,
    },
    {
      nombre: full_name,
      telefono: phone,
      pin: access_pin,
      fecha_ingreso: hire_date,
      notas: notes,
      rol: mapRoleToLegacy(role),
      pin_temporal: true,
    },
    {
      nombre: full_name,
      telefono: phone,
      pin_acceso: access_pin,
      fecha_ingreso: hire_date,
      notas: notes,
      rol: mapRoleToLegacy(role),
      pin_temporal: true,
    },
    {
      nombre: full_name,
      telefono: phone,
      pin: access_pin,
      fecha_contratacion: hire_date,
      rol: mapRoleToLegacy(role),
    },
    {
      nombre: full_name,
      telefono: phone,
      pin_acceso: access_pin,
      fecha_contratacion: hire_date,
      rol: mapRoleToLegacy(role),
    },
    {
      nombre_completo: full_name,
      telefono: phone,
      pin: access_pin,
      rol: mapRoleToLegacy(role),
      notas: notes,
    },
    {
      nombre: full_name,
      telefono: phone,
      pin: access_pin,
      rol: mapRoleToLegacy(role),
      notas: notes,
    },
    {
      nombre_completo: full_name,
      telefono: phone,
      pin_acceso: access_pin,
      rol: mapRoleToLegacy(role),
      notas: notes,
    },
    {
      nombre: full_name,
      telefono: phone,
      pin_acceso: access_pin,
      rol: mapRoleToLegacy(role),
      notas: notes,
    },
    {
      nombre_completo: full_name,
      pin: access_pin,
      rol: mapRoleToLegacy(role),
    },
    {
      nombre: full_name,
      pin: access_pin,
      rol: mapRoleToLegacy(role),
    },
    {
      nombre_completo: full_name,
      pin_acceso: access_pin,
      rol: mapRoleToLegacy(role),
    },
    {
      nombre: full_name,
      pin_acceso: access_pin,
      rol: mapRoleToLegacy(role),
    },
  ];

  let fallbackError: string | null = null;

  for (const payload of fallbackPayloads) {
    const candidate: Record<string, unknown> = { ...payload };

    for (let i = 0; i < 10; i += 1) {
      const attempt = await supabase
        .from('empleados')
        .insert(candidate)
        .select('*')
        .single<GenericRow>();

      if (!attempt.error && attempt.data) {
        const mapped = mapEmployeeRow(attempt.data);
        return NextResponse.json({ ok: true, employee: mapped ?? attempt.data }, { status: 201 });
      }

      const message = attempt.error?.message ?? 'No se pudo guardar empleado en tabla legacy.';
      fallbackError = message;

      const missingColumn = getMissingColumnFromError(message);
      if (!missingColumn || !(missingColumn in candidate)) {
        break;
      }

      delete candidate[missingColumn];
      if (Object.keys(candidate).length === 0) {
        break;
      }
    }
  }

  return NextResponse.json({ error: fallbackError ?? 'No se pudo guardar empleado.' }, { status: 500 });
}
