import { NextResponse } from 'next/server';
import { INVOICE_COLS, RECEIPT_METHODS, PAYMENT_TYPES, round2, deriveBalanceStatus } from '@/lib/invoicesApi';
import { sanitizeDbError } from '@/lib/clientsApi';
import { authErrorResponse, requireRole } from '@/lib/apiAuth';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

// POST /api/facturas/[id]/pagos → registrar un pago contra la factura
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole('owner', 'admin', 'super_user');
    const supabase = getSupabaseServerClient();
    const { id } = await params;
    const body = await request.json();

    const amount = round2(body.amount);
    if (!(amount > 0)) return NextResponse.json({ error: 'El monto del pago debe ser mayor a $0.' }, { status: 400 });
    const method = (RECEIPT_METHODS as readonly string[]).includes(body.method) ? body.method : 'cash';
    const payment_type = (PAYMENT_TYPES as readonly string[]).includes(body.payment_type) ? body.payment_type : 'deposit';

    const { data: invoice, error: invErr } = await supabase.from('invoices').select('id,document_number,total,amount_paid,status').eq('id', id).maybeSingle();
    if (invErr) return NextResponse.json({ error: sanitizeDbError('pagos.POST.read', invErr.message) }, { status: 500 });
    if (!invoice) return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
    if (invoice.status === 'void') return NextResponse.json({ error: 'No se puede registrar un pago en una factura anulada.' }, { status: 400 });

    const newPaid = round2(Number(invoice.amount_paid) + amount);
    if (newPaid - Number(invoice.total) > 0.01) {
      return NextResponse.json({ error: 'El pago excede el saldo pendiente de la factura.' }, { status: 400 });
    }

    // Folio del comprobante: <número de factura>-R<n> (n = pagos previos + 1).
    const { count: prevCount } = await supabase.from('invoice_payments').select('id', { count: 'exact', head: true }).eq('invoice_id', id);
    const seq = (prevCount ?? 0) + 1;
    const receipt_number = `${invoice.document_number || `INV-${String(id).slice(0, 8)}`}-R${seq}`;

    const { data: payment, error: payErr } = await supabase.from('invoice_payments').insert({
      invoice_id: id, amount, method, payment_type, receipt_number,
      reference: String(body.reference ?? '').trim() || null,
      paid_at: body.paid_at || new Date().toISOString().slice(0, 10),
      notes: String(body.notes ?? '').trim() || null,
      created_by: (session as any)?.id ?? null,
      created_by_name: (session as any)?.full_name ?? null,
    }).select('id,amount,method,payment_type,receipt_number,reference,paid_at,notes,created_by_name,created_at').single();
    if (payErr) return NextResponse.json({ error: sanitizeDbError('pagos.POST.insert', payErr.message) }, { status: 500 });

    const { balance, status } = deriveBalanceStatus(Number(invoice.total), newPaid);
    const { data: updated, error: updErr } = await supabase
      .from('invoices').update({ amount_paid: newPaid, balance, status }).eq('id', id).select(INVOICE_COLS).single();
    if (updErr) return NextResponse.json({ error: sanitizeDbError('pagos.POST.update', updErr.message) }, { status: 500 });

    return NextResponse.json({ ok: true, invoice: updated, payment });
  } catch (err) {
    const authResp = authErrorResponse(err);
    if (authResp) return authResp;
    throw err;
  }
}
