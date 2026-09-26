'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { PaymentReceiptButton } from '@/components/PaymentReceiptButton';
import { fmtDate } from '@/lib/fmt';

interface Row {
  id: string; paid_at: string; receipt_number: string | null; document_number: string | null;
  invoice_id: string; client: string; method: string; payment_type: string; amount: number;
  reference: string | null; created_by_name: string | null;
}
interface Bucket { total: number; count: number }
interface Data {
  from: string; to: string; total: number; count: number;
  by_method: Record<string, Bucket>; by_type: Record<string, Bucket>; rows: Row[];
  sales_tax: number; invoiced_total: number; invoiced_count: number;
}
interface ShopOpt { id: string; name: string }

function firstOfMonth() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); }
const todayISO = () => new Date().toISOString().slice(0, 10);

const METHOD_ORDER = ['cash', 'check', 'card', 'deposit', 'credit'];
const TYPE_ORDER = ['settlement', 'deposit', 'advance', 'payment'];

export default function ReporteCobranzaPage() {
  const { t, lang } = useLanguage();
  const locale = lang === 'en' ? 'en-US' : 'es-MX';
  const money = (n: number) => '$' + (Number(n) || 0).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(todayISO());
  const [shopId, setShopId] = useState('');
  const [shops, setShops] = useState<ShopOpt[]>([]);
  const [isContable, setIsContable] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      let role = '';
      try { const res = await fetch('/api/auth/me'); if (res.ok) { const j = await res.json(); role = (j?.user?.role ?? '').toLowerCase(); } } catch {}
      const contable = role === 'contable';
      setIsContable(contable);
      // El selector de taller solo para roles globales (la contable está fijada a su taller).
      if (!contable) {
        try { const rs = await fetch('/api/shops/options'); if (rs.ok) { const js = await rs.json(); setShops(js.shops ?? []); } } catch {}
      }
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ from, to });
      if (shopId) qs.set('shop_id', shopId);
      const r = await fetch(`/api/reportes/cobranza?${qs.toString()}`);
      if (r.ok) setData(await r.json()); else setData(null);
    } catch { setData(null); }
    setLoading(false);
  }, [from, to, shopId]);

  useEffect(() => { load(); }, [load]);

  function exportCsv() {
    if (!data) return;
    const head = [t('collections.date'), t('collections.receipt'), t('collections.invoice'), t('collections.client'), t('collections.method'), t('collections.type'), t('collections.amount'), t('collections.recordedBy')];
    const lines = data.rows.map(r => [
      r.paid_at, r.receipt_number ?? '', r.document_number ?? '', r.client,
      t(`invoices.pm.${r.method}`), t(`invoices.paymentType.${r.payment_type}`),
      String(r.amount), r.created_by_name ?? '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const csv = [head.map(h => `"${h}"`).join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `cobranza_${from}_${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const inputCls = 'bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-amber-400/50 transition';

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="display-font text-3xl font-bold text-slate-100 tracking-wide">{t('collections.title')}</h1>
          <p className="text-slate-400 mt-1">{t('collections.subtitle')}</p>
        </div>
        <button onClick={exportCsv} disabled={!data || data.rows.length === 0}
          className="bg-slate-800 hover:bg-slate-700 disabled:opacity-40 border border-white/10 text-slate-200 text-sm px-4 py-2.5 rounded-lg transition flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          {t('collections.exportCsv')}
        </button>
      </div>

      {/* Filtros */}
      <div className="flex items-end gap-3 flex-wrap mb-6">
        <div>
          <label className="block text-slate-500 text-xs mb-1">{t('collections.from')}</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-slate-500 text-xs mb-1">{t('collections.to')}</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls} />
        </div>
        {!isContable && shops.length > 0 && (
          <div>
            <label className="block text-slate-500 text-xs mb-1">{t('collections.shop')}</label>
            <select value={shopId} onChange={e => setShopId(e.target.value)} className={inputCls}>
              <option value="">{t('collections.allShops')}</option>
              {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-500">{t('common.loading')}</div>
      ) : !data || data.count === 0 ? (
        <div className="text-center py-12 text-slate-500">{t('collections.none')}</div>
      ) : (
        <>
          {/* Resumen: dinero cobrado + impuesto recolectado */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-5">
              <p className="text-emerald-300/70 text-xs uppercase tracking-wide">{t('collections.total')}</p>
              <p className="display-font text-3xl font-bold text-emerald-300 mt-1">{money(data.total)}</p>
              <p className="text-slate-500 text-xs mt-1">{data.count} {t('collections.payments')}</p>
            </div>
            <div className="bg-sky-500/10 border border-sky-500/30 rounded-xl p-5">
              <p className="text-sky-300/70 text-xs uppercase tracking-wide">{t('collections.salesTax')}</p>
              <p className="display-font text-3xl font-bold text-sky-300 mt-1">{money(data.sales_tax)}</p>
              <p className="text-slate-500 text-xs mt-1">{t('collections.salesTaxNote').replace('{n}', String(data.invoiced_count)).replace('{a}', money(data.invoiced_total))}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-slate-900/60 border border-white/5 rounded-xl p-5">
              <p className="text-slate-400 text-xs uppercase tracking-wide mb-2">{t('collections.byMethod')}</p>
              <div className="space-y-1.5">
                {METHOD_ORDER.filter(m => data.by_method[m]).map(m => (
                  <div key={m} className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">{t(`invoices.pm.${m}`)} <span className="text-slate-600 text-xs">({data.by_method[m].count})</span></span>
                    <span className={`font-semibold ${m === 'cash' ? 'text-emerald-300' : 'text-slate-200'}`}>{money(data.by_method[m].total)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-slate-900/60 border border-white/5 rounded-xl p-5">
              <p className="text-slate-400 text-xs uppercase tracking-wide mb-2">{t('collections.byType')}</p>
              <div className="space-y-1.5">
                {TYPE_ORDER.filter(ty => data.by_type[ty]).map(ty => (
                  <div key={ty} className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">{t(`invoices.paymentType.${ty}`)} <span className="text-slate-600 text-xs">({data.by_type[ty].count})</span></span>
                    <span className="font-semibold text-slate-200">{money(data.by_type[ty].total)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Detalle */}
          <div className="bg-slate-900/60 border border-white/5 rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
              <thead>
                <tr className="border-b border-white/5 text-slate-500">
                  <th className="text-left px-4 py-3 font-medium">{t('collections.date')}</th>
                  <th className="text-left px-4 py-3 font-medium">{t('collections.receipt')}</th>
                  <th className="text-left px-4 py-3 font-medium">{t('collections.invoice')}</th>
                  <th className="text-left px-4 py-3 font-medium">{t('collections.client')}</th>
                  <th className="text-left px-4 py-3 font-medium">{t('collections.method')}</th>
                  <th className="text-left px-4 py-3 font-medium">{t('collections.type')}</th>
                  <th className="text-right px-4 py-3 font-medium">{t('collections.amount')}</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map(r => (
                  <tr key={r.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">{fmtDate(r.paid_at)}</td>
                    <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">{r.receipt_number ?? '—'}</td>
                    <td className="px-4 py-2.5 text-slate-400">{r.document_number ?? '—'}</td>
                    <td className="px-4 py-2.5 text-slate-200">{r.client}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${r.method === 'cash' ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' : 'text-slate-300 bg-slate-700/40 border-white/10'}`}>{t(`invoices.pm.${r.method}`)}</span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-400">{t(`invoices.paymentType.${r.payment_type}`)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-emerald-300 whitespace-nowrap">{money(r.amount)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <PaymentReceiptButton invoiceId={r.invoice_id} paymentId={r.id} mode="print" />
                        <PaymentReceiptButton invoiceId={r.invoice_id} paymentId={r.id} mode="download" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
