import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyPin } from '@/lib/pinSecurity';


type LoginBody = {
  employee_id: string;
  pin: string;
};

type MechanicLookup = {
  id: string;
  full_name: string;
  role: string;
  access_pin: string;
};

type GenericRow = Record<string, unknown>;

function fromGenericRow(row: GenericRow): MechanicLookup | null {
  const id = String(row.id ?? row.employee_id ?? row.empleado_id ?? '').trim();
  const fullName = String(row.full_name ?? row.nombre_completo ?? row.nombre ?? '').trim();
  const role = String(row.role ?? row.rol ?? row.tipo ?? row.cargo ?? 'mechanic').trim();
  const accessPin = String(row.access_pin ?? row.pin_acceso ?? row.pin ?? '').trim();

  if (!id || !fullName || !accessPin) return null;

  return {
    id,
    full_name: fullName,
    role,
    access_pin: accessPin,
  };
}

async function findEmployeeById(supabase: ReturnType<typeof getClient>, employeeId: string) {
  const primary = await supabase
    .from('employees')
    .select('id,full_name,role,access_pin')
    .eq('id', employeeId)
    .maybeSingle<MechanicLookup>();

  if (!primary.error && primary.data) {
    return { data: primary.data, error: null as string | null };
  }

  if (primary.error && primary.error.code !== 'PGRST205') {
    return { data: null as MechanicLookup | null, error: primary.error.message };
  }

  const fallback = await supabase
    .from('empleados')
    .select('*')
    .eq('id', employeeId)
    .maybeSingle<GenericRow>();

  if (fallback.error) {
    return { data: null as MechanicLookup | null, error: fallback.error.message };
  }

  return { data: fallback.data ? fromGenericRow(fallback.data) : null, error: null as string | null };
}

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor');
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

    const { data, error } = await findEmployeeById(supabase, body.employee_id);

    if (error || !data) {
      return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 });
    }

    if (!verifyPin(body.pin, String(data.access_pin ?? ''))) {
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
