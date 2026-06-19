'use client';

import { useEffect, useState, useCallback } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { fmtDate } from '@/lib/fmt';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

type Period = 'day' | 'week' | 'month' | 'year';

interface ShopRow {
  id: string | null;
  name: string;
  business_code: string | null;
  facturado: number;
  sales_tax: number;
  cobrado: number;
  por_cobrar: number;
  num_facturas: number;
}
interface Totals { facturado: number; sales_tax: number; cobrado: number; por_cobrar: number; num_facturas: number }

// ── Fechas (parseadas a mediodía local para evitar corrimientos de zona) ──
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (s: string) => new Date(s + 'T12:00:00');
const todayISO = () => iso(new Date());

// Rango [from,to] del periodo que contiene `cursor`.
function rangeFor(period: Period, cursorISO: string): { from: string; to: string } {
  const d = parse(cursorISO);
  const y = d.getFullYear(), m = d.getMonth();
  if (period === 'day') return { from: cursorISO, to: cursorISO };
  if (period === 'week') {
    const start = new Date(d); start.setDate(d.getDate() - d.getDay()); // domingo
    const end = new Date(start); end.setDate(start.getDate() + 6);       // sábado
    return { from: iso(start), to: iso(end) };
  }
  if (period === 'month') return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
  return { from: iso(new Date(y, 0, 1)), to: iso(new Date(y, 11, 31)) }; // year
}

// Mueve el cursor un periodo hacia atrás/adelante.
function shift(period: Period, cursorISO: string, dir: 1 | -1): string {
  const d = parse(cursorISO);
  if (period === 'day') d.setDate(d.getDate() + dir);
  else if (period === 'week') d.setDate(d.getDate() + 7 * dir);
  else if (period === 'month') return iso(new Date(d.getFullYear(), d.getMonth() + dir, 1));
  else return iso(new Date(d.getFullYear() + dir, 0, 1));
  return iso(d);
}

export default function InformeVentasPage() {
  const { t, lang } = useLanguage();
  const locale = lang === 'en' ? 'en-US' : 'es-MX';
  const money = (n: number) => '$' + (Number(n) || 0).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const [period, setPeriod] = useState<Period>('month');
  const [cursor, setCursor] = useState(todayISO());
  const [shops, setShops] = useState<ShopRow[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState<boolean | null>(null);

  const { from, to } = rangeFor(period, cursor);

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

  // Etiqueta legible del periodo seleccionado.
  function periodLabel(): string {
    const d = parse(cursor);
    if (period === 'day') return fmtDate(from);
    if (period === 'week') return `${fmtDate(from)} — ${fmtDate(to)}`;
    if (period === 'month') return d.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
    return String(d.getFullYear());
  }

  function generatePdf() {
    const INK = 30, SOFT = 110, LINE = 175;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
    const W = doc.internal.pageSize.getWidth();
    const M = 40;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(INK, INK, INK);
    doc.text('ADVANCE TRUCK REPAIR', M, 40);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(SOFT, SOFT, SOFT);
    doc.text(`${t('salesReport.title')} — ${t(`salesReport.${period}`)}`, M, 56);
    doc.text(`${t('shopReport.period')}: ${fmtDate(from)} — ${fmtDate(to)}`, W - M, 56, { align: 'right' });

    const head = [[t('shopReport.business'), t('salesReport.sales'), t('shopReport.salesTax'), t('shopReport.collected'), t('shopReport.receivable'), '#']];
    const body = shops.map(s => [
      (s.business_code ? s.business_code + ' · ' : '') + s.name,
      money(s.facturado), money(s.sales_tax), money(s.cobrado), money(s.por_cobrar), String(s.num_facturas),
    ]);
    if (totals && shops.length > 1) {
      body.push([t('salesReport.bothShops'), money(totals.facturado), money(totals.sales_tax), money(totals.cobrado), money(totals.por_cobrar), String(totals.num_facturas)]);
    }
    const totalRowIdx = totals && shops.length > 1 ? body.length - 1 : -1;
    autoTable(doc, {
      startY: 70, head, body,
      styles: { fontSize: 9, textColor: [INK, INK, INK], cellPadding: 5, lineColor: [LINE, LINE, LINE], lineWidth: 0.3 },
      headStyles: { fillColor: [240, 240, 240], textColor: [INK, INK, INK], fontStyle: 'bold' as const, fontSize: 9 },
      columnStyles: { 0: { halign: 'left' }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'center' } },
      didParseCell: (h: any) => { if (h.section === 'body' && h.row.index === totalRowIdx) h.cell.styles.fontStyle = 'bold'; },
    });
    const now = new Date();
    doc.setFontSize(8); doc.setTextColor(SOFT, SOFT, SOFT);
    doc.text(`${t('shopReport.printed')}: ${now.toLocaleDateString('en-US')} ${now.toLocaleTimeString('en-US')}`, M, doc.internal.pageSize.getHeight() - 24);
    doc.save(`informe_ventas_${period}_${from}_${to}.pdf`);
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

  const periods: Period[] = ['day', 'week', 'month', 'year'];

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="display-font text-3xl font-bold text-slate-100 tracking-wide">{t('salesReport.title')}</h1>
          <p className="text-slate-400 mt-1">{t('salesReport.subtitle')}</p>
        </div>
        <button onClick={generatePdf} disabled={shops.length === 0}
          className="bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed border border-white/10 text-slate-200 text-sm px-4 py-2.5 rounded-lg transition flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          {t('shopReport.exportPdf')}
        </button>
      </div>

      {/* Selector de periodo */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {periods.map(p => (
          <button key={p} onClick={() => { setPeriod(p); setCursor(todayISO()); }}
            className={`px-4 py-1.5 rounded-lg text-sm border transition ${period === p ? 'bg-amber-500/15 border-amber-500/40 text-amber-300' : 'bg-slate-800 border-white/10 text-slate-400 hover:text-slate-200'}`}>
            {t(`salesReport.${p}`)}
          </button>
        ))}
      </div>

      {/* Navegación del periodo */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <button onClick={() => setCursor(c => shift(period, c, -1))} className="px-3 py-1.5 rounded-lg text-sm border bg-slate-800 border-white/10 text-slate-300 hover:text-white transition">‹ {t('salesReport.prev')}</button>
        <span className="display-font text-slate-100 font-semibold tracking-wide capitalize min-w-[12rem] text-center">{periodLabel()}</span>
        <button onClick={() => setCursor(c => shift(period, c, 1))} className="px-3 py-1.5 rounded-lg text-sm border bg-slate-800 border-white/10 text-slate-300 hover:text-white transition">{t('salesReport.next')} ›</button>
        <button onClick={() => setCursor(todayISO())} className="px-3 py-1.5 rounded-lg text-sm border bg-slate-800 border-white/10 text-slate-400 hover:text-slate-200 transition">{t('salesReport.today')}</button>
        <span className="text-slate-500 text-xs ml-1">{fmtDate(from)} — {fmtDate(to)}</span>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-500">{t('common.loading')}</div>
      ) : shops.length === 0 ? (
        <div className="bg-slate-900/60 border border-white/5 rounded-xl p-12 text-center">
          <p className="text-slate-500 mb-1">{t('shopReport.empty')}</p>
          <p className="text-slate-600 text-xs">{t('shopReport.emptyHint')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Total (ambos talleres juntos) primero, destacado */}
          {totals && shops.length > 1 && (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-5">
              <p className="display-font text-amber-300 font-semibold tracking-wide mb-4">{t('salesReport.bothShops')}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <Metric label={t('salesReport.sales')} value={money(totals.facturado)} accent="text-amber-300" />
                <Metric label={t('shopReport.collected')} value={money(totals.cobrado)} accent="text-emerald-300" />
                <Metric label={t('shopReport.receivable')} value={money(totals.por_cobrar)} accent="text-orange-300" />
                <Metric label={t('shopReport.salesTax')} value={money(totals.sales_tax)} accent="text-sky-300" />
                <Metric label={t('shopReport.invoices')} value={String(totals.num_facturas)} accent="text-slate-200" />
              </div>
            </div>
          )}

          {/* Por taller (separado) */}
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
                <Metric label={t('salesReport.sales')} value={money(s.facturado)} accent="text-amber-300" />
                <Metric label={t('shopReport.collected')} value={money(s.cobrado)} accent="text-emerald-300" />
                <Metric label={t('shopReport.receivable')} value={money(s.por_cobrar)} accent="text-orange-300" />
                <Metric label={t('shopReport.salesTax')} value={money(s.sales_tax)} accent="text-sky-300" />
                <Metric label={t('shopReport.invoices')} value={String(s.num_facturas)} accent="text-slate-200" />
              </div>
            </div>
          ))}
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
