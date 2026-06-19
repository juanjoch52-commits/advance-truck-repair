import { NextResponse } from 'next/server';
import { requireInvoicesAccess, INVOICE_COLS, PAYMENT_METHODS } from '@/lib/invoicesApi';
import { sanitizeDbError } from '@/lib/clientsApi';
import { authErrorResponse } from '@/lib/apiAuth';

// GET /api/facturas/[id] → factura con sus pagos y datos del cliente
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await requireInvoicesAccess();
    const { id } = await params;

    const { data: invoice, error } = await supabase.from('invoices').select(INVOICE_COLS).eq('id', id).maybeSingle();
    if (error) return NextResponse.json({ error: sanitizeDbError('facturas/[id].GET', error.message) }, { status: 500 });
    if (!invoice) return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });

    const [{ data: payments }, { data: items }, clientRes, shopRes, truckRes] = await Promise.all([
      supabase.from('invoice_payments').select('id,amount,method,reference,paid_at,notes,created_at').eq('invoice_id', id).order('paid_at', { ascending: false }),
      supabase.from('invoice_items').select('id,line_type,description,qty,unit_price,amount,cost,part_source,taxable,mechanic_id,commission_pct,done,sort_order').eq('invoice_id', id).order('sort_order', { ascending: true }),
      invoice.client_id
        ? supabase.from('clients').select('id,name,billing_address_line,city,state,zip,phone,email').eq('id', invoice.client_id).maybeSingle()
        : Promise.resolve({ data: null }),
      invoice.shop_id
        ? supabase.from('shops').select('id,name,legal_name,ein,sales_tax_certificate,billing_address_line,city,state,zip,phone,email,logo_url').eq('id', invoice.shop_id).maybeSingle()
        : Promise.resolve({ data: null }),
      invoice.truck_id
        ? supabase.from('trucks').select('id,unit_number,plate,make,model,year,vin').eq('id', invoice.truck_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    return NextResponse.json({
      invoice,
      payments: payments ?? [],
      items: items ?? [],
      client: (clientRes as any).data ?? null,
      shop: (shopRes as any).data ?? null,
      truck: (truckRes as any).data ?? null,
    });
  } catch (err) {
    const authResp = authErrorResponse(err);
    if (authResp) return authResp;
    throw err;
  }
}

// PATCH /api/facturas/[id] → editar campos de la factura (no recalcula totales)
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await requireInvoicesAccess();
    const { id } = await params;
    const body = await request.json();

    const payload: Record<string, unknown> = {};
    if (body.due_date !== undefined) payload.due_date = body.due_date || null;
    if (body.issue_date !== undefined && body.issue_date) payload.issue_date = body.issue_date;
    if (body.payment_method !== undefined && PAYMENT_METHODS.includes(body.payment_method)) payload.payment_method = body.payment_method;
    if (body.description !== undefined) payload.description = String(body.description).trim() || null;
    if (body.notes !== undefined) payload.notes = String(body.notes).trim() || null;
    // Anular (void): solo cambio de estado, no toca montos.
    if (body.status === 'void') payload.status = 'void';

    if (Object.keys(payload).length === 0) return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });

    const { data, error } = await supabase.from('invoices').update(payload).eq('id', id).select(INVOICE_COLS).single();
    if (error) return NextResponse.json({ error: sanitizeDbError('facturas/[id].PATCH', error.message) }, { status: 500 });

    return NextResponse.json({ ok: true, invoice: data });
  } catch (err) {
    const authResp = authErrorResponse(err);
    if (authResp) return authResp;
    throw err;
  }
}

// DELETE /api/facturas/[id] → eliminar factura (cascade a sus pagos)
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await requireInvoicesAccess();
    const { id } = await params;
    const { error } = await supabase.from('invoices').delete().eq('id', id);
    if (error) return NextResponse.json({ error: sanitizeDbError('facturas/[id].DELETE', error.message) }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const authResp = authErrorResponse(err);
    if (authResp) return authResp;
    throw err;
  }
}
