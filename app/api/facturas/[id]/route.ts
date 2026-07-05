import { NextResponse } from 'next/server';
import { requireInvoicesAccess, INVOICE_COLS, PAYMENT_METHODS, INSURANCE_STATUSES, computeAutoTax, round2, deriveBalanceStatus } from '@/lib/invoicesApi';
import { sanitizeDbError } from '@/lib/clientsApi';
import { authErrorResponse } from '@/lib/apiAuth';

// GET /api/facturas/[id] → factura con sus pagos y datos del cliente
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await requireInvoicesAccess();
    const { id } = await params;

    const { data: invoice, error } = await supabase.from('invoices').select(INVOICE_COLS).eq('id', id).maybeSingle();
    if (error) return NextResponse.json({ error: sanitizeDbError('facturas/[id].GET', error.message) }, { status: 500 });
    if (!invoice) return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });

    const [{ data: payments }, { data: items }, { data: credits }, clientRes, shopRes, truckRes] = await Promise.all([
      supabase.from('invoice_payments').select('id,amount,method,payment_type,receipt_number,reference,paid_at,notes,created_by_name,voided,voided_by_name,void_reason,created_at').eq('invoice_id', id).order('paid_at', { ascending: false }),
      supabase.from('invoice_items').select('id,line_type,description,qty,unit_price,amount,cost,part_source,taxable,mechanic_id,commission_pct,done,sort_order').eq('invoice_id', id).order('sort_order', { ascending: true }),
      supabase.from('invoice_credits').select('id,credit_number,amount,reason,created_by_name,created_at').eq('invoice_id', id).order('created_at', { ascending: false }),
      invoice.client_id
        ? supabase.from('clients').select('id,name,billing_address_line,city,state,zip,phone,email').eq('id', invoice.client_id).maybeSingle()
        : Promise.resolve({ data: null }),
      invoice.shop_id
        ? supabase.from('shops').select('id,name,legal_name,ein,sales_tax_certificate,billing_address_line,city,state,zip,phone,email,logo_url').eq('id', invoice.shop_id).maybeSingle()
        : Promise.resolve({ data: null }),
      invoice.truck_id
        ? supabase.from('trucks').select('id,unit_number,plate,make,model,year,vin').eq('id', invoice.truck_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    return NextResponse.json({
      invoice,
      payments: payments ?? [],
      items: items ?? [],
      credits: credits ?? [],
      client: (clientRes as any).data ?? null,
      shop: (shopRes as any).data ?? null,
      truck: (truckRes as any).data ?? null,
    });
  } catch (err) {
    const authResp = authErrorResponse(err);
    if (authResp) return authResp;
    throw err;
  }
}

// PATCH /api/facturas/[id] → editar campos de la factura (no recalcula totales)
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await requireInvoicesAccess();
    const { id } = await params;
    const body = await request.json();

    const payload: Record<string, unknown> = {};
    if (body.due_date !== undefined) payload.due_date = body.due_date || null;
    if (body.issue_date !== undefined && body.issue_date) payload.issue_date = body.issue_date;
    if (body.payment_method !== undefined && PAYMENT_METHODS.includes(body.payment_method)) payload.payment_method = body.payment_method;
    if (body.description !== undefined) payload.description = String(body.description).trim() || null;
    if (body.notes !== undefined) payload.notes = String(body.notes).trim() || null;
    // Seguro: metadata editable incluso después de emitir (no toca montos).
    if (body.insurance_company !== undefined) payload.insurance_company = String(body.insurance_company).trim() || null;
    if (body.insurance_claim !== undefined) payload.insurance_claim = String(body.insurance_claim).trim() || null;
    if (body.insurance_status !== undefined) {
      payload.insurance_status = INSURANCE_STATUSES.includes(body.insurance_status) ? body.insurance_status : null;
    }
    // Anular (void): solo cambio de estado, no toca montos.
    if (body.status === 'void') payload.status = 'void';

    if (Object.keys(payload).length === 0) return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });

    const { data, error } = await supabase.from('invoices').update(payload).eq('id', id).select(INVOICE_COLS).single();
    if (error) return NextResponse.json({ error: sanitizeDbError('facturas/[id].PATCH', error.message) }, { status: 500 });

    return NextResponse.json({ ok: true, invoice: data });
  } catch (err) {
    const authResp = authErrorResponse(err);
    if (authResp) return authResp;
    throw err;
  }
}

// PUT /api/facturas/[id] → editar un BORRADOR por completo (campos + renglones +
// mecánicos), recalculando totales. Solo en borradores: aún no tocan inventario
// ni planilla, así que reemplazar todo es seguro (eso pasa al EMITIR). Una factura
// ya emitida no se edita aquí (se anula/reversa por el flujo fiscal).
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await requireInvoicesAccess();
    const { id } = await params;
    const body = await request.json();

    const { data: existing } = await supabase.from('invoices').select('id,status,document_type').eq('id', id).maybeSingle();
    if (!existing) return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
    if (existing.status !== 'draft') return NextResponse.json({ error: 'Solo se puede editar un borrador. Una factura emitida se anula, no se edita.' }, { status: 400 });

    const payment_method = PAYMENT_METHODS.includes(body.payment_method) ? body.payment_method : 'cash';

    // Datos del taller (tasa para el tax automático).
    let shop: { id: string; tax_rate: number } | null = null;
    if (body.shop_id) {
      const { data } = await supabase.from('shops').select('id,tax_rate').eq('id', body.shop_id).maybeSingle();
      if (data) shop = data as any;
    }

    // Enlace a orden de trabajo (igual que en POST): la factura hereda el número.
    let work_report_id: string | null = body.work_report_id || null;
    let order_number: string | null = String(body.order_number ?? '').trim() || null;
    if (work_report_id) {
      const { data: wr } = await supabase.from('work_reports').select('id,external_order_number').eq('id', work_report_id).maybeSingle();
      if (wr) order_number = (wr as any).external_order_number ?? order_number;
      else work_report_id = null;
    }

    // Exención por certificado del cliente registrado.
    let clientExempt = false;
    let clientExemptCert: string | null = null;
    if (body.client_id) {
      const { data: cli } = await supabase.from('clients').select('tax_exempt,tax_exempt_certificate').eq('id', body.client_id).maybeSingle();
      if (cli?.tax_exempt) { clientExempt = true; clientExemptCert = (cli as any).tax_exempt_certificate ?? null; }
    }

    // Renglones + asignaciones (mismo formato que POST).
    const rawItems: any[] = Array.isArray(body.items) ? body.items : [];
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
        mechanic_id: assigns[0]?.employee_id ?? null,
        commission_pct: assigns[0] ? assigns[0].commission_pct : 0,
        done: Boolean(it.done),
        sort_order: idx,
      };
    });

    const subtotal = items.length ? round2(items.reduce((s, it) => s + it.amount, 0)) : round2(body.subtotal);
    const taxableBase = round2(items.filter(it => it.taxable).reduce((s, it) => s + it.amount, 0));
    const autoTax = shop && items.length && body.tax_override !== true && !clientExempt;
    const tax_amount = clientExempt ? 0 : (autoTax ? computeAutoTax(taxableBase, shop!.tax_rate) : round2(body.tax_amount));
    const discount = round2(body.discount);
    const total = round2(subtotal + tax_amount - discount);
    if (total <= 0) return NextResponse.json({ error: 'El total de la factura debe ser mayor a $0.' }, { status: 400 });

    // El borrador no tiene pagos; saldo = total, estado = draft.
    const derived = deriveBalanceStatus(total, 0);

    const payload = {
      shop_id: body.shop_id || null,
      client_id: body.client_id || null,
      customer_name: !body.client_id ? (String(body.customer_name ?? '').trim() || null) : null,
      customer_company: !body.client_id ? (String(body.customer_company ?? '').trim() || null) : null,
      customer_phone: !body.client_id ? (String(body.customer_phone ?? '').trim() || null) : null,
      customer_truck: !body.client_id ? (String(body.customer_truck ?? '').trim() || null) : null,
      insurance_company: String(body.insurance_company ?? '').trim() || null,
      insurance_claim: String(body.insurance_claim ?? '').trim() || null,
      location_id: body.location_id || null,
      truck_id: body.truck_id || null,
      work_report_id,
      order_number,
      issue_date: body.issue_date || new Date().toISOString().slice(0, 10),
      due_date: body.due_date || null,
      payment_method,
      subtotal, tax_amount, discount, total,
      tax_exempt: clientExempt,
      tax_exempt_certificate: clientExempt ? clientExemptCert : null,
      amount_paid: 0, balance: derived.balance, status: 'draft',
      description: String(body.description ?? '').trim() || null,
    };

    const { data: invoice, error } = await supabase.from('invoices').update(payload).eq('id', id).select(INVOICE_COLS).single();
    if (error) return NextResponse.json({ error: sanitizeDbError('facturas/[id].PUT', error.message) }, { status: 500 });

    // Reemplazar renglones (cascade borra sus asignaciones) y reinsertarlos.
    await supabase.from('invoice_items').delete().eq('invoice_id', id);
    if (items.length) {
      const rows = items.map(it => ({ ...it, invoice_id: id }));
      const { data: itRows, error: itErr } = await supabase.from('invoice_items').insert(rows).select('id,sort_order');
      if (itErr) return NextResponse.json({ error: sanitizeDbError('facturas/[id].PUT.items', itErr.message) }, { status: 500 });
      const itemByIdx: Record<number, string> = {};
      for (const r of (itRows ?? [])) itemByIdx[r.sort_order] = r.id;
      const asgRows: any[] = [];
      for (const [idxStr, assigns] of Object.entries(assignmentsByIdx)) {
        const itemId = itemByIdx[Number(idxStr)];
        if (!itemId) continue;
        assigns.forEach((a, i) => asgRows.push({ invoice_item_id: itemId, employee_id: a.employee_id, commission_pct: a.commission_pct, sort_order: i }));
      }
      if (asgRows.length) {
        const { error: asgErr } = await supabase.from('invoice_item_assignments').insert(asgRows);
        if (asgErr) return NextResponse.json({ error: sanitizeDbError('facturas/[id].PUT.assignments', asgErr.message) }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, invoice });
  } catch (err) {
    const authResp = authErrorResponse(err);
    if (authResp) return authResp;
    throw err;
  }
}

// DELETE /api/facturas/[id] → eliminar factura (cascade a sus pagos)
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await requireInvoicesAccess();
    const { id } = await params;
    const { error } = await supabase.from('invoices').delete().eq('id', id);
    if (error) return NextResponse.json({ error: sanitizeDbError('facturas/[id].DELETE', error.message) }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const authResp = authErrorResponse(err);
    if (authResp) return authResp;
    throw err;
  }
}
