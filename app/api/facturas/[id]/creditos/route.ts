import { NextResponse } from 'next/server';
import { INVOICE_COLS, round2 } from '@/lib/invoicesApi';
import { sanitizeDbError } from '@/lib/clientsApi';
import { authErrorResponse, requireRole } from '@/lib/apiAuth';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

// POST /api/facturas/[id]/creditos → NOTA DE CRÉDITO contra una factura emitida.
// Corrige un cobro de más o una devolución parcial SIN anular toda la factura:
// reduce el saldo (balance = total − pagado − créditos). Numerada <factura>-NC<n>.
//
// Reglas:
//  - Solo facturas fiscales EMITIDAS (no borradores: un borrador se edita directo).
//  - amount > 0 y ≤ saldo pendiente (no es un reembolso de dinero ya cobrado; si
//    la factura está totalmente pagada, la devolución de dinero va por fuera).
//  - Razón obligatoria (respaldo para el contador).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole('owner', 'admin', 'super_user');
    const supabase = getSupabaseServerClient();
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const amount = round2(body.amount);
    const reason = String(body.reason ?? '').trim();
    if (!(amount > 0)) return NextResponse.json({ error: 'El monto del crédito debe ser mayor a $0.' }, { status: 400 });
    if (!reason) return NextResponse.json({ error: 'Escriba la razón de la nota de crédito.' }, { status: 400 });

    const { data: invoice, error } = await supabase.from('invoices').select(INVOICE_COLS).eq('id', id).maybeSingle();
    if (error) return NextResponse.json({ error: sanitizeDbError('facturas/creditos.GET', error.message) }, { status: 500 });
    if (!invoice) return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
    if (invoice.document_type !== 'invoice') return NextResponse.json({ error: 'Las notas de crédito aplican solo a facturas.' }, { status: 400 });
    if (invoice.status === 'draft') return NextResponse.json({ error: 'Un borrador se edita directamente; la nota de crédito es para facturas emitidas.' }, { status: 400 });
    if (invoice.status === 'void') return NextResponse.json({ error: 'La factura está anulada.' }, { status: 400 });

    const balance = round2(invoice.balance);
    if (amount > balance + 0.001) {
      return NextResponse.json({ error: `El crédito no puede superar el saldo pendiente (${balance.toFixed(2)}).` }, { status: 400 });
    }

    // Folio: <número de factura>-NC<n>.
    const { count } = await supabase.from('invoice_credits').select('id', { count: 'exact', head: true }).eq('invoice_id', id);
    const credit_number = `${invoice.document_number || `INV-${String(id).slice(0, 8)}`}-NC${(count ?? 0) + 1}`;

    const { data: credit, error: crErr } = await supabase.from('invoice_credits').insert({
      invoice_id: id, credit_number, amount, reason,
      created_by: (session as any)?.id ?? null,
      created_by_name: (session as any)?.full_name ?? null,
    }).select('id,credit_number,amount,reason,created_by_name,created_at').single();
    if (crErr) return NextResponse.json({ error: sanitizeDbError('facturas/creditos.insert', crErr.message) }, { status: 500 });

    // Nuevo saldo/estado. El crédito reduce lo por cobrar; si llega a 0 y hay algo
    // pagado queda 'paid'; si llega a 0 sin ningún pago, también se liquida (la
    // factura se ajustó completa por crédito).
    const newBalance = Math.max(0, round2(balance - amount));
    const newStatus = newBalance <= 0.001 ? 'paid' : (Number(invoice.amount_paid) > 0.001 ? 'partial' : 'open');
    const { data: updated, error: upErr } = await supabase.from('invoices')
      .update({ balance: newBalance, status: newStatus })
      .eq('id', id).select(INVOICE_COLS).single();
    if (upErr) return NextResponse.json({ error: sanitizeDbError('facturas/creditos.update', upErr.message) }, { status: 500 });

    return NextResponse.json({ ok: true, credit, invoice: updated }, { status: 201 });
  } catch (err) {
    const authResp = authErrorResponse(err);
    if (authResp) return authResp;
    throw err;
  }
}
