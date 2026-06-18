import { NextResponse } from 'next/server';
import { requireInvoicesAccess, agingBucket, daysBetween } from '@/lib/invoicesApi';
import { sanitizeDbError } from '@/lib/clientsApi';
import { authErrorResponse } from '@/lib/apiAuth';

type Bucket = 'current' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90_plus';
const ZERO = () => ({ current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 });

// GET /api/cuentas-por-cobrar → reporte de cuentas por cobrar con antigüedad de
// saldos. Incluye facturas abiertas/parciales (saldo > 0); resalta las de crédito.
export async function GET() {
  try {
    const supabase = await requireInvoicesAccess();

    const { data: invoices, error } = await supabase
      .from('invoices')
      .select('id,client_id,document_number,issue_date,due_date,payment_method,status,total,amount_paid,balance')
      .in('status', ['open', 'partial'])
      .order('due_date', { ascending: true });
    if (error) return NextResponse.json({ error: sanitizeDbError('cxc.GET', error.message) }, { status: 500 });

    const open = (invoices ?? []).filter((i: any) => Number(i.balance) > 0.001);

    // Nombres de cliente.
    const ids = Array.from(new Set(open.map((i: any) => i.client_id).filter(Boolean)));
    let nameById: Record<string, string> = {};
    if (ids.length) {
      const { data: clients } = await supabase.from('clients').select('id,name').in('id', ids);
      nameById = Object.fromEntries((clients ?? []).map((c: any) => [c.id, c.name]));
    }

    const today = new Date();
    const summary = { total: 0, count: open.length, ...ZERO() };
    const byClient: Record<string, any> = {};

    for (const inv of open) {
      const balance = Number(inv.balance);
      const daysPastDue = inv.due_date ? daysBetween(inv.due_date, today) : 0;
      const bucket: Bucket = agingBucket(daysPastDue);

      summary.total += balance;
      (summary as any)[bucket] += balance;

      const key = inv.client_id ?? '__none__';
      if (!byClient[key]) {
        byClient[key] = {
          client_id: inv.client_id ?? null,
          client_name: inv.client_id ? (nameById[inv.client_id] ?? '—') : 'Sin cliente',
          total: 0, count: 0, buckets: ZERO(), invoices: [] as any[],
        };
      }
      const c = byClient[key];
      c.total += balance;
      c.count += 1;
      c.buckets[bucket] += balance;
      c.invoices.push({
        id: inv.id,
        document_number: inv.document_number,
        issue_date: inv.issue_date,
        due_date: inv.due_date,
        payment_method: inv.payment_method,
        status: inv.status,
        total: Number(inv.total),
        amount_paid: Number(inv.amount_paid),
        balance,
        days_past_due: Math.max(0, daysPastDue),
        bucket,
      });
    }

    const clients = Object.values(byClient).sort((a: any, b: any) => b.total - a.total);

    return NextResponse.json({ summary, clients });
  } catch (err) {
    const authResp = authErrorResponse(err);
    if (authResp) return authResp;
    throw err;
  }
}
