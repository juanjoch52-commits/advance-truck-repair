import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { requireRole } from '@/lib/apiAuth';

export const PAYMENT_METHODS = ['cash', 'check', 'card', 'deposit', 'credit'] as const;
// Métodos válidos para un PAGO real recibido (no incluye 'credit', que es un término
// de venta a crédito, no una forma de cobro).
export const RECEIPT_METHODS = ['cash', 'check', 'card', 'deposit'] as const;

export const INVOICE_COLS =
  'id,shop_id,client_id,location_id,document_number,issue_date,due_date,payment_method,status,subtotal,tax_amount,discount,total,amount_paid,balance,description,notes,created_by,created_at,updated_at';

// Facturación / cuentas por cobrar: owner / admin / super_user (gestión diaria).
export async function requireInvoicesAccess() {
  await requireRole('owner', 'admin', 'super_user');
  return getSupabaseServerClient();
}

export function round2(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// Calcula saldo y estado a partir del total, lo pagado y el método.
export function deriveBalanceStatus(total: number, amountPaid: number): { balance: number; status: string } {
  const balance = round2(total - amountPaid);
  let status: string;
  if (amountPaid <= 0.001) status = 'open';
  else if (balance > 0.001) status = 'partial';
  else status = 'paid';
  return { balance: Math.max(0, balance), status };
}

// Cubeta de antigüedad según días vencidos (due_date vs hoy).
export function agingBucket(daysPastDue: number): 'current' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90_plus' {
  if (daysPastDue <= 0) return 'current';
  if (daysPastDue <= 30) return 'd1_30';
  if (daysPastDue <= 60) return 'd31_60';
  if (daysPastDue <= 90) return 'd61_90';
  return 'd90_plus';
}

export function daysBetween(fromISO: string, toDate: Date): number {
  const from = new Date(fromISO + 'T00:00:00');
  return Math.floor((toDate.getTime() - from.getTime()) / 86400000);
}
