import { NextResponse } from 'next/server';
import { requireInvoicesAccess, INVOICE_COLS, PAYMENT_METHODS, round2, deriveBalanceStatus } from '@/lib/invoicesApi';
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
    const withNames = (invoices ?? []).map((i: any) => ({ ...i, client_name: i.client_id ? (nameById[i.client_id] ?? null) : null }));

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

    // Renglones opcionales (mano de obra / piezas / cargos). Si vienen, el
    // subtotal se calcula a partir de ellos (si no, se usa el subtotal plano).
    const rawItems: any[] = Array.isArray(body.items) ? body.items : [];
    const items = rawItems.map((it: any, idx: number) => {
      const qty = round2(it.qty ?? 1) || 1;
      const unit_price = round2(it.unit_price);
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
        sort_order: idx,
      };
    });

    const subtotal = items.length
      ? round2(items.reduce((s, it) => s + it.amount, 0))
      : round2(body.subtotal);
    const tax_amount = round2(body.tax_amount);
    const discount = round2(body.discount);
    const total = round2(subtotal + tax_amount - discount);
    if (total <= 0) return NextResponse.json({ error: 'El total de la factura debe ser mayor a $0.' }, { status: 400 });

    // Numeración: usa lo que envíe el usuario; si viene vacío, autogenera con el
    // prefijo del taller (si hay) + correlativo simple basado en el conteo.
    let document_number = String(body.document_number ?? '').trim();
    if (!document_number) {
      const { count } = await supabase.from('invoices').select('id', { count: 'exact', head: true });
      let prefix = 'INV-';
      if (body.shop_id) {
        const { data: shop } = await supabase.from('shops').select('invoice_prefix,next_invoice_number').eq('id', body.shop_id).maybeSingle();
        if (shop?.invoice_prefix) prefix = shop.invoice_prefix;
      }
      document_number = `${prefix}${(count ?? 0) + 1}`;
    }

    // Crédito (préstamo) → factura abierta, sin pago. Otros métodos → opción de
    // marcarla pagada de una vez (mark_paid).
    const markPaid = payment_method !== 'credit' && body.mark_paid === true;
    const amount_paid = markPaid ? total : 0;
    const { balance, status } = deriveBalanceStatus(total, amount_paid);

    const payload = {
      shop_id: body.shop_id || null,
      client_id: body.client_id || null,
      location_id: body.location_id || null,
      document_number,
      issue_date: body.issue_date || new Date().toISOString().slice(0, 10),
      due_date: body.due_date || null,
      payment_method,
      status,
      subtotal, tax_amount, discount, total,
      amount_paid, balance,
      description: String(body.description ?? '').trim() || null,
      notes: String(body.notes ?? '').trim() || null,
      created_by: (session as any)?.id ?? null,
    };

    const { data: invoice, error } = await supabase.from('invoices').insert(payload).select(INVOICE_COLS).single();
    if (error) return NextResponse.json({ error: sanitizeDbError('facturas.POST', error.message) }, { status: 500 });

    // Si se marcó pagada, registrar el pago correspondiente.
    if (markPaid) {
      await supabase.from('invoice_payments').insert({
        invoice_id: invoice.id, amount: total, method: payment_method,
        reference: String(body.payment_reference ?? '').trim() || null,
        paid_at: payload.issue_date,
        created_by: (session as any)?.id ?? null,
      });
    }

    // Renglones + descuento de bodega para piezas que salen del inventario.
    if (items.length) {
      const rows = items.map(it => ({ ...it, invoice_id: invoice.id }));
      const { error: itErr } = await supabase.from('invoice_items').insert(rows);
      if (itErr) return NextResponse.json({ error: sanitizeDbError('facturas.POST.items', itErr.message) }, { status: 500 });

      for (const it of items) {
        if (it.line_type === 'part' && it.inventory_item_id && it.qty > 0) {
          // Salida de bodega: movimiento 'sale' (negativo) + baja de stock.
          await supabase.from('inventory_movements').insert({
            inventory_item_id: it.inventory_item_id,
            movement_type: 'sale',
            quantity: -it.qty,
            unit_cost: it.cost,
            invoice_id: invoice.id,
            created_by: (session as any)?.id ?? null,
          });
          const { data: invItem } = await supabase.from('inventory_items').select('quantity_on_hand').eq('id', it.inventory_item_id).maybeSingle();
          if (invItem) {
            await supabase.from('inventory_items')
              .update({ quantity_on_hand: round2(Number(invItem.quantity_on_hand) - it.qty) })
              .eq('id', it.inventory_item_id);
          }
        }
      }
    }

    return NextResponse.json({ ok: true, invoice }, { status: 201 });
  } catch (err) {
    const authResp = authErrorResponse(err);
    if (authResp) return authResp;
    throw err;
  }
}
