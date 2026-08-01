import { NextResponse } from 'next/server';
import { INVOICE_COLS, deriveBalanceStatus, applyWarehouseDeduction, round2, nextReceiptNumber, createWorkOrderFromInvoice } from '@/lib/invoicesApi';
import { computePayout } from '@/lib/money';
import { sanitizeDbError } from '@/lib/clientsApi';
import { authErrorResponse, requireRole } from '@/lib/apiAuth';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

// POST /api/facturas/[id]/emitir → emite un BORRADOR de factura:
//   1. valida que esté en 'draft' y sin comisiones generadas;
//   2. marca TODAS las tareas de mano de obra como completadas (emitir = trabajo
//      terminado; ya no se exige marcarlas antes);
//   3. asigna el número fiscal correlativo (atómico) del taller;
//   4. descuenta inventario de las piezas de bodega;
//   5. CREA LA ORDEN DE TRABAJO amarrada (work_reports + report_tasks +
//      task_assignments + earned_entries) por cada renglón de mano de obra con
//      mecánico → las comisiones entran a la planilla DESDE UN SOLO ORIGEN (la
//      orden). Si la factura ya venía enlazada a una orden existente, NO se
//      recrea: se respetan sus comisiones (evita doble pago).
//   6. fija estado/saldo según el pago y marca emitted_at + commissions_generated.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole('owner', 'admin', 'super_user');
    const supabase = getSupabaseServerClient();
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const { data: invoice, error } = await supabase.from('invoices').select(INVOICE_COLS).eq('id', id).maybeSingle();
    if (error) return NextResponse.json({ error: sanitizeDbError('facturas/emitir.GET', error.message) }, { status: 500 });
    if (!invoice) return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
    if (invoice.document_type !== 'invoice') return NextResponse.json({ error: 'Solo una FACTURA se puede emitir. Convierta la cotización en factura primero.' }, { status: 400 });
    if (invoice.status !== 'draft') return NextResponse.json({ error: 'Solo se puede emitir un borrador.' }, { status: 400 });
    if (invoice.commissions_generated) return NextResponse.json({ error: 'Esta factura ya fue emitida.' }, { status: 400 });

    const { data: items } = await supabase.from('invoice_items')
      .select('id,line_type,description,qty,unit_price,amount,cost,part_source,inventory_item_id,done')
      .eq('invoice_id', id);
    const allItems = items ?? [];
    const laborItems = allItems.filter((it: any) => it.line_type === 'labor');

    // Al EMITIR se da el trabajo por terminado: no exige marcar tareas hechas y
    // más abajo se marcan TODAS como completadas. Las comisiones y el descuento
    // de inventario ocurren igual (no dependen del checkbox 'done').

    // Asignaciones de mecánicos por renglón de mano de obra (hasta 2 por tarea).
    const laborIds = laborItems.map((it: any) => it.id);
    const assignmentsByItem: Record<string, Array<{ employee_id: string; commission_pct: number }>> = {};
    if (laborIds.length) {
      const { data: asgs } = await supabase.from('invoice_item_assignments')
        .select('invoice_item_id,employee_id,commission_pct,sort_order')
        .in('invoice_item_id', laborIds)
        .order('sort_order', { ascending: true });
      for (const a of (asgs ?? [])) {
        (assignmentsByItem[a.invoice_item_id] ??= []).push({ employee_id: a.employee_id, commission_pct: Number(a.commission_pct) });
      }
    }

    // Fecha de emisión (la del número y la de la comisión).
    const emitDate = (typeof body.completed_date === 'string' && body.completed_date) || new Date().toISOString().slice(0, 10);

    // Número fiscal: correlativo atómico del taller (con la fecha de emisión), o respaldo global.
    let document_number = String(invoice.document_number ?? '').trim();
    if (!document_number) {
      let prefix = 'INV-';
      if (invoice.shop_id) {
        const { data: num } = await supabase.rpc('next_shop_invoice_number', { p_shop_id: invoice.shop_id, p_date: emitDate });
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

    // Marca TODAS las tareas de mano de obra como completadas (emitir = terminado).
    if (laborIds.length) {
      await supabase.from('invoice_items').update({ done: true }).in('id', laborIds);
    }

    // Estado / pago.
    const total = Number(invoice.total) || 0;
    const markPaid = invoice.payment_method !== 'credit' && body.mark_paid === true;
    const amount_paid = markPaid ? total : 0;
    const { balance, status } = deriveBalanceStatus(total, amount_paid);

    // Forma de pago del cobro: se puede confirmar/cambiar al emitir (efectivo,
    // cheque, tarjeta, depósito). Si no viene una válida, se usa la de la factura.
    const PAID_METHODS = ['cash', 'check', 'card', 'deposit'];
    const payMethod = PAID_METHODS.includes(String(body.pay_method))
      ? String(body.pay_method)
      : (invoice.payment_method === 'credit' ? 'cash' : invoice.payment_method);

    const { data: updated, error: upErr } = await supabase.from('invoices').update({
      document_number,
      status,
      amount_paid,
      balance,
      emitted_at: new Date().toISOString(),
      commissions_generated: true,
      // Si se cobra al emitir, refleja la forma de pago realmente usada.
      ...(markPaid ? { payment_method: payMethod } : {}),
    }).eq('id', id).select(INVOICE_COLS).single();
    if (upErr) return NextResponse.json({ error: sanitizeDbError('facturas/emitir.update', upErr.message) }, { status: 500 });

    if (markPaid) {
      const receipt_number = await nextReceiptNumber(supabase, id, document_number);
      await supabase.from('invoice_payments').insert({
        invoice_id: id, amount: total, method: payMethod, payment_type: 'settlement', receipt_number,
        reference: String(body.payment_reference ?? '').trim() || null,
        paid_at: invoice.issue_date,
        created_by: (session as any)?.id ?? null,
        created_by_name: (session as any)?.full_name ?? null,
      });
    }

    // Orden de trabajo + comisiones. Si la factura YA viene enlazada a una orden
    // existente, NO se recrea (sus comisiones ya están en la planilla); solo se
    // emite. Si no, se crea la orden desde los renglones de mano de obra con mecánico.
    let workReportId: string | null = (invoice.work_report_id as any) ?? null;
    let commissionsCreated = 0;
    let commissionsTotal = 0;
    if (!workReportId) {
      try {
        const newReportId = await createWorkOrderFromInvoice(supabase, {
          invoice: updated,
          laborItems,
          assignmentsByItem,
          emitDate,
          createdById: (session as any)?.id ?? null,
          createdByName: (session as any)?.full_name ?? null,
        });
        if (newReportId) {
          workReportId = newReportId;
          await supabase.from('invoices').update({ work_report_id: newReportId }).eq('id', id);
          // Conteo / total de comisiones generadas (para el aviso al usuario).
          for (const it of laborItems) {
            for (const a of (assignmentsByItem[it.id] ?? [])) {
              if (!a.employee_id) continue;
              commissionsCreated += 1;
              commissionsTotal += computePayout(round2(it.amount), Math.min(100, Math.max(0, round2(a.commission_pct))));
            }
          }
        }
      } catch (e: any) {
        return NextResponse.json({ error: sanitizeDbError('facturas/emitir.workorder', e?.message ?? 'error') }, { status: 500 });
      }
    }

    return NextResponse.json({
      ok: true,
      invoice: updated,
      work_report_id: workReportId,
      commissions_created: commissionsCreated,
      commissions_total: round2(commissionsTotal),
    });
  } catch (err) {
    const authResp = authErrorResponse(err);
    if (authResp) return authResp;
    throw err;
  }
}
