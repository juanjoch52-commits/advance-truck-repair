'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { PaymentReceiptButton } from '@/components/PaymentReceiptButton';

type ReceiptMethod = 'cash' | 'check' | 'card' | 'deposit';
type PaymentKind = 'deposit' | 'advance' | 'settlement';
type Bucket = 'current' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90_plus';

interface ARInvoice {
  id: string;
  document_number: string | null;
  issue_date: string;
  due_date: string | null;
  payment_method: string;
  status: string;
  total: number;
  amount_paid: number;
  balance: number;
  days_past_due: number;
  bucket: Bucket;
}
interface ARClient {
  client_id: string | null;
  client_name: string;
  total: number;
  count: number;
  buckets: Record<Bucket, number>;
  invoices: ARInvoice[];
}
interface ARSummary { total: number; count: number; current: number; d1_30: number; d31_60: number; d61_90: number; d90_plus: number }

const RECEIPT_METHODS: ReceiptMethod[] = ['cash', 'check', 'card', 'deposit'];
const PAYMENT_TYPES: PaymentKind[] = ['deposit', 'advance', 'settlement'];
const BUCKETS: Bucket[] = ['current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus'];
const money = (n: any) => `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const inputCls = 'w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 focus:outline-none focus:border-amber-400/50 transition';

const BUCKET_STYLE: Record<Bucket, string> = {
  current: 'text-emerald-300',
  d1_30: 'text-amber-300',
  d31_60: 'text-orange-300',
  d61_90: 'text-red-300',
  d90_plus: 'text-red-400',
};

export default function CuentasPorCobrarPage() {
  const { t } = useLanguage();
  const [summary, setSummary] = useState<ARSummary | null>(null);
  const [clients, setClients] = useState<ARClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const [payFor, setPayFor] = useState<ARInvoice | null>(null);
  const [payForm, setPayForm] = useState({ amount: '', payment_type: 'deposit' as PaymentKind, method: 'cash' as ReceiptMethod, reference: '', paid_at: new Date().toISOString().slice(0, 10) });
  const [paySaving, setPaySaving] = useState(false);
  const [payError, setPayError] = useState('');
  const [paidReceipt, setPaidReceipt] = useState<{ invoiceId: string; payment: any } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/cuentas-por-cobrar');
      const j = await res.json();
      setSummary(j.summary ?? null);
      setClients((j.clients ?? []) as ARClient[]);
    } catch { setSummary(null); setClients([]); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  // KPIs + alertas (derivados de lo que ya devuelve el API, sin llamadas extra).
  const kpis = useMemo(() => {
    const overdue = summary ? Math.max(0, summary.total - summary.current) : 0;
    const topDebtor = clients.length ? clients[0] : null; // el API ya ordena por saldo desc
    // Por vencer (próximos 7 días): facturas aún no vencidas con due_date dentro del rango.
    const todayMs = new Date().setHours(0, 0, 0, 0);
    const soonMs = todayMs + 7 * 86400000;
    let dueSoon = 0;
    const overdueInvoices: (ARInvoice & { client_name: string })[] = [];
    for (const c of clients) {
      for (const inv of c.invoices) {
        if (inv.days_past_due > 0) overdueInvoices.push({ ...inv, client_name: c.client_name });
        else if (inv.due_date) {
          const d = new Date(inv.due_date + 'T00:00:00').getTime();
          if (d >= todayMs && d <= soonMs) dueSoon += Number(inv.balance);
        }
      }
    }
    overdueInvoices.sort((a, b) => b.days_past_due - a.days_past_due);
    return { overdue, topDebtor, dueSoon, overdueInvoices };
  }, [summary, clients]);

  function openPay(inv: ARInvoice) {
    setPayFor(inv);
    setPaidReceipt(null);
    setPayForm({ amount: String(inv.balance), payment_type: 'deposit', method: 'cash', reference: '', paid_at: new Date().toISOString().slice(0, 10) });
    setPayError('');
  }
  function closePay() { setPayFor(null); setPaidReceipt(null); setPayError(''); }
  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!payFor) return;
    setPayError(''); setPaySaving(true);
    const res = await fetch(`/api/facturas/${payFor.id}/pagos`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: parseFloat(payForm.amount) || 0, payment_type: payForm.payment_type, method: payForm.method, reference: payForm.reference, paid_at: payForm.paid_at }),
    });
    const j = await res.json();
    if (!res.ok) { setPayError(j.error ?? 'Error'); setPaySaving(false); return; }
    setPaySaving(false);
    if (j.payment) setPaidReceipt({ invoiceId: payFor.id, payment: j.payment });
    else setPayFor(null);
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
                  <input value={payForm.reference} onChange={e => setPayForm(f => ({ ...f, reference: e.target.value }))} className={inputCls} />
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

      <div className="mb-6">
        <h1 className="display-font text-3xl font-bold text-slate-100 tracking-wide">{t('receivables.title')}</h1>
        <p className="text-slate-400 mt-1">{t('receivables.subtitle')}</p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-500">{t('common.loading')}</div>
      ) : !summary || summary.count === 0 ? (
        <div className="bg-slate-900/60 border border-white/5 rounded-xl p-12 text-center"><p className="text-slate-500">{t('receivables.empty')}</p></div>
      ) : (
        <>
          {/* KPIs */}
          <div data-tour="ar-kpis" className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <div className="bg-slate-900/60 border border-amber-500/20 rounded-xl px-4 py-3.5">
              <p className="text-slate-500 text-xs mb-1">{t('receivables.kpi.outstanding')}</p>
              <p className="display-font text-2xl font-bold text-amber-300">{money(summary.total)}</p>
              <p className="text-slate-600 text-xs mt-0.5">{summary.count} {t('receivables.kpi.openInvoices')}</p>
            </div>
            <div className={`bg-slate-900/60 border rounded-xl px-4 py-3.5 ${kpis.overdue > 0.001 ? 'border-red-500/30' : 'border-white/5'}`}>
              <p className="text-slate-500 text-xs mb-1">{t('receivables.kpi.overdue')}</p>
              <p className={`display-font text-2xl font-bold ${kpis.overdue > 0.001 ? 'text-red-400' : 'text-slate-400'}`}>{money(kpis.overdue)}</p>
              <p className="text-slate-600 text-xs mt-0.5">{kpis.overdueInvoices.length} {t('receivables.kpi.openInvoices')}</p>
            </div>
            <div className="bg-slate-900/60 border border-white/5 rounded-xl px-4 py-3.5">
              <p className="text-slate-500 text-xs mb-1">{t('receivables.kpi.dueSoon')}</p>
              <p className="display-font text-2xl font-bold text-sky-300">{money(kpis.dueSoon)}</p>
              <p className="text-slate-600 text-xs mt-0.5">{t('receivables.kpi.dueSoonHint')}</p>
            </div>
            <div className="bg-slate-900/60 border border-white/5 rounded-xl px-4 py-3.5 min-w-0">
              <p className="text-slate-500 text-xs mb-1">{t('receivables.kpi.topDebtor')}</p>
              {kpis.topDebtor ? (
                <>
                  <p className="display-font text-lg font-bold text-slate-200 truncate">{kpis.topDebtor.client_name}</p>
                  <p className="text-amber-300 text-xs mt-0.5">{money(kpis.topDebtor.total)}</p>
                </>
              ) : <p className="text-slate-500">—</p>}
            </div>
          </div>

          {/* Alertas de vencidos */}
          {kpis.overdueInvoices.length > 0 && (
            <div data-tour="ar-alerts" className="bg-red-500/[0.04] border border-red-500/20 rounded-xl p-5 mb-6">
              <h2 className="display-font text-red-300 font-semibold tracking-wider text-sm uppercase mb-3 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                {t('receivables.alerts.title')} <span className="text-slate-500 normal-case font-normal">({kpis.overdueInvoices.length})</span>
              </h2>
              <div className="space-y-1.5">
                {kpis.overdueInvoices.slice(0, 8).map(inv => (
                  <div key={inv.id} className="flex items-center justify-between gap-3 flex-wrap text-sm bg-slate-900/40 rounded-lg px-3 py-2">
                    <div className="min-w-0">
                      <span className="text-slate-300">{inv.document_number}</span>
                      <span className="text-slate-500 mx-2">·</span>
                      <span className="text-slate-400">{inv.client_name}</span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className={`text-xs ${BUCKET_STYLE[inv.bucket]}`}>{inv.days_past_due} {t('receivables.alerts.daysLate')}</span>
                      <span className="text-amber-300 font-semibold">{money(inv.balance)}</span>
                      <button onClick={() => openPay(inv)} className="text-emerald-400 hover:text-emerald-300 text-xs font-medium hover:underline">{t('receivables.collect')}</button>
                    </div>
                  </div>
                ))}
                {kpis.overdueInvoices.length > 8 && (
                  <p className="text-slate-600 text-xs pt-1">+{kpis.overdueInvoices.length - 8} {t('receivables.alerts.more')}</p>
                )}
              </div>
            </div>
          )}

          {/* Resumen + antigüedad */}
          <div data-tour="ar-aging" className="bg-slate-900/60 border border-white/5 rounded-xl p-5 mb-6">
            <div className="flex items-baseline justify-between flex-wrap gap-2 mb-4">
              <span className="text-slate-400 text-sm">{t('receivables.agingTitle')}</span>
              <span className="display-font text-2xl font-bold text-amber-300">{money(summary.total)}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {BUCKETS.map(b => (
                <div key={b} className="bg-slate-800/50 border border-white/5 rounded-lg px-3 py-2.5 text-center">
                  <p className="text-slate-500 text-xs mb-1">{t(`receivables.bucket.${b}`)}</p>
                  <p className={`font-semibold display-font ${BUCKET_STYLE[b]}`}>{money((summary as any)[b])}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Por cliente */}
          <div className="space-y-3">
            {clients.map(c => {
              const key = c.client_id ?? '__none__';
              const isOpen = open[key];
              return (
                <div key={key} className="bg-slate-900/60 border border-white/5 rounded-xl overflow-hidden">
                  <button onClick={() => setOpen(o => ({ ...o, [key]: !o[key] }))} className="w-full px-5 py-4 flex items-center justify-between gap-4 hover:bg-white/[0.02] transition text-left">
                    <div className="min-w-0">
                      <p className="display-font font-semibold tracking-wide text-slate-200">{c.client_name}</p>
                      <p className="text-slate-500 text-xs mt-0.5">{c.count} {t('receivables.invoicesCount')}</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-amber-300 font-bold display-font">{money(c.total)}</span>
                      <svg className={`w-4 h-4 text-slate-500 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="border-t border-white/5 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-slate-500 text-xs">
                            <th className="text-left font-medium px-5 py-2">{t('receivables.invoice')}</th>
                            <th className="text-left font-medium px-3 py-2">{t('invoices.dueDate')}</th>
                            <th className="text-right font-medium px-3 py-2">{t('receivables.daysPastDue')}</th>
                            <th className="text-right font-medium px-3 py-2">{t('invoices.total')}</th>
                            <th className="text-right font-medium px-3 py-2">{t('receivables.paid')}</th>
                            <th className="text-right font-medium px-3 py-2">{t('invoices.balance')}</th>
                            <th className="px-3 py-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {c.invoices.map(inv => (
                            <tr key={inv.id} className="border-t border-white/5">
                              <td className="px-5 py-2.5 text-slate-300">{inv.document_number}</td>
                              <td className="px-3 py-2.5 text-slate-400">{inv.due_date ?? '—'}</td>
                              <td className={`px-3 py-2.5 text-right ${inv.days_past_due > 0 ? BUCKET_STYLE[inv.bucket] : 'text-slate-500'}`}>{inv.days_past_due > 0 ? inv.days_past_due : t('receivables.notDue')}</td>
                              <td className="px-3 py-2.5 text-right text-slate-300">{money(inv.total)}</td>
                              <td className="px-3 py-2.5 text-right text-slate-500">{money(inv.amount_paid)}</td>
                              <td className="px-3 py-2.5 text-right text-amber-300 font-semibold">{money(inv.balance)}</td>
                              <td className="px-3 py-2.5 text-right">
                                <button onClick={() => openPay(inv)} className="text-emerald-400 hover:text-emerald-300 text-xs font-medium hover:underline">{t('receivables.collect')}</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
