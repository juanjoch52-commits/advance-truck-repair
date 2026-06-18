import { NextResponse } from 'next/server';
import { requireInvoicesAccess, INVOICE_COLS, deriveBalanceStatus, applyWarehouseDeduction, weekRangeMonSun, round2 } from '@/lib/invoicesApi';
import { computePayout } from '@/lib/money';
import { sanitizeDbError } from '@/lib/clientsApi';
import { authErrorResponse } from '@/lib/apiAuth';

// POST /api/facturas/[id]/emitir → emite un BORRADOR de factura:
//   1. valida que esté en 'draft' y sin comisiones generadas;
//   2. (salvo force) exige que las tareas de mano de obra estén marcadas hechas;
//   3. asigna el número fiscal correlativo (atómico) del taller;
//   4. descuenta inventario de las piezas de bodega;
//   5. genera COMISIONES (earned_entries entry_type='mechanic') por cada renglón
//      de labor con mecánico asignado → entran a la nómina de mecánicos;
//   6. fija estado/saldo según el pago y marca emitted_at + commissions_generated.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await requireInvoicesAccess();
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const { data: invoice, error } = await supabase.from('invoices').select(INVOICE_COLS).eq('id', id).maybeSingle();
    if (error) return NextResponse.json({ error: sanitizeDbError('facturas/emitir.GET', error.message) }, { status: 500 });
    if (!invoice) return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
    if (invoice.status !== 'draft') return NextResponse.json({ error: 'Solo se puede emitir un borrador.' }, { status: 400 });
    if (invoice.commissions_generated) return NextResponse.json({ error: 'Esta factura ya fue emitida.' }, { status: 400 });

    const { data: items } = await supabase.from('invoice_items')
      .select('id,line_type,description,qty,unit_price,amount,cost,part_source,inventory_item_id,mechanic_id,commission_pct,done')
      .eq('invoice_id', id);
    const allItems = items ?? [];

    // Tareas de mano de obra pendientes (sin marcar hechas) → bloquea salvo force.
    const pendingLabor = allItems.filter((it: any) => it.line_type === 'labor' && !it.done);
    if (pendingLabor.length > 0 && body.force !== true) {
      return NextResponse.json({ error: 'pending_tasks', pending: pendingLabor.length }, { status: 409 });
    }

    // Número fiscal: correlativo atómico del taller, o respaldo global.
    let document_number = String(invoice.document_number ?? '').trim();
    if (!document_number) {
      let prefix = 'INV-';
      if (invoice.shop_id) {
        const { data: num } = await supabase.rpc('next_shop_invoice_number', { p_shop_id: invoice.shop_id });
        if (num) document_number = String(num);
        const { data: shop } = await supabase.from('shops').select('invoice_prefix').eq('id', invoice.shop_id).maybeSingle();
        if (shop?.invoice_prefix) prefix = shop.invoice_prefix;
      }
      if (!document_number) {
        const { count } = await supabase.from('invoices').select('id', { count: 'exact', head: true });
        document_number = `${prefix}${(count ?? 0) + 1}`;
      }
    }

    // Descuento de bodega (diferido del borrador).
    await applyWarehouseDeduction(supabase, allItems, id, (invoice.created_by as any) ?? null);

    // Estado / pago.
    const total = Number(invoice.total) || 0;
    const markPaid = invoice.payment_method !== 'credit' && body.mark_paid === true;
    const amount_paid = markPaid ? total : 0;
    const { balance, status } = deriveBalanceStatus(total, amount_paid);

    const emitDate = (typeof body.completed_date === 'string' && body.completed_date) || new Date().toISOString().slice(0, 10);

    const { data: updated, error: upErr } = await supabase.from('invoices').update({
      document_number,
      status,
      amount_paid,
      balance,
      emitted_at: new Date().toISOString(),
      commissions_generated: true,
    }).eq('id', id).select(INVOICE_COLS).single();
    if (upErr) return NextResponse.json({ error: sanitizeDbError('facturas/emitir.update', upErr.message) }, { status: 500 });

    if (markPaid) {
      await supabase.from('invoice_payments').insert({
        invoice_id: id, amount: total, method: invoice.payment_method,
        reference: String(body.payment_reference ?? '').trim() || null,
        paid_at: invoice.issue_date,
        created_by: (invoice.created_by as any) ?? null,
      });
    }

    // Comisiones: un earned_entry por renglón de labor con mecánico asignado.
    const { start: week_start, end: week_end } = weekRangeMonSun(emitDate);
    const commissionRows = allItems
      .filter((it: any) => it.line_type === 'labor' && it.mechanic_id && Number(it.amount) > 0)
      .map((it: any) => ({
        invoice_item_id: it.id,
        employee_id: it.mechanic_id,
        amount: computePayout(it.amount, it.commission_pct ?? 50),
        work_date: emitDate,
        truck_number: null,
        mechanic_role: 'mechanic',
        entry_type: 'mechanic',
        description: `Factura ${document_number}${it.description ? ' · ' + it.description : ''}`,
        week_start,
        week_end,
      }));

    let commissionsCreated = 0;
    if (commissionRows.length) {
      const { error: ceErr } = await supabase.from('earned_entries').insert(commissionRows);
      if (ceErr) return NextResponse.json({ error: sanitizeDbError('facturas/emitir.commissions', ceErr.message) }, { status: 500 });
      commissionsCreated = commissionRows.length;
    }

    return NextResponse.json({
      ok: true,
      invoice: updated,
      commissions_created: commissionsCreated,
      commissions_total: round2(commissionRows.reduce((s, r) => s + Number(r.amount), 0)),
    });
  } catch (err) {
    const authResp = authErrorResponse(err);
    if (authResp) return authResp;
    throw err;
  }
}
