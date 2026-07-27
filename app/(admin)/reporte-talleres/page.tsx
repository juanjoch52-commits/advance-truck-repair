'use client';

import { useEffect, useState, useCallback } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { fmtDate } from '@/lib/fmt';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ShopRow {
  id: string | null;
  name: string;
  business_code: string | null;
  facturado: number;
  sales_tax: number;
  costo_piezas: number;
  cobrado: number;
  por_cobrar: number;
  num_facturas: number;
}
interface Totals { facturado: number; sales_tax: number; costo_piezas: number; ganancia_piezas: number; cobrado: number; por_cobrar: number; num_facturas: number }
interface Labor { facturada: number; pagada: number; margen: number }

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
  const [labor, setLabor] = useState<Labor | null>(null);
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
      if (r.ok) { const j = await r.json(); setShops(j.shops ?? []); setTotals(j.totals ?? null); setLabor(j.labor ?? null); }
      else { setShops([]); setTotals(null); setLabor(null); }
    } catch { setShops([]); setTotals(null); setLabor(null); }
    setLoading(false);
  }, [from, to]);

  useEffect(() => { if (allowed) load(); }, [allowed, load]);

  function generatePdf() {
    const INK = 30, SOFT = 110, LINE = 175;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
    const W = doc.internal.pageSize.getWidth();
    const M = 40;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(INK, INK, INK);
    doc.text('ADVANCE TRUCK REPAIR', M, 40);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(SOFT, SOFT, SOFT);
    doc.text(t('shopReport.title'), M, 56);
    doc.text(`${t('shopReport.period')}: ${fmtDate(from)} — ${fmtDate(to)}`, W - M, 56, { align: 'right' });

    const head = [[t('shopReport.business'), t('shopReport.invoiced'), t('shopReport.salesTax'), t('shopReport.partsCost'), t('shopReport.collected'), t('shopReport.receivable'), '#']];
    const body = shops.map(s => [
      (s.business_code ? s.business_code + ' · ' : '') + s.name,
      money(s.facturado), money(s.sales_tax), money(s.costo_piezas), money(s.cobrado), money(s.por_cobrar), String(s.num_facturas),
    ]);
    if (totals && shops.length > 1) {
      body.push([t('shopReport.total'), money(totals.facturado), money(totals.sales_tax), money(totals.costo_piezas), money(totals.cobrado), money(totals.por_cobrar), String(totals.num_facturas)]);
    }
    const totalRowIdx = totals && shops.length > 1 ? body.length - 1 : -1;
    autoTable(doc, {
      startY: 70,
      head, body,
      styles: { fontSize: 9, textColor: [INK, INK, INK], cellPadding: 5, lineColor: [LINE, LINE, LINE], lineWidth: 0.3 },
      headStyles: { fillColor: [240, 240, 240], textColor: [INK, INK, INK], fontStyle: 'bold' as const, fontSize: 9 },
      columnStyles: { 0: { halign: 'left' }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'center' } },
      didParseCell: (h: any) => { if (h.section === 'body' && h.row.index === totalRowIdx) h.cell.styles.fontStyle = 'bold'; },
    });
    let y = ((doc as any).lastAutoTable?.finalY ?? 200) + 18;
    if (totals) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(INK, INK, INK);
      doc.text(`${t('shopReport.partsProfit')} (${t('shopReport.total').toLowerCase()}): ${money(totals.ganancia_piezas)}`, M, y);
      y += 16;
    }
    if (labor) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(INK, INK, INK);
      doc.text(`${t('shopReport.laborTitle')} (${t('shopReport.laborSubtitle')}):`, M, y);
      y += 14;
      doc.setFont('helvetica', 'normal');
      doc.text(`${t('shopReport.laborBilled')}: ${money(labor.facturada)}    ${t('shopReport.laborPaid')}: ${money(labor.pagada)}    ${t('shopReport.laborMargin')}: ${money(labor.margen)}`, M, y);
      y += 18;
    }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(SOFT, SOFT, SOFT);
    doc.text(t('shopReport.cpaNote'), M, y, { maxWidth: W - M * 2 });
    const now = new Date();
    doc.text(`${t('shopReport.printed')}: ${now.toLocaleDateString('en-US')} ${now.toLocaleTimeString('en-US')}`, M, doc.internal.pageSize.getHeight() - 24);
    doc.save(`reporte_talleres_${from}_${to}.pdf`);
  }

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
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="display-font text-3xl font-bold text-slate-100 tracking-wide">{t('shopReport.title')}</h1>
          <p className="text-slate-400 mt-1">{t('shopReport.subtitle')}</p>
        </div>
        <button data-tour="rep-pdf" onClick={generatePdf} disabled={shops.length === 0}
          className="bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed border border-white/10 text-slate-200 text-sm px-4 py-2.5 rounded-lg transition flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          {t('shopReport.exportPdf')}
        </button>
      </div>

      {/* Periodo */}
      <div data-tour="rep-presets" className="flex items-end gap-3 mb-6 flex-wrap">
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
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <Metric label={t('shopReport.invoiced')} value={money(s.facturado)} accent="text-amber-300" />
                <Metric label={t('shopReport.salesTax')} value={money(s.sales_tax)} accent="text-sky-300" />
                <Metric label={t('shopReport.partsCost')} value={money(s.costo_piezas)} accent="text-red-300" />
                <Metric label={t('shopReport.collected')} value={money(s.cobrado)} accent="text-emerald-300" />
                <Metric label={t('shopReport.receivable')} value={money(s.por_cobrar)} accent="text-orange-300" />
              </div>
              {s.costo_piezas > 0 && (
                <p className="text-slate-600 text-xs mt-2">{t('shopReport.absorbsCostsNote')}</p>
              )}
            </div>
          ))}

          {totals && shops.length > 1 && (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-5">
              <p className="display-font text-amber-300 font-semibold tracking-wide mb-4">{t('shopReport.total')}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <Metric label={t('shopReport.invoiced')} value={money(totals.facturado)} accent="text-amber-300" />
                <Metric label={t('shopReport.salesTax')} value={money(totals.sales_tax)} accent="text-sky-300" />
                <Metric label={t('shopReport.partsCost')} value={money(totals.costo_piezas)} accent="text-red-300" />
                <Metric label={t('shopReport.partsProfit')} value={money(totals.ganancia_piezas)} accent="text-emerald-300" />
                <Metric label={t('shopReport.collected')} value={money(totals.cobrado)} accent="text-emerald-300" />
                <Metric label={t('shopReport.receivable')} value={money(totals.por_cobrar)} accent="text-orange-300" />
              </div>
            </div>
          )}

          {labor && (
            <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-5">
              <p className="display-font text-indigo-300 font-semibold tracking-wide mb-1">{t('shopReport.laborTitle')}</p>
              <p className="text-slate-500 text-xs mb-4">{t('shopReport.laborSubtitle')}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Metric label={t('shopReport.laborBilled')} value={money(labor.facturada)} accent="text-amber-300" />
                <Metric label={t('shopReport.laborPaid')} value={money(labor.pagada)} accent="text-red-300" />
                <Metric label={t('shopReport.laborMargin')} value={money(labor.margen)} accent="text-emerald-300" />
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
