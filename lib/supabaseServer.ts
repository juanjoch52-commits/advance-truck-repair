import { createClient } from '@supabase/supabase-js';

// Cliente server con service role (para operaciones admin en rutas API)
export function getSupabaseServerClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
