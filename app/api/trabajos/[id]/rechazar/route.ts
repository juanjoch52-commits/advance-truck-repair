import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Supabase no configurado');
  }

  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = getClient();

    let rejectionReason: string | null = null;
    try {
      const body = await request.json() as { rejection_reason?: string };
      rejectionReason = typeof body.rejection_reason === 'string' && body.rejection_reason.trim().length > 0
        ? body.rejection_reason.trim()
        : null;
    } catch {
      // body is optional — proceed without reason
    }

    const { data: order, error: orderError } = await supabase
      .from('work_orders')
      .select('id,status')
      .eq('id', id)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: orderError?.message ?? 'Orden no encontrada' }, { status: 404 });
    }

    const updatePayload: Record<string, unknown> = { status: 'rejected' };
    if (rejectionReason) {
      updatePayload.rejection_reason = rejectionReason;
    }

    const { error: updateError } = await supabase
      .from('work_orders')
      .update(updatePayload)
      .eq('id', id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, status: 'rejected' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
