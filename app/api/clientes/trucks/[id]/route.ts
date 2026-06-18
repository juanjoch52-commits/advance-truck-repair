import { NextResponse } from 'next/server';
import { requireClientsAccess, sanitizeDbError } from '@/lib/clientsApi';
import { authErrorResponse } from '@/lib/apiAuth';

const TRUCK_COLS =
  'id,client_id,location_id,unit_number,plate,make,model,year,vin,notes,is_active';

function parseYear(value: unknown): number | null {
  const n = parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n > 1900 && n < 2200 ? n : null;
}

// PATCH /api/clientes/trucks/[id]
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await requireClientsAccess();
    const { id } = await params;
    const body = await request.json();

    const payload: Record<string, unknown> = {};
    if (body.location_id !== undefined) payload.location_id = String(body.location_id).trim() || null;
    if (body.unit_number !== undefined) payload.unit_number = String(body.unit_number).trim() || null;
    if (body.plate !== undefined) payload.plate = String(body.plate).trim() || null;
    if (body.make !== undefined) payload.make = String(body.make).trim() || null;
    if (body.model !== undefined) payload.model = String(body.model).trim() || null;
    if (body.year !== undefined) payload.year = parseYear(body.year);
    if (body.vin !== undefined) payload.vin = String(body.vin).trim() || null;
    if (body.notes !== undefined) payload.notes = String(body.notes).trim() || null;
    if (body.is_active !== undefined) payload.is_active = Boolean(body.is_active);

    const { data, error } = await supabase.from('trucks').update(payload).eq('id', id).select(TRUCK_COLS).single();
    if (error) return NextResponse.json({ error: sanitizeDbError('trucks/[id].PATCH', error.message) }, { status: 500 });

    return NextResponse.json({ ok: true, truck: data });
  } catch (err) {
    const authResp = authErrorResponse(err);
    if (authResp) return authResp;
    throw err;
  }
}

// DELETE /api/clientes/trucks/[id]
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await requireClientsAccess();
    const { id } = await params;

    const { error } = await supabase.from('trucks').delete().eq('id', id);
    if (error) return NextResponse.json({ error: sanitizeDbError('trucks/[id].DELETE', error.message) }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const authResp = authErrorResponse(err);
    if (authResp) return authResp;
    throw err;
  }
}
