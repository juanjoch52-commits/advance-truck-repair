import { NextResponse } from 'next/server';
import { requireInvoicesAccess } from '@/lib/invoicesApi';
import { sanitizeDbError } from '@/lib/clientsApi';
import { authErrorResponse } from '@/lib/apiAuth';

// GET /api/shops/options → lista MÍNIMA de talleres para elegir al facturar
// (id, nombre y tasa de impuesto). A diferencia de /api/shops (datos fiscales
// completos, solo dueño/super), esto lo puede leer también la administración:
// solo necesita escoger a qué taller pertenece la factura, sin ver EIN,
// certificados ni el correlativo fiscal.
export async function GET() {
  try {
    const supabase = await requireInvoicesAccess();
    const { data, error } = await supabase
      .from('shops')
      .select('id,name,tax_rate,is_active,sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) return NextResponse.json({ error: sanitizeDbError('shops.options.GET', error.message) }, { status: 500 });
    return NextResponse.json({ shops: (data ?? []).map((s: any) => ({ id: s.id, name: s.name, tax_rate: Number(s.tax_rate) || 0 })) });
  } catch (err) {
    const authResp = authErrorResponse(err);
    if (authResp) return authResp;
    throw err;
  }
}
