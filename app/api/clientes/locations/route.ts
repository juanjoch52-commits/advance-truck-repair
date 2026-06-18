import { NextResponse } from 'next/server';
import { requireClientsAccess, sanitizeDbError } from '@/lib/clientsApi';
import { authErrorResponse } from '@/lib/apiAuth';

const LOCATION_COLS =
  'id,client_id,name,billing_address_line,city,state,zip,contact_name,phone,is_active';

// POST /api/clientes/locations → crear distrito / sucursal
export async function POST(request: Request) {
  try {
    const supabase = await requireClientsAccess();
    const body = await request.json();

    const client_id = String(body.client_id ?? '').trim();
    const name = String(body.name ?? '').trim();
    if (!client_id) return NextResponse.json({ error: 'client_id es requerido' }, { status: 400 });
    if (!name) return NextResponse.json({ error: 'El nombre del distrito es requerido' }, { status: 400 });

    const payload = {
      client_id,
      name,
      billing_address_line: String(body.billing_address_line ?? '').trim() || null,
      city: String(body.city ?? '').trim() || null,
      state: String(body.state ?? '').trim() || null,
      zip: String(body.zip ?? '').trim() || null,
      contact_name: String(body.contact_name ?? '').trim() || null,
      phone: String(body.phone ?? '').trim() || null,
      is_active: body.is_active === false ? false : true,
    };

    const { data, error } = await supabase.from('client_locations').insert(payload).select(LOCATION_COLS).single();
    if (error) return NextResponse.json({ error: sanitizeDbError('locations.POST', error.message) }, { status: 500 });

    return NextResponse.json({ ok: true, location: data }, { status: 201 });
  } catch (err) {
    const authResp = authErrorResponse(err);
    if (authResp) return authResp;
    throw err;
  }
}
