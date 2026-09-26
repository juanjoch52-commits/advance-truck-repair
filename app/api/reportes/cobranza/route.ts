import { NextResponse } from 'next/server';
import { round2 } from '@/lib/invoicesApi';
import { sanitizeDbError } from '@/lib/clientsApi';
import { authErrorResponse, requireRole, shopScopeFor } from '@/lib/apiAuth';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

// GET /api/reportes/cobranza?from=YYYY-MM-DD&to=YYYY-MM-DD&shop_id=...
// Reporte de COBRANZA: pagos recibidos en un periodo, para cuadrar la caja.
// Totales por método (efectivo/cheque/tarjeta/depósito) y por tipo
// (abono/adelanto/liquidación), más el detalle de cada pago.
// Excluye pagos anulados. Un pago se ata a un taller por la factura (shop_id).
//
// SEGURIDAD: middleware deja pasar /api/reportes/* sin cookie, así que el
// requireRole aquí es la ÚNICA barrera. owner/admin/super_user ven todo (con
// filtro opcional por taller); la contable queda limitada a SU taller.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  try {
    const session = await requireRole('owner', 'admin', 'super_user', 'contable');
    const supabase = getSupabaseServerClient();
    const shopScope = shopScopeFor(session); // contable → su shop_id; otros → null

    const url = new URL(request.url);
    const today = new Date().toISOString().slice(0, 10);
    const from = ISO_DATE.test(url.searchParams.get('from') ?? '') ? url.searchParams.get('from')! : today.slice(0, 8) + '01';
    const to = ISO_DATE.test(url.searchParams.get('to') ?? '') ? url.searchParams.get('to')! : today;
    // Filtro de taller: la contable lo tiene forzado; los demás, opcional.
    const shopFilter = shopScope ?? (url.searchParams.get('shop_id') || null);

    // 1) Pagos del periodo (se excluyen anulados en JS por compatibilidad con
    //    filas viejas cuyo `voided` pudiera ser null).
    const { data: rawPayments, error: payErr } = await supabase
      .from('invoice_payments')
      .select('id,invoice_id,amount,method,payment_type,receipt_number,reference,paid_at,notes,created_by_name,voided')
      .gte('paid_at', from)
      .lte('paid_at', to)
      .order('paid_at', { ascending: false });
    if (payErr) return NextResponse.json({ error: sanitizeDbError('cobranza.payments', payErr.message) }, { status: 500 });
    const payments = (rawPayments ?? []).filter((p: any) => !p.voided);

    // 2) Facturas de esos pagos (para taller, número de documento y cliente).
    const invoiceIds = Array.from(new Set(payments.map((p: any) => p.invoice_id).filter(Boolean)));
    let invById: Record<string, any> = {};
    if (invoiceIds.length) {
      const { data: invs, error: invErr } = await supabase
        .from('invoices')
        .select('id,shop_id,document_number,client_id,customer_name,customer_company')
        .in('id', invoiceIds);
      if (invErr) return NextResponse.json({ error: sanitizeDbError('cobranza.invoices', invErr.message) }, { status: 500 });
      invById = Object.fromEntries((invs ?? []).map((i: any) => [i.id, i]));
    }

    // 3) Nombres de cliente.
    const clientIds = Array.from(new Set(Object.values(invById).map((i: any) => i.client_id).filter(Boolean)));
    let nameById: Record<string, string> = {};
    if (clientIds.length) {
      const { data: clients } = await supabase.from('clients').select('id,name').in('id', clientIds);
      nameById = Object.fromEntries((clients ?? []).map((c: any) => [c.id, c.name]));
    }

    // 4) Armar filas + totales, aplicando el filtro de taller.
    const byMethod: Record<string, { total: number; count: number }> = {};
    const byType: Record<string, { total: number; count: number }> = {};
    let total = 0;
    const rows: any[] = [];
    for (const p of payments) {
      const inv = invById[p.invoice_id] ?? null;
      if (shopFilter && (inv?.shop_id ?? null) !== shopFilter) continue;
      const clientName = (inv?.client_id ? nameById[inv.client_id] : null) || inv?.customer_name || inv?.customer_company || '—';
      const amount = Number(p.amount);
      total = round2(total + amount);
      const m = p.method || 'cash';
      const ty = p.payment_type || 'deposit';
      byMethod[m] = { total: round2((byMethod[m]?.total ?? 0) + amount), count: (byMethod[m]?.count ?? 0) + 1 };
      byType[ty] = { total: round2((byType[ty]?.total ?? 0) + amount), count: (byType[ty]?.count ?? 0) + 1 };
      rows.push({
        id: p.id,
        paid_at: p.paid_at,
        receipt_number: p.receipt_number,
        document_number: inv?.document_number ?? null,
        invoice_id: p.invoice_id,
        client: clientName,
        method: m,
        payment_type: ty,
        amount,
        reference: p.reference,
        created_by_name: p.created_by_name,
      });
    }

    // Impuesto (sales tax) RECOLECTADO en el periodo. Mismo criterio que
    // /reporte-talleres: facturas fiscales emitidas (no anuladas/borrador) por
    // fecha de emisión, para que la cifra coincida entre reportes. Scoped por taller.
    let taxQuery = supabase
      .from('invoices')
      .select('tax_amount,total,shop_id')
      .eq('document_type', 'invoice')
      .not('status', 'in', '("void","draft")')
      .gte('issue_date', from)
      .lte('issue_date', to);
    if (shopFilter) taxQuery = taxQuery.eq('shop_id', shopFilter);
    const { data: taxInvs, error: taxErr } = await taxQuery;
    if (taxErr) return NextResponse.json({ error: sanitizeDbError('cobranza.tax', taxErr.message) }, { status: 500 });
    let salesTax = 0, invoicedTotal = 0, invoicedCount = 0;
    for (const i of taxInvs ?? []) {
      salesTax = round2(salesTax + Number(i.tax_amount));
      invoicedTotal = round2(invoicedTotal + Number(i.total));
      invoicedCount += 1;
    }

    return NextResponse.json({
      from, to,
      shop_filter: shopFilter,
      total,
      count: rows.length,
      by_method: byMethod,
      by_type: byType,
      rows,
      sales_tax: salesTax,
      invoiced_total: invoicedTotal,
      invoiced_count: invoicedCount,
    });
  } catch (err) {
    const authResp = authErrorResponse(err);
    if (authResp) return authResp;
    throw err;
  }
}
