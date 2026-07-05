import { NextResponse } from 'next/server';
import { requireInvoicesAccess, INVOICE_COLS } from '@/lib/invoicesApi';
import { sanitizeDbError } from '@/lib/clientsApi';
import { authErrorResponse } from '@/lib/apiAuth';

// POST /api/facturas/[id]/convertir → convierte una COTIZACIÓN (estimate) en un
// BORRADOR de factura, copiando encabezado + renglones + mecánicos asignados.
// El cliente acepta la cotización → no se recaptura nada (evita errores de monto).
// La cotización queda marcada con converted_to_invoice_id (no se convierte 2 veces);
// la factura nace como borrador: se revisa y se EMITE desde la lista como siempre.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await requireInvoicesAccess();
    const { id } = await params;

    const { data: est, error } = await supabase.from('invoices').select(INVOICE_COLS).eq('id', id).maybeSingle();
    if (error) return NextResponse.json({ error: sanitizeDbError('facturas/convertir.GET', error.message) }, { status: 500 });
    if (!est) return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 });
    if (est.document_type !== 'estimate') return NextResponse.json({ error: 'Solo una cotización se puede convertir en factura.' }, { status: 400 });
    if (est.status === 'void') return NextResponse.json({ error: 'La cotización está anulada.' }, { status: 400 });
    if (est.converted_to_invoice_id) {
      return NextResponse.json({ error: 'Esta cotización ya fue convertida en factura.', invoice_id: est.converted_to_invoice_id }, { status: 409 });
    }

    // Renglones + asignaciones de mecánicos de la cotización.
    const { data: items } = await supabase.from('invoice_items')
      .select('id,line_type,description,qty,unit_price,amount,cost,part_source,inventory_item_id,taxable,mechanic_id,commission_pct,sort_order')
      .eq('invoice_id', id).order('sort_order', { ascending: true });
    const srcItems = items ?? [];
    const srcIds = srcItems.map((it: any) => it.id);
    const asgByItem: Record<string, any[]> = {};
    if (srcIds.length) {
      const { data: asgs } = await supabase.from('invoice_item_assignments')
        .select('invoice_item_id,employee_id,commission_pct,sort_order')
        .in('invoice_item_id', srcIds).order('sort_order', { ascending: true });
      for (const a of (asgs ?? [])) (asgByItem[a.invoice_item_id] ??= []).push(a);
    }

    // Factura borrador con los mismos datos (fecha de hoy; sin número: se asigna al emitir).
    const today = new Date().toISOString().slice(0, 10);
    const { data: invoice, error: invErr } = await supabase.from('invoices').insert({
      shop_id: est.shop_id, client_id: est.client_id,
      customer_name: est.customer_name, customer_company: est.customer_company,
      customer_phone: est.customer_phone, customer_truck: est.customer_truck,
      insurance_company: est.insurance_company, insurance_claim: est.insurance_claim,
      location_id: est.location_id, truck_id: est.truck_id,
      work_report_id: est.work_report_id, order_number: est.order_number,
      document_type: 'invoice', document_number: null, status: 'draft',
      issue_date: today, due_date: est.due_date, payment_method: est.payment_method,
      subtotal: est.subtotal, tax_amount: est.tax_amount, discount: est.discount, total: est.total,
      tax_exempt: est.tax_exempt, tax_exempt_certificate: est.tax_exempt_certificate,
      amount_paid: 0, balance: est.total,
      description: est.description, notes: est.notes,
    }).select(INVOICE_COLS).single();
    if (invErr) return NextResponse.json({ error: sanitizeDbError('facturas/convertir.insert', invErr.message) }, { status: 500 });

    // Copiar renglones (y mapear las asignaciones por sort_order).
    if (srcItems.length) {
      const rows = srcItems.map((it: any) => ({
        invoice_id: invoice.id,
        line_type: it.line_type, description: it.description,
        qty: it.qty, unit_price: it.unit_price, amount: it.amount, cost: it.cost,
        part_source: it.part_source, inventory_item_id: it.inventory_item_id,
        taxable: it.taxable, mechanic_id: it.mechanic_id, commission_pct: it.commission_pct,
        done: false, sort_order: it.sort_order,
      }));
      const { data: newItems, error: itErr } = await supabase.from('invoice_items').insert(rows).select('id,sort_order');
      if (itErr) return NextResponse.json({ error: sanitizeDbError('facturas/convertir.items', itErr.message) }, { status: 500 });

      const newByOrder: Record<number, string> = {};
      for (const r of (newItems ?? [])) newByOrder[r.sort_order] = r.id;
      const asgRows: any[] = [];
      for (const src of srcItems) {
        const newId = newByOrder[src.sort_order];
        if (!newId) continue;
        for (const a of (asgByItem[src.id] ?? [])) {
          asgRows.push({ invoice_item_id: newId, employee_id: a.employee_id, commission_pct: a.commission_pct, sort_order: a.sort_order });
        }
      }
      if (asgRows.length) await supabase.from('invoice_item_assignments').insert(asgRows);
    }

    // Marcar la cotización como convertida.
    await supabase.from('invoices').update({ converted_to_invoice_id: invoice.id }).eq('id', id);

    return NextResponse.json({ ok: true, invoice }, { status: 201 });
  } catch (err) {
    const authResp = authErrorResponse(err);
    if (authResp) return authResp;
    throw err;
  }
}
