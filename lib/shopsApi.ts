import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { requireRole } from '@/lib/apiAuth';

// Columnas expuestas de shops (datos de facturación por taller).
export const SHOP_COLS =
  'id,name,legal_name,ein,sales_tax_certificate,county,billing_address_line,city,state,zip,phone,email,tax_rate,invoice_prefix,next_invoice_number,notes,is_active,sort_order,created_at,updated_at';

// Datos fiscales/facturación: solo owner / super_user (más restringido que el
// CRM de clientes, que permite admin). Tabla con RLS deny-all → service_role.
export async function requireShopsAccess() {
  await requireRole('owner', 'super_user');
  return getSupabaseServerClient();
}

// Construye un payload completo (para crear). Para PATCH se aplica campo por
// campo en la ruta [id] respetando `undefined` (actualización parcial).
export function buildShopPayload(body: any) {
  return {
    name: String(body.name ?? '').trim(),
    legal_name: String(body.legal_name ?? '').trim() || null,
    ein: String(body.ein ?? '').trim() || null,
    sales_tax_certificate: String(body.sales_tax_certificate ?? '').trim() || null,
    county: String(body.county ?? '').trim() || null,
    billing_address_line: String(body.billing_address_line ?? '').trim() || null,
    city: String(body.city ?? '').trim() || null,
    state: String(body.state ?? '').trim() || null,
    zip: String(body.zip ?? '').trim() || null,
    phone: String(body.phone ?? '').trim() || null,
    email: String(body.email ?? '').trim() || null,
    tax_rate: Number.isFinite(Number(body.tax_rate)) ? Math.min(100, Math.max(0, Number(body.tax_rate))) : 0,
    invoice_prefix: String(body.invoice_prefix ?? '').trim() || null,
    next_invoice_number: Number.isFinite(Number(body.next_invoice_number))
      ? Math.max(1, parseInt(body.next_invoice_number, 10) || 1) : 1,
    notes: String(body.notes ?? '').trim() || null,
  };
}
