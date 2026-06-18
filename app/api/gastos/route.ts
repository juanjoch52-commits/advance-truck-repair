import { NextResponse } from 'next/server';
import { requireInventoryAccess, round2 } from '@/lib/inventoryApi';
import { sanitizeDbError } from '@/lib/clientsApi';
import { authErrorResponse } from '@/lib/apiAuth';

// GET /api/gastos?from=YYYY-MM-DD&to=YYYY-MM-DD → reporte de gastos de piezas.
// Modelo "compra + ganancia": el gasto se reconoce al COMPRAR (restock a bodega
// + piezas one-off compradas para un trabajo). La ganancia en piezas = cobrado −
// costo de las piezas en facturas. No se doble-cuenta (vender de bodega no es gasto nuevo).
export async function GET(request: Request) {
  try {
    const supabase = await requireInventoryAccess();
    const url = new URL(request.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');

    // 1) Facturas del período (excluye anuladas).
    let invQ = supabase.from('invoices').select('id,document_number,issue_date,client_id,status').neq('status', 'void');
    if (from) invQ = invQ.gte('issue_date', from);
    if (to) invQ = invQ.lte('issue_date', to);
    const { data: invoices, error: invErr } = await invQ;
    if (invErr) return NextResponse.json({ error: sanitizeDbError('gastos.invoices', invErr.message) }, { status: 500 });

    const invById: Record<string, any> = Object.fromEntries((invoices ?? []).map((i: any) => [i.id, i]));
    const invIds = Object.keys(invById);

    // 2) Renglones de pieza de esas facturas.
    let partLines: any[] = [];
    if (invIds.length) {
      const { data: items, error: itErr } = await supabase
        .from('invoice_items')
        .select('invoice_id,line_type,description,qty,unit_price,amount,cost,part_source')
        .in('invoice_id', invIds)
        .eq('line_type', 'part');
      if (itErr) return NextResponse.json({ error: sanitizeDbError('gastos.items', itErr.message) }, { status: 500 });
      partLines = items ?? [];
    }

    // 3) Compras a bodega (restock) en el período.
    let movQ = supabase.from('inventory_movements').select('quantity,unit_cost,created_at,inventory_item_id').eq('movement_type', 'purchase');
    if (from) movQ = movQ.gte('created_at', from);
    if (to) movQ = movQ.lte('created_at', to + 'T23:59:59');
    const { data: purchases, error: pErr } = await movQ;
    if (pErr) return NextResponse.json({ error: sanitizeDbError('gastos.purchases', pErr.message) }, { status: 500 });

    // Nombres de cliente.
    const clientIds = Array.from(new Set((invoices ?? []).map((i: any) => i.client_id).filter(Boolean)));
    let nameById: Record<string, string> = {};
    if (clientIds.length) {
      const { data: clients } = await supabase.from('clients').select('id,name').in('id', clientIds);
      nameById = Object.fromEntries((clients ?? []).map((c: any) => [c.id, c.name]));
    }

    // Agregados.
    const purchasesInventory = round2((purchases ?? []).reduce((s: number, m: any) => s + Number(m.quantity) * Number(m.unit_cost), 0));
    let purchasesOneOff = 0;
    let partsCharged = 0;
    let partsCost = 0;
    const byInvoice: Record<string, any> = {};

    for (const ln of partLines) {
      const lineCost = round2(Number(ln.cost) * Number(ln.qty));
      const charged = Number(ln.amount);
      partsCharged += charged;
      partsCost += lineCost;
      // Gasto one-off: piezas compradas para el trabajo (no de bodega).
      if (ln.part_source === 'new_purchased' || ln.part_source === 'used') purchasesOneOff += lineCost;

      const inv = invById[ln.invoice_id];
      if (!byInvoice[ln.invoice_id]) {
        byInvoice[ln.invoice_id] = {
          invoice_id: ln.invoice_id,
          document_number: inv?.document_number ?? null,
          issue_date: inv?.issue_date ?? null,
          client_name: inv?.client_id ? (nameById[inv.client_id] ?? '—') : 'Sin cliente',
          charged: 0, cost: 0, profit: 0,
        };
      }
      const b = byInvoice[ln.invoice_id];
      b.charged = round2(b.charged + charged);
      b.cost = round2(b.cost + lineCost);
      b.profit = round2(b.charged - b.cost);
    }

    const summary = {
      purchasesInventory,
      purchasesOneOff: round2(purchasesOneOff),
      totalPurchases: round2(purchasesInventory + purchasesOneOff),
      partsCharged: round2(partsCharged),
      partsCost: round2(partsCost),
      partsProfit: round2(partsCharged - partsCost),
    };

    const invoicesOut = Object.values(byInvoice).sort((a: any, b: any) => (b.issue_date ?? '').localeCompare(a.issue_date ?? ''));

    return NextResponse.json({ summary, invoices: invoicesOut });
  } catch (err) {
    const authResp = authErrorResponse(err);
    if (authResp) return authResp;
    throw err;
  }
}
