import { NextResponse } from 'next/server';
import { INVOICE_COLS, round2, deriveBalanceStatus } from '@/lib/invoicesApi';
import { sanitizeDbError } from '@/lib/clientsApi';
import { authErrorResponse, requireRole } from '@/lib/apiAuth';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

// DELETE /api/facturas/[id]/pagos/[paymentId] → ANULA un pago (no lo borra).
// Marca el pago como anulado (con motivo y quién) y recalcula el saldo de la
// factura sumando solo los pagos NO anulados.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; paymentId: string }> }) {
  try {
    const session = await requireRole('owner', 'admin', 'super_user');
    const supabase = getSupabaseServerClient();
    const { id, paymentId } = await params;
    const body = await request.json().catch(() => ({}));

    const { data: payment, error: payErr } = await supabase
      .from('invoice_payments').select('id,invoice_id,voided').eq('id', paymentId).maybeSingle();
    if (payErr) return NextResponse.json({ error: sanitizeDbError('pagos.void.read', payErr.message) }, { status: 500 });
    if (!payment || payment.invoice_id !== id) return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 });
    if (payment.voided) return NextResponse.json({ error: 'Este pago ya está anulado.' }, { status: 400 });

    const { error: updPayErr } = await supabase.from('invoice_payments').update({
      voided: true,
      voided_at: new Date().toISOString(),
      voided_by_name: (session as any)?.full_name ?? null,
      void_reason: String(body.reason ?? '').trim() || null,
    }).eq('id', paymentId);
    if (updPayErr) return NextResponse.json({ error: sanitizeDbError('pagos.void.update', updPayErr.message) }, { status: 500 });

    // Recalcular lo pagado a partir de los pagos NO anulados.
    const { data: invoice } = await supabase.from('invoices').select('id,total,status').eq('id', id).maybeSingle();
    if (!invoice) return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
    const { data: actives } = await supabase.from('invoice_payments').select('amount').eq('invoice_id', id).eq('voided', false);
    const newPaid = round2((actives ?? []).reduce((s: number, p: any) => s + Number(p.amount), 0));
    // Si la factura no está anulada, recalcular estado/saldo; si lo está, se respeta.
    const derived = deriveBalanceStatus(Number(invoice.total), newPaid);
    const patch = invoice.status === 'void'
      ? { amount_paid: newPaid }
      : { amount_paid: newPaid, balance: derived.balance, status: derived.status };
    const { data: updated, error: invErr } = await supabase.from('invoices').update(patch).eq('id', id).select(INVOICE_COLS).single();
    if (invErr) return NextResponse.json({ error: sanitizeDbError('pagos.void.invoice', invErr.message) }, { status: 500 });

    return NextResponse.json({ ok: true, invoice: updated });
  } catch (err) {
    const authResp = authErrorResponse(err);
    if (authResp) return authResp;
    throw err;
  }
}
