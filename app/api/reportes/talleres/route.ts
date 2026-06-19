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

    // Agregar por taller.
    type Row = { id: string | null; name: string; business_code: string | null; facturado: number; sales_tax: number; costo_piezas: number; ganancia_piezas: number; cobrado: number; por_cobrar: number; num_facturas: number };
    const byShop = new Map<string, Row>();
    const shopMeta = new Map<string, any>((shops ?? []).map((s: any) => [s.id, s]));
    const ensure = (shopId: string | null): Row => {
      const key = shopId ?? '__none__';
      if (!byShop.has(key)) {
        const meta = shopId ? shopMeta.get(shopId) : null;
        byShop.set(key, {
          id: shopId, name: meta?.legal_name || meta?.name || (shopId ? 'Taller' : 'Sin taller'),
          business_code: meta?.business_code ?? null,
          facturado: 0, sales_tax: 0, costo_piezas: 0, ganancia_piezas: 0, cobrado: 0, por_cobrar: 0, num_facturas: 0,
        });
      }
      return byShop.get(key)!;
    };

    for (const inv of invList) {
      const r = ensure(inv.shop_id);
      r.facturado = round2(r.facturado + Number(inv.total));
      r.sales_tax = round2(r.sales_tax + Number(inv.tax_amount));
      r.costo_piezas = round2(r.costo_piezas + (costByInvoice[inv.id] ?? 0));
      r.ganancia_piezas = round2(r.ganancia_piezas + (profitByInvoice[inv.id] ?? 0));
      r.cobrado = round2(r.cobrado + Number(inv.amount_paid));
      r.por_cobrar = round2(r.por_cobrar + Number(inv.balance));
      r.num_facturas += 1;
    }

    const rows = Array.from(byShop.values()).sort((a, b) => (a.business_code ?? '').localeCompare(b.business_code ?? ''));
    const totals = rows.reduce((t, r) => ({
      facturado: round2(t.facturado + r.facturado),
      sales_tax: round2(t.sales_tax + r.sales_tax),
      costo_piezas: round2(t.costo_piezas + r.costo_piezas),
      ganancia_piezas: round2(t.ganancia_piezas + r.ganancia_piezas),
      cobrado: round2(t.cobrado + r.cobrado),
      por_cobrar: round2(t.por_cobrar + r.por_cobrar),
      num_facturas: t.num_facturas + r.num_facturas,
    }), { facturado: 0, sales_tax: 0, costo_piezas: 0, ganancia_piezas: 0, cobrado: 0, por_cobrar: 0, num_facturas: 0 });

    return NextResponse.json({ from, to, shops: rows, totals });
  } catch (err) {
    const authResp = authErrorResponse(err);
    if (authResp) return authResp;
    throw err;
  }
}
