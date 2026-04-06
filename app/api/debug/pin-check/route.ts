import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type AnyRow = Record<string, unknown>;

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.json({ error: 'Env vars faltantes', url: !!url, key: !!key });
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const employeesResult = await supabase
    .from('employees')
    .select('*')
    .limit(3)
    .returns<AnyRow[]>();

  const empleadosResult = await supabase
    .from('empleados')
    .select('*')
    .limit(3)
    .returns<AnyRow[]>();

  const employeesRows = employeesResult.data ?? [];
  const empleadosRows = empleadosResult.data ?? [];

  return NextResponse.json({
    ok: true,
    using_service_role: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    employees: {
      error: employeesResult.error?.message ?? null,
      code: employeesResult.error?.code ?? null,
      count: employeesRows.length,
      sample_keys: employeesRows[0] ? Object.keys(employeesRows[0]) : [],
      sample: employeesRows[0] ?? null,
    },
    empleados: {
      error: empleadosResult.error?.message ?? null,
      code: empleadosResult.error?.code ?? null,
      count: empleadosRows.length,
      sample_keys: empleadosRows[0] ? Object.keys(empleadosRows[0]) : [],
      sample: empleadosRows[0] ?? null,
    },
  });
}
