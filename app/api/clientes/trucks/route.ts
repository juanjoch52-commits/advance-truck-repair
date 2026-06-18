import { NextResponse } from 'next/server';
import { requireClientsAccess, sanitizeDbError } from '@/lib/clientsApi';
import { authErrorResponse } from '@/lib/apiAuth';

const TRUCK_COLS =
  'id,client_id,location_id,unit_number,plate,make,model,year,vin,notes,is_active';

function parseYear(value: unknown): number | null {
  const n = parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n > 1900 && n < 2200 ? n : null;
}

// POST /api/clientes/trucks → crear camión / unidad
export async function POST(request: Request) {
  try {
    const supabase = await requireClientsAccess();
    const body = await request.json();

    const client_id = String(body.client_id ?? '').trim();
    if (!client_id) return NextResponse.json({ error: 'client_id es requerido' }, { status: 400 });

    const payload = {
      client_id,
      location_id: String(body.location_id ?? '').trim() || null,
      unit_number: String(body.unit_number ?? '').trim() || null,
      plate: String(body.plate ?? '').trim() || null,
      make: String(body.make ?? '').trim() || null,
      model: String(body.model ?? '').trim() || null,
      year: parseYear(body.year),
      vin: String(body.vin ?? '').trim() || null,
      notes: String(body.notes ?? '').trim() || null,
      is_active: body.is_active === false ? false : true,
    };

    const { data, error } = await supabase.from('trucks').insert(payload).select(TRUCK_COLS).single();
    if (error) return NextResponse.json({ error: sanitizeDbError('trucks.POST', error.message) }, { status: 500 });

    return NextResponse.json({ ok: true, truck: data }, { status: 201 });
  } catch (err) {
    const authResp = authErrorResponse(err);
    if (authResp) return authResp;
    throw err;
  }
}
