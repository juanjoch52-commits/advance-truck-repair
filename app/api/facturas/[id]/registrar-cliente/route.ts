import { NextResponse } from 'next/server';
import { requireInvoicesAccess, INVOICE_COLS } from '@/lib/invoicesApi';
import { sanitizeDbError } from '@/lib/clientsApi';
import { authErrorResponse } from '@/lib/apiAuth';

// POST /api/facturas/[id]/registrar-cliente → convierte el cliente OCASIONAL de
// esta factura en un cliente registrado del CRM: crea el cliente (nombre/empresa/
// teléfono), su camión si se anotó (texto → unit_number) y enlaza la factura
// (client_id + truck_id). Así el walk-in que vuelve ya tiene ficha e historial.
// Los datos customer_* de la factura se conservan como snapshot histórico.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await requireInvoicesAccess();
    const { id } = await params;

    const { data: invoice, error } = await supabase.from('invoices').select(INVOICE_COLS).eq('id', id).maybeSingle();
    if (error) return NextResponse.json({ error: sanitizeDbError('facturas/registrar-cliente.GET', error.message) }, { status: 500 });
    if (!invoice) return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
    if (invoice.client_id) return NextResponse.json({ error: 'Esta factura ya tiene un cliente registrado.' }, { status: 400 });

    const personName = String(invoice.customer_name ?? '').trim();
    const company = String(invoice.customer_company ?? '').trim();
    if (!personName && !company) return NextResponse.json({ error: 'La factura no tiene nombre de cliente ocasional.' }, { status: 400 });

    // Nombre de la ficha: la empresa si existe (cliente corporativo), si no la persona.
    const clientName = company || personName;

    // Evitar duplicado exacto por nombre: si ya existe, se reutiliza esa ficha.
    const { data: existing } = await supabase.from('clients').select('id,name').ilike('name', clientName).limit(1).maybeSingle();
    let clientId: string;
    let reused = false;
    if (existing) {
      clientId = existing.id;
      reused = true;
    } else {
      const { data: created, error: cliErr } = await supabase.from('clients').insert({
        name: clientName,
        client_type: company ? 'corporate' : 'individual',
        contact_name: company && personName && personName !== company ? personName : null,
        phone: String(invoice.customer_phone ?? '').trim() || null,
        default_payment_method: invoice.payment_method === 'credit' ? 'credit' : 'cash',
        notes: 'Registrado desde factura de cliente ocasional.',
        is_active: true,
      }).select('id').single();
      if (cliErr) return NextResponse.json({ error: sanitizeDbError('facturas/registrar-cliente.client', cliErr.message) }, { status: 500 });
      clientId = created.id;
    }

    // Camión: el texto libre anotado en la factura pasa a ser una unidad del cliente.
    let truckId: string | null = null;
    const truckText = String(invoice.customer_truck ?? '').trim();
    if (truckText) {
      const { data: existingTruck } = await supabase.from('trucks')
        .select('id').eq('client_id', clientId).ilike('unit_number', truckText).limit(1).maybeSingle();
      if (existingTruck) {
        truckId = existingTruck.id;
      } else {
        const { data: truck } = await supabase.from('trucks')
          .insert({ client_id: clientId, unit_number: truckText, is_active: true })
          .select('id').single();
        truckId = truck?.id ?? null;
      }
    }

    // Enlazar la factura a la ficha (conservando los customer_* como snapshot).
    const { data: updated, error: upErr } = await supabase.from('invoices')
      .update({ client_id: clientId, truck_id: truckId })
      .eq('id', id).select(INVOICE_COLS).single();
    if (upErr) return NextResponse.json({ error: sanitizeDbError('facturas/registrar-cliente.update', upErr.message) }, { status: 500 });

    return NextResponse.json({ ok: true, client_id: clientId, truck_id: truckId, reused, invoice: updated }, { status: 201 });
  } catch (err) {
    const authResp = authErrorResponse(err);
    if (authResp) return authResp;
    throw err;
  }
}
