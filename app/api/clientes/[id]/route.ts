import { NextResponse } from 'next/server';
import { requireClientsAccess, sanitizeDbError } from '@/lib/clientsApi';
import { authErrorResponse } from '@/lib/apiAuth';

const CLIENT_COLS =
  'id,name,client_type,contact_name,phone,email,billing_address_line,city,state,zip,tax_id,default_payment_method,payment_terms_days,notes,is_active,created_at,updated_at';

// GET /api/clientes/[id] → cliente con sus distritos y camiones
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await requireClientsAccess();
    const { id } = await params;

    const { data: client, error } = await supabase.from('clients').select(CLIENT_COLS).eq('id', id).maybeSingle();
    if (error) return NextResponse.json({ error: sanitizeDbError('clientes/[id].GET', error.message) }, { status: 500 });
    if (!client) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });

    const [{ data: locations }, { data: trucks }] = await Promise.all([
      supabase.from('client_locations')
        .select('id,client_id,name,billing_address_line,city,state,zip,contact_name,phone,is_active')
        .eq('client_id', id).order('name', { ascending: true }),
      supabase.from('trucks')
        .select('id,client_id,location_id,unit_number,plate,make,model,year,vin,notes,is_active')
        .eq('client_id', id).order('unit_number', { ascending: true }),
    ]);

    return NextResponse.json({ client, locations: locations ?? [], trucks: trucks ?? [] });
  } catch (err) {
    const authResp = authErrorResponse(err);
    if (authResp) return authResp;
    throw err;
  }
}

// PATCH /api/clientes/[id] → actualizar cliente
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await requireClientsAccess();
    const { id } = await params;
    const body = await request.json();

    const payload: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 });
      payload.name = name;
    }
    if (body.client_type !== undefined) payload.client_type = body.client_type === 'individual' ? 'individual' : 'corporate';
    if (body.contact_name !== undefined) payload.contact_name = String(body.contact_name).trim() || null;
    if (body.phone !== undefined) payload.phone = String(body.phone).trim() || null;
    if (body.email !== undefined) payload.email = String(body.email).trim() || null;
    if (body.billing_address_line !== undefined) payload.billing_address_line = String(body.billing_address_line).trim() || null;
    if (body.city !== undefined) payload.city = String(body.city).trim() || null;
    if (body.state !== undefined) payload.state = String(body.state).trim() || null;
    if (body.zip !== undefined) payload.zip = String(body.zip).trim() || null;
    if (body.tax_id !== undefined) payload.tax_id = String(body.tax_id).trim() || null;
    if (body.default_payment_method !== undefined)
      payload.default_payment_method = ['cash', 'check', 'card', 'transfer', 'credit'].includes(body.default_payment_method)
        ? body.default_payment_method : 'cash';
    if (body.payment_terms_days !== undefined)
      payload.payment_terms_days = Math.max(0, parseInt(body.payment_terms_days, 10) || 0);
    if (body.notes !== undefined) payload.notes = String(body.notes).trim() || null;
    if (body.is_active !== undefined) payload.is_active = Boolean(body.is_active);

    const { data, error } = await supabase.from('clients').update(payload).eq('id', id).select(CLIENT_COLS).single();
    if (error) return NextResponse.json({ error: sanitizeDbError('clientes/[id].PATCH', error.message) }, { status: 500 });

    return NextResponse.json({ ok: true, client: data });
  } catch (err) {
    const authResp = authErrorResponse(err);
    if (authResp) return authResp;
    throw err;
  }
}

// DELETE /api/clientes/[id] → eliminar cliente (cascade a distritos/camiones;
// work_reports.client_id queda en null por on delete set null)
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await requireClientsAccess();
    const { id } = await params;

    const { error } = await supabase.from('clients').delete().eq('id', id);
    if (error) return NextResponse.json({ error: sanitizeDbError('clientes/[id].DELETE', error.message) }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const authResp = authErrorResponse(err);
    if (authResp) return authResp;
    throw err;
  }
}
