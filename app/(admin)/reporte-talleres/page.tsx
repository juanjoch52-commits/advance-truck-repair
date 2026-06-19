'use client';

import { useEffect, useState, useCallback } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { fmtDate } from '@/lib/fmt';

interface ShopRow {
  id: string | null;
  name: string;
  business_code: string | null;
  facturado: number;
  sales_tax: number;
  cobrado: number;
  por_cobrar: number;
  ganancia_piezas: number;
  num_facturas: number;
}
interface Totals { facturado: number; sales_tax: number; cobrado: number; por_cobrar: number; ganancia_piezas: number; num_facturas: number }

function firstOfMonth() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); }
function firstOfQuarter() { const d = new Date(); const q = Math.floor(d.getMonth() / 3) * 3; return new Date(d.getFullYear(), q, 1).toISOString().slice(0, 10); }
function firstOfYear() { const d = new Date(); return new Date(d.getFullYear(), 0, 1).toISOString().slice(0, 10); }
const todayISO = () => new Date().toISOString().slice(0, 10);

export default function ReporteTalleresPage() {
  const { t, lang } = useLanguage();
  const locale = lang === 'en' ? 'en-US' : 'es-MX';
  const money = (n: number) => '$' + (Number(n) || 0).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(todayISO());
  const [shops, setShops] = useState<ShopRow[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      let role = '';
      try { const res = await fetch('/api/auth/me'); if (res.ok) { const j = await res.json(); role = (j?.user?.role ?? '').toLowerCase(); } } catch {}
      setAllowed(role === 'super_user' || role === 'super_admin' || role === 'owner');
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/reportes/talleres?from=${from}&to=${to}`);
      if (r.ok) { const j = await r.json(); setShops(j.shops ?? []); setTotals(j.totals ?? null); }
      else { setShops([]); setTotals(null); }
    } catch { setShops([]); setTotals(null); }
    setLoading(false);
  }, [from, to]);

  useEffect(() => { if (allowed) load(); }, [allowed, load]);

  function preset(which: 'month' | 'quarter' | 'year') {
    if (which === 'month') setFrom(firstOfMonth());
    if (which === 'quarter') setFrom(firstOfQuarter());
    if (which === 'year') setFrom(firstOfYear());
    setTo(todayISO());
  }

  if (allowed === null) return <div className="text-center py-12 text-slate-500">{t('common.loading')}</div>;
  if (!allowed) {
    return (
      <div className="max-w-2xl mx-auto bg-red-500/10 border border-red-500/30 rounded-xl p-8 text-center">
        <h2 className="display-font text-red-400 font-bold text-xl mb-2">{t('adminPayroll.notAllowedTitle')}</h2>
        <p className="text-slate-400 text-sm">{t('adminPayroll.notAllowedMsg')}</p>
      </div>
    );
  }

  const presetBtn = 'px-3 py-1.5 rounded-lg text-sm border bg-slate-800 border-white/10 text-slate-400 hover:text-slate-200 transition';

  return (
    <div>
      <div className="mb-6">
        <h1 className="display-font text-3xl font-bold text-slate-100 tracking-wide">{t('shopReport.title')}</h1>
        <p className="text-slate-400 mt-1">{t('shopReport.subtitle')}</p>
      </div>

      {/* Periodo */}
      <div className="flex items-end gap-3 mb-6 flex-wrap">
        <div className="flex gap-2">
          <button onClick={() => preset('month')} className={presetBtn}>{t('shopReport.thisMonth')}</button>
          <button onClick={() => preset('quarter')} className={presetBtn}>{t('shopReport.thisQuarter')}</button>
          <button onClick={() => preset('year')} className={presetBtn}>{t('shopReport.thisYear')}</button>
        </div>
        <div className="flex items-center gap-2">
          <div>
            <label className="block text-slate-500 text-xs mb-1">{t('shopReport.from')}</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-amber-400/50" />
          </div>
          <div>
            <label className="block text-slate-500 text-xs mb-1">{t('shopReport.to')}</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-amber-400/50" />
          </div>
        </div>
      </div>

      <p className="text-slate-500 text-xs mb-4">{t('shopReport.period')}: <span className="text-slate-300">{fmtDate(from)} — {fmtDate(to)}</span></p>

      {loading ? (
        <div className="text-center py-12 text-slate-500">{t('common.loading')}</div>
      ) : shops.length === 0 ? (
        <div className="bg-slate-900/60 border border-white/5 rounded-xl p-12 text-center">
          <p className="text-slate-500 mb-1">{t('shopReport.empty')}</p>
          <p className="text-slate-600 text-xs">{t('shopReport.emptyHint')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {shops.map(s => (
            <div key={s.id ?? 'none'} className="bg-slate-900/60 border border-white/5 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  {s.business_code && <span className="text-xs px-2 py-0.5 rounded-full border bg-amber-500/10 border-amber-500/30 text-amber-300">{s.business_code}</span>}
                  <span className="display-font text-slate-100 font-semibold tracking-wide">{s.name}</span>
                </div>
                <span className="text-slate-500 text-xs">{s.num_facturas} {t('shopReport.invoices')}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <Metric label={t('shopReport.invoiced')} value={money(s.facturado)} accent="text-amber-300" />
                <Metric label={t('shopReport.salesTax')} value={money(s.sales_tax)} accent="text-sky-300" />
                <Metric label={t('shopReport.collected')} value={money(s.cobrado)} accent="text-emerald-300" />
                <Metric label={t('shopReport.receivable')} value={money(s.por_cobrar)} accent="text-orange-300" />
                <Metric label={t('shopReport.partsProfit')} value={money(s.ganancia_piezas)} accent="text-emerald-300" />
              </div>
            </div>
          ))}

          {totals && shops.length > 1 && (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-5">
              <p className="display-font text-amber-300 font-semibold tracking-wide mb-4">{t('shopReport.total')}</p>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <Metric label={t('shopReport.invoiced')} value={money(totals.facturado)} accent="text-amber-300" />
                <Metric label={t('shopReport.salesTax')} value={money(totals.sales_tax)} accent="text-sky-300" />
                <Metric label={t('shopReport.collected')} value={money(totals.cobrado)} accent="text-emerald-300" />
                <Metric label={t('shopReport.receivable')} value={money(totals.por_cobrar)} accent="text-orange-300" />
                <Metric label={t('shopReport.partsProfit')} value={money(totals.ganancia_piezas)} accent="text-emerald-300" />
              </div>
            </div>
          )}

          <p className="text-slate-600 text-xs">{t('shopReport.cpaNote')}</p>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="bg-slate-800/40 rounded-lg px-3 py-2.5">
      <p className="text-slate-500 text-xs mb-0.5">{label}</p>
      <p className={`display-font font-bold ${accent}`}>{value}</p>
    </div>
  );
}
