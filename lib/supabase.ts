import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Cliente browser (para componentes cliente)
let browserClient: ReturnType<typeof createSupabaseClient> | null = null;

export function createClient() {
  if (browserClient) return browserClient;
  browserClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  return browserClient;
}
