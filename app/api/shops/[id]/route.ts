import { NextResponse } from 'next/server';
import { requireShopsAccess, SHOP_COLS } from '@/lib/shopsApi';
import { sanitizeDbError } from '@/lib/clientsApi';
import { authErrorResponse } from '@/lib/apiAuth';

// PATCH /api/shops/[id] → actualizar taller (parcial: respeta undefined)
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await requireShopsAccess();
    const { id } = await params;
    const body = await request.json();

    const payload: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return NextResponse.json({ error: 'El nombre del taller es requerido' }, { status: 400 });
      payload.name = name;
    }
    if (body.legal_name !== undefined) payload.legal_name = String(body.legal_name).trim() || null;
    if (body.ein !== undefined) payload.ein = String(body.ein).trim() || null;
    if (body.sales_tax_certificate !== undefined) payload.sales_tax_certificate = String(body.sales_tax_certificate).trim() || null;
    if (body.county !== undefined) payload.county = String(body.county).trim() || null;
    if (body.billing_address_line !== undefined) payload.billing_address_line = String(body.billing_address_line).trim() || null;
    if (body.city !== undefined) payload.city = String(body.city).trim() || null;
    if (body.state !== undefined) payload.state = String(body.state).trim() || null;
    if (body.zip !== undefined) payload.zip = String(body.zip).trim() || null;
    if (body.phone !== undefined) payload.phone = String(body.phone).trim() || null;
    if (body.email !== undefined) payload.email = String(body.email).trim() || null;
    if (body.tax_rate !== undefined)
      payload.tax_rate = Number.isFinite(Number(body.tax_rate)) ? Math.min(100, Math.max(0, Number(body.tax_rate))) : 0;
    if (body.invoice_prefix !== undefined) payload.invoice_prefix = String(body.invoice_prefix).trim() || null;
    if (body.next_invoice_number !== undefined)
      payload.next_invoice_number = Math.max(1, parseInt(body.next_invoice_number, 10) || 1);
    if (body.notes !== undefined) payload.notes = String(body.notes).trim() || null;
    if (body.is_active !== undefined) payload.is_active = Boolean(body.is_active);

    const { data, error } = await supabase.from('shops').update(payload).eq('id', id).select(SHOP_COLS).single();
    if (error) return NextResponse.json({ error: sanitizeDbError('shops/[id].PATCH', error.message) }, { status: 500 });

    return NextResponse.json({ ok: true, shop: data });
  } catch (err) {
    const authResp = authErrorResponse(err);
    if (authResp) return authResp;
    throw err;
  }
}

// DELETE /api/shops/[id] → eliminar taller
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await requireShopsAccess();
    const { id } = await params;
    const { error } = await supabase.from('shops').delete().eq('id', id);
    if (error) return NextResponse.json({ error: sanitizeDbError('shops/[id].DELETE', error.message) }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const authResp = authErrorResponse(err);
    if (authResp) return authResp;
    throw err;
  }
}
