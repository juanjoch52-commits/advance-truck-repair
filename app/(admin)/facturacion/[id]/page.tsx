'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { InvoicePdfButton } from '@/components/InvoicePdfButton';
import { PaymentReceiptButton } from '@/components/PaymentReceiptButton';
import { fmtDate } from '@/lib/fmt';

// ─── Detalle de factura / cotización ─────────────────────────────────────────
// Todo lo de un documento en una pantalla: encabezado, cliente (registrado o
// ocasional), seguro con seguimiento del reclamo, renglones, totales, pagos con
// comprobantes, notas de crédito y acciones (editar/emitir/convertir/pagar/
// anular/PDF/registrar cliente). Letra grande, estilo del resto del módulo.

const money = (n: any) => `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-slate-700/40 border-white/10 text-slate-400',
  open: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
  partial: 'bg-sky-500/10 border-sky-500/30 text-sky-300',
  paid: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
  void: 'bg-red-500/10 border-red-500/30 text-red-300',
};

const INSURANCE_STATUSES = ['sent', 'approved', 'partial', 'paid', 'denied'];

export default function FacturaDetallePage() {
  const { t, lang } = useLanguage();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const L = lang === 'en' ? EN : ES;

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/facturas/${id}`);
      if (r.ok) setData(await r.json());
      else setData(null);
    } catch { setData(null); }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const inv = data?.invoice;
  const items: any[] = data?.items ?? [];
  const payments: any[] = data?.payments ?? [];
  const credits: any[] = data?.credits ?? [];
  const client = data?.client;
  const shop = data?.shop;
  const truck = data?.truck;

  const isEstimate = inv?.document_type === 'estimate';
  const isDraftInvoice = inv?.status === 'draft' && inv?.document_type === 'invoice';
  const isVoid = inv?.status === 'void';
  const creditsTotal = credits.reduce((s, c) => s + Number(c.amount), 0);

  // ─── Acciones ───
  async function emitir(force = false) {
    setBusy(true);
    const res = await fetch(`/api/facturas/${id}/emitir`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ force }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.status === 409 && j.error === 'pending_tasks') {
      if (confirm(t('invoices.emitPendingConfirm').replace('{n}', String(j.pending)))) emitir(true);
      return;
    }
    if (!res.ok) { alert(j.error ?? 'Error'); return; }
    alert(j.commissions_created > 0
      ? t('invoices.emitDoneCommissions').replace('{n}', String(j.commissions_created)).replace('{a}', money(j.commissions_total))
      : t('invoices.emitDone'));
    load();
  }

  async function convertir() {
    if (!confirm(L.convertConfirm)) return;
    setBusy(true);
    const res = await fetch(`/api/facturas/${id}/convertir`, { method: 'POST' });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { alert(j.error ?? 'Error'); return; }
    window.location.href = `/facturacion/nueva?id=${j.invoice.id}`;
  }

  async function anular() {
    if (!confirm(t('invoices.voidConfirm').replace('{n}', inv?.document_number ?? ''))) return;
    setBusy(true);
    await fetch(`/api/facturas/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'void' }) });
    setBusy(false); load();
  }

  async function registrarCliente() {
    if (!confirm(L.registerConfirm)) return;
    setBusy(true);
    const res = await fetch(`/api/facturas/${id}/registrar-cliente`, { method: 'POST' });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { alert(j.error ?? 'Error'); return; }
    alert(j.reused ? L.registerReused : L.registerDone);
    load();
  }

  async function setInsuranceStatus(status: string) {
    await fetch(`/api/facturas/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ insurance_status: status || null }),
    });
    load();
  }

  // ─── Pago (formulario compacto en línea) ───
  const [showPay, setShowPay] = useState(false);
  const [payForm, setPayForm] = useState({ amount: '', payment_type: 'deposit', method: 'cash', reference: '', paid_at: new Date().toISOString().slice(0, 10) });
  const [payError, setPayError] = useState('');
  const [paySaving, setPaySaving] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<any>(null);

  function openPay() {
    setPayForm({ amount: String(inv?.balance ?? ''), payment_type: 'deposit', method: 'cash', reference: '', paid_at: new Date().toISOString().slice(0, 10) });
    setPayError(''); setLastReceipt(null); setShowPay(true);
  }

  async function savePay(e: React.FormEvent) {
    e.preventDefault();
    setPayError(''); setPaySaving(true);
    const res = await fetch(`/api/facturas/${id}/pagos`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payForm, amount: parseFloat(payForm.amount) || 0 }),
    });
    const j = await res.json().catch(() => ({}));
    setPaySaving(false);
    if (!res.ok) { setPayError(j.error ?? 'Error'); return; }
    setLastReceipt(j.payment ?? null);
    load();
  }

  async function voidPayment(p: any) {
    const reason = prompt(t('invoices.payment.voidPrompt').replace('{n}', p.receipt_number || ''));
    if (reason === null) return;
    const res = await fetch(`/api/facturas/${id}/pagos/${p.id}`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); alert((j as any).error ?? 'Error'); return; }
    load();
  }

  // ─── Nota de crédito ───
  const [showCredit, setShowCredit] = useState(false);
  const [creditForm, setCreditForm] = useState({ amount: '', reason: '' });
  const [creditError, setCreditError] = useState('');
  const [creditSaving, setCreditSaving] = useState(false);

  async function saveCredit(e: React.FormEvent) {
    e.preventDefault();
    setCreditError(''); setCreditSaving(true);
    const res = await fetch(`/api/facturas/${id}/creditos`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: parseFloat(creditForm.amount) || 0, reason: creditForm.reason }),
    });
    const j = await res.json().catch(() => ({}));
    setCreditSaving(false);
    if (!res.ok) { setCreditError(j.error ?? 'Error'); return; }
    setShowCredit(false); setCreditForm({ amount: '', reason: '' });
    load();
  }

  // ─── Render ───
  if (loading) return <div className="text-center py-12 text-slate-500">{t('common.loading')}</div>;
  if (!inv) {
    return (
      <div className="max-w-2xl mx-auto bg-red-500/10 border border-red-500/30 rounded-xl p-8 text-center">
        <p className="text-red-300">{L.notFound}</p>
        <a href="/facturacion" className="text-amber-400 hover:text-amber-300 text-sm mt-3 inline-block">{L.back}</a>
      </div>
    );
  }

  const card = 'bg-slate-900/60 border border-white/10 rounded-2xl p-6';
  const sectionTitle = 'display-font text-slate-300 font-bold text-sm tracking-widest uppercase mb-4';
  const inputCls = 'bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-amber-400/50 transition';

  return (
    <div className="max-w-4xl">
      <a href="/facturacion" className="text-slate-400 hover:text-slate-200 text-base flex items-center gap-1.5 mb-4">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        {L.back}
      </a>

      {/* ─── Encabezado ─── */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="display-font text-3xl font-bold text-slate-100 tracking-wide">
              {inv.document_number || t('invoices.draftLabel')}
            </h1>
            {isEstimate && <span className="text-sm px-2.5 py-1 rounded-full border bg-purple-500/10 border-purple-500/30 text-purple-300">{t('invoices.docType.estimate')}</span>}
            <span className={`text-sm px-2.5 py-1 rounded-full border ${STATUS_STYLE[inv.status] ?? ''}`}>
              {isDraftInvoice ? t('invoices.pendingLabel') : t(`invoices.status.${inv.status}`)}
            </span>
            <span className="text-sm px-2.5 py-1 rounded-full border bg-slate-700/40 border-white/10 text-slate-400">{t(`invoices.pm.${inv.payment_method}`)}</span>
          </div>
          <div className="flex items-center gap-4 mt-2 flex-wrap text-sm text-slate-500">
            <span>{t('invoices.issueDate')}: <span className="text-slate-300">{fmtDate(inv.issue_date)}</span></span>
            {inv.due_date && <span>{t('invoices.dueDate')}: <span className="text-slate-300">{fmtDate(inv.due_date)}</span></span>}
            {shop && <span>{L.shop}: <span className="text-slate-300">{shop.name}</span></span>}
            {inv.order_number && <span>{t('invoices.orderNumberLabel')} <span className="text-purple-300">{inv.order_number}</span></span>}
            {inv.emitted_at && <span>{L.emittedAt}: <span className="text-slate-300">{fmtDate(String(inv.emitted_at).slice(0, 10))}</span></span>}
          </div>
        </div>
        <div className="text-right">
          <p className="display-font text-3xl font-bold text-amber-300">{money(inv.total)}</p>
          {inv.balance > 0.001 && !isVoid && inv.status !== 'draft' && (
            <p className="text-amber-400 text-sm mt-1">{t('invoices.balance')}: {money(inv.balance)}</p>
          )}
        </div>
      </div>

      {/* ─── Acciones ─── */}
      <div className="flex items-center gap-2 flex-wrap mb-6">
        {inv.status === 'draft' && !isVoid && (
          <a href={`/facturacion/nueva?id=${inv.id}`} className="bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 text-sky-200 font-semibold px-5 py-2.5 rounded-lg transition">
            {t('common.edit')}
          </a>
        )}
        {isDraftInvoice && (
          <button onClick={() => emitir()} disabled={busy} className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold px-5 py-2.5 rounded-lg transition display-font tracking-wide">
            {t('invoices.emit')}
          </button>
        )}
        {isEstimate && !inv.converted_to_invoice_id && !isVoid && (
          <button onClick={convertir} disabled={busy} className="bg-purple-500 hover:bg-purple-400 disabled:opacity-50 text-slate-950 font-bold px-5 py-2.5 rounded-lg transition display-font tracking-wide">
            {L.convert}
          </button>
        )}
        {isEstimate && inv.converted_to_invoice_id && (
          <a href={`/facturacion/${inv.converted_to_invoice_id}`} className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 px-5 py-2.5 rounded-lg transition">
            {L.seeConverted}
          </a>
        )}
        {inv.balance > 0.001 && !isVoid && inv.status !== 'draft' && (
          <button onClick={openPay} className="bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-200 font-semibold px-5 py-2.5 rounded-lg transition">
            {t('invoices.recordPayment')}
          </button>
        )}
        {!isVoid && inv.status !== 'draft' && inv.document_type === 'invoice' && inv.balance > 0.001 && (
          <button onClick={() => { setShowCredit(v => !v); setCreditError(''); }} className="bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/40 text-orange-200 font-semibold px-5 py-2.5 rounded-lg transition">
            {L.creditNote}
          </button>
        )}
        {!inv.client_id && (inv.customer_name || inv.customer_company) && (
          <button onClick={registrarCliente} disabled={busy} className="bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-200 px-5 py-2.5 rounded-lg transition">
            {L.registerClient}
          </button>
        )}
        <span className="flex-1" />
        <InvoicePdfButton invoiceId={inv.id} className="bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-300 p-2.5 rounded-lg transition" />
        <InvoicePdfButton invoiceId={inv.id} mode="print" className="bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-300 p-2.5 rounded-lg transition" />
        {!isVoid && (
          <button onClick={anular} disabled={busy} className="bg-slate-800 hover:bg-orange-500/10 border border-white/10 hover:border-orange-500/40 text-slate-400 hover:text-orange-300 px-4 py-2.5 rounded-lg transition text-sm">
            {t('invoices.void')}
          </button>
        )}
      </div>

      {/* ─── Formulario de pago (inline) ─── */}
      {showPay && (
        <div className={card + ' mb-6 border-emerald-500/20'}>
          <div className="flex items-center justify-between mb-4">
            <h2 className={sectionTitle + ' mb-0'}>{lastReceipt ? t('invoices.payment.recorded') : t('invoices.recordPayment')}</h2>
            <button onClick={() => setShowPay(false)} className="text-slate-500 hover:text-slate-300 text-sm">✕</button>
          </div>
          {lastReceipt ? (
            <div className="flex items-center gap-4 flex-wrap">
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-5 py-3">
                <span className="text-emerald-300 display-font text-xl font-bold">{money(lastReceipt.amount)}</span>
                <span className="text-slate-400 text-sm ml-3">{t('invoices.payment.receiptNo')} {lastReceipt.receipt_number}</span>
              </div>
              <PaymentReceiptButton invoiceId={inv.id} paymentId={lastReceipt.id} mode="print" label={t('invoices.payment.printReceipt')} className="inline-flex items-center gap-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold py-2.5 px-5 rounded-lg transition text-sm" />
              <button onClick={() => setShowPay(false)} className="text-slate-400 hover:text-slate-200 text-sm ml-auto">{t('common.done')}</button>
            </div>
          ) : (
            <form onSubmit={savePay} className="flex items-end gap-3 flex-wrap">
              <div>
                <label className="block text-slate-500 text-xs mb-1">{t('invoices.payment.type')}</label>
                <select value={payForm.payment_type} onChange={e => setPayForm(f => ({ ...f, payment_type: e.target.value }))} className={inputCls}>
                  {['deposit', 'advance', 'settlement'].map(pt => <option key={pt} value={pt}>{t(`invoices.paymentType.${pt}`)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-slate-500 text-xs mb-1">{t('invoices.payment.amount')} ($)</label>
                <input type="number" min="0.01" step="0.01" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} className={inputCls + ' w-32'} />
              </div>
              <div>
                <label className="block text-slate-500 text-xs mb-1">{t('invoices.payment.method')}</label>
                <select value={payForm.method} onChange={e => setPayForm(f => ({ ...f, method: e.target.value }))} className={inputCls}>
                  {['cash', 'check', 'card', 'deposit'].map(m => <option key={m} value={m}>{t(`invoices.pm.${m}`)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-slate-500 text-xs mb-1">{t('invoices.payment.date')}</label>
                <input type="date" value={payForm.paid_at} onChange={e => setPayForm(f => ({ ...f, paid_at: e.target.value }))} className={inputCls} />
              </div>
              <div className="flex-1 min-w-32">
                <label className="block text-slate-500 text-xs mb-1">{t('invoices.payment.reference')}</label>
                <input value={payForm.reference} onChange={e => setPayForm(f => ({ ...f, reference: e.target.value }))} placeholder={t('invoices.payment.referenceHint')} className={inputCls + ' w-full'} />
              </div>
              <button type="submit" disabled={paySaving} className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold py-2 px-5 rounded-lg transition display-font">
                {paySaving ? t('common.saving') : t('invoices.payment.save')}
              </button>
              {payError && <p className="w-full text-red-400 text-sm">{payError}</p>}
            </form>
          )}
        </div>
      )}

      {/* ─── Nota de crédito (inline) ─── */}
      {showCredit && (
        <div className={card + ' mb-6 border-orange-500/20'}>
          <div className="flex items-center justify-between mb-2">
            <h2 className={sectionTitle + ' mb-0'}>{L.creditNote}</h2>
            <button onClick={() => setShowCredit(false)} className="text-slate-500 hover:text-slate-300 text-sm">✕</button>
          </div>
          <p className="text-slate-500 text-sm mb-4">{L.creditHint.replace('{b}', money(inv.balance))}</p>
          <form onSubmit={saveCredit} className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="block text-slate-500 text-xs mb-1">{L.creditAmount} ($)</label>
              <input type="number" min="0.01" step="0.01" max={inv.balance} value={creditForm.amount}
                onChange={e => setCreditForm(f => ({ ...f, amount: e.target.value }))} className={inputCls + ' w-32'} />
            </div>
            <div className="flex-1 min-w-48">
              <label className="block text-slate-500 text-xs mb-1">{L.creditReason}</label>
              <input value={creditForm.reason} onChange={e => setCreditForm(f => ({ ...f, reason: e.target.value }))}
                placeholder={L.creditReasonHint} className={inputCls + ' w-full'} />
            </div>
            <button type="submit" disabled={creditSaving} className="bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-slate-950 font-bold py-2 px-5 rounded-lg transition display-font">
              {creditSaving ? t('common.saving') : L.creditSave}
            </button>
            {creditError && <p className="w-full text-red-400 text-sm">{creditError}</p>}
          </form>
        </div>
      )}

      <div className="space-y-5">
        {/* ─── Cliente + Seguro ─── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className={card}>
            <h2 className={sectionTitle}>{L.client}</h2>
            <p className="text-slate-100 text-lg font-semibold">
              {client?.name ?? inv.customer_name ?? t('invoices.noClient')}
              {!inv.client_id && (inv.customer_name || inv.customer_company) && (
                <span className="text-xs px-2 py-0.5 rounded-full border bg-slate-700/40 border-white/10 text-slate-400 ml-2 align-middle">{L.walkin}</span>
              )}
            </p>
            <div className="text-slate-400 text-sm mt-2 space-y-1">
              {client ? (
                <>
                  {client.billing_address_line && <p>{client.billing_address_line}</p>}
                  {(client.city || client.state || client.zip) && <p>{[client.city, client.state, client.zip].filter(Boolean).join(', ')}</p>}
                  {client.phone && <p>Tel: {client.phone}</p>}
                  <a href={`/clientes/${client.id}`} className="text-amber-400/80 hover:text-amber-300 text-xs inline-block mt-1">{L.seeClient}</a>
                </>
              ) : (
                <>
                  {inv.customer_company && <p>{inv.customer_company}</p>}
                  {inv.customer_phone && <p>Tel: {inv.customer_phone}</p>}
                </>
              )}
              {(truck || inv.customer_truck) && (
                <p className="text-sky-300/80">
                  🚛 {truck ? [truck.unit_number || truck.plate, [truck.year, truck.make, truck.model].filter(Boolean).join(' ')].filter(Boolean).join(' · ') : inv.customer_truck}
                </p>
              )}
            </div>
          </div>

          <div className={card}>
            <h2 className={sectionTitle}>{L.insurance}</h2>
            {inv.insurance_company || inv.insurance_claim ? (
              <div className="space-y-2 text-sm">
                {inv.insurance_company && <p className="text-slate-100 text-lg font-semibold">🛡 {inv.insurance_company}</p>}
                {inv.insurance_claim && <p className="text-slate-400">{L.claim}: <span className="text-slate-200">{inv.insurance_claim}</span></p>}
                <div className="flex items-center gap-2 pt-1">
                  <label className="text-slate-500 text-xs">{L.claimStatus}:</label>
                  <select value={inv.insurance_status ?? ''} onChange={e => setInsuranceStatus(e.target.value)} className={inputCls}>
                    <option value="">{L.claimStatusNone}</option>
                    {INSURANCE_STATUSES.map(s => <option key={s} value={s}>{(L.ins as any)[s]}</option>)}
                  </select>
                </div>
              </div>
            ) : (
              <p className="text-slate-600 text-sm">{L.noInsurance}</p>
            )}
          </div>
        </div>

        {/* ─── Renglones ─── */}
        <div className={card}>
          <h2 className={sectionTitle}>{L.items}</h2>
          {items.length === 0 ? (
            <p className="text-slate-600 text-sm">{inv.description || '—'}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-500 text-xs border-b border-white/10">
                    <th className="text-left py-2 pr-3 font-normal">{L.itemDesc}</th>
                    <th className="text-right py-2 px-3 font-normal">{L.itemQty}</th>
                    <th className="text-right py-2 px-3 font-normal">{L.itemPrice}</th>
                    <th className="text-right py-2 pl-3 font-normal">{L.itemAmount}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it: any) => (
                    <tr key={it.id} className="border-b border-white/5">
                      <td className="py-2.5 pr-3">
                        <span className={`text-xs px-1.5 py-0.5 rounded mr-2 ${it.line_type === 'labor' ? 'bg-sky-500/15 text-sky-300' : 'bg-amber-500/15 text-amber-300'}`}>
                          {t(`invoices.lineType.${it.line_type}`)}
                        </span>
                        <span className="text-slate-200">{it.description || '—'}</span>
                        {it.taxable && <span className="text-emerald-400/60 text-xs ml-2">{L.taxableBadge}</span>}
                      </td>
                      <td className="text-right py-2.5 px-3 text-slate-400">{Number(it.qty)}</td>
                      <td className="text-right py-2.5 px-3 text-slate-400">{money(it.unit_price)}</td>
                      <td className="text-right py-2.5 pl-3 text-slate-200 font-medium">{money(it.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Totales */}
          <div className="flex justify-end mt-4">
            <div className="w-full max-w-xs space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">{L.subtotal}</span><span className="text-slate-300">{money(inv.subtotal)}</span></div>
              <div className="flex justify-between">
                <span className="text-slate-500">{L.tax}{inv.tax_exempt ? ` (${L.exempt}${inv.tax_exempt_certificate ? ` #${inv.tax_exempt_certificate}` : ''})` : ''}</span>
                <span className="text-slate-300">{money(inv.tax_amount)}</span>
              </div>
              {Number(inv.discount) > 0 && <div className="flex justify-between"><span className="text-slate-500">{L.discount}</span><span className="text-slate-300">-{money(inv.discount)}</span></div>}
              <div className="flex justify-between border-t border-white/10 pt-2"><span className="text-slate-200 font-semibold">{L.total}</span><span className="text-amber-300 font-bold display-font text-lg">{money(inv.total)}</span></div>
              {Number(inv.amount_paid) > 0.001 && <div className="flex justify-between"><span className="text-slate-500">{L.paid}</span><span className="text-emerald-300">{money(inv.amount_paid)}</span></div>}
              {creditsTotal > 0.001 && <div className="flex justify-between"><span className="text-slate-500">{L.creditsApplied}</span><span className="text-orange-300">-{money(creditsTotal)}</span></div>}
              {inv.status !== 'draft' && <div className="flex justify-between"><span className="text-slate-400 font-medium">{t('invoices.balance')}</span><span className={`font-semibold ${inv.balance > 0.001 ? 'text-amber-300' : 'text-emerald-300'}`}>{money(inv.balance)}</span></div>}
            </div>
          </div>
        </div>

        {/* ─── Pagos ─── */}
        {payments.length > 0 && (
          <div className={card}>
            <h2 className={sectionTitle}>{t('invoices.payment.receipts')}</h2>
            <div className="space-y-1.5">
              {payments.map((p: any) => (
                <div key={p.id} className={`flex items-center justify-between gap-3 flex-wrap text-sm rounded-lg px-3 py-2 ${p.voided ? 'bg-red-500/[0.04]' : 'bg-slate-900/50'}`}>
                  <div className="min-w-0">
                    <span className={`font-semibold ${p.voided ? 'text-slate-500 line-through' : 'text-emerald-300'}`}>{money(p.amount)}</span>
                    <span className="text-slate-500 mx-2">·</span>
                    <span className="text-slate-400">{t(`invoices.paymentType.${p.payment_type ?? 'deposit'}`)}</span>
                    <span className="text-slate-600 text-xs ml-2">{fmtDate(p.paid_at)}</span>
                    {p.created_by_name && <span className="text-slate-600 text-xs ml-2">· {p.created_by_name}</span>}
                    {p.voided && <span className="text-xs px-1.5 py-0.5 ml-2 rounded-full border bg-red-500/10 border-red-500/30 text-red-300">{t('invoices.payment.voided')}{p.void_reason ? `: ${p.void_reason}` : ''}</span>}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="text-slate-600 text-xs mr-1">{p.receipt_number}</span>
                    {!p.voided && <>
                      <PaymentReceiptButton invoiceId={inv.id} paymentId={p.id} mode="print" />
                      <PaymentReceiptButton invoiceId={inv.id} paymentId={p.id} mode="download" />
                      <button onClick={() => voidPayment(p)} title={t('invoices.payment.void')} className="p-1.5 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                      </button>
                    </>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── Notas de crédito ─── */}
        {credits.length > 0 && (
          <div className={card}>
            <h2 className={sectionTitle}>{L.creditNotes}</h2>
            <div className="space-y-1.5">
              {credits.map((c: any) => (
                <div key={c.id} className="flex items-center justify-between gap-3 flex-wrap text-sm rounded-lg px-3 py-2 bg-slate-900/50">
                  <div className="min-w-0">
                    <span className="font-semibold text-orange-300">-{money(c.amount)}</span>
                    {c.reason && <span className="text-slate-400 ml-3">{c.reason}</span>}
                    {c.created_by_name && <span className="text-slate-600 text-xs ml-2">· {c.created_by_name}</span>}
                    <span className="text-slate-600 text-xs ml-2">{fmtDate(String(c.created_at).slice(0, 10))}</span>
                  </div>
                  <span className="text-slate-600 text-xs">{c.credit_number}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── Orden de trabajo enlazada ─── */}
        {inv.work_report_id && (
          <div className={card}>
            <h2 className={sectionTitle}>{L.workOrder}</h2>
            <p className="text-slate-400 text-sm">
              {L.workOrderLinked}{inv.order_number ? ` · #${inv.order_number}` : ''}
              <a href="/ordenes" className="text-amber-400/80 hover:text-amber-300 ml-3">{L.seeOrders}</a>
            </p>
          </div>
        )}
      </div>
      <div className="pb-10" />
    </div>
  );
}

// ─── Textos locales (bilingüe) ───────────────────────────────────────────────
const ES = {
  back: 'Volver a facturas', notFound: 'No se pudo cargar la factura.',
  shop: 'Taller', emittedAt: 'Emitida',
  client: 'Cliente', walkin: 'Ocasional', seeClient: 'Ver ficha del cliente →',
  insurance: 'Seguro', claim: 'Reclamo / póliza', claimStatus: 'Estado del reclamo',
  claimStatusNone: 'Sin estado', noInsurance: 'Esta factura no se cobra a un seguro.',
  ins: { sent: 'Enviado al seguro', approved: 'Aprobado', partial: 'Pago parcial', paid: 'Pagado', denied: 'Negado' },
  items: 'Detalle', itemDesc: 'Descripción', itemQty: 'Cant.', itemPrice: 'Precio', itemAmount: 'Importe',
  taxableBadge: '· impuesto', subtotal: 'Subtotal', tax: 'Impuesto', exempt: 'Exento', discount: 'Descuento',
  total: 'TOTAL', paid: 'Pagado', creditsApplied: 'Notas de crédito',
  convert: 'CONVERTIR EN FACTURA', seeConverted: 'Ver factura creada →',
  convertConfirm: '¿Convertir esta cotización en una factura borrador?',
  creditNote: 'Nota de crédito', creditNotes: 'Notas de crédito',
  creditHint: 'Reduce el saldo pendiente ({b}) por corrección o devolución, sin anular la factura. Queda numerada y con su razón para el contador.',
  creditAmount: 'Monto', creditReason: 'Razón', creditReasonHint: 'Ej. descuento acordado, trabajo no realizado…', creditSave: 'Aplicar crédito',
  registerClient: 'Registrar como cliente', registerConfirm: '¿Crear una ficha de cliente con los datos de esta factura (nombre, empresa, teléfono, camión) y enlazarla?',
  registerDone: 'Cliente registrado y enlazado a la factura.', registerReused: 'Ya existía un cliente con ese nombre; se enlazó la factura a esa ficha.',
  workOrder: 'Orden de trabajo', workOrderLinked: 'Esta factura está enlazada a una orden de trabajo (sus comisiones ya están en planilla).',
  seeOrders: 'Ver órdenes →',
};
const EN = {
  back: 'Back to invoices', notFound: 'Could not load the invoice.',
  shop: 'Shop', emittedAt: 'Emitted',
  client: 'Customer', walkin: 'Walk-in', seeClient: 'View client file →',
  insurance: 'Insurance', claim: 'Claim / policy', claimStatus: 'Claim status',
  claimStatusNone: 'No status', noInsurance: 'This invoice is not billed to insurance.',
  ins: { sent: 'Sent to insurer', approved: 'Approved', partial: 'Partially paid', paid: 'Paid', denied: 'Denied' },
  items: 'Details', itemDesc: 'Description', itemQty: 'Qty', itemPrice: 'Price', itemAmount: 'Amount',
  taxableBadge: '· taxable', subtotal: 'Subtotal', tax: 'Tax', exempt: 'Exempt', discount: 'Discount',
  total: 'TOTAL', paid: 'Paid', creditsApplied: 'Credit notes',
  convert: 'CONVERT TO INVOICE', seeConverted: 'View created invoice →',
  convertConfirm: 'Convert this estimate into a draft invoice?',
  creditNote: 'Credit note', creditNotes: 'Credit notes',
  creditHint: 'Reduces the outstanding balance ({b}) for a correction or return, without voiding the invoice. Numbered with its reason for the accountant.',
  creditAmount: 'Amount', creditReason: 'Reason', creditReasonHint: 'e.g. agreed discount, work not performed…', creditSave: 'Apply credit',
  registerClient: 'Register as client', registerConfirm: 'Create a client file from this invoice (name, company, phone, truck) and link it?',
  registerDone: 'Client registered and linked to the invoice.', registerReused: 'A client with that name already existed; the invoice was linked to it.',
  workOrder: 'Work order', workOrderLinked: 'This invoice is linked to a work order (its commissions are already in payroll).',
  seeOrders: 'View orders →',
};
