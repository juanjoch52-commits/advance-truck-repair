import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { requireRole } from '@/lib/apiAuth';

export const INVENTORY_COLS =
  'id,part_number,name,description,unit_cost,sale_price,quantity_on_hand,reorder_level,location,is_active,created_at,updated_at';

export const MOVEMENT_TYPES = ['purchase', 'sale', 'adjustment', 'return'] as const;

// Inventario / gastos: owner / admin / super_user.
export async function requireInventoryAccess() {
  await requireRole('owner', 'admin', 'super_user');
  return getSupabaseServerClient();
}

export function num(n: unknown): number {
  const v = parseFloat(String(n));
  return Number.isFinite(v) ? v : 0;
}

export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}
