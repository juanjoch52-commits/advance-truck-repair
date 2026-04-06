import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.json({ error: 'Env vars faltantes', url: !!url, key: !!key });
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await supabase
    .from('employees')
    .select('id, full_name, role, access_pin')
    .eq('role', 'SUPER_USER');

  if (error) {
    return NextResponse.json({ error: error.message, code: error.code });
  }

  const rows = (data ?? []).map((r) => ({
    id: r.id,
    full_name: r.full_name,
    role: r.role,
    pin_prefix: String(r.access_pin ?? '').slice(0, 8),
    pin_length: String(r.access_pin ?? '').length,
    is_plain: /^\d{4,6}$/.test(String(r.access_pin ?? '')),
  }));

  return NextResponse.json({ ok: true, rows });
}
