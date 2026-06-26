import { NextResponse } from 'next/server';
import { requireInvoicesAccess, INVOICE_COLS, PAYMENT_METHODS, DOCUMENT_TYPES, isFiscalDocument, computeAutoTax, applyWarehouseDeduction, round2, deriveBalanceStatus, nextReceiptNumber, createWorkOrderFromInvoice } from '@/lib/invoicesApi';
import { sanitizeDbError } from '@/lib/clientsApi';
import { authErrorResponse, requireRole } from '@/lib/apiAuth';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

// GET /api/facturas?status=&client_id=  → lista de facturas (con nombre de cliente)
export async function GET(request: Request) {
  try {
    const supabase = await requireInvoicesAccess();
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const clientId = url.searchParams.get('client_id');

    let query = supabase.from('invoices').select(INVOICE_COLS).order('issue_date', { ascending: false });
    if (status) query = query.eq('status', status);
    if (clientId) query = query.eq('client_id', clientId);

    const { data: invoices, error } = await query;
    if (error) return NextResponse.json({ error: sanitizeDbError('facturas.GET', error.message) }, { status: 500 });

    // Adjuntar nombre de cliente (consulta aparte; tablas con RLS deny-all).
    const ids = Array.from(new Set((invoices ?? []).map((i: any) => i.client_id).filter(Boolean)));
    let nameById: Record<string, string> = {};
    if (ids.length) {
      const { data: clients } = await supabase.from('clients').select('id,name').in('id', ids);
      nameById = Object.fromEntries((clients ?? []).map((c: any) => [c.id, c.name]));
    }
    // Etiqueta de camión (# unidad o placa) para mostrarla en la lista.
    const truckIds = Array.from(new Set((invoices ?? []).map((i: any) => i.truck_id).filter(Boolean)));
    let truckById: Record<string, string> = {};
    if (truckIds.length) {
      const { data: trucks } = await supabase.from('trucks').select('id,unit_number,plate').in('id', truckIds);
      truckById = Object.fromEntries((trucks ?? []).map((t: any) => [t.id, t.unit_number || t.plate || '—']));
    }
    const withNames = (invoices ?? []).map((i: any) => ({
      ...i,
      client_name: i.client_id ? (nameById[i.client_id] ?? null) : null,
      truck_label: i.truck_id ? (truckById[i.truck_id] ?? null) : null,
    }));

    return NextResponse.json({ invoices: withNames });
  } catch (err) {
    const authResp = authErrorResponse(err);
    if (authResp) return authResp;
    throw err;
  }
}

// POST /api/facturas → crear factura
export async function POST(request: Request) {
  try {
    const session = await requireRole('owner', 'admin', 'super_user');
    const supabase = getSupabaseServerClient();
    const body = await request.json();

    const payment_method = PAYMENT_METHODS.includes(body.payment_method) ? body.payment_method : 'cash';
    const document_type = DOCUMENT_TYPES.includes(body.document_type) ? body.document_type : 'invoice';
    const isFiscal = isFiscalDocument(document_type);
    // Borrador: factura con trabajo pendiente. NO consume número fiscal, NO
    // descuenta inventario y NO cobra; todo eso ocurre al EMITIR (/emitir).
    const isDraft = body.draft === true && isFiscal;

    // Datos del taller (una sola consulta): tasa para el tax automático y
    // prefijo/correlativo para la numeración fiscal.
    let shop: { id: string; tax_rate: number; invoice_prefix: string | null } | null = null;
    if (body.shop_id) {
      const { data } = await supabase.from('shops').select('id,tax_rate,invoice_prefix').eq('id', body.shop_id).maybeSingle();
      if (data) shop = data as any;
    }

    // Enlace a orden de trabajo: la factura hereda el número de orden
    // (external_order_number) de la orden seleccionada. Se "fotografía" en
    // order_number para conservarlo aunque la orden cambie o se borre.
    let work_report_id: string | null = body.work_report_id || null;
    let order_number: string | null = String(body.order_number ?? '').trim() || null;
    if (work_report_id) {
      const { data: wr } = await supabase.from('work_reports').select('id,external_order_number').eq('id', work_report_id).maybeSingle();
      if (wr) order_number = (wr as any).external_order_number ?? order_number;
      else work_report_id = null; // orden inexistente → no romper el FK
    }

    // Exención de sales tax: si el CLIENTE tiene certificado de exención, sus
    // facturas no llevan tax y se "fotografía" el número de certificado en la
    // factura (requisito fiscal para la venta exenta).
    let clientExempt = false;
    let clientExemptCert: string | null = null;
    if (body.client_id) {
      const { data: cli } = await supabase.from('clients').select('tax_exempt,tax_exempt_certificate').eq('id', body.client_id).maybeSingle();
      if (cli?.tax_exempt) { clientExempt = true; clientExemptCert = (cli as any).tax_exempt_certificate ?? null; }
    }

    // Renglones opcionales (mano de obra / piezas / cargos). Si vienen, el
    // subtotal se calcula a partir de ellos (si no, se usa el subtotal plano).
    const rawItems: any[] = Array.isArray(body.items) ? body.items : [];
    // Asignaciones de mecánicos por renglón (hasta 2 por tarea de mano de obra).
    // Acepta `assignments: [{ employee_id, commission_pct }]`; por compatibilidad,
    // si solo viene `mechanic_id`, lo trata como una asignación única.
    const assignmentsByIdx: Record<number, Array<{ employee_id: string; commission_pct: number }>> = {};
    const items = rawItems.map((it: any, idx: number) => {
      const qty = round2(it.qty ?? 1) || 1;
      const unit_price = round2(it.unit_price);
      let assigns: Array<{ employee_id: string; commission_pct: number }> = [];
      if (it.line_type === 'labor') {
        const raw = Array.isArray(it.assignments) && it.assignments.length
          ? it.assignments
          : (it.mechanic_id ? [{ employee_id: it.mechanic_id, commission_pct: it.commission_pct ?? 50 }] : []);
        assigns = raw
          .filter((a: any) => a && a.employee_id)
          .slice(0, 2)
          .map((a: any) => ({ employee_id: a.employee_id, commission_pct: Math.min(100, Math.max(0, round2(a.commission_pct ?? 50))) }));
        if (assigns.length) assignmentsByIdx[idx] = assigns;
      }
      return {
        line_type: ['labor', 'part', 'fee'].includes(it.line_type) ? it.line_type : 'part',
        description: String(it.description ?? '').trim() || null,
        qty,
        unit_price,
        amount: round2(qty * unit_price),
        cost: round2(it.cost),
        part_source: ['new_purchased', 'used', 'warehouse'].includes(it.part_source) ? it.part_source : null,
        inventory_item_id: it.inventory_item_id || null,
        taxable: Boolean(it.taxable),
        // Compat: primer mecánico también en el renglón (display / esquema viejo).
        mechanic_id: assigns[0]?.employee_id ?? null,
        commission_pct: assigns[0] ? assigns[0].commission_pct : 0,
        done: Boolean(it.done),
        sort_order: idx,
      };
    });

    const subtotal = items.length
      ? round2(items.reduce((s, it) => s + it.amount, 0))
      : round2(body.subtotal);

    // Sales tax: si hay taller (con tasa) y renglones, se calcula automáticamente
    // sobre la base gravable (Σ renglones taxable). Sin taller/renglones, o si el
    // usuario pide override, se usa el monto manual.
    const taxableBase = round2(items.filter(it => it.taxable).reduce((s, it) => s + it.amount, 0));
    const autoTax = shop && items.length && body.tax_override !== true && !clientExempt;
    // Cliente exento → tax 0 (gana sobre auto y manual).
    const tax_amount = clientExempt ? 0 : (autoTax ? computeAutoTax(taxableBase, shop!.tax_rate) : round2(body.tax_amount));

    const discount = round2(body.discount);
    const total = round2(subtotal + tax_amount - discount);
    if (total <= 0) return NextResponse.json({ error: 'El total de la factura debe ser mayor a $0.' }, { status: 400 });

    // Numeración: usa lo que envíe el usuario; si viene vacío:
    //  - factura fiscal con taller → correlativo ATÓMICO del taller (RPC), que
    //    consume e incrementa shops.next_invoice_number sin huecos por carreras;
    //  - resto (no fiscal, o sin taller) → prefijo por tipo + conteo de respaldo.
    const issueDate = body.issue_date || new Date().toISOString().slice(0, 10);
    let document_number = String(body.document_number ?? '').trim();
    if (!document_number && !isDraft && isFiscal && shop) {
      const { data: num } = await supabase.rpc('next_shop_invoice_number', { p_shop_id: shop.id, p_date: issueDate });
      if (num) document_number = String(num);
    }
    if (!document_number && !isDraft) {
      const { count } = await supabase.from('invoices').select('id', { count: 'exact', head: true });
      const prefix = document_type === 'estimate' ? 'EST-'
        : document_type === 'work_order' ? 'WO-'
        : (shop?.invoice_prefix || 'INV-');
      document_number = `${prefix}${(count ?? 0) + 1}`;
    }
    // Borrador sin número aún → null (se asigna al emitir).
    if (!document_number) document_number = null as any;

    // Crédito (préstamo) → factura abierta, sin pago. Otros métodos → opción de
    // marcarla pagada de una vez (mark_paid). Documentos NO fiscales
    // (estimate/work_order) nunca se cobran ni entran a CxC: quedan en 'draft'.
    const markPaid = !isDraft && isFiscal && payment_method !== 'credit' && body.mark_paid === true;
    const amount_paid = markPaid ? total : 0;
    const derived = deriveBalanceStatus(total, amount_paid);
    const balance = derived.balance;
    // Borrador y documentos no fiscales → 'draft' (pendiente). Factura emitida → según pago.
    const status = (isFiscal && !isDraft) ? derived.status : 'draft';

    const payload = {
      shop_id: body.shop_id || null,
      client_id: body.client_id || null,
      // Cliente esporádico (walk-in): nombre + datos opcionales a mano cuando no
      // hay client_id (para registrados esos datos viven en el CRM).
      customer_name: !body.client_id ? (String(body.customer_name ?? '').trim() || null) : null,
      customer_company: !body.client_id ? (String(body.customer_company ?? '').trim() || null) : null,
      customer_phone: !body.client_id ? (String(body.customer_phone ?? '').trim() || null) : null,
      customer_truck: !body.client_id ? (String(body.customer_truck ?? '').trim() || null) : null,
      location_id: body.location_id || null,
      truck_id: body.truck_id || null,
      work_report_id,
      order_number,
      document_number,
      document_type,
      issue_date: body.issue_date || new Date().toISOString().slice(0, 10),
      due_date: body.due_date || null,
      payment_method,
      status,
      subtotal, tax_amount, discount, total,
      tax_exempt: clientExempt,
      tax_exempt_certificate: clientExempt ? clientExemptCert : null,
      amount_paid, balance,
      description: String(body.description ?? '').trim() || null,
      notes: String(body.notes ?? '').trim() || null,
      created_by: (session as any)?.id ?? null,
    };

    const { data: invoice, error } = await supabase.from('invoices').insert(payload).select(INVOICE_COLS).single();
    if (error) return NextResponse.json({ error: sanitizeDbError('facturas.POST', error.message) }, { status: 500 });

    // Si se marcó pagada, registrar el pago correspondiente con su comprobante
    // (folio + tipo 'settlement' = liquida el total + quién lo registró).
    if (markPaid) {
      const receipt_number = await nextReceiptNumber(supabase, invoice.id, invoice.document_number);
      await supabase.from('invoice_payments').insert({
        invoice_id: invoice.id, amount: total, method: payment_method, payment_type: 'settlement', receipt_number,
        reference: String(body.payment_reference ?? '').trim() || null,
        paid_at: payload.issue_date,
        created_by: (session as any)?.id ?? null,
        created_by_name: (session as any)?.full_name ?? null,
      });
    }

    // Renglones. El descuento de bodega solo ocurre al FINALIZAR: si es factura
    // fiscal directa, ahora; si es borrador, se difiere a /emitir.
    let insertedItems: any[] = [];
    if (items.length) {
      const rows = items.map(it => ({ ...it, invoice_id: invoice.id }));
      const { data: itRows, error: itErr } = await supabase.from('invoice_items').insert(rows)
        .select('id,line_type,description,amount,inventory_item_id,qty,cost,sort_order');
      if (itErr) return NextResponse.json({ error: sanitizeDbError('facturas.POST.items', itErr.message) }, { status: 500 });
      insertedItems = itRows ?? [];

      // Asignaciones de mecánicos por renglón (mapeadas por sort_order = idx).
      const itemByIdx: Record<number, string> = {};
      for (const r of insertedItems) itemByIdx[r.sort_order] = r.id;
      const asgRows: any[] = [];
      for (const [idxStr, assigns] of Object.entries(assignmentsByIdx)) {
        const itemId = itemByIdx[Number(idxStr)];
        if (!itemId) continue;
        assigns.forEach((a, i) => asgRows.push({
          invoice_item_id: itemId, employee_id: a.employee_id, commission_pct: a.commission_pct, sort_order: i,
        }));
      }
      if (asgRows.length) {
        const { error: asgErr } = await supabase.from('invoice_item_assignments').insert(asgRows);
        if (asgErr) return NextResponse.json({ error: sanitizeDbError('facturas.POST.assignments', asgErr.message) }, { status: 500 });
      }

      if (isFiscal && !isDraft) {
        await applyWarehouseDeduction(supabase, items, invoice.id, (session as any)?.id ?? null);
      }
    }

    // Factura fiscal DIRECTA (no borrador) con mano de obra y mecánicos → crea la
    // orden de trabajo amarrada + comisiones en el acto (mismo origen que /emitir),
    // salvo que venga enlazada a una orden existente. Borradores lo difieren a /emitir.
    if (isFiscal && !isDraft && !work_report_id && insertedItems.length) {
      const laborItems = insertedItems.filter((it: any) => it.line_type === 'labor');
      const assignmentsByItem: Record<string, Array<{ employee_id: string; commission_pct: number }>> = {};
      for (const it of laborItems) {
        const assigns = assignmentsByIdx[it.sort_order];
        if (assigns?.length) assignmentsByItem[it.id] = assigns;
      }
      try {
        const newReportId = await createWorkOrderFromInvoice(supabase, {
          invoice,
          laborItems,
          assignmentsByItem,
          emitDate: invoice.issue_date,
          createdById: (session as any)?.id ?? null,
          createdByName: (session as any)?.full_name ?? null,
        });
        if (newReportId) {
          await supabase.from('invoices').update({ work_report_id: newReportId, commissions_generated: true }).eq('id', invoice.id);
          (invoice as any).work_report_id = newReportId;
        }
      } catch (e: any) {
        return NextResponse.json({ error: sanitizeDbError('facturas.POST.workorder', e?.message ?? 'error') }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, invoice }, { status: 201 });
  } catch (err) {
    const authResp = authErrorResponse(err);
    if (authResp) return authResp;
    throw err;
  }
}
