import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

export async function POST() {
  const supabase = getSupabaseServerClient();
  await supabase.auth.signOut();
  return NextResponse.json({ success: true });
}
