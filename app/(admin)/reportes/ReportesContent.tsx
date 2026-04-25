'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { useLanguage, getTranslator, type Lang } from '@/contexts/LanguageContext';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

type TipoReporte = 'semanal' | 'mensual' | 'anual';

function getWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMon);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: monday.toISOString().split('T')[0], end: sunday.toISOString().split('T')[0] };
}

export default function ReportesContent() {
  const searchParams = useSearchParams();
  const { t: tUI } = useLanguage();
  const supabase = createClient();

  const now = new Date();
  const { start: defaultWeekStart, end: defaultWeekEnd } = getWeekRange();

  const [tipo, setTipo] = useState<TipoReporte>((searchParams.get('tipo') as TipoReporte) ?? 'semanal');
  const [desde, setDesde] = useState(searchParams.get('desde') ?? defaultWeekStart);
  const [hasta, setHasta] = useState(searchParams.get('hasta') ?? defaultWeekEnd);
  const [mes, setMes] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [anio, setAnio] = useState(String(now.getFullYear()));
  const [loading, setLoading] = useState(false);
  const [showLangModal, setShowLangModal] = useState(false);

  const formatMoney = (n: number) =>
    '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const formatDate = (d: string, locale = 'es-MX') =>
    new Date(d + 'T12:00:00').toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric' });

  async function generarPDF(pdfLang: Lang) {
    setShowLangModal(false);
    setLoading(true);
    const t = getTranslator(pdfLang);
    const locale = pdfLang === 'en' ? 'en-US' : 'es-MX';

    let fechaDesde = desde;
    let fechaHasta = hasta;
    let titulo = '';
    let subtitulo = '';

    if (tipo === 'mensual') {
      const [y, m] = mes.split('-').map(Number);
      fechaDesde = new Date(y, m - 1, 1).toISOString().split('T')[0];
      fechaHasta = new Date(y, m, 0).toISOString().split('T')[0];
      const mesNombre = new Date(y, m - 1, 15).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
      titulo = t('pdf.reportTitle.mensual');
      subtitulo = `${t('pdf.period.label')}: ${mesNombre.toUpperCase()}`;
    } else if (tipo === 'anual') {
      fechaDesde = `${anio}-01-01`;
      fechaHasta = `${anio}-12-31`;
      titulo = t('pdf.reportTitle.anual');
      subtitulo = `${t('pdf.period.year')}: ${anio}`;
    } else {
      titulo = t('pdf.reportTitle.semanal');
      subtitulo = `${t('pdf.period.week')}: ${formatDate(desde, locale)} — ${formatDate(hasta, locale)}`;
    }

    const { data: entries } = await (supabase as any)
      .from('earned_entries')
      .select(`
        id, amount, work_date, truck_number, description,
        employees!earned_entries_employee_id_fkey(full_name),
        work_reports!earned_entries_work_report_id_fkey(company, external_order_number)
      `)
      .gte('work_date', fechaDesde)
      .lte('work_date', fechaHasta)
      .order('work_date', { ascending: true });

    const data = entries ?? [];

    if (data.length === 0) {
      alert(tUI('payroll.empty'));
      setLoading(false);
      return;
    }

    const byEmployee: Record<string, { name: string; total: number; rows: any[] }> = {};
    for (const e of data) {
      const name = (e as any).employees?.full_name ?? 'Sin nombre';
      if (!byEmployee[name]) byEmployee[name] = { name, total: 0, rows: [] };
      byEmployee[name].total += Number(e.amount);
      byEmployee[name].rows.push(e);
    }
    const mechanics = Object.values(byEmployee).sort((a, b) => b.total - a.total);
    const totalGeneral = mechanics.reduce((s, m) => s + m.total, 0);

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 15;

    // ── Ink-friendly palette (grayscale only) ──
    // We avoid filled backgrounds, dark headers and color highlights
    // so the document prints with minimal toner/ink consumption.
    const INK = 30;        // primary text (near black)
    const SOFT = 110;      // secondary text
    const LINE = 170;      // thin separators

    // ── Header (text only, no fills) ──
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(INK, INK, INK);
    doc.text(t('pdf.header.company'), margin, 14);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(SOFT, SOFT, SOFT);
    doc.text(t('pdf.header.system'), margin, 20);

    const fechaEmision = new Date().toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric' });
    doc.text(`${t('pdf.header.issued')}: ${fechaEmision}`, pageW - margin, 20, { align: 'right' });

    // Single thin separator line
    doc.setDrawColor(LINE, LINE, LINE);
    doc.setLineWidth(0.2);
    doc.line(margin, 24, pageW - margin, 24);

    // ── Title block ──
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.setTextColor(INK, INK, INK);
    doc.text(titulo, margin, 32);

    doc.setFontSize(9);
    doc.setTextColor(SOFT, SOFT, SOFT);
    doc.text(subtitulo, margin, 38);

    let y = 46;

    // ── Summary line (no boxes, plain text) ──
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(SOFT, SOFT, SOFT);
    doc.text(t('pdf.summary.totalPayroll') + ':', margin, y);
    doc.setTextColor(INK, INK, INK);
    doc.text(formatMoney(totalGeneral), margin + 50, y);

    doc.setTextColor(SOFT, SOFT, SOFT);
    doc.text(t('pdf.summary.mechanics') + ':', pageW / 2, y);
    doc.setTextColor(INK, INK, INK);
    doc.text(String(mechanics.length), pageW / 2 + 30, y);

    doc.setTextColor(SOFT, SOFT, SOFT);
    doc.text(t('pdf.summary.records') + ':', pageW - margin - 35, y);
    doc.setTextColor(INK, INK, INK);
    doc.text(String(data.length), pageW - margin - 8, y);

    y += 4;
    doc.setDrawColor(LINE, LINE, LINE);
    doc.setLineWidth(0.2);
    doc.line(margin, y, pageW - margin, y);
    y += 6;

    // Shared minimal table styles (no fills, no alternate rows, thin grey rules)
    const baseTableStyles = {
      fontSize: 9,
      textColor: [INK, INK, INK] as [number, number, number],
      lineColor: [LINE, LINE, LINE] as [number, number, number],
      lineWidth: 0.15,
      cellPadding: { top: 2.2, right: 3, bottom: 2.2, left: 3 },
    };
    const baseHeadStyles = {
      fillColor: [255, 255, 255] as [number, number, number],
      textColor: [INK, INK, INK] as [number, number, number],
      fontStyle: 'normal' as const,
      fontSize: 9,
    };
    const baseFootStyles = {
      fillColor: [255, 255, 255] as [number, number, number],
      textColor: [INK, INK, INK] as [number, number, number],
      fontStyle: 'normal' as const,
      fontSize: 9,
    };

    if (tipo === 'semanal') {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(INK, INK, INK);
      doc.text(t('pdf.checksTable'), margin, y);
      y += 4;

      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        theme: 'plain',
        head: [[t('pdf.table.num'), t('pdf.table.mechanic'), t('pdf.table.jobs'), t('pdf.table.amount')]],
        body: mechanics.map((m, i) => [i + 1, m.name, m.rows.length, formatMoney(m.total)]),
        foot: [['', t('pdf.table.total'), mechanics.reduce((s, m) => s + m.rows.length, 0), formatMoney(totalGeneral)]],
        styles: baseTableStyles,
        headStyles: baseHeadStyles,
        footStyles: baseFootStyles,
        columnStyles: {
          0: { halign: 'center', cellWidth: 10 },
          2: { halign: 'center', cellWidth: 25 },
          3: { halign: 'right', cellWidth: 40 },
        },
        // single thin line under header / above footer for readability
        didDrawCell: (hookData) => {
          if (hookData.section === 'head') {
            const { x, y: cy, width, height } = hookData.cell;
            doc.setDrawColor(LINE, LINE, LINE);
            doc.setLineWidth(0.2);
            doc.line(x, cy + height, x + width, cy + height);
          }
        },
      });

      y = (doc as any).lastAutoTable.finalY + 10;

      for (const m of mechanics) {
        if (y > 230) { doc.addPage(); y = 20; }
        // mechanic block heading: text + thin underline (no filled bar)
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(INK, INK, INK);
        doc.text(m.name.toUpperCase(), margin, y + 4);
        doc.text(formatMoney(m.total), pageW - margin, y + 4, { align: 'right' });
        doc.setDrawColor(LINE, LINE, LINE);
        doc.setLineWidth(0.2);
        doc.line(margin, y + 6, pageW - margin, y + 6);
        y += 9;

        autoTable(doc, {
          startY: y,
          margin: { left: margin, right: margin },
          theme: 'plain',
          head: [[t('pdf.table.date'), t('pdf.table.truck'), t('pdf.table.company'), t('pdf.table.task'), t('pdf.table.amount')]],
          body: m.rows.map((e: any) => [
            new Date(e.work_date + 'T12:00:00').toLocaleDateString(locale),
            e.truck_number ?? '-',
            e.work_reports?.company ?? '-',
            e.description ?? '-',
            formatMoney(Number(e.amount)),
          ]),
          styles: { ...baseTableStyles, fontSize: 8 },
          headStyles: { ...baseHeadStyles, fontSize: 8 },
          columnStyles: { 4: { halign: 'right' } },
          didDrawCell: (hookData) => {
            if (hookData.section === 'head') {
              const { x, y: cy, width, height } = hookData.cell;
              doc.setDrawColor(LINE, LINE, LINE);
              doc.setLineWidth(0.2);
              doc.line(x, cy + height, x + width, cy + height);
            }
          },
        });

        y = (doc as any).lastAutoTable.finalY + 8;
      }
    } else {
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        theme: 'plain',
        head: [[t('pdf.table.num'), t('pdf.table.mechanic'), t('pdf.table.jobs'), t('pdf.table.totalEarned')]],
        body: mechanics.map((m, i) => [i + 1, m.name, m.rows.length, formatMoney(m.total)]),
        foot: [['', t('pdf.table.total'), mechanics.reduce((s, m) => s + m.rows.length, 0), formatMoney(totalGeneral)]],
        styles: { ...baseTableStyles, fontSize: 10 },
        headStyles: { ...baseHeadStyles, fontSize: 10 },
        footStyles: { ...baseFootStyles, fontSize: 10 },
        columnStyles: {
          0: { halign: 'center', cellWidth: 12 },
          2: { halign: 'center', cellWidth: 30 },
          3: { halign: 'right', cellWidth: 45 },
        },
        didDrawCell: (hookData) => {
          if (hookData.section === 'head') {
            const { x, y: cy, width, height } = hookData.cell;
            doc.setDrawColor(LINE, LINE, LINE);
            doc.setLineWidth(0.2);
            doc.line(x, cy + height, x + width, cy + height);
          }
        },
      });
    }

    // Footer pages — light gray, no fills
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(SOFT, SOFT, SOFT);
      doc.text(
        `${t('pdf.footer')} ${i} / ${totalPages}`,
        pageW / 2,
        doc.internal.pageSize.getHeight() - 8,
        { align: 'center' }
      );
    }

    const fileName = tipo === 'semanal'
      ? `nomina_semanal_${desde}_${hasta}.pdf`
      : tipo === 'mensual'
      ? `nomina_mensual_${mes}.pdf`
      : `nomina_anual_${anio}.pdf`;

    doc.save(fileName);

    // Audit log
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await (supabase as any)
          .from('profiles').select('full_name, email').eq('id', user.id).single();
        await (supabase as any).from('report_logs').insert({
          generated_by: user.id,
          generated_by_name: (profile as any)?.full_name || (profile as any)?.email || user.email,
          tipo,
          fecha_desde: fechaDesde,
          fecha_hasta: fechaHasta,
          pdf_language: pdfLang,
        });
      }
    } catch (_) {}

    setLoading(false);
  }

  const REPORT_TYPES = [
    { key: 'semanal' as TipoReporte, labelKey: 'reports.typeSemanal', descKey: 'reports.typeDescSemanal' },
    { key: 'mensual' as TipoReporte, labelKey: 'reports.typeMensual', descKey: 'reports.typeDescMensual' },
    { key: 'anual'   as TipoReporte, labelKey: 'reports.typeAnual',   descKey: 'reports.typeDescAnual'   },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="display-font text-3xl font-bold text-slate-100 tracking-wide">{tUI('reports.title')}</h1>
        <p className="text-slate-400 mt-1">{tUI('reports.subtitle')}</p>
      </div>

      <div className="max-w-2xl space-y-6">
        {/* Tipo */}
        <div className="bg-slate-900/60 border border-white/5 rounded-xl p-6">
          <h2 className="display-font text-slate-300 font-semibold mb-4 tracking-wide">{tUI('reports.reportType')}</h2>
          <div className="grid grid-cols-3 gap-3">
            {REPORT_TYPES.map((tp) => (
              <button key={tp.key} type="button" onClick={() => setTipo(tp.key)}
                className={`p-4 rounded-xl border text-left transition-all ${
                  tipo === tp.key
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                    : 'bg-slate-800/50 border-white/5 text-slate-400 hover:border-white/10'
                }`}>
                <p className="display-font font-bold text-sm tracking-wide mb-1">{tUI(tp.labelKey).toUpperCase()}</p>
                <p className="text-xs opacity-75">{tUI(tp.descKey)}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Periodo */}
        <div className="bg-slate-900/60 border border-white/5 rounded-xl p-6">
          <h2 className="display-font text-slate-300 font-semibold mb-4 tracking-wide">{tUI('reports.period')}</h2>
          {tipo === 'semanal' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-400 text-sm mb-1.5">{tUI('reports.weekStart')}</label>
                <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
                  className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 focus:outline-none focus:border-amber-400/50 transition" />
              </div>
              <div>
                <label className="block text-slate-400 text-sm mb-1.5">{tUI('reports.weekEnd')}</label>
                <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
                  className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 focus:outline-none focus:border-amber-400/50 transition" />
              </div>
            </div>
          )}
          {tipo === 'mensual' && (
            <div>
              <label className="block text-slate-400 text-sm mb-1.5">{tUI('reports.month')}</label>
              <input type="month" value={mes} onChange={e => setMes(e.target.value)}
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 focus:outline-none focus:border-amber-400/50 transition" />
            </div>
          )}
          {tipo === 'anual' && (
            <div>
              <label className="block text-slate-400 text-sm mb-1.5">{tUI('reports.year')}</label>
              <select value={anio} onChange={e => setAnio(e.target.value)}
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 focus:outline-none focus:border-amber-400/50 transition">
                {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          )}
        </div>

        <button
          onClick={() => setShowLangModal(true)}
          disabled={loading}
          className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/50 text-slate-950 font-bold py-4 rounded-xl transition display-font tracking-wide text-lg flex items-center justify-center gap-3"
        >
          {loading ? (
            <>
              <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {tUI('pdf.generating')}
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {tUI('pdf.download')} {tUI(`pdf.type.${tipo}`).toUpperCase()}
            </>
          )}
        </button>

        <p className="text-slate-600 text-xs text-center">{tUI('reports.downloadNote')}</p>
      </div>

      {/* ─── Language Modal ─── */}
      {showLangModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-8 w-full max-w-sm shadow-2xl">
            <h2 className="display-font text-slate-100 font-bold text-lg tracking-wide mb-1">
              {tUI('pdf.modalTitle')}
            </h2>
            <p className="text-slate-400 text-sm mb-6">{tUI('pdf.modalSubtitle')}</p>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => generarPDF('es')}
                className="flex flex-col items-center gap-2 p-5 rounded-xl border border-white/10 hover:border-amber-500/40 hover:bg-amber-500/10 transition group"
              >
                <span className="text-3xl">🇪🇸</span>
                <span className="display-font text-slate-200 group-hover:text-amber-400 font-bold tracking-wide transition">
                  {tUI('pdf.spanish')}
                </span>
              </button>
              <button
                onClick={() => generarPDF('en')}
                className="flex flex-col items-center gap-2 p-5 rounded-xl border border-white/10 hover:border-sky-500/40 hover:bg-sky-500/10 transition group"
              >
                <span className="text-3xl">🇺🇸</span>
                <span className="display-font text-slate-200 group-hover:text-sky-400 font-bold tracking-wide transition">
                  {tUI('pdf.english')}
                </span>
              </button>
            </div>

            <button
              onClick={() => setShowLangModal(false)}
              className="w-full mt-4 text-slate-500 hover:text-slate-300 text-sm py-2 transition"
            >
              {tUI('pdf.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
