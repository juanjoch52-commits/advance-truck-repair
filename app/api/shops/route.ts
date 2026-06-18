import { NextResponse } from 'next/server';
import { requireShopsAccess, SHOP_COLS, buildShopPayload } from '@/lib/shopsApi';
import { sanitizeDbError } from '@/lib/clientsApi';
import { authErrorResponse } from '@/lib/apiAuth';

// GET /api/shops → lista de talleres (datos de facturación)
export async function GET() {
  try {
    const supabase = await requireShopsAccess();
    const { data, error } = await supabase
      .from('shops')
      .select(SHOP_COLS)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) return NextResponse.json({ error: sanitizeDbError('shops.GET', error.message) }, { status: 500 });
    return NextResponse.json({ shops: data ?? [] });
  } catch (err) {
    const authResp = authErrorResponse(err);
    if (authResp) return authResp;
    throw err;
  }
}

// POST /api/shops → crear taller
export async function POST(request: Request) {
  try {
    const supabase = await requireShopsAccess();
    const body = await request.json();
    const payload = buildShopPayload(body);
    if (!payload.name) return NextResponse.json({ error: 'El nombre del taller es requerido' }, { status: 400 });

    const { data, error } = await supabase
      .from('shops')
      .insert({ ...payload, is_active: body.is_active === false ? false : true })
      .select(SHOP_COLS)
      .single();
    if (error) return NextResponse.json({ error: sanitizeDbError('shops.POST', error.message) }, { status: 500 });

    return NextResponse.json({ ok: true, shop: data }, { status: 201 });
  } catch (err) {
    const authResp = authErrorResponse(err);
    if (authResp) return authResp;
    throw err;
  }
}
