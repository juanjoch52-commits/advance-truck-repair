'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';

// ─── Pantalla "Nueva factura" estilo orden de trabajo ────────────────────────
// Pensada para lectura fácil (letra grande, secciones claras, botones grandes):
// el dueño no es técnico. Cliente registrado o esporádico (walk-in), tareas de
// mano de obra con hasta 2 mecánicos (comisión), piezas, impuesto y pago.
// Al "Crear" / "Guardar borrador" llama a POST /api/facturas con assignments[].

type PaymentMethod = 'cash' | 'check' | 'card' | 'deposit' | 'credit';
type PartSource = 'new_purchased' | 'used' | 'warehouse';

interface ClientTruck { id: string; location_id: string | null; unit_number: string | null; plate: string | null }
interface ClientLoc { id: string; name: string }
interface ClientOpt { id: string; name: string; tax_exempt?: boolean; tax_exempt_certificate?: string | null; locations: ClientLoc[]; trucks: ClientTruck[] }
interface ShopOpt { id: string; name: string; tax_rate: number }
interface MechanicOpt { id: string; full_name: string }
interface InvItem { id: string; name: string; part_number: string | null; sale_price: number; unit_cost: number; quantity_on_hand: number }
interface WorkOrderOpt { id: string; external_order_number: string | null; company: string | null; truck_number: string | null; work_date: string | null; client_id: string | null; truck_id: string | null }

interface Mech { id: string; employee_id: string; commission_pct: string }
interface Task { id: string; description: string; qty: string; amount: string; mechanics: Mech[]; taxable: boolean }
interface Part { id: string; description: string; qty: string; unit_price: string; cost: string; part_source: PartSource; inventory_item_id: string; taxable: boolean }

let seq = 0;
const uid = () => `r${++seq}`;
const newMech = (pct = 50): Mech => ({ id: uid(), employee_id: '', commission_pct: String(pct) });
const newTask = (): Task => ({ id: uid(), description: '', qty: '1', amount: '', mechanics: [newMech()], taxable: false });
const newPart = (): Part => ({ id: uid(), description: '', qty: '1', unit_price: '', cost: '', part_source: 'new_purchased', inventory_item_id: '', taxable: true });

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const money = (n: any) => `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'check', 'card', 'deposit', 'credit'];
const HARD_CAP = 100;

export default function NuevaFacturaPage() {
  return (
    <Suspense fallback={null}>
      <NuevaFacturaInner />
    </Suspense>
  );
}

function NuevaFacturaInner() {
  const { t, lang } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Edición de un BORRADOR existente: ?id=<uuid>. Sin id → factura nueva.
  const editId = searchParams.get('id') || '';
  const isEditing = !!editId;

  // Diccionario bilingüe local (sin tocar los archivos grandes de traducción).
  const L = lang === 'en' ? EN : ES;

  // Catálogos
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [shops, setShops] = useState<ShopOpt[]>([]);
  const [mechanics, setMechanics] = useState<MechanicOpt[]>([]);
  const [invItems, setInvItems] = useState<InvItem[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrderOpt[]>([]);

  // Cliente
  const [walkin, setWalkin] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerCompany, setCustomerCompany] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerTruck, setCustomerTruck] = useState('');
  const [clientId, setClientId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [truckId, setTruckId] = useState('');

  // Alta rápida de cliente desde la propia factura (modal).
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [ncName, setNcName] = useState('');
  const [ncType, setNcType] = useState<'corporate' | 'individual'>('corporate');
  const [ncPhone, setNcPhone] = useState('');
  const [ncExempt, setNcExempt] = useState(false);
  const [ncCert, setNcCert] = useState('');
  const [ncSaving, setNcSaving] = useState(false);
  const [ncError, setNcError] = useState('');

  // Tipo de documento: factura fiscal o cotización (estimate, sin número fiscal,
  // no cobra ni baja inventario; luego se puede CONVERTIR en factura).
  const [docType, setDocType] = useState<'invoice' | 'estimate'>('invoice');
  const isEstimate = docType === 'estimate';

  // Encabezado
  const [workReportId, setWorkReportId] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [shopId, setShopId] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');

  // Seguro (opcional): aseguradora + nº de reclamo/póliza. Al activarlo, la factura
  // se cobra "a crédito" (queda abierta hasta que el seguro pague).
  const [insuranceOn, setInsuranceOn] = useState(false);
  const [insuranceCompany, setInsuranceCompany] = useState('');
  const [insuranceClaim, setInsuranceClaim] = useState('');

  // Líneas
  const [tasks, setTasks] = useState<Task[]>([newTask()]);
  const [parts, setParts] = useState<Part[]>([]);

  // Totales
  const [discount, setDiscount] = useState('');
  const [taxOverride, setTaxOverride] = useState(false);
  const [taxManual, setTaxManual] = useState('');       // impuesto manual en $
  const [taxRateManual, setTaxRateManual] = useState(''); // tasa manual en % (calcula el $)
  // Al editar un borrador: impuesto guardado, para restaurar el modo "a mano".
  const [loadedTax, setLoadedTax] = useState<number | null>(null);
  const taxReconciled = useRef(false);
  const [markPaid, setMarkPaid] = useState(true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try { const r = await fetch('/api/clientes?tree=1'); if (r.ok) { const j = await r.json(); setClients((j.clients ?? []) as ClientOpt[]); } } catch {}
      try { const r = await fetch('/api/shops/options'); if (r.ok) { const j = await r.json(); setShops((j.shops ?? []).map((s: any) => ({ id: s.id, name: s.name, tax_rate: Number(s.tax_rate) || 0 }))); } } catch {}
      try { const r = await fetch('/api/empleados'); if (r.ok) { const j = await r.json(); setMechanics((j.employees ?? []).filter((e: any) => (e.role ?? '').toLowerCase() === 'mechanic' || e.payment_type === 'mechanic_commission').map((e: any) => ({ id: e.id, full_name: e.full_name }))); } } catch {}
      try { const r = await fetch('/api/inventario'); if (r.ok) { const j = await r.json(); setInvItems((j.items ?? []) as InvItem[]); } } catch {}
      try { const r = await fetch('/api/facturas/ordenes'); if (r.ok) { const j = await r.json(); setWorkOrders((j.orders ?? []) as WorkOrderOpt[]); } } catch {}
    })();
  }, []);

  // Edición: cargar el borrador y poblar el formulario. Solo borradores son editables.
  useEffect(() => {
    if (!editId) return;
    (async () => {
      try {
        const [invRes, itRes] = await Promise.all([
          fetch(`/api/facturas/${editId}`),
          fetch(`/api/facturas/${editId}/items`),
        ]);
        if (!invRes.ok) { setError(L.editNotFound); return; }
        const { invoice } = await invRes.json();
        const its = itRes.ok ? ((await itRes.json()).items ?? []) : [];
        if (!invoice) { setError(L.editNotFound); return; }
        if (invoice.status !== 'draft') { setError(L.editOnlyDraft); return; }

        // Cliente
        if (invoice.client_id) {
          setWalkin(false);
          setClientId(invoice.client_id);
          setLocationId(invoice.location_id ?? '');
          setTruckId(invoice.truck_id ?? '');
        } else {
          setWalkin(true);
          setCustomerName(invoice.customer_name ?? '');
          setCustomerCompany(invoice.customer_company ?? '');
          setCustomerPhone(invoice.customer_phone ?? '');
          setCustomerTruck(invoice.customer_truck ?? '');
        }
        // Encabezado
        setDocType(invoice.document_type === 'estimate' ? 'estimate' : 'invoice');
        setWorkReportId(invoice.work_report_id ?? '');
        setOrderNumber(invoice.order_number ?? '');
        setShopId(invoice.shop_id ?? '');
        setIssueDate(invoice.issue_date ?? new Date().toISOString().slice(0, 10));
        setDueDate(invoice.due_date ?? '');
        setPaymentMethod((invoice.payment_method as PaymentMethod) ?? 'cash');
        // Seguro
        if (invoice.insurance_company || invoice.insurance_claim) {
          setInsuranceOn(true);
          setInsuranceCompany(invoice.insurance_company ?? '');
          setInsuranceClaim(invoice.insurance_claim ?? '');
        }
        // Totales
        setDiscount(invoice.discount ? String(invoice.discount) : '');

        // Renglones → tareas (mano de obra) y piezas.
        const laborItems = its.filter((it: any) => it.line_type === 'labor');
        const partItems = its.filter((it: any) => it.line_type !== 'labor');
        if (laborItems.length) {
          setTasks(laborItems.map((it: any) => ({
            id: uid(),
            description: it.description ?? '',
            qty: String(Number(it.qty ?? 1)),
            amount: String(Number(it.unit_price ?? it.amount ?? 0)),
            taxable: !!it.taxable,
            mechanics: (it.assignments && it.assignments.length)
              ? it.assignments.map((a: any) => ({ id: uid(), employee_id: a.employee_id, commission_pct: String(Number(a.commission_pct ?? 50)) }))
              : [newMech()],
          })));
        }
        if (partItems.length) {
          setParts(partItems.map((it: any) => ({
            id: uid(),
            description: it.description ?? '',
            qty: String(Number(it.qty ?? 1)),
            unit_price: String(Number(it.unit_price ?? 0)),
            cost: String(Number(it.cost ?? 0)),
            part_source: (['new_purchased', 'used', 'warehouse'].includes(it.part_source) ? it.part_source : 'new_purchased') as PartSource,
            inventory_item_id: it.inventory_item_id ?? '',
            taxable: !!it.taxable,
          })));
        }
        // Guarda el impuesto del borrador para restaurar el modo "a mano" (ver efecto abajo).
        taxReconciled.current = false;
        setLoadedTax(Number(invoice.tax_amount) || 0);
      } catch { setError(L.editNotFound); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  const selectedClient = clients.find(c => c.id === clientId) || null;
  const clientLocations = selectedClient?.locations ?? [];
  const clientTrucks = (selectedClient?.trucks ?? []).filter(tk => locationId ? tk.location_id === locationId : true);
  const clientExempt = !!selectedClient?.tax_exempt;
  const truckLabel = (tk: ClientTruck) => [tk.unit_number, tk.plate].filter(Boolean).join(' · ') || '—';

  const selectedShop = shops.find(s => s.id === shopId) || null;

  // Al editar un borrador, restaura el modo "impuesto a mano" si el impuesto
  // guardado NO coincide con el que daría el automático (o si no hay taller pero
  // hay impuesto). tax_override no se persiste, así que se infiere aquí. Corre
  // una vez, cuando ya cargaron talleres/renglones.
  useEffect(() => {
    if (!isEditing || loadedTax === null || taxReconciled.current) return;
    if (shopId && shops.length === 0) return; // espera el catálogo de talleres
    const base = round2(
      tasks.filter(t => t.taxable).reduce((s, t) => s + (parseFloat(t.qty) || 0) * (parseFloat(t.amount) || 0), 0)
      + parts.filter(p => p.taxable).reduce((s, p) => s + (parseFloat(p.qty) || 0) * (parseFloat(p.unit_price) || 0), 0),
    );
    const auto = selectedShop && !clientExempt ? round2(base * selectedShop.tax_rate / 100) : null;
    const isManual = auto === null ? loadedTax > 0.001 : Math.abs(loadedTax - auto) > 0.005;
    if (isManual) {
      // Subtotal completo (todos los renglones) para back-calcular la tasa % mostrada.
      const sub = round2(
        tasks.reduce((s, t) => s + (parseFloat(t.qty) || 0) * (parseFloat(t.amount) || 0), 0)
        + parts.reduce((s, p) => s + (parseFloat(p.qty) || 0) * (parseFloat(p.unit_price) || 0), 0),
      );
      setTaxOverride(true);
      setTaxManual(String(loadedTax));
      setTaxRateManual(sub > 0 ? String(round2(loadedTax / sub * 100)) : '');
    }
    taxReconciled.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, loadedTax, shopId, shops, selectedShop, clientExempt, tasks, parts]);

  // ─── Cliente ───
  function onSelectClient(id: string) { setClientId(id); setLocationId(''); setTruckId(''); }
  function onWalkinToggle(on: boolean) {
    setWalkin(on);
    if (on) { setClientId(''); setLocationId(''); setTruckId(''); }
    else { setCustomerName(''); setCustomerCompany(''); setCustomerPhone(''); setCustomerTruck(''); }
  }

  function openNewClient() {
    setNcName(''); setNcType('corporate'); setNcPhone(''); setNcExempt(false); setNcCert(''); setNcError('');
    setNewClientOpen(true);
  }
  async function saveNewClient() {
    if (!ncName.trim()) { setNcError(L.errWalkinName); return; }
    setNcSaving(true); setNcError('');
    try {
      const res = await fetch('/api/clientes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: ncName.trim(), client_type: ncType, phone: ncPhone.trim() || null,
          tax_exempt: ncExempt, tax_exempt_certificate: ncExempt ? (ncCert.trim() || null) : null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setNcError(j?.error || L.ncFail); setNcSaving(false); return; }
      const c = j.client;
      // Insertar en el catálogo local (sin distritos/camiones aún) y seleccionarlo.
      const opt: ClientOpt = { id: c.id, name: c.name, tax_exempt: !!c.tax_exempt, tax_exempt_certificate: c.tax_exempt_certificate ?? null, locations: [], trucks: [] };
      setClients(prev => [opt, ...prev.filter(p => p.id !== c.id)].sort((a, b) => a.name.localeCompare(b.name)));
      setWalkin(false);
      onSelectClient(c.id);
      setNewClientOpen(false);
    } catch { setNcError(L.ncFail); }
    setNcSaving(false);
  }

  // ─── Partir de una orden existente (opcional): solo enlaza, no recrea comisión ───
  function onPickWorkOrder(id: string) {
    setWorkReportId(id);
    const o = workOrders.find(w => w.id === id) || null;
    if (o) {
      setOrderNumber(o.external_order_number ?? '');
      if (o.client_id) { setWalkin(false); onSelectClient(o.client_id); if (o.truck_id) setTruckId(o.truck_id); }
    }
  }
  const linkedToOrder = !!workReportId;

  // ─── Tareas (mano de obra) ───
  // Total de la tarea = cantidad × precio unitario (la comisión se calcula sobre este total).
  const taskAmount = (tk: Task) => round2((parseFloat(tk.qty) || 0) * (parseFloat(tk.amount) || 0));
  const usedPct = (tk: Task) => tk.mechanics.reduce((s, m) => s + (parseFloat(m.commission_pct) || 0), 0);
  const mechPayout = (tk: Task, m: Mech) => round2(taskAmount(tk) * (parseFloat(m.commission_pct) || 0) / 100);
  function addTask() { setTasks(p => [...p, newTask()]); }
  function removeTask(id: string) { setTasks(p => p.filter(t => t.id !== id)); }
  function updTask(id: string, patch: Partial<Task>) { setTasks(p => p.map(t => t.id === id ? { ...t, ...patch } : t)); }
  function addMech(taskId: string) {
    setTasks(p => p.map(t => {
      if (t.id !== taskId || t.mechanics.length >= 2) return t;
      const remaining = Math.max(0, HARD_CAP - usedPct(t));
      return { ...t, mechanics: [...t.mechanics, newMech(Math.min(remaining, 50))] };
    }));
  }
  function removeMech(taskId: string, mechId: string) { setTasks(p => p.map(t => t.id === taskId ? { ...t, mechanics: t.mechanics.filter(m => m.id !== mechId) } : t)); }
  function updMech(taskId: string, mechId: string, patch: Partial<Mech>) { setTasks(p => p.map(t => t.id === taskId ? { ...t, mechanics: t.mechanics.map(m => m.id === mechId ? { ...m, ...patch } : m) } : t)); }

  // ─── Piezas ───
  const partAmount = (pt: Part) => (parseFloat(pt.qty) || 0) * (parseFloat(pt.unit_price) || 0);
  function addPart() { setParts(p => [...p, newPart()]); }
  function removePart(id: string) { setParts(p => p.filter(x => x.id !== id)); }
  function updPart(id: string, patch: Partial<Part>) { setParts(p => p.map(x => x.id === id ? { ...x, ...patch } : x)); }
  function pickInventory(id: string, invId: string) {
    const inv = invItems.find(i => i.id === invId);
    if (!inv) { updPart(id, { inventory_item_id: '', part_source: 'new_purchased' }); return; }
    updPart(id, { inventory_item_id: invId, part_source: 'warehouse', description: inv.name, cost: String(inv.unit_cost), unit_price: String(inv.sale_price || ''), taxable: true });
  }

  // ─── Totales ───
  const laborTotal = round2(tasks.reduce((s, tk) => s + taskAmount(tk), 0));
  const partsTotal = round2(parts.reduce((s, pt) => s + partAmount(pt), 0));
  const subtotal = round2(laborTotal + partsTotal);
  // Base gravable: piezas marcadas + mano de obra marcada (casilla por trabajo).
  const taxableBase = round2(
    parts.filter(p => p.taxable).reduce((s, p) => s + partAmount(p), 0) +
    tasks.filter(tk => tk.taxable).reduce((s, tk) => s + taskAmount(tk), 0)
  );
  const autoTax = !!selectedShop && !taxOverride && !clientExempt;
  const taxN = clientExempt ? 0 : (autoTax ? round2(taxableBase * (selectedShop!.tax_rate) / 100) : (parseFloat(taxManual) || 0));
  const discountN = parseFloat(discount) || 0;
  const total = Math.max(0, round2(subtotal + taxN - discountN));
  const isCredit = paymentMethod === 'credit';

  // Resumen de comisiones (para que el dueño vea cuánto se va a planilla).
  const totalPayout = round2(tasks.reduce((s, tk) => s + tk.mechanics.reduce((ms, m) => ms + mechPayout(tk, m), 0), 0));
  const hasMechanics = tasks.some(tk => tk.mechanics.some(m => m.employee_id));

  function buildItems() {
    const laborItems = tasks
      .filter(tk => (tk.description.trim() || taskAmount(tk) > 0))
      .map(tk => ({
        line_type: 'labor',
        description: tk.description.trim(),
        qty: parseFloat(tk.qty) || 1,
        unit_price: parseFloat(tk.amount) || 0,
        taxable: tk.taxable,
        assignments: tk.mechanics.filter(m => m.employee_id).map(m => ({ employee_id: m.employee_id, commission_pct: parseFloat(m.commission_pct) || 0 })),
      }));
    const partItems = parts
      .filter(pt => (pt.description.trim() || partAmount(pt) > 0))
      .map(pt => ({
        line_type: 'part',
        description: pt.description.trim(),
        qty: parseFloat(pt.qty) || 0,
        unit_price: parseFloat(pt.unit_price) || 0,
        cost: parseFloat(pt.cost) || 0,
        part_source: pt.part_source,
        inventory_item_id: pt.part_source === 'warehouse' ? (pt.inventory_item_id || null) : null,
        taxable: pt.taxable,
      }));
    return [...laborItems, ...partItems];
  }

  function validate(): string | null {
    if (!walkin && !clientId && !customerName.trim()) return L.errClient;
    if (walkin && !customerName.trim()) return L.errWalkinName;
    for (const tk of tasks) {
      if (taskAmount(tk) > 0 && usedPct(tk) > HARD_CAP) return L.errCommission;
      for (const m of tk.mechanics) {
        if (m.employee_id && (parseFloat(m.commission_pct) || 0) <= 0) return L.errCommissionPct;
      }
    }
    if (total <= 0) return L.errTotal;
    return null;
  }

  async function submit(asDraft: boolean) {
    setError('');
    const err = validate();
    if (err) { setError(err); return; }
    setSaving(true);
    const body: any = {
      client_id: walkin ? null : (clientId || null),
      customer_name: walkin ? customerName.trim() : (clientId ? null : customerName.trim()),
      customer_company: walkin ? (customerCompany.trim() || null) : null,
      customer_phone: walkin ? (customerPhone.trim() || null) : null,
      customer_truck: walkin ? (customerTruck.trim() || null) : null,
      insurance_company: insuranceOn ? (insuranceCompany.trim() || null) : null,
      insurance_claim: insuranceOn ? (insuranceClaim.trim() || null) : null,
      location_id: walkin ? null : (locationId || null),
      truck_id: walkin ? null : (truckId || null),
      work_report_id: workReportId || null,
      order_number: orderNumber.trim() || null,
      shop_id: shopId || null,
      issue_date: issueDate,
      due_date: dueDate || null,
      payment_method: paymentMethod,
      tax_override: taxOverride,
      tax_amount: taxN,
      discount: discountN,
      items: buildItems(),
    };

    let res: Response;
    if (isEditing) {
      // Guardar cambios del borrador (sigue siendo borrador hasta que se emita).
      res = await fetch(`/api/facturas/${editId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
    } else {
      res = await fetch('/api/facturas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, document_type: docType, draft: asDraft, mark_paid: !isEstimate && !asDraft && !isCredit && !insuranceOn && markPaid }),
      });
    }
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setError(j.error ?? 'Error'); setSaving(false); return; }
    router.push('/facturacion');
  }

  // Estilos reutilizables — letra grande, alto contraste, campos amplios.
  const label = 'block text-slate-300 text-base font-medium mb-2';
  const input = 'w-full bg-slate-800 border border-white/15 rounded-xl px-4 py-3 text-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/60 transition';
  const card = 'bg-slate-900/60 border border-white/10 rounded-2xl p-6 md:p-7';
  const sectionTitle = 'display-font text-slate-100 font-bold text-xl md:text-2xl tracking-wide mb-5';
  const hint = 'text-slate-500 text-base mt-1.5'; // ayuda gris permanente bajo un campo

  return (
    <div className="max-w-4xl">
      <a href="/facturacion" className="text-slate-400 hover:text-slate-200 text-base flex items-center gap-1.5 mb-4">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        {L.back}
      </a>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-7">
        <h1 className="display-font text-3xl md:text-4xl font-bold text-slate-100 tracking-wide">
          {isEditing ? (isEstimate ? L.editEstimateTitle : L.editTitle) : L.title}
        </h1>
        <button type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('atr:start-tour', { detail: { key: 'facturacion-nueva' } }))}
          className="text-amber-400/90 hover:text-amber-300 text-base flex items-center gap-1.5 border border-amber-500/30 hover:border-amber-500/50 rounded-xl px-4 py-2.5 transition">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          {t('tour.explainFields')}
        </button>
      </div>

      <div className="space-y-6">
        {/* ─── Tipo de documento ─── */}
        {!isEditing && (
          <div data-tour="facn-doctype">
            <div className="flex gap-3 flex-wrap">
              <button type="button" onClick={() => setDocType('invoice')}
                className={`px-6 py-3.5 rounded-xl text-lg border transition ${!isEstimate ? 'bg-amber-500/15 border-amber-500/50 text-amber-200 font-semibold' : 'bg-slate-800 border-white/10 text-slate-400 hover:text-slate-200'}`}>
                {L.docInvoice}
              </button>
              <button type="button" onClick={() => setDocType('estimate')}
                className={`px-6 py-3.5 rounded-xl text-lg border transition ${isEstimate ? 'bg-purple-500/15 border-purple-500/50 text-purple-200 font-semibold' : 'bg-slate-800 border-white/10 text-slate-400 hover:text-slate-200'}`}>
                {L.docEstimate}
              </button>
            </div>
            <p className={hint}>{isEstimate ? L.estimateHint : L.docHint}</p>
          </div>
        )}

        {/* ─── Cliente ─── */}
        <div className={card} data-tour="facn-client">
          <h2 className={sectionTitle}>{L.sectionClient}</h2>

          <div className="flex gap-3 mb-2 flex-wrap">
            <button type="button" onClick={() => onWalkinToggle(false)}
              className={`px-5 py-3 rounded-xl text-lg border transition ${!walkin ? 'bg-amber-500/15 border-amber-500/50 text-amber-200 font-semibold' : 'bg-slate-800 border-white/10 text-slate-400 hover:text-slate-200'}`}>
              {L.registered}
            </button>
            <button type="button" onClick={() => onWalkinToggle(true)}
              className={`px-5 py-3 rounded-xl text-lg border transition ${walkin ? 'bg-amber-500/15 border-amber-500/50 text-amber-200 font-semibold' : 'bg-slate-800 border-white/10 text-slate-400 hover:text-slate-200'}`}>
              {L.walkin}
            </button>
          </div>
          <p className={`${hint} mb-5`}>{walkin ? L.walkinDesc : L.registeredDesc}</p>

          {walkin ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className={label}>{L.walkinName}</label>
                <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder={L.walkinNameHint} className={input} />
              </div>
              <div>
                <label className={label}>{L.walkinCompany} <span className="text-slate-500 text-sm font-normal">{L.optional}</span></label>
                <input value={customerCompany} onChange={e => setCustomerCompany(e.target.value)} placeholder={L.walkinCompanyHint} className={input} />
              </div>
              <div>
                <label className={label}>{L.walkinPhone} <span className="text-slate-500 text-sm font-normal">{L.optional}</span></label>
                <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder={L.walkinPhoneHint} className={input} />
              </div>
              <div className="md:col-span-2">
                <label className={label}>{L.walkinTruck} <span className="text-slate-500 text-sm font-normal">{L.optional}</span></label>
                <input value={customerTruck} onChange={e => setCustomerTruck(e.target.value)} placeholder={L.walkinTruckHint} className={input} />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={label}>{L.client}</label>
                <select value={clientId} onChange={e => onSelectClient(e.target.value)} className={input}>
                  <option value="">{L.selectClient}</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.tax_exempt ? ' ★' : ''}</option>)}
                </select>
                <button type="button" onClick={openNewClient}
                  className="mt-2 text-sky-300 hover:text-sky-200 text-base flex items-center gap-1.5 border border-sky-500/30 hover:border-sky-500/50 rounded-lg px-3 py-2 transition">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  {L.newClient}
                </button>
              </div>
              <div>
                <label className={label}>{L.location}</label>
                <select value={locationId} onChange={e => { setLocationId(e.target.value); setTruckId(''); }} disabled={!clientId || clientLocations.length === 0} className={input + ' disabled:opacity-40'}>
                  <option value="">{L.noLocation}</option>
                  {clientLocations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div>
                <label className={label}>{L.truck}</label>
                <select value={truckId} onChange={e => setTruckId(e.target.value)} disabled={!clientId || clientTrucks.length === 0} className={input + ' disabled:opacity-40'}>
                  <option value="">{L.selectTruck}</option>
                  {clientTrucks.map(tk => <option key={tk.id} value={tk.id}>{truckLabel(tk)}</option>)}
                </select>
              </div>
              <p className={`${hint} md:col-span-3`}>{L.locTruckDesc}</p>
            </div>
          )}
          {clientExempt && <p className="text-emerald-300/90 text-base mt-3">{L.exemptHint}{selectedClient?.tax_exempt_certificate ? ` (#${selectedClient.tax_exempt_certificate})` : ''}</p>}
        </div>

        {/* ─── Datos de la factura ─── */}
        <div className={card} data-tour="facn-invoice">
          <h2 className={sectionTitle}>{L.sectionInvoice}</h2>
          {workOrders.length > 0 && (
            <div className="mb-5">
              <label className={label}>{L.fromOrder}</label>
              <select value={workReportId} onChange={e => onPickWorkOrder(e.target.value)} className={input}>
                <option value="">{L.fromOrderNone}</option>
                {workOrders.map(o => <option key={o.id} value={o.id}>{[o.external_order_number ? `#${o.external_order_number}` : '—', o.company, o.truck_number, o.work_date].filter(Boolean).join(' · ')}</option>)}
              </select>
              {linkedToOrder && <p className="text-sky-300/90 text-base mt-2">{L.fromOrderHint}</p>}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={label}>{L.orderNumber}</label>
              <input value={orderNumber} onChange={e => setOrderNumber(e.target.value)} placeholder={L.orderNumberHint} className={input} />
              <p className={hint}>{L.orderNumberDesc}</p>
            </div>
            {shops.length > 0 && (
              <div>
                <label className={label}>{L.shop}</label>
                <select value={shopId} onChange={e => setShopId(e.target.value)} className={input}>
                  <option value="">{L.noShop}</option>
                  {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <p className={hint}>{L.shopDesc}</p>
              </div>
            )}
            <div>
              <label className={label}>{L.issueDate}</label>
              <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} className={input} />
            </div>
            <div>
              <label className={label}>{L.dueDate}</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={input} />
              <p className={hint}>{L.dueDateDesc}</p>
            </div>
            <div className="md:col-span-2">
              <label className={label}>{L.paymentMethod}</label>
              <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as PaymentMethod)} className={input}>
                {PAYMENT_METHODS.map(pm => <option key={pm} value={pm}>{L.pm[pm]}</option>)}
              </select>
              {isCredit ? <p className="text-amber-300/90 text-base mt-2">{L.creditHint}</p> : <p className={hint}>{L.pmDesc}</p>}
            </div>
          </div>
        </div>

        {/* ─── Seguro (opcional) ─── */}
        <div className={card} data-tour="facn-insurance">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={insuranceOn} onChange={e => {
              const on = e.target.checked;
              setInsuranceOn(on);
              if (on) setPaymentMethod('credit'); // cobrar al seguro = a crédito
            }} className="accent-amber-500 w-6 h-6" />
            <span className="display-font text-slate-100 font-bold text-xl md:text-2xl tracking-wide">{L.sectionInsurance}</span>
          </label>
          {insuranceOn && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
              <div>
                <label className={label}>{L.insurer}</label>
                <input value={insuranceCompany} onChange={e => setInsuranceCompany(e.target.value)} placeholder={L.insurerHint} className={input} />
              </div>
              <div>
                <label className={label}>{L.claim}</label>
                <input value={insuranceClaim} onChange={e => setInsuranceClaim(e.target.value)} placeholder={L.claimHint} className={input} />
              </div>
              <p className="md:col-span-2 text-amber-300/90 text-base">{L.insuranceHint}</p>
            </div>
          )}
        </div>

        {/* ─── Mano de obra ─── */}
        <div className={card} data-tour="facn-labor">
          <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
            <h2 className="display-font text-slate-100 font-bold text-xl md:text-2xl tracking-wide">{L.sectionLabor}</h2>
            <button type="button" onClick={addTask} className="bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 text-sky-200 text-lg font-semibold rounded-xl px-5 py-2.5 transition">+ {L.addTask}</button>
          </div>
          <p className={`${hint} mb-5`}>{L.laborDesc}</p>

          {linkedToOrder && <p className="text-sky-300/90 text-base mb-4">{L.laborLinkedHint}</p>}

          <div className="space-y-4">
            {tasks.map((tk, i) => {
              const over = usedPct(tk) > HARD_CAP;
              return (
                <div key={tk.id} className={`rounded-2xl border bg-slate-800/40 p-5 ${over ? 'border-red-500/50' : 'border-white/10'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="display-font text-slate-400 text-sm tracking-widest">{L.task.toUpperCase()} {i + 1}</span>
                    {tasks.length > 1 && (
                      <button type="button" onClick={() => removeTask(tk.id)} className="text-slate-500 hover:text-red-400 text-base">✕ {L.remove}</button>
                    )}
                  </div>
                  <div className="mb-4">
                    <label className={label}>{L.taskDesc}</label>
                    <input value={tk.description} onChange={e => updTask(tk.id, { description: e.target.value })} placeholder={L.taskDescHint} className={input} />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end mb-4">
                    <div>
                      <label className={label}>{L.qty}</label>
                      <input type="number" min="0" step="1" value={tk.qty} onChange={e => updTask(tk.id, { qty: e.target.value })} placeholder="1" className={input} />
                    </div>
                    <div>
                      <label className={label}>{L.unitPriceLabor}</label>
                      <input type="number" min="0" step="0.01" value={tk.amount} onChange={e => updTask(tk.id, { amount: e.target.value })} placeholder="0.00" className={input} />
                    </div>
                    <div className="col-span-2 md:text-right">
                      <label className={label}>{L.lineTotal}</label>
                      <span className="text-emerald-300 text-xl font-semibold block py-2.5">{money(taskAmount(tk))}</span>
                    </div>
                  </div>

                  <label className="flex items-center gap-2.5 text-base text-slate-300 cursor-pointer mb-4">
                    <input type="checkbox" checked={tk.taxable} onChange={e => updTask(tk.id, { taxable: e.target.checked })} className="accent-amber-500 w-5 h-5" />
                    {L.taxableLabor}
                  </label>

                  {!linkedToOrder && (
                    <div className="bg-slate-900/40 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-slate-300 text-base font-medium">{L.whoWorked}</span>
                        {tk.mechanics.length < 2 && (
                          <button type="button" onClick={() => addMech(tk.id)} className="text-sky-300 hover:text-sky-200 text-base border border-sky-500/30 rounded-lg px-3 py-1.5">+ {L.addMechanic}</button>
                        )}
                      </div>
                      <div className="space-y-2.5">
                        {tk.mechanics.map(m => (
                          <div key={m.id} className="flex items-center gap-2.5 flex-wrap">
                            <select value={m.employee_id} onChange={e => updMech(tk.id, m.id, { employee_id: e.target.value })} className={input + ' flex-1 min-w-[180px] py-2.5'}>
                              <option value="">{L.selectMechanic}</option>
                              {mechanics.map(mm => <option key={mm.id} value={mm.id}>{mm.full_name}</option>)}
                            </select>
                            <div className="flex items-center gap-1.5">
                              <input type="number" min="0" max="100" step="1" value={m.commission_pct} onChange={e => updMech(tk.id, m.id, { commission_pct: e.target.value })} className="w-20 bg-slate-800 border border-white/15 rounded-xl px-3 py-2.5 text-lg text-slate-100" />
                              <span className="text-slate-400 text-lg">%</span>
                            </div>
                            <span className="text-emerald-300 text-lg font-semibold min-w-[90px] text-right">{money(mechPayout(tk, m))}</span>
                            {tk.mechanics.length > 1 && (
                              <button type="button" onClick={() => removeMech(tk.id, m.id)} className="text-slate-500 hover:text-red-400 px-2 text-xl">✕</button>
                            )}
                          </div>
                        ))}
                      </div>
                      {over && <p className="text-red-400 text-base mt-2">{L.errCommission}</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ─── Piezas ─── */}
        <div className={card} data-tour="facn-parts">
          <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
            <h2 className="display-font text-slate-100 font-bold text-xl md:text-2xl tracking-wide">{L.sectionParts}</h2>
            <button type="button" onClick={addPart} className="bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-200 text-lg font-semibold rounded-xl px-5 py-2.5 transition">+ {L.addPart}</button>
          </div>
          <p className={`${hint} mb-5`}>{L.partsDesc}</p>
          {parts.length === 0 ? (
            <p className="text-slate-500 text-lg">{L.noParts}</p>
          ) : (
            <div className="space-y-4">
              {parts.map(pt => (
                <div key={pt.id} className="rounded-2xl border border-white/10 bg-slate-800/40 p-5">
                  <div className="flex items-center gap-3 mb-3 flex-wrap">
                    <select value={pt.inventory_item_id} onChange={e => pickInventory(pt.id, e.target.value)} className={input + ' flex-1 min-w-[200px]'}>
                      <option value="">{L.oneoff}</option>
                      {invItems.map(it => <option key={it.id} value={it.id}>{it.name}{it.part_number ? ` (#${it.part_number})` : ''} · {it.quantity_on_hand} {L.inStock}</option>)}
                    </select>
                    <button type="button" onClick={() => removePart(pt.id)} className="text-slate-500 hover:text-red-400 text-base">✕ {L.remove}</button>
                  </div>
                  <input value={pt.description} onChange={e => updPart(pt.id, { description: e.target.value })} placeholder={L.partDesc} className={input + ' mb-3'} />
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
                    <div>
                      <label className="block text-slate-400 text-sm mb-1.5">{L.qty}</label>
                      <input type="number" min="0" step="0.01" value={pt.qty} onChange={e => updPart(pt.id, { qty: e.target.value })} className={input + ' py-2.5'} />
                    </div>
                    <div>
                      <label className="block text-slate-400 text-sm mb-1.5">{L.unitPrice}</label>
                      <input type="number" min="0" step="0.01" value={pt.unit_price} onChange={e => updPart(pt.id, { unit_price: e.target.value })} className={input + ' py-2.5'} />
                    </div>
                    <div>
                      <label className="block text-slate-400 text-sm mb-1.5">{L.cost}</label>
                      <input type="number" min="0" step="0.01" value={pt.cost} disabled={pt.part_source === 'warehouse'} onChange={e => updPart(pt.id, { cost: e.target.value })} className={input + ' py-2.5 disabled:opacity-50'} />
                    </div>
                    <div className="text-right">
                      <span className="text-emerald-300 text-xl font-semibold">{money(partAmount(pt))}</span>
                    </div>
                  </div>
                  {/* Aviso de existencias: si la cantidad supera lo que hay en bodega. */}
                  {pt.part_source === 'warehouse' && pt.inventory_item_id && (() => {
                    const inv = invItems.find(i => i.id === pt.inventory_item_id);
                    const qty = parseFloat(pt.qty) || 0;
                    if (inv && qty > Number(inv.quantity_on_hand)) {
                      return <p className="text-amber-300 text-base mt-2">⚠ {L.stockWarn.replace('{q}', String(inv.quantity_on_hand))}</p>;
                    }
                    return null;
                  })()}
                  <div className="flex items-center gap-4 mt-3 flex-wrap">
                    {pt.part_source !== 'warehouse' && (
                      <select value={pt.part_source} onChange={e => updPart(pt.id, { part_source: e.target.value as PartSource })} className="bg-slate-800 border border-white/15 rounded-lg px-3 py-2 text-base text-slate-100">
                        <option value="new_purchased">{L.sourceNew}</option>
                        <option value="used">{L.sourceUsed}</option>
                      </select>
                    )}
                    <label className="flex items-center gap-2 text-base text-slate-300 cursor-pointer">
                      <input type="checkbox" checked={pt.taxable} onChange={e => updPart(pt.id, { taxable: e.target.checked })} className="accent-amber-500 w-5 h-5" />
                      {L.taxable}
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ─── Totales ─── */}
        <div className={card} data-tour="facn-totals">
          <h2 className="display-font text-slate-100 font-bold text-xl md:text-2xl tracking-wide mb-2">{L.sectionTotals}</h2>
          <p className={`${hint} mb-5`}>{L.totalsDesc}</p>
          <div className="space-y-3 text-lg">
            <div className="flex justify-between"><span className="text-slate-400">{L.labor}</span><span className="text-slate-200 font-medium">{money(laborTotal)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">{L.partsLabel}</span><span className="text-slate-200 font-medium">{money(partsTotal)}</span></div>
            <div className="flex justify-between border-t border-white/10 pt-3"><span className="text-slate-400">{L.subtotal}</span><span className="text-slate-200 font-medium">{money(subtotal)}</span></div>

            <div className="flex justify-between items-center">
              <span className="text-slate-400">{L.tax}</span>
              {clientExempt ? (
                <span className="text-emerald-300 font-medium">{money(0)} · {L.exempt}</span>
              ) : autoTax ? (
                <span className="flex items-center gap-3">
                  <span className="text-slate-200 font-medium">{money(taxN)}</span>
                  <button type="button" onClick={() => { setTaxOverride(true); setTaxManual(String(taxN)); setTaxRateManual(selectedShop ? String(selectedShop.tax_rate) : ''); }} className="text-slate-500 hover:text-slate-300 text-base underline">{L.taxManual}</button>
                </span>
              ) : (
                <span className="flex items-center gap-2 flex-wrap justify-end">
                  <span className="flex items-center gap-1">
                    <input type="number" min="0" step="0.01" value={taxRateManual}
                      onChange={e => { const v = e.target.value; setTaxRateManual(v); setTaxManual(String(round2(subtotal * (parseFloat(v) || 0) / 100))); }}
                      placeholder="%" title={L.taxRateTitle}
                      className="w-20 bg-slate-800 border border-white/15 rounded-xl px-3 py-2 text-lg text-slate-100 text-right" />
                    <span className="text-slate-500 text-base">%</span>
                  </span>
                  <span className="text-slate-500 text-base">=</span>
                  <input type="number" min="0" step="0.01" value={taxManual} onChange={e => setTaxManual(e.target.value)} className="w-32 bg-slate-800 border border-white/15 rounded-xl px-3 py-2 text-lg text-slate-100 text-right" />
                  {selectedShop && <button type="button" onClick={() => setTaxOverride(false)} className="text-emerald-400 hover:text-emerald-300 text-base underline">{L.taxAuto}</button>}
                </span>
              )}
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-400">{L.discount}</span>
              <input type="number" min="0" step="0.01" value={discount} onChange={e => setDiscount(e.target.value)} className="w-32 bg-slate-800 border border-white/15 rounded-xl px-3 py-2 text-lg text-slate-100 text-right" />
            </div>

            <div className="flex justify-between items-center border-t border-white/10 pt-4">
              <span className="text-slate-200 text-xl font-semibold">{L.total}</span>
              <span className="text-amber-300 text-3xl font-bold display-font">{money(total)}</span>
            </div>

            {hasMechanics && !linkedToOrder && (
              <div className="flex justify-between text-base text-slate-500 pt-1">
                <span>{L.toPayroll}</span><span className="text-emerald-400/80">{money(totalPayout)}</span>
              </div>
            )}
          </div>

          {!isCredit && !isEditing && !isEstimate && (
            <label className="flex items-center gap-3 mt-5 text-lg text-slate-200 cursor-pointer">
              <input type="checkbox" checked={markPaid} onChange={e => setMarkPaid(e.target.checked)} className="accent-amber-500 w-6 h-6" />
              {L.markPaid}
            </label>
          )}
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/40 rounded-xl px-5 py-4 text-red-300 text-lg">{error}</div>}

        {/* ─── Botones ─── */}
        {isEditing ? (
          <>
            <div className="flex gap-3 flex-wrap pb-10" data-tour="facn-submit">
              <button type="button" disabled={saving} onClick={() => submit(true)}
                className="bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/50 text-slate-950 font-bold text-xl py-4 px-10 rounded-xl transition display-font tracking-wide">
                {saving ? L.saving : L.saveChanges}
              </button>
              <a href="/facturacion" className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-lg py-4 px-8 rounded-xl transition flex items-center">{t('common.cancel')}</a>
            </div>
            <p className="text-slate-500 text-base -mt-6 pb-10">{L.editHint}</p>
          </>
        ) : isEstimate ? (
          <>
            <div className="flex gap-3 flex-wrap pb-10" data-tour="facn-submit">
              <button type="button" disabled={saving} onClick={() => submit(true)}
                className="bg-purple-500 hover:bg-purple-400 disabled:bg-purple-500/50 text-slate-950 font-bold text-xl py-4 px-10 rounded-xl transition display-font tracking-wide">
                {saving ? L.saving : L.createEstimate}
              </button>
              <a href="/facturacion" className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-lg py-4 px-8 rounded-xl transition flex items-center">{t('common.cancel')}</a>
            </div>
            <p className="text-slate-500 text-base -mt-6 pb-10">{L.estimateHint}</p>
          </>
        ) : (
          <>
            <div className="flex gap-3 flex-wrap pb-10" data-tour="facn-submit">
              <button type="button" disabled={saving} onClick={() => submit(false)}
                className="bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/50 text-slate-950 font-bold text-xl py-4 px-10 rounded-xl transition display-font tracking-wide">
                {saving ? L.saving : L.create}
              </button>
              <button type="button" disabled={saving} onClick={() => submit(true)}
                className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-amber-200 border border-amber-500/40 text-lg font-semibold py-4 px-8 rounded-xl transition">
                {L.saveDraft}
              </button>
              <a href="/facturacion" className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-lg py-4 px-8 rounded-xl transition flex items-center">{t('common.cancel')}</a>
            </div>
            <p className="text-slate-500 text-base -mt-6 pb-10">{L.draftHint}</p>
          </>
        )}
      </div>

      {/* ─── Modal: alta rápida de cliente ─── */}
      {newClientOpen && (
        <div className="fixed inset-0 z-50 flex items-start md:items-center justify-center bg-black/60 p-4 overflow-y-auto" onClick={() => !ncSaving && setNewClientOpen(false)}>
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 md:p-7 w-full max-w-lg my-8" onClick={e => e.stopPropagation()}>
            <h2 className="display-font text-slate-100 font-bold text-2xl tracking-wide mb-1">{L.newClientTitle}</h2>
            <p className={`${hint} mb-5`}>{L.newClientDesc}</p>

            <div className="space-y-4">
              <div className="flex gap-3 flex-wrap">
                <button type="button" onClick={() => setNcType('corporate')}
                  className={`px-5 py-3 rounded-xl text-lg border transition ${ncType === 'corporate' ? 'bg-amber-500/15 border-amber-500/50 text-amber-200 font-semibold' : 'bg-slate-800 border-white/10 text-slate-400 hover:text-slate-200'}`}>
                  {L.typeCompany}
                </button>
                <button type="button" onClick={() => setNcType('individual')}
                  className={`px-5 py-3 rounded-xl text-lg border transition ${ncType === 'individual' ? 'bg-amber-500/15 border-amber-500/50 text-amber-200 font-semibold' : 'bg-slate-800 border-white/10 text-slate-400 hover:text-slate-200'}`}>
                  {L.typeIndividual}
                </button>
              </div>
              <div>
                <label className={label}>{L.walkinName}</label>
                <input value={ncName} onChange={e => setNcName(e.target.value)} placeholder={L.walkinNameHint} className={input} autoFocus />
              </div>
              <div>
                <label className={label}>{L.walkinPhone} <span className="text-slate-500 text-sm font-normal">{L.optional}</span></label>
                <input value={ncPhone} onChange={e => setNcPhone(e.target.value)} placeholder={L.walkinPhoneHint} className={input} />
              </div>
              <div className="bg-slate-800/40 border border-white/5 rounded-xl p-4">
                <label className="flex items-center gap-3 cursor-pointer text-lg text-slate-200">
                  <input type="checkbox" checked={ncExempt} onChange={e => setNcExempt(e.target.checked)} className="accent-amber-500 w-5 h-5" />
                  {L.ncExemptLabel}
                </label>
                {ncExempt && (
                  <div className="mt-3">
                    <label className={label}>{L.ncCertLabel}</label>
                    <input value={ncCert} onChange={e => setNcCert(e.target.value)} className={input} />
                  </div>
                )}
              </div>
              <p className={hint}>{L.newClientMoreHint}</p>
              {ncError && <div className="bg-red-500/10 border border-red-500/40 rounded-xl px-4 py-3 text-red-300 text-base">{ncError}</div>}
            </div>

            <div className="flex gap-3 flex-wrap mt-6">
              <button type="button" disabled={ncSaving} onClick={saveNewClient}
                className="bg-sky-500 hover:bg-sky-400 disabled:bg-sky-500/50 text-slate-950 font-bold text-lg py-3.5 px-8 rounded-xl transition">
                {ncSaving ? L.saving : L.ncSave}
              </button>
              <button type="button" disabled={ncSaving} onClick={() => setNewClientOpen(false)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-lg py-3.5 px-6 rounded-xl transition">
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Textos (bilingüe local) ─────────────────────────────────────────────────
const ES = {
  back: 'Volver a facturas', title: 'Nueva factura',
  docInvoice: 'Factura', docEstimate: 'Cotización',
  estimateHint: 'Cotización: no lleva número fiscal, no cobra ni baja inventario. Si el cliente acepta, se convierte en factura con un botón.',
  docHint: 'Factura = documento fiscal que cobra y baja inventario. Cotización = presupuesto, no cobra ni lleva número.',
  registeredDesc: 'Un cliente que ya está guardado en tu lista. Aparecen su distrito y camión si los tiene cargados.',
  walkinDesc: 'Alguien que llega una sola vez. Escribes su nombre a mano; no se guarda como cliente.',
  locTruckDesc: 'El distrito y el camión solo aparecen si el cliente los tiene registrados. Son opcionales.',
  orderNumberDesc: 'El número de la orden del otro sistema, si lo tienes. Sale en la factura. Opcional.',
  shopDesc: 'El negocio que emite la factura (01 papá / 02 hijo). Define la numeración y la tasa de impuesto.',
  dueDateDesc: 'Hasta cuándo tiene el cliente para pagar (cuando es a crédito).',
  pmDesc: 'Efectivo, cheque, tarjeta o depósito = ya pagada. A crédito = queda pendiente en Cuentas por cobrar.',
  laborDesc: 'Un renglón por trabajo: qué se hizo y su precio. Marca "cobra impuesto" solo si aplica (normalmente la mano de obra no lo lleva en Florida). Elige quién trabajó y su % de comisión.',
  partsDesc: '"De bodega" descuenta el stock y usa el costo guardado. "Suelta" es una pieza que no manejas en inventario: le pones costo (lo que te costó) y precio (lo que cobras) a mano.',
  totalsDesc: 'El impuesto se calcula solo con la tasa del taller; puedes ponerlo a mano. El descuento resta del total.',
  createEstimate: 'Guardar cotización', editEstimateTitle: 'Editar cotización',
  stockWarn: 'Solo hay {q} en bodega; el inventario quedará en negativo al emitir.',
  editTitle: 'Editar borrador', saveChanges: 'Guardar cambios',
  editHint: 'Estás editando un borrador. Al guardar sigue como borrador; emítela desde la lista cuando esté lista.',
  editNotFound: 'No se pudo cargar el borrador.', editOnlyDraft: 'Solo se puede editar un borrador (una factura emitida se anula, no se edita).',
  sectionInsurance: 'Cobrar a seguro', insurer: 'Aseguradora', insurerHint: 'Ej. Progressive, GEICO…',
  claim: 'Nº de reclamo / póliza', claimHint: 'Ej. CLM-00123',
  insuranceHint: 'La factura se cobra "a crédito": queda abierta y la envías al seguro; registras el pago cuando paguen.',
  sectionClient: 'Cliente', registered: 'Cliente registrado', walkin: 'Cliente ocasional',
  walkinName: 'Nombre del cliente', walkinNameHint: 'Escriba el nombre del cliente', optional: '(opcional)',
  walkinCompany: 'Empresa / compañía', walkinCompanyHint: 'Ej. Transportes López',
  walkinPhone: 'Teléfono', walkinPhoneHint: 'Ej. (305) 555-1234',
  walkinTruck: 'Camión / vehículo', walkinTruckHint: 'Ej. unidad 142 o placa ABC-1234',
  client: 'Cliente', selectClient: 'Seleccione un cliente', location: 'Distrito / Sucursal', noLocation: 'Sin distrito',
  truck: 'Camión', selectTruck: 'Seleccione un camión', exemptHint: 'Cliente exento de impuesto',
  newClient: 'Registrar cliente nuevo', newClientTitle: 'Registrar cliente nuevo',
  newClientDesc: 'Se guarda en tu lista de clientes y queda seleccionado en esta factura.',
  typeCompany: 'Empresa', typeIndividual: 'Particular',
  ncExemptLabel: 'Cliente exento de sales tax', ncCertLabel: 'Nº de certificado de exención',
  newClientMoreHint: 'Puedes completar el resto (dirección, correo, términos) después en la sección Clientes.',
  ncSave: 'Guardar cliente', ncFail: 'No se pudo crear el cliente.',
  sectionInvoice: 'Datos de la factura',
  fromOrder: '¿Ya hay una orden de trabajo para este trabajo? (opcional)', fromOrderNone: 'No, es una factura nueva',
  fromOrderHint: 'Se usará esa orden y sus comisiones; no se crearán comisiones nuevas.',
  orderNumber: 'Número de orden', orderNumberHint: 'Ej. 1234',
  shop: 'Taller', noShop: 'Sin taller', issueDate: 'Fecha', dueDate: 'Fecha de vencimiento',
  paymentMethod: 'Forma de pago', creditHint: 'A crédito: la factura queda pendiente de pago.',
  sectionLabor: 'Mano de obra', addTask: 'Agregar trabajo', task: 'Trabajo', remove: 'Quitar',
  taskDesc: '¿Qué se hizo?', taskDescHint: 'Ej. Cambio de llanta', amount: 'Precio ($)',
  unitPriceLabor: 'Precio por unidad ($)', lineTotal: 'Total del renglón',
  taxableLabor: 'Cobra impuesto a esta mano de obra',
  whoWorked: '¿Quién trabajó?', addMechanic: 'Agregar mecánico', selectMechanic: 'Seleccione mecánico',
  laborLinkedHint: 'Esta factura está enlazada a una orden existente; las comisiones vienen de esa orden.',
  sectionParts: 'Piezas y repuestos', addPart: 'Agregar pieza', noParts: 'Sin piezas todavía.',
  oneoff: 'Pieza suelta (no de bodega)', inStock: 'en bodega', partDesc: 'Descripción de la pieza',
  qty: 'Cantidad', unitPrice: 'Precio ($)', cost: 'Costo ($)', sourceNew: 'Nueva comprada', sourceUsed: 'Usada', taxable: 'Cobra impuesto',
  sectionTotals: 'Totales', labor: 'Mano de obra', partsLabel: 'Piezas', subtotal: 'Subtotal',
  tax: 'Impuesto', exempt: 'Exento', taxManual: 'Poner a mano', taxAuto: 'Volver a automático',
  taxRateTitle: 'Tasa % a mano (calcula el monto sobre el subtotal y lo suma)',
  discount: 'Descuento', total: 'TOTAL', toPayroll: 'Comisiones a planilla', markPaid: 'Marcar como pagada ahora',
  create: 'Crear factura', saveDraft: 'Guardar borrador', saving: 'Guardando...',
  draftHint: 'Borrador: guarda el trabajo en proceso. Al "Emitir" desde la lista se asigna el número fiscal, baja el inventario y se crea la orden de trabajo con las comisiones.',
  errClient: 'Seleccione un cliente o escriba el nombre.', errWalkinName: 'Escriba el nombre del cliente.',
  errTotal: 'El total debe ser mayor a $0.', errCommission: 'La comisión no puede pasar de 100%.', errCommissionPct: 'Ponga un % de comisión mayor a 0.',
  pm: { cash: 'Efectivo', check: 'Cheque', card: 'Tarjeta', deposit: 'Depósito', credit: 'A crédito' } as Record<PaymentMethod, string>,
};
const EN = {
  back: 'Back to invoices', title: 'New invoice',
  docInvoice: 'Invoice', docEstimate: 'Estimate',
  estimateHint: 'Estimate: no tax number, no charge, no inventory deduction. If the customer accepts, convert it into an invoice with one click.',
  docHint: 'Invoice = a fiscal document that charges and lowers inventory. Estimate = a quote, no charge and no number.',
  registeredDesc: 'A customer already saved in your list. Their district and truck show if they have them.',
  walkinDesc: 'Someone who comes once. You type their name; it isn’t saved as a customer.',
  locTruckDesc: 'District and truck only show if the customer has them registered. Both optional.',
  orderNumberDesc: 'The order number from the other system, if you have it. It shows on the invoice. Optional.',
  shopDesc: 'The business issuing the invoice (01 dad / 02 son). Sets the numbering and the tax rate.',
  dueDateDesc: 'How long the customer has to pay (when on credit).',
  pmDesc: 'Cash, check, card or deposit = already paid. On credit = stays open in Accounts receivable.',
  laborDesc: 'One row per job: what was done and its price. Check “charge tax” only if it applies (labor usually isn’t taxed in Florida). Pick who worked and their commission %.',
  partsDesc: '“From warehouse” lowers stock and uses the saved cost. “One-off” is a part you don’t keep in inventory: you enter cost (what you paid) and price (what you charge) by hand.',
  totalsDesc: 'Tax is computed automatically with the shop rate; you can enter it by hand. The discount subtracts from the total.',
  createEstimate: 'Save estimate', editEstimateTitle: 'Edit estimate',
  stockWarn: 'Only {q} in stock; inventory will go negative when emitted.',
  editTitle: 'Edit draft', saveChanges: 'Save changes',
  editHint: 'You are editing a draft. Saving keeps it a draft; emit it from the list when ready.',
  editNotFound: 'Could not load the draft.', editOnlyDraft: 'Only a draft can be edited (an issued invoice is voided, not edited).',
  sectionInsurance: 'Bill to insurance', insurer: 'Insurance company', insurerHint: 'e.g. Progressive, GEICO…',
  claim: 'Claim / policy #', claimHint: 'e.g. CLM-00123',
  insuranceHint: 'The invoice is billed "on credit": it stays open and you send it to the insurer; record the payment when they pay.',
  sectionClient: 'Customer', registered: 'Registered customer', walkin: 'Walk-in customer',
  walkinName: 'Customer name', walkinNameHint: 'Type the customer name', optional: '(optional)',
  walkinCompany: 'Company', walkinCompanyHint: 'e.g. Lopez Trucking',
  walkinPhone: 'Phone', walkinPhoneHint: 'e.g. (305) 555-1234',
  walkinTruck: 'Truck / vehicle', walkinTruckHint: 'e.g. unit 142 or plate ABC-1234',
  client: 'Customer', selectClient: 'Select a customer', location: 'District / Location', noLocation: 'No district',
  truck: 'Truck', selectTruck: 'Select a truck', exemptHint: 'Tax-exempt customer',
  newClient: 'Register new customer', newClientTitle: 'Register new customer',
  newClientDesc: 'It’s saved to your customer list and selected on this invoice.',
  typeCompany: 'Company', typeIndividual: 'Individual',
  ncExemptLabel: 'Tax-exempt customer', ncCertLabel: 'Exemption certificate #',
  newClientMoreHint: 'You can fill in the rest (address, email, terms) later in the Customers section.',
  ncSave: 'Save customer', ncFail: 'Could not create the customer.',
  sectionInvoice: 'Invoice details',
  fromOrder: 'Is there already a work order for this job? (optional)', fromOrderNone: 'No, this is a new invoice',
  fromOrderHint: 'That order and its commissions will be used; no new commissions are created.',
  orderNumber: 'Order number', orderNumberHint: 'e.g. 1234',
  shop: 'Shop', noShop: 'No shop', issueDate: 'Date', dueDate: 'Due date',
  paymentMethod: 'Payment method', creditHint: 'On credit: the invoice stays unpaid.',
  sectionLabor: 'Labor', addTask: 'Add job', task: 'Job', remove: 'Remove',
  taskDesc: 'What was done?', taskDescHint: 'e.g. Tire replacement', amount: 'Price ($)',
  unitPriceLabor: 'Unit price ($)', lineTotal: 'Line total',
  taxableLabor: 'Charge tax on this labor',
  whoWorked: 'Who worked on it?', addMechanic: 'Add mechanic', selectMechanic: 'Select mechanic',
  laborLinkedHint: 'This invoice is linked to an existing order; commissions come from that order.',
  sectionParts: 'Parts', addPart: 'Add part', noParts: 'No parts yet.',
  oneoff: 'One-off part (not from warehouse)', inStock: 'in stock', partDesc: 'Part description',
  qty: 'Qty', unitPrice: 'Price ($)', cost: 'Cost ($)', sourceNew: 'New purchased', sourceUsed: 'Used', taxable: 'Taxable',
  sectionTotals: 'Totals', labor: 'Labor', partsLabel: 'Parts', subtotal: 'Subtotal',
  tax: 'Tax', exempt: 'Exempt', taxManual: 'Enter manually', taxAuto: 'Back to automatic',
  taxRateTitle: 'Manual % rate (computes the amount on the subtotal and adds it)',
  discount: 'Discount', total: 'TOTAL', toPayroll: 'Commissions to payroll', markPaid: 'Mark as paid now',
  create: 'Create invoice', saveDraft: 'Save draft', saving: 'Saving...',
  draftHint: 'Draft: saves work in progress. "Emit" from the list assigns the tax number, lowers inventory and creates the work order with commissions.',
  errClient: 'Select a customer or type a name.', errWalkinName: 'Type the customer name.',
  errTotal: 'Total must be greater than $0.', errCommission: 'Commission cannot exceed 100%.', errCommissionPct: 'Enter a commission % greater than 0.',
  pm: { cash: 'Cash', check: 'Check', card: 'Card', deposit: 'Deposit', credit: 'On credit' } as Record<PaymentMethod, string>,
};
