import { NextResponse } from 'next/server';
import { requireInvoicesAccess } from '@/lib/invoicesApi';
import { sanitizeDbError } from '@/lib/clientsApi';
import { authErrorResponse } from '@/lib/apiAuth';

// GET /api/facturas/ordenes → órdenes de trabajo recientes (work_reports) para
// enlazarlas a una factura y heredar su número de orden.
export async function GET() {
  try {
    const supabase = await requireInvoicesAccess();
    const { data, error } = await supabase
      .from('work_reports')
      .select('id,external_order_number,company,truck_number,work_date,client_id,truck_id')
      .order('work_date', { ascending: false })
      .limit(300);
    if (error) return NextResponse.json({ error: sanitizeDbError('facturas.ordenes.GET', error.message) }, { status: 500 });
    return NextResponse.json({ orders: data ?? [] });
  } catch (err) {
    const authResp = authErrorResponse(err);
    if (authResp) return authResp;
    throw err;
  }
}
