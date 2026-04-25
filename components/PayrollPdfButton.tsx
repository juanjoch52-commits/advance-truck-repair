'use client';

import { useState } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

type JobRow = {
  date: string;
  unit: string;
  invoice: string;
  laborTotal: number;
  mechanicPay: number;
};

type DeductionRow = {
  label: string;
  amount: number;
};

type PayrollReportRow = {
  employeeName: string;
  jobs: JobRow[];
  deductions: DeductionRow[];
  gross: number;
  totalDeductions: number;
  net: number;
};

type PayrollPdfButtonProps = {
  periodStart: string;
  periodEnd: string;
  employeeFilterLabel: string;
  rows: PayrollReportRow[];
  totalNetPay: number;
  large?: boolean;
};

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function PayrollPdfButton({
  periodStart,
  periodEnd,
  employeeFilterLabel,
  rows,
  totalNetPay,
  large = false,
}: PayrollPdfButtonProps) {
  const [generating, setGenerating] = useState(false);

  async function handleGeneratePdf() {
    setGenerating(true);
    try {
      // ── Page constants ──────────────────────────────────────────────────────
      const PAGE_W  = 612;
      const PAGE_H  = 792;
      const M       = 30;
      const CONTENT_W = PAGE_W - M * 2;
      const FOOTER_Y  = PAGE_H - 18;
      const USABLE_H  = PAGE_H - M - 36;

      const doc  = new jsPDF({ unit: 'pt', format: 'letter' });

      const now   = new Date();
      const stamp = `${now.toLocaleDateString('en-US')} ${now.toLocaleTimeString('en-US')}`;
      const dateSlug = now.toISOString().slice(0, 10).replace(/-/g, '');

      // ── Ink-friendly palette (grayscale only) ──
      // No filled backgrounds, no dark headers, no color highlights.
      // Document prints with minimal toner / ink consumption.
      const INK  = 30;
      const SOFT = 110;
      const LINE = 170;

      // ── Helpers ─────────────────────────────────────────────────────────────
      function drawFooter() {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(SOFT, SOFT, SOFT);
        doc.text(`Impreso: ${stamp}`, M, FOOTER_Y);
        doc.text('Powered by JRC Smart Systems', PAGE_W - M - 120, FOOTER_Y);
        doc.setTextColor(0, 0, 0);
      }

      function estimateBlockHeight(row: PayrollReportRow): number {
        const ROW_H   = 16;
        const HEAD_H  = 14;
        const LABEL_H = 12;
        const jobRows = Math.max(row.jobs.length, 1);
        const dedRows = Math.max(row.deductions.length, 1);
        const BANNER  = 20;
        const GAP     = 8;
        const SUMMARY = 44;
        const SIG     = 18;
        return (
          BANNER + GAP +
          LABEL_H + HEAD_H + jobRows * ROW_H + GAP +
          LABEL_H + HEAD_H + dedRows * ROW_H + GAP +
          SUMMARY + SIG + 10
        );
      }

      // Shared minimal table styles (no fills, no alternate rows, thin grey rules)
      const tableStyles = {
        fontSize: 8,
        textColor: [INK, INK, INK] as [number, number, number],
        cellPadding: { top: 3, right: 5, bottom: 3, left: 5 },
        lineColor: [LINE, LINE, LINE] as [number, number, number],
        lineWidth: 0.15,
      };
      const headStyles = {
        fillColor: [255, 255, 255] as [number, number, number],
        textColor: [INK, INK, INK] as [number, number, number],
        fontStyle: 'normal' as const,
        fontSize: 8,
        cellPadding: { top: 3, right: 5, bottom: 3, left: 5 },
      };
      // Underline header row only — gives readability without filling cells
      function underlineHeader(hookData: any) {
        if (hookData.section === 'head') {
          const { x, y: cy, width, height } = hookData.cell;
          doc.setDrawColor(LINE, LINE, LINE);
          doc.setLineWidth(0.2);
          doc.line(x, cy + height, x + width, cy + height);
        }
      }

      let y = M;

      // ── Document header (text only, no fills) ───────────────────────────────
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(13);
      doc.setTextColor(INK, INK, INK);
      doc.text('Advance Truck Repair', M, y + 12);

      doc.setFontSize(9);
      doc.setTextColor(SOFT, SOFT, SOFT);
      doc.text(`Nómina Semanal  ·  Periodo: ${periodStart} al ${periodEnd}`, M, y + 26);
      doc.text(`Empleado(s): ${employeeFilterLabel}`, M, y + 38);

      // Total summary on the right (plain text, no filled box, no color)
      const SB_X = PAGE_W - M - 140;
      doc.setFontSize(8);
      doc.setTextColor(SOFT, SOFT, SOFT);
      doc.text('TOTAL A PAGAR', SB_X + 140, y + 12, { align: 'right' });
      doc.setFontSize(13);
      doc.setTextColor(INK, INK, INK);
      doc.text(money.format(totalNetPay), SB_X + 140, y + 30, { align: 'right' });

      y += 48;
      doc.setDrawColor(LINE, LINE, LINE);
      doc.setLineWidth(0.2);
      doc.line(M, y, PAGE_W - M, y);
      y += 8;
      drawFooter();

      // ── Per-mechanic blocks ──────────────────────────────────────────────────
      rows.forEach((row, index) => {
        const blockH = estimateBlockHeight(row);
        const gap    = index === 0 ? 0 : 10;

        if (y + gap + blockH > USABLE_H) {
          doc.addPage();
          drawFooter();
          y = M;
        } else {
          y += gap;
        }

        // ── Employee label (text + thin underline, no filled banner) ────────
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(INK, INK, INK);
        doc.text(row.employeeName.toUpperCase(), M, y + 12);
        doc.setDrawColor(LINE, LINE, LINE);
        doc.setLineWidth(0.2);
        doc.line(M, y + 16, PAGE_W - M, y + 16);
        y += 22;

        // ── Jobs table ───────────────────────────────────────────────────────
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(SOFT, SOFT, SOFT);
        doc.text('TRABAJOS REALIZADOS', M, y);
        y += 4;

        autoTable(doc, {
          startY: y,
          theme: 'plain',
          head: [['Fecha', 'Unidad / Camión', 'Invoice #', 'Labor', 'Mecánico']],
          body: row.jobs.length > 0
            ? row.jobs.map((job) => [
                job.date,
                job.unit,
                job.invoice || '—',
                money.format(job.laborTotal),
                money.format(job.mechanicPay),
              ])
            : [['—', '—', '—', '—', '—']],
          showHead: 'everyPage',
          styles: tableStyles,
          headStyles: headStyles,
          columnStyles: {
            0: { cellWidth: 58 },
            3: { halign: 'right', cellWidth: 62 },
            4: { halign: 'right', cellWidth: 68 },
          },
          didDrawCell: underlineHeader,
          didDrawPage: () => { drawFooter(); },
        });

        y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 24) + 6;

        // ── Deductions table ─────────────────────────────────────────────────
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(SOFT, SOFT, SOFT);
        doc.text('DEDUCCIONES', M, y);
        y += 4;

        autoTable(doc, {
          startY: y,
          theme: 'plain',
          head: [['Descripción', 'Monto']],
          body: row.deductions.length > 0
            ? row.deductions.map((d) => [d.label, money.format(d.amount)])
            : [['Sin deducciones este período', '—']],
          showHead: 'everyPage',
          styles: tableStyles,
          headStyles: headStyles,
          columnStyles: {
            1: { halign: 'right', cellWidth: 80 },
          },
          didDrawCell: underlineHeader,
          didDrawPage: () => { drawFooter(); },
        });

        y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 18) + 6;

        // ── Compact summary strip (text only, thin separators) ──────────────
        const STRIP_H = 26;
        const colW    = CONTENT_W / 3;

        // Top + bottom rules only
        doc.setDrawColor(LINE, LINE, LINE);
        doc.setLineWidth(0.2);
        doc.line(M, y, PAGE_W - M, y);
        doc.line(M, y + STRIP_H, PAGE_W - M, y + STRIP_H);

        const lY = y + 9;
        const vY = y + 21;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(SOFT, SOFT, SOFT);
        doc.text('BRUTO', M + colW * 0 + colW / 2, lY, { align: 'center' });
        doc.text('DEDUCCIONES', M + colW * 1 + colW / 2, lY, { align: 'center' });
        doc.text('NETO A PAGAR', M + colW * 2 + colW / 2, lY, { align: 'center' });

        doc.setFontSize(10);
        doc.setTextColor(INK, INK, INK);
        doc.text(money.format(row.gross), M + colW * 0 + colW / 2, vY, { align: 'center' });
        doc.text(money.format(row.totalDeductions), M + colW * 1 + colW / 2, vY, { align: 'center' });
        doc.text(money.format(row.net), M + colW * 2 + colW / 2, vY, { align: 'center' });

        y += STRIP_H + 8;

        // ── Compact signature line ───────────────────────────────────────────
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(SOFT, SOFT, SOFT);
        doc.text('Firma:', M, y + 7);
        doc.setDrawColor(LINE, LINE, LINE);
        doc.setLineWidth(0.3);
        doc.line(M + 30, y + 8, M + 200, y + 8);
        doc.setFontSize(7);
        doc.text(`Fecha: ${now.toLocaleDateString('en-US')}`, PAGE_W - M - 80, y + 7);
        doc.setTextColor(0, 0, 0);
        y += 14;
      });

      // ── Summary page (multi-mechanic only) ──────────────────────────────────
      if (rows.length > 1) {
        doc.addPage();
        drawFooter();
        let sy = M;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(12);
        doc.setTextColor(INK, INK, INK);
        doc.text('Resumen General de Nómina', M, sy + 14);
        doc.setFontSize(9);
        doc.setTextColor(SOFT, SOFT, SOFT);
        doc.text(`Periodo: ${periodStart} al ${periodEnd}`, M, sy + 28);
        sy += 38;

        doc.setDrawColor(LINE, LINE, LINE);
        doc.setLineWidth(0.2);
        doc.line(M, sy, PAGE_W - M, sy);
        sy += 8;

        autoTable(doc, {
          startY: sy,
          theme: 'plain',
          head: [['Mecánico', 'Bruto', 'Deducciones', 'Neto']],
          body: rows.map((r) => [
            r.employeeName,
            money.format(r.gross),
            money.format(r.totalDeductions),
            money.format(r.net),
          ]),
          foot: [['TOTAL GENERAL', '', '', money.format(totalNetPay)]],
          styles: {
            ...tableStyles,
            fontSize: 9,
            cellPadding: { top: 4, right: 6, bottom: 4, left: 6 },
          },
          headStyles: { ...headStyles, fontSize: 9 },
          footStyles: {
            fillColor: [255, 255, 255] as [number, number, number],
            textColor: [INK, INK, INK] as [number, number, number],
            fontStyle: 'normal' as const,
            fontSize: 9,
          },
          columnStyles: {
            1: { halign: 'right' },
            2: { halign: 'right' },
            3: { halign: 'right' },
          },
          didDrawCell: underlineHeader,
        });
      }

      // ── Direct download ──────────────────────────────────────────────────────
      doc.save(`Nomina_Advance_${dateSlug}.pdf`);
    } finally {
      setGenerating(false);
    }
  }

  const baseClass = large
    ? 'inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-6 py-3 text-sm font-bold uppercase tracking-[0.18em] text-white shadow-lg shadow-emerald-900/40 transition hover:bg-emerald-400 disabled:opacity-50 print:hidden'
    : 'rounded-xl border border-emerald-300/30 bg-emerald-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200 transition hover:bg-emerald-300 hover:text-slate-950 disabled:opacity-50 print:hidden';

  return (
    <button
      type="button"
      onClick={() => void handleGeneratePdf()}
      disabled={generating || rows.length === 0}
      className={baseClass}
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
      </svg>
      {generating ? 'Generando...' : 'Descargar PDF'}
    </button>
  );
}
