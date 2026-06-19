'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { InvoicePdfButton } from '@/components/InvoicePdfButton';

type PaymentMethod = 'cash' | 'check' | 'card' | 'deposit' | 'credit';
type ReceiptMethod = 'cash' | 'check' | 'card' | 'deposit';
type InvoiceStatus = 'draft' | 'open' | 'partial' | 'paid' | 'void';

type DocumentType = 'invoice' | 'estimate' | 'work_order';

interface Invoice {
  id: string;
  document_number: string | null;
  document_type: DocumentType;
  client_id: string | null;
  client_name: string | null;
  shop_id: string | null;
  issue_date: string;
  due_date: string | null;
  payment_method: PaymentMethod;
  status: InvoiceStatus;
  subtotal: number;
  tax_amount: number;
  discount: number;
  total: number;
  amount_paid: number;
  balance: number;
  description: string | null;
}

interface ClientOpt { id: string; name: string }
interface ShopOpt { id: string; name: string; tax_rate: number }
interface InvItem { id: string; name: string; part_number: string | null; sale_price: number; unit_cost: number; quantity_on_hand: number }

type LineType = 'labor' | 'part' | 'fee';
type PartSource = 'new_purchased' | 'used' | 'warehouse';
interface Line {
  id: string;
  line_type: LineType;
  description: string;
  qty: string;
  unit_price: string;
  cost: string;
  part_source: PartSource;
  inventory_item_id: string;
  taxable: boolean;
  mechanic_id: string;     // solo mano de obra: mecánico que gana la comisión
  commission_pct: string;  // % de comisión (default 50)
}
interface MechanicOpt { id: string; full_name: string }
const PART_SOURCES: PartSource[] = ['new_purchased', 'used', 'warehouse'];
let lineSeq = 0;
const newLine = (type: LineType = 'part'): Line => ({
  id: `l${++lineSeq}`, line_type: type, description: '', qty: '1', unit_price: '', cost: '',
  part_source: type === 'part' ? 'new_purchased' : 'new_purchased', inventory_item_id: '', taxable: type === 'part',
  mechanic_id: '', commission_pct: '50',
});

const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'check', 'card', 'deposit', 'credit'];
const RECEIPT_METHODS: ReceiptMethod[] = ['cash', 'check', 'card', 'deposit'];
const STATUSES: InvoiceStatus[] = ['draft', 'open', 'partial', 'paid', 'void'];
const DOCUMENT_TYPES: DocumentType[] = ['invoice', 'estimate', 'work_order'];
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

const inputCls =
  'w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/50 transition';
const money = (n: any) => `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_STYLE: Record<InvoiceStatus, string> = {
  draft: 'bg-slate-700/40 border-white/10 text-slate-400',
  open: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
  partial: 'bg-sky-500/10 border-sky-500/30 text-sky-300',
  paid: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
  void: 'bg-red-500/10 border-red-500/30 text-red-300',
};

export default function FacturacionPage() {
  const { t } = useLanguage();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [shops, setShops] = useState<ShopOpt[]>([]);
  const [mechanics, setMechanics] = useState<MechanicOpt[]>([]);
  const [invItems, setInvItems] = useState<InvItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [busyId, setBusyId] = useState<string | null>(null);

  // Crear
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    client_id: '', shop_id: '', document_type: 'invoice' as DocumentType,
    issue_date: new Date().toISOString().slice(0, 10),
    due_date: '', payment_method: 'cash' as PaymentMethod,
    subtotal: '', tax_amount: '', tax_override: false, discount: '', description: '', mark_paid: true,
  });
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Pago
  const [payFor, setPayFor] = useState<Invoice | null>(null);
  const [payForm, setPayForm] = useState({ amount: '', method: 'cash' as ReceiptMethod, reference: '', paid_at: new Date().toISOString().slice(0, 10), notes: '' });
  const [paySaving, setPaySaving] = useState(false);
  const [payError, setPayError] = useState('');

  async function load() {
    try {
      const res = await fetch('/api/facturas' + (statusFilter ? `?status=${statusFilter}` : ''));
      const j = await res.json();
      setInvoices((j.invoices ?? []) as Invoice[]);
    } catch { setInvoices([]); }
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [statusFilter]);
  useEffect(() => {
    (async () => {
      try { const r = await fetch('/api/clientes'); const j = await r.json(); setClients((j.clients ?? []).map((c: any) => ({ id: c.id, name: c.name }))); } catch {}
      try { const r = await fetch('/api/shops'); if (r.ok) { const j = await r.json(); setShops((j.shops ?? []).map((s: any) => ({ id: s.id, name: s.name, tax_rate: Number(s.tax_rate) || 0 }))); } } catch {}
      try { const r = await fetch('/api/empleados'); if (r.ok) { const j = await r.json(); setMechanics((j.employees ?? []).filter((e: any) => (e.role ?? '').toLowerCase() === 'mechanic').map((e: any) => ({ id: e.id, full_name: e.full_name }))); } } catch {}
      try { const r = await fetch('/api/inventario'); if (r.ok) { const j = await r.json(); setInvItems((j.items ?? []) as InvItem[]); } } catch {}
    })();
  }, []);

  // ─── Renglones (mano de obra / piezas) ───
  const lineAmount = (l: Line) => (parseFloat(l.qty) || 0) * (parseFloat(l.unit_price) || 0);
  function addLine(type: LineType) { setLines(prev => [...prev, newLine(type)]); }
  function removeLine(id: string) { setLines(prev => prev.filter(l => l.id !== id)); }
  function updateLine(id: string, patch: Partial<Line>) { setLines(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l)); }
  function pickInventory(id: string, invId: string) {
    const inv = invItems.find(i => i.id === invId);
    if (!inv) { updateLine(id, { inventory_item_id: '', part_source: 'new_purchased' }); return; }
    updateLine(id, {
      inventory_item_id: invId, part_source: 'warehouse',
      description: inv.name, cost: String(inv.unit_cost),
      unit_price: String(inv.sale_price || ''), taxable: true,
    });
  }

  const linesSubtotal = round2(lines.reduce((s, l) => s + lineAmount(l), 0));
  const subtotalN = lines.length ? linesSubtotal : (parseFloat(form.subtotal) || 0);

  // Sales tax automático: si hay taller (con tasa) y renglones, se calcula sobre
  // la base gravable (Σ renglones taxable). El usuario puede pasar a manual.
  const selectedShop = shops.find(s => s.id === form.shop_id) || null;
  const taxableBase = round2(lines.filter(l => l.taxable).reduce((s, l) => s + lineAmount(l), 0));
  const autoTax = !!selectedShop && lines.length > 0 && !form.tax_override;
  const taxN = autoTax ? round2(taxableBase * selectedShop!.tax_rate / 100) : (parseFloat(form.tax_amount) || 0);

  const discountN = parseFloat(form.discount) || 0;
  const totalN = Math.max(0, subtotalN + taxN - discountN);
  const isCredit = form.payment_method === 'credit';
  const isFiscal = form.document_type === 'invoice';

  async function handleCreate(e: React.FormEvent | null, asDraft = false) {
    if (e) e.preventDefault();
    setFormError('');
    if (totalN <= 0) { setFormError(t('invoices.errTotal')); return; }
    setSaving(true);
    const res = await fetch('/api/facturas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: form.client_id || null,
        shop_id: form.shop_id || null,
        document_type: form.document_type,
        draft: asDraft && isFiscal,
        issue_date: form.issue_date,
        due_date: form.due_date || null,
        payment_method: form.payment_method,
        subtotal: subtotalN, tax_amount: taxN, tax_override: form.tax_override, discount: discountN,
        description: form.description,
        mark_paid: !asDraft && isFiscal && !isCredit && form.mark_paid,
        items: lines.map(l => ({
          line_type: l.line_type,
          description: l.description,
          qty: parseFloat(l.qty) || 0,
          unit_price: parseFloat(l.unit_price) || 0,
          cost: l.line_type === 'part' ? (parseFloat(l.cost) || 0) : 0,
          part_source: l.line_type === 'part' ? l.part_source : null,
          inventory_item_id: l.line_type === 'part' && l.part_source === 'warehouse' ? (l.inventory_item_id || null) : null,
          taxable: l.taxable,
          mechanic_id: l.line_type === 'labor' ? (l.mechanic_id || null) : null,
          commission_pct: l.line_type === 'labor' ? (parseFloat(l.commission_pct) || 0) : 0,
        })),
      }),
    });
    const j = await res.json();
    if (!res.ok) { setFormError(j.error ?? 'Error'); setSaving(false); return; }
    setSaving(false); setShowForm(false);
    setForm({ client_id: '', shop_id: '', document_type: 'invoice', issue_date: new Date().toISOString().slice(0, 10), due_date: '', payment_method: 'cash', subtotal: '', tax_amount: '', tax_override: false, discount: '', description: '', mark_paid: true });
    setLines([]);
    load();
  }

  function openPay(inv: Invoice) {
    setPayFor(inv);
    setPayForm({ amount: String(inv.balance), method: 'cash', reference: '', paid_at: new Date().toISOString().slice(0, 10), notes: '' });
    setPayError('');
  }

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!payFor) return;
    setPayError(''); setPaySaving(true);
    const res = await fetch(`/api/facturas/${payFor.id}/pagos`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: parseFloat(payForm.amount) || 0, method: payForm.method, reference: payForm.reference, paid_at: payForm.paid_at, notes: payForm.notes }),
    });
    const j = await res.json();
    if (!res.ok) { setPayError(j.error ?? 'Error'); setPaySaving(false); return; }
    setPaySaving(false); setPayFor(null); load();
  }

  async function handleVoid(inv: Invoice) {
    if (!confirm(t('invoices.voidConfirm').replace('{n}', inv.document_number ?? ''))) return;
    setBusyId(inv.id);
    await fetch(`/api/facturas/${inv.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'void' }) });
    setBusyId(null); load();
  }

  async function handleDelete(inv: Invoice) {
    if (!confirm(t('invoices.deleteConfirm').replace('{n}', inv.document_number ?? ''))) return;
    setBusyId(inv.id);
    const res = await fetch(`/api/facturas/${inv.id}`, { method: 'DELETE' });
    if (!res.ok) { const j = await res.json().catch(() => ({})); alert((j as any).error ?? t('invoices.deleteError')); }
    setBusyId(null); load();
  }

  // ─── Borradores: tareas pendientes + emisión ───
  const [draftItems, setDraftItems] = useState<Record<string, any[]>>({});
  const [expandedDraft, setExpandedDraft] = useState<string | null>(null);
  const [emittingId, setEmittingId] = useState<string | null>(null);

  async function loadDraftItems(invId: string) {
    try {
      const r = await fetch(`/api/facturas/${invId}/items`);
      if (r.ok) { const j = await r.json(); setDraftItems(prev => ({ ...prev, [invId]: j.items ?? [] })); }
    } catch {}
  }

  function toggleDraft(invId: string) {
    if (expandedDraft === invId) { setExpandedDraft(null); return; }
    setExpandedDraft(invId);
    if (!draftItems[invId]) loadDraftItems(invId);
  }

  async function toggleTask(invId: string, item: any) {
    await fetch(`/api/facturas/${invId}/items`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: item.id, done: !item.done }),
    });
    loadDraftItems(invId);
  }

  async function emitInvoice(inv: Invoice, force = false) {
    setEmittingId(inv.id);
    const res = await fetch(`/api/facturas/${inv.id}/emitir`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force }),
    });
    const j = await res.json().catch(() => ({}));
    setEmittingId(null);
    if (res.status === 409 && j.error === 'pending_tasks') {
      if (confirm(t('invoices.emitPendingConfirm').replace('{n}', String(j.pending)))) emitInvoice(inv, true);
      return;
    }
    if (!res.ok) { alert(j.error ?? 'Error'); return; }
    const msg = j.commissions_created > 0
      ? t('invoices.emitDoneCommissions').replace('{n}', String(j.commissions_created)).replace('{a}', money(j.commissions_total))
      : t('invoices.emitDone');
    alert(msg);
    setExpandedDraft(null);
    load();
  }

  return (
    <div>
      {/* Modal crear */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-amber-500/20 rounded-2xl p-6 w-full max-w-2xl my-8 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="display-font text-slate-100 font-bold text-lg tracking-wide">{t('invoices.newInvoice')}</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-500 hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-700 transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-slate-400 text-sm mb-1.5">{t('invoices.documentType')}</label>
                <div className="flex gap-2 flex-wrap">
                  {DOCUMENT_TYPES.map(dt => (
                    <button key={dt} type="button" onClick={() => setForm(f => ({ ...f, document_type: dt }))}
                      className={`px-3 py-1.5 rounded-lg text-sm border transition ${form.document_type === dt ? 'bg-amber-500/15 border-amber-500/40 text-amber-300' : 'bg-slate-800 border-white/10 text-slate-400 hover:text-slate-200'}`}>
                      {t(`invoices.docType.${dt}`)}
                    </button>
                  ))}
                </div>
                {!isFiscal && <p className="text-amber-400/80 text-xs mt-1.5">{t('invoices.nonFiscalHint')}</p>}
              </div>
              <div className="md:col-span-2">
                <label className="block text-slate-400 text-sm mb-1.5">{t('invoices.client')}</label>
                <select value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))} className={inputCls}>
                  <option value="">{t('invoices.selectClient')}</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              {shops.length > 0 && (
                <div className="md:col-span-2">
                  <label className="block text-slate-400 text-sm mb-1.5">{t('invoices.shop')}</label>
                  <select value={form.shop_id} onChange={e => setForm(f => ({ ...f, shop_id: e.target.value }))} className={inputCls}>
                    <option value="">{t('invoices.noShop')}</option>
                    {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-slate-400 text-sm mb-1.5">{t('invoices.issueDate')}</label>
                <input type="date" value={form.issue_date} onChange={e => setForm(f => ({ ...f, issue_date: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className="block text-slate-400 text-sm mb-1.5">{t('invoices.dueDate')}</label>
                <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className={inputCls} />
              </div>
              <div className="md:col-span-2">
                <label className="block text-slate-400 text-sm mb-1.5">{t('invoices.paymentMethod')}</label>
                <select value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value as PaymentMethod }))} className={inputCls}>
                  {PAYMENT_METHODS.map(pm => <option key={pm} value={pm}>{t(`invoices.pm.${pm}`)}</option>)}
                </select>
                {isCredit && <p className="text-amber-400/80 text-xs mt-1">{t('invoices.creditHint')}</p>}
              </div>
              {/* Renglones (mano de obra / piezas) */}
              <div className="md:col-span-2 bg-slate-800/40 border border-white/5 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-slate-400 text-sm">{t('invoices.lines.title')}</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => addLine('labor')} className="text-sky-400 hover:text-sky-300 text-xs border border-sky-500/20 rounded px-2 py-1 transition">+ {t('invoices.lines.labor')}</button>
                    <button type="button" onClick={() => addLine('part')} className="text-amber-400 hover:text-amber-300 text-xs border border-amber-500/20 rounded px-2 py-1 transition">+ {t('invoices.lines.part')}</button>
                  </div>
                </div>
                {lines.length === 0 ? (
                  <p className="text-slate-600 text-xs">{t('invoices.lines.empty')}</p>
                ) : (
                  <div className="space-y-2">
                    {lines.map(l => (
                      <div key={l.id} className="bg-slate-900/50 border border-white/5 rounded-lg p-2.5 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${l.line_type === 'part' ? 'bg-amber-500/15 text-amber-300' : 'bg-sky-500/15 text-sky-300'}`}>{t(`invoices.lineType.${l.line_type}`)}</span>
                          {l.line_type === 'part' && (
                            <select value={l.inventory_item_id} onChange={e => pickInventory(l.id, e.target.value)}
                              className="flex-1 bg-slate-800 border border-white/10 rounded px-2 py-1 text-slate-100 text-xs">
                              <option value="">{t('invoices.lines.oneoff')}</option>
                              {invItems.map(i => <option key={i.id} value={i.id}>{i.name}{i.part_number ? ` (#${i.part_number})` : ''} · {i.quantity_on_hand} {t('invoices.lines.inStock')}</option>)}
                            </select>
                          )}
                          <button type="button" onClick={() => removeLine(l.id)} className="text-slate-600 hover:text-red-400 p-1 flex-shrink-0">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                        <input value={l.description} onChange={e => updateLine(l.id, { description: e.target.value })} placeholder={t('invoices.lines.description')}
                          className="w-full bg-slate-800 border border-white/10 rounded px-2 py-1.5 text-slate-100 text-sm" />
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div>
                            <label className="block text-slate-600 text-[10px] mb-0.5">{t('invoices.lines.qty')}</label>
                            <input type="number" min="0" step="0.01" value={l.qty} onChange={e => updateLine(l.id, { qty: e.target.value })} className="w-full bg-slate-800 border border-white/10 rounded px-2 py-1 text-slate-100 text-sm" />
                          </div>
                          <div>
                            <label className="block text-slate-600 text-[10px] mb-0.5">{t('invoices.lines.unitPrice')}</label>
                            <input type="number" min="0" step="0.01" value={l.unit_price} onChange={e => updateLine(l.id, { unit_price: e.target.value })} className="w-full bg-slate-800 border border-white/10 rounded px-2 py-1 text-slate-100 text-sm" />
                          </div>
                          {l.line_type === 'part' && (
                            <div>
                              <label className="block text-slate-600 text-[10px] mb-0.5">{t('invoices.lines.cost')}</label>
                              <input type="number" min="0" step="0.01" value={l.cost} disabled={l.part_source === 'warehouse'} onChange={e => updateLine(l.id, { cost: e.target.value })} className="w-full bg-slate-800 border border-white/10 rounded px-2 py-1 text-slate-100 text-sm disabled:opacity-50" />
                            </div>
                          )}
                          <div className="flex items-end justify-end">
                            <span className="text-emerald-300 text-sm font-semibold">{money(lineAmount(l))}</span>
                          </div>
                        </div>
                        {l.line_type === 'part' && l.part_source !== 'warehouse' && (
                          <div className="flex items-center gap-3">
                            <select value={l.part_source} onChange={e => updateLine(l.id, { part_source: e.target.value as PartSource })} className="bg-slate-800 border border-white/10 rounded px-2 py-1 text-slate-100 text-xs">
                              <option value="new_purchased">{t('invoices.source.new_purchased')}</option>
                              <option value="used">{t('invoices.source.used')}</option>
                            </select>
                            <label className="flex items-center gap-1.5 text-xs text-slate-400">
                              <input type="checkbox" checked={l.taxable} onChange={e => updateLine(l.id, { taxable: e.target.checked })} className="accent-amber-500" />
                              {t('invoices.lines.taxable')}
                            </label>
                          </div>
                        )}
                        {l.line_type === 'labor' && isFiscal && (
                          <div className="flex items-center gap-2 flex-wrap border-t border-white/5 pt-2">
                            <span className="text-slate-500 text-[10px]">{t('invoices.lines.mechanic')}:</span>
                            <select value={l.mechanic_id} onChange={e => updateLine(l.id, { mechanic_id: e.target.value })} className="bg-slate-800 border border-white/10 rounded px-2 py-1 text-slate-100 text-xs">
                              <option value="">{t('invoices.lines.noMechanic')}</option>
                              {mechanics.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                            </select>
                            {l.mechanic_id && (
                              <span className="flex items-center gap-1 text-xs text-slate-400">
                                <input type="number" min="0" max="100" step="1" value={l.commission_pct} onChange={e => updateLine(l.id, { commission_pct: e.target.value })} className="w-12 bg-slate-800 border border-white/10 rounded px-1.5 py-1 text-slate-100 text-xs" />%
                                <span className="text-emerald-400/70">= {money(lineAmount(l) * (parseFloat(l.commission_pct) || 0) / 100)}</span>
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-slate-400 text-sm mb-1.5">{t('invoices.subtotal')} ($)</label>
                {lines.length ? (
                  <div className={inputCls + ' bg-slate-800/60'}>{money(subtotalN)}</div>
                ) : (
                  <input type="number" min="0" step="0.01" value={form.subtotal} onChange={e => setForm(f => ({ ...f, subtotal: e.target.value }))} className={inputCls} />
                )}
              </div>
              <div>
                <label className="block text-slate-400 text-sm mb-1.5">{t('invoices.tax')} ($)</label>
                {autoTax ? (
                  <>
                    <div className={inputCls + ' bg-slate-800/60 flex items-center justify-between'}>
                      <span>{money(taxN)}</span>
                      <span className="text-emerald-400/80 text-xs">{t('invoices.taxAuto').replace('{rate}', String(selectedShop!.tax_rate))}</span>
                    </div>
                    <button type="button" onClick={() => setForm(f => ({ ...f, tax_override: true, tax_amount: String(taxN) }))} className="text-slate-500 hover:text-slate-300 text-xs mt-1 underline">
                      {t('invoices.taxOverride')}
                    </button>
                  </>
                ) : (
                  <>
                    <input type="number" min="0" step="0.01" value={form.tax_amount} onChange={e => setForm(f => ({ ...f, tax_amount: e.target.value }))} className={inputCls} />
                    {selectedShop && lines.length > 0
                      ? <button type="button" onClick={() => setForm(f => ({ ...f, tax_override: false }))} className="text-emerald-500 hover:text-emerald-400 text-xs mt-1 underline">{t('invoices.taxBackToAuto')}</button>
                      : <p className="text-slate-600 text-xs mt-1">{t('invoices.taxHint')}</p>}
                  </>
                )}
              </div>
              <div>
                <label className="block text-slate-400 text-sm mb-1.5">{t('invoices.discount')} ($)</label>
                <input type="number" min="0" step="0.01" value={form.discount} onChange={e => setForm(f => ({ ...f, discount: e.target.value }))} className={inputCls} />
              </div>
              <div className="flex items-end">
                <div className="w-full bg-slate-800/60 border border-white/10 rounded-lg px-4 py-2.5">
                  <span className="text-slate-400 text-sm">{t('invoices.total')}: </span>
                  <span className="text-amber-300 font-bold display-font">{money(totalN)}</span>
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="block text-slate-400 text-sm mb-1.5">{t('invoices.description')}</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder={t('invoices.descriptionPlaceholder')} className={inputCls} />
              </div>
              {isFiscal && !isCredit && (
                <label className="md:col-span-2 flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={form.mark_paid} onChange={e => setForm(f => ({ ...f, mark_paid: e.target.checked }))} className="accent-amber-500 w-4 h-4" />
                  {t('invoices.markPaid')}
                </label>
              )}
              {formError && <div className="md:col-span-2 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2.5 text-red-400 text-sm">{formError}</div>}
              <div className="md:col-span-2 flex gap-3 flex-wrap">
                <button type="submit" disabled={saving} className="bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/50 text-slate-950 font-bold py-2.5 px-6 rounded-lg transition display-font tracking-wide">
                  {saving ? t('common.saving') : t('invoices.create')}
                </button>
                {isFiscal && (
                  <button type="button" disabled={saving} onClick={() => handleCreate(null, true)} className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-amber-300 border border-amber-500/30 py-2.5 px-5 rounded-lg transition text-sm font-semibold">
                    {t('invoices.saveDraft')}
                  </button>
                )}
                <button type="button" onClick={() => setShowForm(false)} className="bg-slate-700 hover:bg-slate-600 text-slate-300 py-2.5 px-5 rounded-lg transition text-sm">{t('common.cancel')}</button>
              </div>
              {isFiscal && <p className="md:col-span-2 text-slate-600 text-xs -mt-1">{t('invoices.draftHint')}</p>}
            </form>
          </div>
        </div>
      )}

      {/* Modal pago */}
      {payFor && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-emerald-500/20 rounded-2xl p-6 w-full max-w-md my-8 shadow-2xl">
            <div className="flex items-center justify-between mb-1">
              <h2 className="display-font text-slate-100 font-bold text-lg tracking-wide">{t('invoices.recordPayment')}</h2>
              <button onClick={() => setPayFor(null)} className="text-slate-500 hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-700 transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <p className="text-slate-400 text-sm mb-4">{payFor.document_number} · {t('invoices.balance')}: <span className="text-amber-300 font-semibold">{money(payFor.balance)}</span></p>
            <form onSubmit={handlePay} className="space-y-4">
              <div>
                <label className="block text-slate-400 text-sm mb-1.5">{t('invoices.payment.amount')} ($)</label>
                <input type="number" min="0.01" step="0.01" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className="block text-slate-400 text-sm mb-1.5">{t('invoices.payment.method')}</label>
                <select value={payForm.method} onChange={e => setPayForm(f => ({ ...f, method: e.target.value as ReceiptMethod }))} className={inputCls}>
                  {RECEIPT_METHODS.map(m => <option key={m} value={m}>{t(`invoices.pm.${m}`)}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 text-sm mb-1.5">{t('invoices.payment.reference')}</label>
                  <input value={payForm.reference} onChange={e => setPayForm(f => ({ ...f, reference: e.target.value }))} placeholder={t('invoices.payment.referenceHint')} className={inputCls} />
                </div>
                <div>
                  <label className="block text-slate-400 text-sm mb-1.5">{t('invoices.payment.date')}</label>
                  <input type="date" value={payForm.paid_at} onChange={e => setPayForm(f => ({ ...f, paid_at: e.target.value }))} className={inputCls} />
                </div>
              </div>
              {payError && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2.5 text-red-400 text-sm">{payError}</div>}
              <div className="flex gap-3">
                <button type="submit" disabled={paySaving} className="bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-500/50 text-slate-950 font-bold py-2.5 px-6 rounded-lg transition display-font tracking-wide">
                  {paySaving ? t('common.saving') : t('invoices.payment.save')}
                </button>
                <button type="button" onClick={() => setPayFor(null)} className="bg-slate-700 hover:bg-slate-600 text-slate-300 py-2.5 px-5 rounded-lg transition text-sm">{t('common.cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="display-font text-3xl font-bold text-slate-100 tracking-wide">{t('invoices.title')}</h1>
          <p className="text-slate-400 mt-1">{invoices.length} {t('invoices.registered')}</p>
        </div>
        <button onClick={() => setShowForm(true)} className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 px-5 rounded-lg transition display-font tracking-wide flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          {t('invoices.addInvoice')}
        </button>
      </div>

      <div className="flex gap-2 mb-5 flex-wrap">
        <button onClick={() => setStatusFilter('')} className={`px-3 py-1.5 rounded-lg text-sm border transition ${statusFilter === '' ? 'bg-amber-500/15 border-amber-500/40 text-amber-300' : 'bg-slate-800 border-white/10 text-slate-400 hover:text-slate-200'}`}>{t('invoices.filterAll')}</button>
        {STATUSES.map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 rounded-lg text-sm border transition ${statusFilter === s ? 'bg-amber-500/15 border-amber-500/40 text-amber-300' : 'bg-slate-800 border-white/10 text-slate-400 hover:text-slate-200'}`}>{t(`invoices.status.${s}`)}</button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-500">{t('common.loading')}</div>
      ) : invoices.length === 0 ? (
        <div className="bg-slate-900/60 border border-white/5 rounded-xl p-12 text-center"><p className="text-slate-500">{t('invoices.empty')}</p></div>
      ) : (
        <div className="space-y-3">
          {invoices.map(inv => {
            const isPending = inv.status === 'draft' && (inv.document_type ?? 'invoice') === 'invoice';
            const tasks = draftItems[inv.id] ?? [];
            const laborTasks = tasks.filter((it: any) => it.line_type === 'labor');
            const pendingTasks = laborTasks.filter((it: any) => !it.done).length;
            return (
            <div key={inv.id} className={`bg-slate-900/60 border rounded-xl ${inv.status === 'void' ? 'opacity-60' : ''} ${isPending ? 'border-amber-500/25' : 'border-white/5'}`}>
              <div className="px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="display-font font-semibold tracking-wide text-slate-200">{inv.document_number || t('invoices.draftLabel')}</span>
                  {inv.document_type && inv.document_type !== 'invoice' && (
                    <span className="text-xs px-2 py-0.5 rounded-full border bg-purple-500/10 border-purple-500/30 text-purple-300">{t(`invoices.docType.${inv.document_type}`)}</span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_STYLE[inv.status]}`}>{isPending ? t('invoices.pendingLabel') : t(`invoices.status.${inv.status}`)}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full border bg-slate-700/40 border-white/10 text-slate-400">{t(`invoices.pm.${inv.payment_method}`)}</span>
                </div>
                <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs text-slate-500">
                  <span className="text-slate-400">{inv.client_name ?? t('invoices.noClient')}</span>
                  <span>{t('invoices.issueDate')}: {inv.issue_date}</span>
                  {inv.due_date && <span>{t('invoices.dueDate')}: {inv.due_date}</span>}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-slate-200 font-semibold display-font">{money(inv.total)}</p>
                {inv.balance > 0.001 && inv.status !== 'void' && inv.status !== 'draft' && <p className="text-amber-400 text-xs">{t('invoices.balance')}: {money(inv.balance)}</p>}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {isPending && (
                  <>
                    <button onClick={() => toggleDraft(inv.id)} className="text-xs px-2.5 py-1.5 rounded border border-white/10 text-slate-300 hover:bg-slate-700 transition">
                      {expandedDraft === inv.id ? t('invoices.hideTasks') : t('invoices.viewTasks')}
                    </button>
                    <button onClick={() => emitInvoice(inv)} disabled={emittingId === inv.id} className="text-xs font-bold px-3 py-1.5 rounded bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 transition display-font">
                      {emittingId === inv.id ? t('common.saving') : t('invoices.emit')}
                    </button>
                  </>
                )}
                <InvoicePdfButton invoiceId={inv.id} />
                <InvoicePdfButton invoiceId={inv.id} mode="print" />
                {inv.balance > 0.001 && inv.status !== 'void' && inv.status !== 'draft' && (
                  <button onClick={() => openPay(inv)} title={t('invoices.recordPayment')} className="p-1.5 rounded text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </button>
                )}
                {inv.status !== 'void' && (
                  <button onClick={() => handleVoid(inv)} disabled={busyId === inv.id} title={t('invoices.void')} className="p-1.5 rounded text-slate-500 hover:text-orange-400 hover:bg-orange-500/10 transition">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                  </button>
                )}
                <button onClick={() => handleDelete(inv)} disabled={busyId === inv.id} title={t('common.delete')} className="p-1.5 rounded text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
              </div>

              {isPending && expandedDraft === inv.id && (
                <div className="border-t border-white/5 px-5 py-3">
                  <p className="text-slate-400 text-xs mb-2">{t('invoices.tasksTitle')} {laborTasks.length > 0 && <span className="text-slate-600">· {pendingTasks} {t('invoices.tasksPending')}</span>}</p>
                  {tasks.length === 0 ? (
                    <p className="text-slate-600 text-xs">{t('common.loading')}</p>
                  ) : laborTasks.length === 0 ? (
                    <p className="text-slate-600 text-xs">{t('invoices.noLaborTasks')}</p>
                  ) : (
                    <div className="space-y-1.5">
                      {laborTasks.map((it: any) => (
                        <label key={it.id} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="checkbox" checked={!!it.done} onChange={() => toggleTask(inv.id, it)} className="accent-emerald-500 w-4 h-4" />
                          <span className={it.done ? 'text-slate-500 line-through' : 'text-slate-300'}>{it.description || t('invoices.lineType.labor')}</span>
                          <span className="text-slate-600 text-xs">{money(it.amount)}</span>
                          {it.mechanic_id && <span className="text-emerald-400/70 text-xs">→ {t('invoices.commissionBadge').replace('{a}', money(Number(it.amount) * Number(it.commission_pct ?? 50) / 100))}</span>}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
