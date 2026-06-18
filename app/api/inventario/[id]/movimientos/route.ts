import { NextResponse } from 'next/server';
import { requireInventoryAccess, INVENTORY_COLS, num, round2 } from '@/lib/inventoryApi';
import { sanitizeDbError } from '@/lib/clientsApi';
import { authErrorResponse, requireRole } from '@/lib/apiAuth';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

// GET /api/inventario/[id]/movimientos → historial (kárdex) de la pieza
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await requireInventoryAccess();
    const { id } = await params;
    const { data, error } = await supabase
      .from('inventory_movements')
      .select('id,movement_type,quantity,unit_cost,reference,invoice_id,notes,created_at')
      .eq('inventory_item_id', id)
      .order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: sanitizeDbError('inv.mov.GET', error.message) }, { status: 500 });
    return NextResponse.json({ movements: data ?? [] });
  } catch (err) {
    const authResp = authErrorResponse(err);
    if (authResp) return authResp;
    throw err;
  }
}

// POST /api/inventario/[id]/movimientos → registrar entrada/ajuste manual.
// Tipos permitidos aquí: purchase (restock, +), adjustment (+/-), return (+).
// 'sale' lo genera el flujo de facturas. Actualiza quantity_on_hand.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole('owner', 'admin', 'super_user');
    const supabase = getSupabaseServerClient();
    const { id } = await params;
    const body = await request.json();

    const type = ['purchase', 'adjustment', 'return'].includes(body.movement_type) ? body.movement_type : 'adjustment';
    let quantity = num(body.quantity);
    if (quantity === 0) return NextResponse.json({ error: 'La cantidad no puede ser 0.' }, { status: 400 });
    // purchase/return siempre entran (positivo); adjustment respeta el signo enviado.
    if (type !== 'adjustment') quantity = Math.abs(quantity);
    const unitCost = num(body.unit_cost);

    const { data: item, error: itErr } = await supabase.from('inventory_items').select('id,quantity_on_hand').eq('id', id).maybeSingle();
    if (itErr) return NextResponse.json({ error: sanitizeDbError('inv.mov.read', itErr.message) }, { status: 500 });
    if (!item) return NextResponse.json({ error: 'Pieza no encontrada' }, { status: 404 });

    const newQty = round2(Number(item.quantity_on_hand) + quantity);
    if (newQty < 0) return NextResponse.json({ error: 'El ajuste dejaría el stock en negativo.' }, { status: 400 });

    const { error: movErr } = await supabase.from('inventory_movements').insert({
      inventory_item_id: id, movement_type: type, quantity, unit_cost: unitCost,
      reference: String(body.reference ?? '').trim() || null,
      notes: String(body.notes ?? '').trim() || null,
      created_by: (session as any)?.id ?? null,
    });
    if (movErr) return NextResponse.json({ error: sanitizeDbError('inv.mov.insert', movErr.message) }, { status: 500 });

    // Actualiza stock; en compras, el último costo pasa a ser el costo unitario.
    const patch: Record<string, unknown> = { quantity_on_hand: newQty };
    if (type === 'purchase' && unitCost > 0) patch.unit_cost = unitCost;
    const { data: updated, error: updErr } = await supabase.from('inventory_items').update(patch).eq('id', id).select(INVENTORY_COLS).single();
    if (updErr) return NextResponse.json({ error: sanitizeDbError('inv.mov.update', updErr.message) }, { status: 500 });

    return NextResponse.json({ ok: true, item: updated });
  } catch (err) {
    const authResp = authErrorResponse(err);
    if (authResp) return authResp;
    throw err;
  }
}
