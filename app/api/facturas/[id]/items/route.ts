import { NextResponse } from 'next/server';
import { requireInvoicesAccess, round2 } from '@/lib/invoicesApi';
import { sanitizeDbError } from '@/lib/clientsApi';
import { authErrorResponse } from '@/lib/apiAuth';

const ITEM_COLS = 'id,line_type,description,qty,unit_price,amount,cost,part_source,inventory_item_id,mechanic_id,commission_pct,done,sort_order';

// GET /api/facturas/[id]/items → renglones de la factura (con sus asignaciones de
// mecánicos) para la vista de tareas del borrador.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await requireInvoicesAccess();
    const { id } = await params;
    const { data, error } = await supabase.from('invoice_items').select(ITEM_COLS).eq('invoice_id', id).order('sort_order', { ascending: true });
    if (error) return NextResponse.json({ error: sanitizeDbError('facturas/items.GET', error.message) }, { status: 500 });

    const items = data ?? [];
    // Adjuntar las asignaciones (hasta 2 mecánicos por renglón de mano de obra).
    const ids = items.map((it: any) => it.id);
    const byItem: Record<string, any[]> = {};
    if (ids.length) {
      const { data: asgs } = await supabase.from('invoice_item_assignments')
        .select('id,invoice_item_id,employee_id,commission_pct,sort_order')
        .in('invoice_item_id', ids)
        .order('sort_order', { ascending: true });
      for (const a of (asgs ?? [])) (byItem[a.invoice_item_id] ??= []).push(a);
    }
    const withAssignments = items.map((it: any) => ({ ...it, assignments: byItem[it.id] ?? [] }));

    return NextResponse.json({ items: withAssignments });
  } catch (err) {
    const authResp = authErrorResponse(err);
    if (authResp) return authResp;
    throw err;
  }
}

// PATCH /api/facturas/[id]/items → actualiza un renglón (hecho/pendiente y/o sus
// mecánicos asignados). Solo mientras la factura es BORRADOR.
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

    // Reemplazo de asignaciones de mecánicos (hasta 2). Si viene `assignments`,
    // se borran las anteriores y se insertan las nuevas; se sincroniza el primer
    // mecánico en el renglón (compat / display).
    if (Array.isArray(body.assignments)) {
      const assigns = body.assignments
        .filter((a: any) => a && a.employee_id)
        .slice(0, 2)
        .map((a: any, i: number) => ({
          invoice_item_id: itemId,
          employee_id: a.employee_id,
          commission_pct: Math.min(100, Math.max(0, round2(a.commission_pct ?? 50))),
          sort_order: i,
        }));
      await supabase.from('invoice_item_assignments').delete().eq('invoice_item_id', itemId);
      if (assigns.length) await supabase.from('invoice_item_assignments').insert(assigns);
      patch.mechanic_id = assigns[0]?.employee_id ?? null;
      patch.commission_pct = assigns[0]?.commission_pct ?? 0;
    } else {
      if (body.mechanic_id !== undefined) patch.mechanic_id = body.mechanic_id || null;
      if (body.commission_pct !== undefined) patch.commission_pct = Math.min(100, Math.max(0, round2(body.commission_pct)));
    }

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
