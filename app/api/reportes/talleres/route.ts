import { NextResponse } from 'next/server';
import { requireShopsAccess } from '@/lib/shopsApi';
import { round2 } from '@/lib/invoicesApi';
import { sanitizeDbError } from '@/lib/clientsApi';
import { authErrorResponse } from '@/lib/apiAuth';

// GET /api/reportes/talleres?from=YYYY-MM-DD&to=YYYY-MM-DD
// Resumen financiero por taller (negocio) en un periodo: facturado, sales tax
// cobrado, cobrado/por cobrar, ganancia en piezas y # de facturas.
// Solo cuenta FACTURAS fiscales no anuladas/borrador. NO incluye el costo de
// mano de obra repartido entre talleres (eso es el esquema intercompany,
// pendiente de validación del CPA).
export async function GET(request: Request) {
  try {
    const supabase = await requireShopsAccess();
    const url = new URL(request.url);
    const today = new Date().toISOString().slice(0, 10);
    const from = url.searchParams.get('from') || today.slice(0, 8) + '01';
    const to = url.searchParams.get('to') || today;

    const { data: shops, error: shopErr } = await supabase
      .from('shops').select('id,name,legal_name,business_code').order('sort_order');
    if (shopErr) return NextResponse.json({ error: sanitizeDbError('reportes/talleres.shops', shopErr.message) }, { status: 500 });

    const { data: invoices, error: invErr } = await supabase
      .from('invoices')
      .select('id,shop_id,total,tax_amount,subtotal,discount,amount_paid,balance')
      .eq('document_type', 'invoice')
      .not('status', 'in', '("void","draft")')
      .gte('issue_date', from)
      .lte('issue_date', to);
    if (invErr) return NextResponse.json({ error: sanitizeDbError('reportes/talleres.invoices', invErr.message) }, { status: 500 });

    const invList = invoices ?? [];
    const invIds = invList.map((i: any) => i.id);

    // Piezas por factura: costo (gasto atribuible al taller) y ganancia (cobrado − costo).
    const profitByInvoice: Record<string, number> = {};
    const costByInvoice: Record<string, number> = {};
    if (invIds.length) {
      const { data: items } = await supabase
        .from('invoice_items').select('invoice_id,line_type,amount,cost,qty').in('invoice_id', invIds);
      for (const it of items ?? []) {
        if (it.line_type !== 'part') continue;
        const cost = round2(Number(it.cost) * Number(it.qty));
        profitByInvoice[it.invoice_id] = round2((profitByInvoice[it.invoice_id] ?? 0) + (Number(it.amount) - cost));
        costByInvoice[it.invoice_id] = round2((costByInvoice[it.invoice_id] ?? 0) + cost);
      }
    }

    // Taller que absorbe TODO el costo de piezas: el papá (business_code '01').
    // Decisión del dueño: las compras/costos de piezas se cargan al papá; los dos
    // negocios se ajustan entre ellos (préstamo) FUERA del sistema. Si no hay un
    // taller con código '01', el costo se atribuye por factura (respaldo).
    const papaShopId = (shops ?? []).find((s: any) => s.business_code === '01')?.id ?? null;

    // Agregar por taller. Ingresos/cobros por taller que emite; costo de piezas
    // centralizado en el papá. ganancia_piezas por-taller no aplica (queda en total).
    type Row = { id: string | null; name: string; business_code: string | null; facturado: number; sales_tax: number; costo_piezas: number; cobrado: number; por_cobrar: number; num_facturas: number };
    const byShop = new Map<string, Row>();
    const shopMeta = new Map<string, any>((shops ?? []).map((s: any) => [s.id, s]));
    const ensure = (shopId: string | null): Row => {
      const key = shopId ?? '__none__';
      if (!byShop.has(key)) {
        const meta = shopId ? shopMeta.get(shopId) : null;
        byShop.set(key, {
          id: shopId, name: meta?.legal_name || meta?.name || (shopId ? 'Taller' : 'Sin taller'),
          business_code: meta?.business_code ?? null,
          facturado: 0, sales_tax: 0, costo_piezas: 0, cobrado: 0, por_cobrar: 0, num_facturas: 0,
        });
      }
      return byShop.get(key)!;
    };

    let totalPartsCost = 0;
    let totalPartsProfit = 0;
    for (const inv of invList) {
      const r = ensure(inv.shop_id);
      r.facturado = round2(r.facturado + Number(inv.total));
      r.sales_tax = round2(r.sales_tax + Number(inv.tax_amount));
      r.cobrado = round2(r.cobrado + Number(inv.amount_paid));
      r.por_cobrar = round2(r.por_cobrar + Number(inv.balance));
      r.num_facturas += 1;
      const cost = costByInvoice[inv.id] ?? 0;
      totalPartsCost = round2(totalPartsCost + cost);
      totalPartsProfit = round2(totalPartsProfit + (profitByInvoice[inv.id] ?? 0));
      if (!papaShopId) r.costo_piezas = round2(r.costo_piezas + cost); // respaldo: por factura
    }
    if (papaShopId) ensure(papaShopId).costo_piezas = totalPartsCost; // todo el costo al papá

    const rows = Array.from(byShop.values()).sort((a, b) => (a.business_code ?? '').localeCompare(b.business_code ?? ''));
    const totals = {
      facturado: round2(rows.reduce((s, r) => s + r.facturado, 0)),
      sales_tax: round2(rows.reduce((s, r) => s + r.sales_tax, 0)),
      costo_piezas: totalPartsCost,
      ganancia_piezas: totalPartsProfit,
      cobrado: round2(rows.reduce((s, r) => s + r.cobrado, 0)),
      por_cobrar: round2(rows.reduce((s, r) => s + r.por_cobrar, 0)),
      num_facturas: rows.reduce((s, r) => s + r.num_facturas, 0),
    };

    return NextResponse.json({ from, to, papa_shop_id: papaShopId, shops: rows, totals });
  } catch (err) {
    const authResp = authErrorResponse(err);
    if (authResp) return authResp;
    throw err;
  }
}
