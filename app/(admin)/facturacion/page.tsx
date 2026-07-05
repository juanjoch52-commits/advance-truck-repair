'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { InvoicePdfButton } from '@/components/InvoicePdfButton';
import { PaymentReceiptButton } from '@/components/PaymentReceiptButton';

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
  customer_name: string | null;
  truck_id: string | null;
  truck_label: string | null;
  customer_truck: string | null;
  insurance_company: string | null;
  insurance_status: string | null;
  converted_to_invoice_id: string | null;
  order_number: string | null;
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

type PaymentKind = 'deposit' | 'advance' | 'settlement';
const RECEIPT_METHODS: ReceiptMethod[] = ['cash', 'check', 'card', 'deposit'];
const PAYMENT_TYPES: PaymentKind[] = ['deposit', 'advance', 'settlement'];
const STATUSES: InvoiceStatus[] = ['draft', 'open', 'partial', 'paid', 'void'];
const PAGE_SIZE = 50;

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
  const { t, lang } = useLanguage();
  const L = lang === 'en' ? EN : ES;

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [docFilter, setDocFilter] = useState<string>(''); // '' = facturas, 'estimate' = cotizaciones
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  function buildParams(offset: number, limit = PAGE_SIZE) {
    const p = new URLSearchParams();
    if (statusFilter) p.set('status', statusFilter);
    if (docFilter) p.set('doctype', docFilter);
    if (q) p.set('q', q);
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    p.set('limit', String(limit));
    p.set('offset', String(offset));
    return p;
  }

  async function load(reset = true) {
    if (reset) setLoading(true); else setLoadingMore(true);
    const offset = reset ? 0 : invoices.length;
    try {
      const res = await fetch('/api/facturas?' + buildParams(offset).toString());
      const j = await res.json();
      const rows = (j.invoices ?? []) as Invoice[];
      setTotal(Number(j.total) || rows.length);
      setInvoices(prev => reset ? rows : [...prev, ...rows]);
    } catch { if (reset) { setInvoices([]); setTotal(0); } }
    setLoading(false); setLoadingMore(false);
  }

  useEffect(() => { load(true); /* eslint-disable-next-line */ }, [statusFilter, docFilter, q, from, to]);

  const hasMore = invoices.length < total;

  // ─── Exportar CSV (respeta los filtros; trae todo por páginas) ───
  async function exportCsv() {
    setExporting(true);
    try {
      const all: Invoice[] = [];
      for (let off = 0; off < 4000; off += 200) {
        const res = await fetch('/api/facturas?' + buildParams(off, 200).toString());
        if (!res.ok) break;
        const j = await res.json();
        const rows = (j.invoices ?? []) as Invoice[];
        all.push(...rows);
        if (all.length >= (Number(j.total) || 0) || rows.length === 0) break;
      }
      const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const header = [L.csv.number, L.csv.type, L.csv.status, L.csv.date, L.csv.due, L.csv.client, L.csv.truck, L.csv.order, L.csv.method, L.csv.subtotal, L.csv.tax, L.csv.discount, L.csv.total, L.csv.paid, L.csv.balance, L.csv.insurance, L.csv.insuranceStatus];
      const lines = all.map(i => [
        esc(i.document_number ?? ''), esc(t(`invoices.docType.${i.document_type ?? 'invoice'}`)), esc(t(`invoices.status.${i.status}`)),
        esc(i.issue_date), esc(i.due_date ?? ''), esc(i.client_name ?? i.customer_name ?? ''),
        esc(i.truck_label ?? i.customer_truck ?? ''), esc(i.order_number ?? ''), esc(t(`invoices.pm.${i.payment_method}`)),
        i.subtotal, i.tax_amount, i.discount, i.total, i.amount_paid, i.balance,
        esc(i.insurance_company ?? ''), esc(i.insurance_status ? (L.ins as any)[i.insurance_status] ?? i.insurance_status : ''),
      ].join(','));
      const csv = '﻿' + [header.map(esc).join(','), ...lines].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `facturas_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally { setExporting(false); }
  }

  // ─── Convertir cotización → factura borrador ───
  const [convertingId, setConvertingId] = useState<string | null>(null);
  async function convertEstimate(inv: Invoice) {
    if (!confirm(L.convertConfirm)) return;
    setConvertingId(inv.id);
    const res = await fetch(`/api/facturas/${inv.id}/convertir`, { method: 'POST' });
    const j = await res.json().catch(() => ({}));
    setConvertingId(null);
    if (!res.ok) { alert(j.error ?? 'Error'); return; }
    // Ir directo a revisar/completar el borrador creado.
    window.location.href = `/facturacion/nueva?id=${j.invoice.id}`;
  }

  // ─── Pago ───
  const [payFor, setPayFor] = useState<Invoice | null>(null);
  const [payForm, setPayForm] = useState({ amount: '', payment_type: 'deposit' as PaymentKind, method: 'cash' as ReceiptMethod, reference: '', paid_at: new Date().toISOString().slice(0, 10), notes: '' });
  const [paySaving, setPaySaving] = useState(false);
  const [payError, setPayError] = useState('');
  const [paidReceipt, setPaidReceipt] = useState<{ invoiceId: string; payment: any } | null>(null);

  const [paymentsByInvoice, setPaymentsByInvoice] = useState<Record<string, any[]>>({});
  const [expandedPayments, setExpandedPayments] = useState<string | null>(null);

  function openPay(inv: Invoice) {
    setPayFor(inv);
    setPaidReceipt(null);
    setPayForm({ amount: String(inv.balance), payment_type: 'deposit', method: 'cash', reference: '', paid_at: new Date().toISOString().slice(0, 10), notes: '' });
    setPayError('');
  }

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!payFor) return;
    setPayError(''); setPaySaving(true);
    const res = await fetch(`/api/facturas/${payFor.id}/pagos`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: parseFloat(payForm.amount) || 0, payment_type: payForm.payment_type, method: payForm.method, reference: payForm.reference, paid_at: payForm.paid_at, notes: payForm.notes }),
    });
    const j = await res.json();
    if (!res.ok) { setPayError(j.error ?? 'Error'); setPaySaving(false); return; }
    setPaySaving(false);
    if (j.payment) setPaidReceipt({ invoiceId: payFor.id, payment: j.payment });
    else setPayFor(null);
    setPaymentsByInvoice(prev => ({ ...prev, [payFor.id]: undefined as any }));
    load();
  }

  function closePay() { setPayFor(null); setPaidReceipt(null); setPayError(''); }

  async function loadPayments(invId: string) {
    try {
      const r = await fetch(`/api/facturas/${invId}`);
      if (r.ok) { const j = await r.json(); setPaymentsByInvoice(prev => ({ ...prev, [invId]: j.payments ?? [] })); }
    } catch {}
  }
  function togglePayments(invId: string) {
    if (expandedPayments === invId) { setExpandedPayments(null); return; }
    setExpandedPayments(invId);
    if (!paymentsByInvoice[invId]) loadPayments(invId);
  }

  async function voidPayment(invId: string, p: any) {
    const reason = prompt(t('invoices.payment.voidPrompt').replace('{n}', p.receipt_number || ''));
    if (reason === null) return;
    const res = await fetch(`/api/facturas/${invId}/pagos/${p.id}`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); alert((j as any).error ?? 'Error'); return; }
    loadPayments(invId);
    load();
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
      {/* Modal pago */}
      {payFor && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-emerald-500/20 rounded-2xl p-6 w-full max-w-md my-8 shadow-2xl">
            <div className="flex items-center justify-between mb-1">
              <h2 className="display-font text-slate-100 font-bold text-lg tracking-wide">{paidReceipt ? t('invoices.payment.recorded') : t('invoices.recordPayment')}</h2>
              <button onClick={closePay} className="text-slate-500 hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-700 transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <p className="text-slate-400 text-sm mb-4">{payFor.document_number} · {t('invoices.balance')}: <span className="text-amber-300 font-semibold">{money(payFor.balance)}</span></p>

            {paidReceipt ? (
              <div className="space-y-4">
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-center">
                  <p className="text-emerald-300 display-font text-2xl font-bold">{money(paidReceipt.payment.amount)}</p>
                  <p className="text-slate-400 text-sm mt-1">{t(`invoices.paymentType.${paidReceipt.payment.payment_type}`)} · {t('invoices.payment.receiptNo')} {paidReceipt.payment.receipt_number}</p>
                  {paidReceipt.payment.created_by_name && <p className="text-slate-600 text-xs mt-1">{t('invoices.payment.recordedBy')}: {paidReceipt.payment.created_by_name}</p>}
                </div>
                <div className="flex gap-3 flex-wrap">
                  <PaymentReceiptButton invoiceId={paidReceipt.invoiceId} paymentId={paidReceipt.payment.id} mode="print" label={t('invoices.payment.printReceipt')} className="inline-flex items-center gap-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold py-2.5 px-5 rounded-lg transition text-sm" />
                  <PaymentReceiptButton invoiceId={paidReceipt.invoiceId} paymentId={paidReceipt.payment.id} mode="download" label={t('invoices.payment.downloadReceipt')} className="inline-flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 py-2.5 px-5 rounded-lg transition text-sm" />
                  <button type="button" onClick={closePay} className="bg-slate-800 hover:bg-slate-700 text-slate-300 py-2.5 px-5 rounded-lg transition text-sm ml-auto">{t('common.done')}</button>
                </div>
              </div>
            ) : (
            <form onSubmit={handlePay} className="space-y-4">
              <div>
                <label className="block text-slate-400 text-sm mb-1.5">{t('invoices.payment.type')}</label>
                <div className="grid grid-cols-3 gap-2">
                  {PAYMENT_TYPES.map(pt => (
                    <button key={pt} type="button" onClick={() => setPayForm(f => ({ ...f, payment_type: pt }))}
                      className={`px-2 py-2 rounded-lg text-xs border transition ${payForm.payment_type === pt ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' : 'bg-slate-800 border-white/10 text-slate-400 hover:text-slate-200'}`}>
                      {t(`invoices.paymentType.${pt}`)}
                    </button>
                  ))}
                </div>
              </div>
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
                <button type="button" onClick={closePay} className="bg-slate-700 hover:bg-slate-600 text-slate-300 py-2.5 px-5 rounded-lg transition text-sm">{t('common.cancel')}</button>
              </div>
            </form>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="display-font text-3xl font-bold text-slate-100 tracking-wide">{t('invoices.title')}</h1>
          <p className="text-slate-400 mt-1">{total} {t('invoices.registered')}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={exportCsv} disabled={exporting || total === 0}
            className="bg-slate-800 hover:bg-slate-700 disabled:opacity-40 border border-white/10 text-slate-200 text-sm px-4 py-2.5 rounded-lg transition flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            {exporting ? L.exporting : L.exportCsv}
          </button>
          <a data-tour="fac-add" href="/facturacion/nueva" className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 px-5 rounded-lg transition display-font tracking-wide flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            {t('invoices.addInvoice')}
          </a>
        </div>
      </div>

      {/* Búsqueda + fechas */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <form className="flex-1 min-w-64 flex gap-2" onSubmit={e => { e.preventDefault(); setQ(qInput.trim()); }}>
          <input value={qInput} onChange={e => setQInput(e.target.value)} placeholder={L.searchPlaceholder} className={inputCls} />
          <button type="submit" className="bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-300 px-4 rounded-lg transition flex-shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </button>
          {q && (
            <button type="button" onClick={() => { setQInput(''); setQ(''); }} className="text-slate-500 hover:text-slate-300 text-sm px-2 flex-shrink-0">✕</button>
          )}
        </form>
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2.5 text-slate-100 text-sm focus:outline-none focus:border-amber-400/50" />
          <span className="text-slate-600 text-xs">—</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2.5 text-slate-100 text-sm focus:outline-none focus:border-amber-400/50" />
          {(from || to) && (
            <button type="button" onClick={() => { setFrom(''); setTo(''); }} className="text-slate-500 hover:text-slate-300 text-sm px-1">✕</button>
          )}
        </div>
      </div>

      {/* Filtros de estado + tipo */}
      <div data-tour="fac-filters" className="flex gap-2 mb-5 flex-wrap">
        <button onClick={() => setStatusFilter('')} className={`px-3 py-1.5 rounded-lg text-sm border transition ${statusFilter === '' ? 'bg-amber-500/15 border-amber-500/40 text-amber-300' : 'bg-slate-800 border-white/10 text-slate-400 hover:text-slate-200'}`}>{t('invoices.filterAll')}</button>
        {STATUSES.map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 rounded-lg text-sm border transition ${statusFilter === s ? 'bg-amber-500/15 border-amber-500/40 text-amber-300' : 'bg-slate-800 border-white/10 text-slate-400 hover:text-slate-200'}`}>{t(`invoices.status.${s}`)}</button>
        ))}
        <span className="w-px bg-white/10 mx-1" />
        <button onClick={() => setDocFilter(docFilter === 'estimate' ? '' : 'estimate')}
          className={`px-3 py-1.5 rounded-lg text-sm border transition ${docFilter === 'estimate' ? 'bg-purple-500/15 border-purple-500/40 text-purple-300' : 'bg-slate-800 border-white/10 text-slate-400 hover:text-slate-200'}`}>
          {L.estimatesFilter}
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-500">{t('common.loading')}</div>
      ) : invoices.length === 0 ? (
        <div className="bg-slate-900/60 border border-white/5 rounded-xl p-12 text-center"><p className="text-slate-500">{t('invoices.empty')}</p></div>
      ) : (
        <div className="space-y-3">
          {invoices.map(inv => {
            const isEstimate = inv.document_type === 'estimate';
            const isPending = inv.status === 'draft' && (inv.document_type ?? 'invoice') === 'invoice';
            const isEditableDraft = inv.status === 'draft' && (inv.document_type === 'invoice' || isEstimate);
            const tasks = draftItems[inv.id] ?? [];
            const laborTasks = tasks.filter((it: any) => it.line_type === 'labor');
            const pendingTasks = laborTasks.filter((it: any) => !it.done).length;
            return (
            <div key={inv.id} className={`bg-slate-900/60 border rounded-xl ${inv.status === 'void' ? 'opacity-60' : ''} ${isPending ? 'border-amber-500/25' : 'border-white/5'}`}>
              <div className="px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
              <a href={`/facturacion/${inv.id}`} className="flex-1 min-w-0 group cursor-pointer">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="display-font font-semibold tracking-wide text-slate-200 group-hover:text-amber-300 transition">{inv.document_number || t('invoices.draftLabel')}</span>
                  {inv.document_type && inv.document_type !== 'invoice' && (
                    <span className="text-xs px-2 py-0.5 rounded-full border bg-purple-500/10 border-purple-500/30 text-purple-300">{t(`invoices.docType.${inv.document_type}`)}</span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_STYLE[inv.status]}`}>{isPending ? t('invoices.pendingLabel') : t(`invoices.status.${inv.status}`)}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full border bg-slate-700/40 border-white/10 text-slate-400">{t(`invoices.pm.${inv.payment_method}`)}</span>
                  {inv.insurance_company && (
                    <span className="text-xs px-2 py-0.5 rounded-full border bg-sky-500/10 border-sky-500/30 text-sky-300">
                      🛡 {inv.insurance_company}{inv.insurance_status ? ` · ${(L.ins as any)[inv.insurance_status] ?? inv.insurance_status}` : ''}
                    </span>
                  )}
                  {isEstimate && inv.converted_to_invoice_id && (
                    <span className="text-xs px-2 py-0.5 rounded-full border bg-emerald-500/10 border-emerald-500/30 text-emerald-300">{L.converted}</span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs text-slate-500">
                  <span className="text-slate-400">{inv.client_name ?? inv.customer_name ?? t('invoices.noClient')}</span>
                  {(inv.truck_label || inv.customer_truck) && <span className="text-sky-300/80">🚛 {inv.truck_label ?? inv.customer_truck}</span>}
                  {inv.order_number && <span className="text-purple-300/80">{t('invoices.orderNumberLabel')} {inv.order_number}</span>}
                  <span>{t('invoices.issueDate')}: {inv.issue_date}</span>
                  {inv.due_date && <span>{t('invoices.dueDate')}: {inv.due_date}</span>}
                </div>
              </a>
              <div className="text-right flex-shrink-0">
                <p className="text-slate-200 font-semibold display-font">{money(inv.total)}</p>
                {inv.balance > 0.001 && inv.status !== 'void' && inv.status !== 'draft' && <p className="text-amber-400 text-xs">{t('invoices.balance')}: {money(inv.balance)}</p>}
              </div>
              <div data-tour="fac-actions" className="flex items-center gap-1 flex-shrink-0">
                {isEstimate && !inv.converted_to_invoice_id && inv.status !== 'void' && (
                  <button onClick={() => convertEstimate(inv)} disabled={convertingId === inv.id}
                    className="text-xs font-bold px-3 py-1.5 rounded bg-purple-500 hover:bg-purple-400 disabled:opacity-50 text-slate-950 transition display-font">
                    {convertingId === inv.id ? t('common.saving') : L.convert}
                  </button>
                )}
                {isEditableDraft && (
                  <a href={`/facturacion/nueva?id=${inv.id}`} className="text-xs px-2.5 py-1.5 rounded border border-sky-500/30 text-sky-300 hover:bg-sky-500/10 transition">
                    {t('common.edit')}
                  </a>
                )}
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
                {Number(inv.amount_paid) > 0.001 && inv.status !== 'void' && (
                  <button onClick={() => togglePayments(inv.id)} title={t('invoices.payment.receipts')} className={`p-1.5 rounded transition ${expandedPayments === inv.id ? 'text-sky-400 bg-sky-500/10' : 'text-slate-500 hover:text-sky-400 hover:bg-sky-500/10'}`}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  </button>
                )}
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

              {expandedPayments === inv.id && (
                <div className="border-t border-white/5 px-5 py-3">
                  <p className="text-slate-400 text-xs mb-2">{t('invoices.payment.receipts')}</p>
                  {!paymentsByInvoice[inv.id] ? (
                    <p className="text-slate-600 text-xs">{t('common.loading')}</p>
                  ) : paymentsByInvoice[inv.id].length === 0 ? (
                    <p className="text-slate-600 text-xs">{t('invoices.payment.noPayments')}</p>
                  ) : (
                    <div className="space-y-1.5">
                      {paymentsByInvoice[inv.id].map((p: any) => (
                        <div key={p.id} className={`flex items-center justify-between gap-3 flex-wrap text-sm rounded-lg px-3 py-2 ${p.voided ? 'bg-red-500/[0.04]' : 'bg-slate-900/50'}`}>
                          <div className="min-w-0">
                            <span className={`font-semibold ${p.voided ? 'text-slate-500 line-through' : 'text-emerald-300'}`}>{money(p.amount)}</span>
                            <span className="text-slate-500 mx-2">·</span>
                            <span className="text-slate-400">{t(`invoices.paymentType.${p.payment_type ?? 'deposit'}`)}</span>
                            <span className="text-slate-600 text-xs ml-2">{p.paid_at}</span>
                            {p.created_by_name && <span className="text-slate-600 text-xs ml-2">· {p.created_by_name}</span>}
                            {p.voided && <span className="text-xs px-1.5 py-0.5 ml-2 rounded-full border bg-red-500/10 border-red-500/30 text-red-300">{t('invoices.payment.voided')}{p.void_reason ? `: ${p.void_reason}` : ''}</span>}
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <span className="text-slate-600 text-xs mr-1">{p.receipt_number}</span>
                            {!p.voided && <>
                              <PaymentReceiptButton invoiceId={inv.id} paymentId={p.id} mode="print" />
                              <PaymentReceiptButton invoiceId={inv.id} paymentId={p.id} mode="download" />
                              <button onClick={() => voidPayment(inv.id, p)} title={t('invoices.payment.void')} className="p-1.5 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                              </button>
                            </>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            );
          })}

          {/* Paginación */}
          {hasMore && (
            <div className="text-center pt-2 pb-6">
              <button onClick={() => load(false)} disabled={loadingMore}
                className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 border border-white/10 text-slate-300 text-sm px-6 py-2.5 rounded-lg transition">
                {loadingMore ? t('common.loading') : `${L.loadMore} (${invoices.length}/${total})`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Textos locales (bilingüe) para lo nuevo de la lista ────────────────────
const ES = {
  searchPlaceholder: 'Buscar por número, cliente, camión, orden o aseguradora…',
  exportCsv: 'Exportar CSV', exporting: 'Exportando…',
  loadMore: 'Cargar más',
  estimatesFilter: 'Cotizaciones',
  convert: 'CONVERTIR EN FACTURA', converted: 'Convertida',
  convertConfirm: '¿Convertir esta cotización en una factura borrador? La cotización queda marcada como convertida.',
  ins: { sent: 'Enviado', approved: 'Aprobado', partial: 'Pago parcial', paid: 'Pagado', denied: 'Negado' } as Record<string, string>,
  csv: { number: 'Número', type: 'Tipo', status: 'Estado', date: 'Fecha', due: 'Vence', client: 'Cliente', truck: 'Camión', order: 'Orden', method: 'Método', subtotal: 'Subtotal', tax: 'Impuesto', discount: 'Descuento', total: 'Total', paid: 'Pagado', balance: 'Saldo', insurance: 'Aseguradora', insuranceStatus: 'Estado seguro' },
};
const EN = {
  searchPlaceholder: 'Search by number, customer, truck, order or insurer…',
  exportCsv: 'Export CSV', exporting: 'Exporting…',
  loadMore: 'Load more',
  estimatesFilter: 'Estimates',
  convert: 'CONVERT TO INVOICE', converted: 'Converted',
  convertConfirm: 'Convert this estimate into a draft invoice? The estimate will be marked as converted.',
  ins: { sent: 'Sent', approved: 'Approved', partial: 'Partially paid', paid: 'Paid', denied: 'Denied' } as Record<string, string>,
  csv: { number: 'Number', type: 'Type', status: 'Status', date: 'Date', due: 'Due', client: 'Customer', truck: 'Truck', order: 'Order', method: 'Method', subtotal: 'Subtotal', tax: 'Tax', discount: 'Discount', total: 'Total', paid: 'Paid', balance: 'Balance', insurance: 'Insurer', insuranceStatus: 'Insurance status' },
};
