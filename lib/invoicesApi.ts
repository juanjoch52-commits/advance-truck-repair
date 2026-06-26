import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { requireRole } from '@/lib/apiAuth';
import { computePayout } from '@/lib/money';

export const PAYMENT_METHODS = ['cash', 'check', 'card', 'deposit', 'credit'] as const;
// Métodos válidos para un PAGO real recibido (no incluye 'credit', que es un término
// de venta a crédito, no una forma de cobro).
export const RECEIPT_METHODS = ['cash', 'check', 'card', 'deposit'] as const;

// Tipo/naturaleza del pago contra una factura abierta (independiente del método):
// depósito, adelanto o cancelación (liquidación del saldo).
export const PAYMENT_TYPES = ['deposit', 'advance', 'settlement'] as const;
export type PaymentType = (typeof PAYMENT_TYPES)[number];

// Tipo de documento. Solo la FACTURA FISCAL ('invoice') es reportable: consume el
// correlativo fiscal del taller, entra a CxC y descuenta inventario. estimate y
// work_order son documentos NO fiscales (cotización / orden de trabajo).
export const DOCUMENT_TYPES = ['invoice', 'estimate', 'work_order'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];
export function isFiscalDocument(t: unknown): boolean {
  return t === 'invoice';
}

export const INVOICE_COLS =
  'id,shop_id,client_id,customer_name,customer_company,customer_phone,customer_truck,insurance_company,insurance_claim,location_id,truck_id,work_report_id,order_number,document_number,document_type,issue_date,due_date,payment_method,status,subtotal,tax_amount,tax_exempt,tax_exempt_certificate,discount,total,amount_paid,balance,description,notes,emitted_at,commissions_generated,created_by,created_at,updated_at';

// Facturación / cuentas por cobrar: owner / admin / super_user (gestión diaria).
export async function requireInvoicesAccess() {
  await requireRole('owner', 'admin', 'super_user');
  return getSupabaseServerClient();
}

export function round2(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// Sales tax automático: base gravable (Σ renglones marcados taxable) × tasa del
// taller. La tasa se guarda como porcentaje (ej. 6.5 = 6.5%). La mano de obra no
// se grava en FL; el flag `taxable` por renglón decide qué entra a la base.
export function computeAutoTax(taxableBase: number, taxRatePct: number): number {
  return round2((Number(taxableBase) || 0) * (Number(taxRatePct) || 0) / 100);
}

// Semana Lun–Dom de una fecha ISO (misma convención que las órdenes de trabajo,
// para que la comisión de factura caiga en el mismo corte que la de las órdenes).
export function weekRangeMonSun(dateISO: string): { start: string; end: string } {
  const date = new Date(dateISO + 'T12:00:00');
  const day = date.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + diffToMon);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: monday.toISOString().split('T')[0], end: sunday.toISOString().split('T')[0] };
}

// Descuenta de bodega las piezas de inventario de los renglones (movimiento
// 'sale' + baja de stock). Se ejecuta al FINALIZAR la factura: al crearla si es
// directa, o al emitirla si venía como borrador. `items` deben traer su `id`.
export async function applyWarehouseDeduction(supabase: any, items: any[], invoiceId: string, createdBy: string | null) {
  for (const it of items) {
    if (it.line_type === 'part' && it.inventory_item_id && Number(it.qty) > 0) {
      await supabase.from('inventory_movements').insert({
        inventory_item_id: it.inventory_item_id,
        movement_type: 'sale',
        quantity: -Number(it.qty),
        unit_cost: round2(it.cost),
        invoice_id: invoiceId,
        created_by: createdBy,
      });
      const { data: invItem } = await supabase.from('inventory_items').select('quantity_on_hand').eq('id', it.inventory_item_id).maybeSingle();
      if (invItem) {
        await supabase.from('inventory_items')
          .update({ quantity_on_hand: round2(Number(invItem.quantity_on_hand) - Number(it.qty)) })
          .eq('id', it.inventory_item_id);
      }
    }
  }
}

// Folio del comprobante de pago: <número de factura>-R<n> (n = pagos previos + 1).
// Si la factura aún no tiene número (respaldo), usa un prefijo con el id.
export async function nextReceiptNumber(supabase: any, invoiceId: string, documentNumber: string | null): Promise<string> {
  const { count } = await supabase.from('invoice_payments').select('id', { count: 'exact', head: true }).eq('invoice_id', invoiceId);
  const seq = (count ?? 0) + 1;
  return `${documentNumber || `INV-${String(invoiceId).slice(0, 8)}`}-R${seq}`;
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

// ─── Factura ↔ Orden de trabajo ──────────────────────────────────────────────
// La orden de trabajo (work_reports) exige company y truck_number NOT NULL. Aquí
// resolvemos esas etiquetas desde la factura: el nombre del cliente registrado, o
// el cliente esporádico (customer_name), o "Walk-in"; y la unidad/placa del camión.
export async function resolveOrderLabels(
  supabase: any,
  opts: { client_id?: string | null; customer_name?: string | null; truck_id?: string | null },
): Promise<{ company: string; truckNumber: string }> {
  let company = (opts.customer_name ?? '').trim();
  if (!company && opts.client_id) {
    const { data: cli } = await supabase.from('clients').select('name').eq('id', opts.client_id).maybeSingle();
    company = (cli?.name ?? '').trim();
  }
  if (!company) company = 'Walk-in';

  let truckNumber = '';
  if (opts.truck_id) {
    const { data: tr } = await supabase.from('trucks').select('unit_number,plate').eq('id', opts.truck_id).maybeSingle();
    truckNumber = (tr?.unit_number || tr?.plate || '').trim();
  }
  if (!truckNumber) truckNumber = '—';

  return { company, truckNumber };
}

// Crea la ORDEN DE TRABAJO amarrada a una factura al finalizarla (emisión o
// creación directa): work_reports + report_tasks (renglones de mano de obra) +
// task_assignments (sus mecánicos, hasta 2) + earned_entries (las comisiones, que
// entran a la planilla — el MISMO origen que /ordenes, así no se paga doble).
//
// `laborItems`: renglones line_type='labor' (con id, description, amount).
// `assignmentsByItem`: invoice_item_id → [{ employee_id, commission_pct }].
// Devuelve el id de la orden creada, o null si ningún renglón tiene mecánico
// (no se crea una orden de trabajo vacía).
export async function createWorkOrderFromInvoice(
  supabase: any,
  args: {
    invoice: any;
    laborItems: any[];
    assignmentsByItem: Record<string, Array<{ employee_id: string; commission_pct: number }>>;
    emitDate: string;
    createdById: string | null;
    createdByName: string | null;
  },
): Promise<string | null> {
  const { invoice, laborItems, assignmentsByItem, emitDate, createdById, createdByName } = args;

  // ¿Hay al menos un renglón de mano de obra con mecánico asignado?
  const hasAnyMechanic = laborItems.some(it => (assignmentsByItem[it.id] ?? []).some(a => a.employee_id));
  if (!hasAnyMechanic) return null;

  const { company, truckNumber } = await resolveOrderLabels(supabase, {
    client_id: invoice.client_id, customer_name: invoice.customer_name, truck_id: invoice.truck_id,
  });

  const { data: report, error: repErr } = await supabase.from('work_reports').insert({
    external_order_number: invoice.order_number || invoice.document_number || null,
    truck_number: truckNumber,
    company,
    work_date: emitDate,
    notes: invoice.description || null,
    client_id: invoice.client_id || null,
    location_id: invoice.location_id || null,
    truck_id: invoice.truck_id || null,
    created_by: createdById,
    created_by_name: createdByName,
    created_by_role: null,
  }).select('id').single();
  if (repErr || !report) throw new Error(repErr?.message ?? 'No se pudo crear la orden de trabajo');

  const { start: week_start, end: week_end } = weekRangeMonSun(emitDate);

  let sortOrder = 0;
  for (const item of laborItems) {
    const assigns = (assignmentsByItem[item.id] ?? []).filter(a => a.employee_id);
    if (assigns.length === 0) continue; // tarea sin mecánico → no entra a la orden

    const amount = round2(item.amount);
    const { data: task, error: taskErr } = await supabase.from('report_tasks').insert({
      report_id: report.id,
      description: (item.description ?? '').trim() || 'Mano de obra',
      amount_charged_to_client: amount,
      sort_order: sortOrder++,
    }).select('id').single();
    if (taskErr || !task) throw new Error(taskErr?.message ?? 'No se pudo crear la tarea de la orden');

    for (const a of assigns) {
      const pct = Math.min(100, Math.max(0, round2(a.commission_pct)));
      const payout = computePayout(amount, pct);
      const { data: assignment, error: asgErr } = await supabase.from('task_assignments').insert({
        task_id: task.id,
        employee_id: a.employee_id,
        commission_percentage: pct,
        mechanic_payout: payout,
      }).select('id').single();
      if (asgErr || !assignment) throw new Error(asgErr?.message ?? 'No se pudo asignar el mecánico');

      await supabase.from('earned_entries').insert({
        task_assignment_id: assignment.id,
        work_report_id: report.id,
        invoice_item_id: item.id,
        employee_id: a.employee_id,
        amount: payout,
        work_date: emitDate,
        truck_number: truckNumber,
        mechanic_role: 'mechanic',
        entry_type: 'mechanic',
        description: `Factura ${invoice.document_number ?? ''}${item.description ? ' · ' + item.description : ''}`.trim(),
        week_start,
        week_end,
      });
    }
  }

  return report.id;
}
