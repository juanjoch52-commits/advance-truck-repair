import { NextResponse } from 'next/server';
import { requireClientsAccess, sanitizeDbError } from '@/lib/clientsApi';
import { authErrorResponse } from '@/lib/apiAuth';

const CLIENT_COLS =
  'id,name,client_type,contact_name,phone,email,billing_address_line,city,state,zip,tax_id,default_payment_method,payment_terms_days,notes,is_active,created_at,updated_at';

// GET /api/clientes           → lista de clientes
// GET /api/clientes?tree=1    → clientes con sus distritos y camiones anidados
export async function GET(request: Request) {
  try {
    const supabase = await requireClientsAccess();
    const tree = new URL(request.url).searchParams.get('tree') === '1';

    const { data: clients, error } = await supabase
      .from('clients')
      .select(CLIENT_COLS)
      .order('name', { ascending: true });
    if (error) return NextResponse.json({ error: sanitizeDbError('clientes.GET', error.message) }, { status: 500 });

    if (!tree) return NextResponse.json({ clients: clients ?? [] });

    const [{ data: locations }, { data: trucks }] = await Promise.all([
      supabase.from('client_locations')
        .select('id,client_id,name,billing_address_line,city,state,zip,contact_name,phone,is_active')
        .order('name', { ascending: true }),
      supabase.from('trucks')
        .select('id,client_id,location_id,unit_number,plate,make,model,year,vin,notes,is_active')
        .order('unit_number', { ascending: true }),
    ]);

    const withTree = (clients ?? []).map((c: any) => ({
      ...c,
      locations: (locations ?? []).filter((l: any) => l.client_id === c.id),
      trucks: (trucks ?? []).filter((tk: any) => tk.client_id === c.id),
    }));

    return NextResponse.json({ clients: withTree });
  } catch (err) {
    const authResp = authErrorResponse(err);
    if (authResp) return authResp;
    throw err;
  }
}

// POST /api/clientes → crear cliente
export async function POST(request: Request) {
  try {
    const supabase = await requireClientsAccess();
    const body = await request.json();

    const name = String(body.name ?? '').trim();
    if (!name) return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 });

    const payload = {
      name,
      client_type: body.client_type === 'individual' ? 'individual' : 'corporate',
      contact_name: String(body.contact_name ?? '').trim() || null,
      phone: String(body.phone ?? '').trim() || null,
      email: String(body.email ?? '').trim() || null,
      billing_address_line: String(body.billing_address_line ?? '').trim() || null,
      city: String(body.city ?? '').trim() || null,
      state: String(body.state ?? '').trim() || null,
      zip: String(body.zip ?? '').trim() || null,
      tax_id: String(body.tax_id ?? '').trim() || null,
      default_payment_method: ['cash', 'check', 'card', 'transfer', 'credit'].includes(body.default_payment_method)
        ? body.default_payment_method : 'cash',
      payment_terms_days: Number.isFinite(Number(body.payment_terms_days)) ? Math.max(0, parseInt(body.payment_terms_days, 10) || 0) : 0,
      notes: String(body.notes ?? '').trim() || null,
      is_active: body.is_active === false ? false : true,
    };

    const { data, error } = await supabase.from('clients').insert(payload).select(CLIENT_COLS).single();
    if (error) return NextResponse.json({ error: sanitizeDbError('clientes.POST', error.message) }, { status: 500 });

    return NextResponse.json({ ok: true, client: data }, { status: 201 });
  } catch (err) {
    const authResp = authErrorResponse(err);
    if (authResp) return authResp;
    throw err;
  }
}
