import { NextResponse } from 'next/server';
import { requireInventoryAccess, INVENTORY_COLS, num } from '@/lib/inventoryApi';
import { sanitizeDbError } from '@/lib/clientsApi';
import { authErrorResponse } from '@/lib/apiAuth';

// PATCH /api/inventario/[id] → editar datos de la pieza (no toca el stock; eso va por movimientos)
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await requireInventoryAccess();
    const { id } = await params;
    const body = await request.json();

    const payload: Record<string, unknown> = {};
    if (body.part_number !== undefined) payload.part_number = String(body.part_number).trim() || null;
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 });
      payload.name = name;
    }
    if (body.description !== undefined) payload.description = String(body.description).trim() || null;
    if (body.unit_cost !== undefined) payload.unit_cost = num(body.unit_cost);
    if (body.sale_price !== undefined) payload.sale_price = num(body.sale_price);
    if (body.reorder_level !== undefined) payload.reorder_level = num(body.reorder_level);
    if (body.location !== undefined) payload.location = String(body.location).trim() || null;
    if (body.is_active !== undefined) payload.is_active = Boolean(body.is_active);

    if (Object.keys(payload).length === 0) return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });

    const { data, error } = await supabase.from('inventory_items').update(payload).eq('id', id).select(INVENTORY_COLS).single();
    if (error) return NextResponse.json({ error: sanitizeDbError('inventario/[id].PATCH', error.message) }, { status: 500 });
    return NextResponse.json({ ok: true, item: data });
  } catch (err) {
    const authResp = authErrorResponse(err);
    if (authResp) return authResp;
    throw err;
  }
}

// DELETE /api/inventario/[id] → eliminar pieza (cascade a sus movimientos)
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await requireInventoryAccess();
    const { id } = await params;
    const { error } = await supabase.from('inventory_items').delete().eq('id', id);
    if (error) return NextResponse.json({ error: sanitizeDbError('inventario/[id].DELETE', error.message) }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const authResp = authErrorResponse(err);
    if (authResp) return authResp;
    throw err;
  }
}
