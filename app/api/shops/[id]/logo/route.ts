import { NextResponse } from 'next/server';
import { requireRole, authErrorResponse } from '@/lib/apiAuth';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { sanitizeDbError } from '@/lib/clientsApi';

const ALLOWED = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

// POST /api/shops/[id]/logo  (multipart, campo "file") → sube el logo al bucket
// shop-logos y guarda la URL pública en shops.logo_url.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole('owner', 'super_user');
    const supabase = getSupabaseServerClient();
    const { id } = await params;

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'No se recibió ningún archivo.' }, { status: 400 });
    if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: 'Formato no permitido (usa PNG, JPG o WEBP).' }, { status: 400 });
    if (file.size > 2 * 1024 * 1024) return NextResponse.json({ error: 'El logo no puede pesar más de 2 MB.' }, { status: 400 });

    const ext = file.type.includes('png') ? 'png' : file.type.includes('webp') ? 'webp' : 'jpg';
    const path = `${id}-${Date.now()}.${ext}`;
    const buffer = new Uint8Array(await file.arrayBuffer());

    const { error: upErr } = await supabase.storage.from('shop-logos').upload(path, buffer, { contentType: file.type, upsert: true });
    if (upErr) return NextResponse.json({ error: sanitizeDbError('shops.logo.upload', upErr.message) }, { status: 500 });

    const { data: pub } = supabase.storage.from('shop-logos').getPublicUrl(path);
    const logo_url = pub.publicUrl;

    const { error: updErr } = await supabase.from('shops').update({ logo_url }).eq('id', id);
    if (updErr) return NextResponse.json({ error: sanitizeDbError('shops.logo.save', updErr.message) }, { status: 500 });

    return NextResponse.json({ ok: true, logo_url });
  } catch (err) {
    const authResp = authErrorResponse(err);
    if (authResp) return authResp;
    throw err;
  }
}
