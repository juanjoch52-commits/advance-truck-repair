import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getEffectiveRole, getServerSession } from '@/lib/authSession';
import { getDemoEmployees } from '@/lib/demoData';

type CreateEmployeeBody = {
  full_name: string;
  phone?: string | null;
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

function normalizeSupabaseError(message: string) {
  if (message.toLowerCase().includes('row-level security policy')) {
    return 'Supabase bloqueó la operación por permisos (RLS). Configura SUPABASE_SERVICE_ROLE_KEY en Vercel o habilita INSERT para esta tabla.';
  }
  // No exponer detalles internos de Postgres al cliente; loguear en servidor.
  console.error('[empleados] Supabase error:', message);
  return 'No se pudo completar la operación. Intenta de nuevo.';
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
    return NextResponse.json({ employees: (primary.data?.length ? primary.data : getDemoEmployees()) ?? [] });
  }

  if (primary.error.code !== 'PGRST205') {
    return NextResponse.json({ employees: getDemoEmployees() });
  }

  const fallback = await supabase
    .from('empleados')
    .select('*')
    .returns<GenericRow[]>();

  if (fallback.error) {
    return NextResponse.json({ employees: getDemoEmployees() });
  }

  const mapped = (fallback.data ?? [])
    .map((row) => mapEmployeeRow(row))
    .filter((row): row is EmployeeResponse => row !== null)
    .sort((a, b) => a.full_name.localeCompare(b.full_name, 'es'));

  return NextResponse.json({ employees: mapped.length > 0 ? mapped : getDemoEmployees() });
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
  const hire_date = body.hire_date;
  const notes = body.notes?.trim() || null;
  const role = body.role ?? 'mechanic';

  if (!full_name || !hire_date) {
    return NextResponse.json({ error: 'Nombre y fecha de contratación son requeridos' }, { status: 400 });
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
    return NextResponse.json({ error: normalizeSupabaseError(existingPrimary.error.message) }, { status: 500 });
  }

  if (existingPrimary.error?.code === 'PGRST205') {
    const existingFallback = await supabase
      .from('empleados')
      .select('*')
      .returns<GenericRow[]>();

    if (existingFallback.error) {
      return NextResponse.json({ error: normalizeSupabaseError(existingFallback.error.message) }, { status: 500 });
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
      hire_date,
      notes,
      role,
    })
    .select('id,full_name,phone,hire_date,role,notes')
    .single<EmployeeResponse>();

  if (!primaryInsert.error) {
    return NextResponse.json({ ok: true, employee: primaryInsert.data }, { status: 201 });
  }

  return NextResponse.json({ error: normalizeSupabaseError(primaryInsert.error.message) }, { status: 500 });
}
