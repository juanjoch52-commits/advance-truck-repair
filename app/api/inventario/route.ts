import { NextResponse } from 'next/server';
import { requireInventoryAccess, INVENTORY_COLS, num } from '@/lib/inventoryApi';
import { sanitizeDbError } from '@/lib/clientsApi';
import { authErrorResponse } from '@/lib/apiAuth';

// GET /api/inventario?low=1  → catálogo de bodega (low=1 solo bajo stock)
export async function GET(request: Request) {
  try {
    const supabase = await requireInventoryAccess();
    const low = new URL(request.url).searchParams.get('low') === '1';

    const { data, error } = await supabase.from('inventory_items').select(INVENTORY_COLS).order('name', { ascending: true });
    if (error) return NextResponse.json({ error: sanitizeDbError('inventario.GET', error.message) }, { status: 500 });

    let items = data ?? [];
    if (low) items = items.filter((i: any) => Number(i.reorder_level) > 0 && Number(i.quantity_on_hand) <= Number(i.reorder_level));
    return NextResponse.json({ items });
  } catch (err) {
    const authResp = authErrorResponse(err);
    if (authResp) return authResp;
    throw err;
  }
}

// POST /api/inventario → crear pieza. Si llega quantity_on_hand > 0, registra el
// movimiento inicial de compra (entra como gasto/restock).
export async function POST(request: Request) {
  try {
    const supabase = await requireInventoryAccess();
    const body = await request.json();

    const name = String(body.name ?? '').trim();
    if (!name) return NextResponse.json({ error: 'El nombre de la pieza es requerido' }, { status: 400 });

    const qty = num(body.quantity_on_hand);
    const unitCost = num(body.unit_cost);
    const payload = {
      part_number: String(body.part_number ?? '').trim() || null,
      name,
      description: String(body.description ?? '').trim() || null,
      unit_cost: unitCost,
      sale_price: num(body.sale_price),
      quantity_on_hand: qty,
      reorder_level: num(body.reorder_level),
      location: String(body.location ?? '').trim() || null,
      is_active: body.is_active === false ? false : true,
    };

    const { data: item, error } = await supabase.from('inventory_items').insert(payload).select(INVENTORY_COLS).single();
    if (error) return NextResponse.json({ error: sanitizeDbError('inventario.POST', error.message) }, { status: 500 });

    // Stock inicial → movimiento de compra (queda en el historial de gastos).
    if (qty > 0) {
      await supabase.from('inventory_movements').insert({
        inventory_item_id: item.id, movement_type: 'purchase', quantity: qty, unit_cost: unitCost,
        reference: 'Stock inicial',
      });
    }

    return NextResponse.json({ ok: true, item }, { status: 201 });
  } catch (err) {
    const authResp = authErrorResponse(err);
    if (authResp) return authResp;
    throw err;
  }
}
