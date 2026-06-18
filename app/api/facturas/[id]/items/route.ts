import { NextResponse } from 'next/server';
import { requireInvoicesAccess, round2 } from '@/lib/invoicesApi';
import { sanitizeDbError } from '@/lib/clientsApi';
import { authErrorResponse } from '@/lib/apiAuth';

const ITEM_COLS = 'id,line_type,description,qty,unit_price,amount,cost,part_source,inventory_item_id,mechanic_id,commission_pct,done,sort_order';

// GET /api/facturas/[id]/items → renglones de la factura (para la vista de tareas del borrador).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await requireInvoicesAccess();
    const { id } = await params;
    const { data, error } = await supabase.from('invoice_items').select(ITEM_COLS).eq('invoice_id', id).order('sort_order', { ascending: true });
    if (error) return NextResponse.json({ error: sanitizeDbError('facturas/items.GET', error.message) }, { status: 500 });
    return NextResponse.json({ items: data ?? [] });
  } catch (err) {
    const authResp = authErrorResponse(err);
    if (authResp) return authResp;
    throw err;
  }
}

// PATCH /api/facturas/[id]/items → actualiza un renglón (hecho/pendiente, mecánico,
// % comisión). Solo mientras la factura es BORRADOR.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await requireInvoicesAccess();
    const { id } = await params;
    const body = await request.json();
    const itemId = String(body.item_id ?? '');
    if (!itemId) return NextResponse.json({ error: 'item_id requerido' }, { status: 400 });

    const { data: invoice } = await supabase.from('invoices').select('id,status').eq('id', id).maybeSingle();
    if (!invoice) return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
    if (invoice.status !== 'draft') return NextResponse.json({ error: 'Solo se editan renglones de un borrador.' }, { status: 400 });

    const patch: Record<string, unknown> = {};
    if (body.done !== undefined) patch.done = Boolean(body.done);
    if (body.mechanic_id !== undefined) patch.mechanic_id = body.mechanic_id || null;
    if (body.commission_pct !== undefined) patch.commission_pct = Math.min(100, Math.max(0, round2(body.commission_pct)));
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });

    const { data, error } = await supabase.from('invoice_items').update(patch).eq('id', itemId).eq('invoice_id', id).select(ITEM_COLS).single();
    if (error) return NextResponse.json({ error: sanitizeDbError('facturas/items.PATCH', error.message) }, { status: 500 });
    return NextResponse.json({ ok: true, item: data });
  } catch (err) {
    const authResp = authErrorResponse(err);
    if (authResp) return authResp;
    throw err;
  }
}
