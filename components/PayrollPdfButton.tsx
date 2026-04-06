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

async function loadLogoAsDataUrl() {
  try {
    const response = await fetch('/logo.png');
    if (!response.ok) {
      return null;
    }

    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

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
      const M       = 30;           // tighter margin
      const CONTENT_W = PAGE_W - M * 2;
      const FOOTER_Y  = PAGE_H - 18;
      const USABLE_H  = PAGE_H - M - 36; // usable bottom before footer

      const doc  = new jsPDF({ unit: 'pt', format: 'letter' });
      const logo = await loadLogoAsDataUrl();

      const now   = new Date();
      const stamp = `${now.toLocaleDateString('en-US')} ${now.toLocaleTimeString('en-US')}`;
      const dateSlug = now.toISOString().slice(0, 10).replace(/-/g, '');

      // ── Helpers ─────────────────────────────────────────────────────────────
      function drawFooter() {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(170, 170, 170);
        doc.text(`Impreso: ${stamp}`, M, FOOTER_Y);
        doc.text('Powered by JRC Smart Systems', PAGE_W - M - 120, FOOTER_Y);
        doc.setTextColor(0, 0, 0);
      }

      // Estimate the height a mechanic block will take (conservative, in pt)
      function estimateBlockHeight(row: PayrollReportRow): number {
        const ROW_H   = 16;   // approx row height at compact padding
        const HEAD_H  = 14;   // table header row
        const LABEL_H = 12;   // section label
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

      let y = M;

      // ── Document header (page 1, compact) ───────────────────────────────────
      const LOGO_SIZE = 44;
      if (logo) {
        doc.addImage(logo, 'PNG', M, y, LOGO_SIZE, LOGO_SIZE);
      }
      const hx = logo ? M + LOGO_SIZE + 8 : M;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(18, 20, 28);
      doc.text('Advance Truck Repair', hx, y + 13);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(70, 70, 70);
      doc.text(`Nómina Semanal  ·  Periodo: ${periodStart} al ${periodEnd}`, hx, y + 26);
      doc.text(`Empleado(s): ${employeeFilterLabel}`, hx, y + 38);

      // Right-side summary box on same row
      const SB_X = PAGE_W - M - 140;
      doc.setFillColor(240, 242, 245);
      doc.rect(SB_X, y, 140, 44, 'F');
      doc.setFontSize(7);
      doc.setTextColor(100, 100, 100);
      doc.text('TOTAL A PAGAR', SB_X + 70, y + 11, { align: 'center' });
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(20, 130, 70);
      doc.text(money.format(totalNetPay), SB_X + 70, y + 32, { align: 'center' });

      y += Math.max(LOGO_SIZE, 44) + 4;
      doc.setDrawColor(180, 180, 190);
      doc.setLineWidth(0.5);
      doc.line(M, y, PAGE_W - M, y);
      y += 8;
      drawFooter();

      // ── Per-mechanic blocks ──────────────────────────────────────────────────
      rows.forEach((row, index) => {
        const blockH = estimateBlockHeight(row);
        const gap    = index === 0 ? 0 : 10;

        // Anti-orphan: if full block won't fit, start new page
        if (y + gap + blockH > USABLE_H) {
          doc.addPage();
          drawFooter();
          y = M;
        } else {
          y += gap;
        }

        // ── Employee label box ──────────────────────────────────────────────
        doc.setFillColor(232, 234, 238);
        doc.setDrawColor(190, 193, 200);
        doc.setLineWidth(0.4);
        doc.rect(M, y, CONTENT_W, 20, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(30, 35, 50);
        doc.text(row.employeeName.toUpperCase(), M + 6, y + 13);
        doc.setTextColor(0, 0, 0);
        y += 22;

        // ── Jobs table ───────────────────────────────────────────────────────
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(80, 80, 80);
        doc.text('TRABAJOS REALIZADOS', M, y);
        y += 3;

        autoTable(doc, {
          startY: y,
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
          styles: {
            fontSize: 8,
            cellPadding: { top: 3, right: 5, bottom: 3, left: 5 },
            lineColor: [220, 220, 220],
            lineWidth: 0.25,
          },
          headStyles: {
            fillColor: [40, 44, 58],
            textColor: [248, 191, 53],
            fontStyle: 'bold',
            fontSize: 7.5,
            cellPadding: { top: 3, right: 5, bottom: 3, left: 5 },
          },
          alternateRowStyles: { fillColor: [247, 248, 250] },
          columnStyles: {
            0: { cellWidth: 58 },
            3: { halign: 'right', cellWidth: 62 },
            4: { halign: 'right', fontStyle: 'bold', cellWidth: 68 },
          },
          didDrawPage: () => { drawFooter(); },
        });

        y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 24) + 6;

        // ── Deductions table ─────────────────────────────────────────────────
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(80, 80, 80);
        doc.text('DEDUCCIONES', M, y);
        y += 3;

        autoTable(doc, {
          startY: y,
          head: [['Descripción', 'Monto']],
          body: row.deductions.length > 0
            ? row.deductions.map((d) => [d.label, money.format(d.amount)])
            : [['Sin deducciones este período', '—']],
          showHead: 'everyPage',
          styles: {
            fontSize: 8,
            cellPadding: { top: 3, right: 5, bottom: 3, left: 5 },
            lineColor: [220, 220, 220],
            lineWidth: 0.25,
          },
          headStyles: {
            fillColor: [55, 58, 70],
            textColor: [230, 230, 230],
            fontStyle: 'bold',
            fontSize: 7.5,
            cellPadding: { top: 3, right: 5, bottom: 3, left: 5 },
          },
          alternateRowStyles: { fillColor: [247, 248, 250] },
          columnStyles: {
            1: { halign: 'right', cellWidth: 80 },
          },
          didDrawPage: () => { drawFooter(); },
        });

        y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 18) + 6;

        // ── Compact summary strip ────────────────────────────────────────────
        const STRIP_H = 22;
        const colW    = CONTENT_W / 3;

        doc.setFillColor(244, 246, 250);
        doc.setDrawColor(200, 205, 215);
        doc.setLineWidth(0.4);
        doc.rect(M, y, CONTENT_W, STRIP_H, 'FD');

        // Dividers
        doc.line(M + colW,     y, M + colW,     y + STRIP_H);
        doc.line(M + colW * 2, y, M + colW * 2, y + STRIP_H);

        const lY = y + 8;
        const vY = y + 17;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(110, 110, 110);
        doc.text('BRUTO', M + colW * 0 + colW / 2, lY, { align: 'center' });
        doc.text('DEDUCCIONES', M + colW * 1 + colW / 2, lY, { align: 'center' });
        doc.text('NETO A PAGAR', M + colW * 2 + colW / 2, lY, { align: 'center' });

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(30, 30, 30);
        doc.text(money.format(row.gross), M + colW * 0 + colW / 2, vY, { align: 'center' });

        doc.setTextColor(170, 35, 35);
        doc.text(money.format(row.totalDeductions), M + colW * 1 + colW / 2, vY, { align: 'center' });

        doc.setFontSize(10);
        doc.setTextColor(15, 120, 60);
        doc.text(money.format(row.net), M + colW * 2 + colW / 2, vY, { align: 'center' });

        doc.setTextColor(0, 0, 0);
        y += STRIP_H + 6;

        // ── Compact signature line ───────────────────────────────────────────
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(90, 90, 90);
        doc.text('Firma:', M, y + 7);
        doc.setDrawColor(120, 120, 120);
        doc.setLineWidth(0.5);
        doc.line(M + 30, y + 8, M + 200, y + 8);
        doc.setFontSize(7);
        doc.setTextColor(160, 160, 160);
        doc.text(`Fecha: ${now.toLocaleDateString('en-US')}`, PAGE_W - M - 80, y + 7);
        doc.setTextColor(0, 0, 0);
        y += 14;
      });

      // ── Summary page (multi-mechanic only) ──────────────────────────────────
      if (rows.length > 1) {
        doc.addPage();
        drawFooter();
        let sy = M;

        if (logo) doc.addImage(logo, 'PNG', M, sy, 36, 36);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(18, 20, 28);
        doc.text('Resumen General de Nómina', logo ? M + 44 : M, sy + 14);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(80, 80, 80);
        doc.text(`Periodo: ${periodStart} al ${periodEnd}`, logo ? M + 44 : M, sy + 27);
        sy += 44;

        doc.setDrawColor(190, 190, 200);
        doc.setLineWidth(0.4);
        doc.line(M, sy, PAGE_W - M, sy);
        sy += 8;

        autoTable(doc, {
          startY: sy,
          head: [['Mecánico', 'Bruto', 'Deducciones', 'Neto']],
          body: rows.map((r) => [
            r.employeeName,
            money.format(r.gross),
            money.format(r.totalDeductions),
            money.format(r.net),
          ]),
          foot: [['TOTAL GENERAL', '', '', money.format(totalNetPay)]],
          styles: {
            fontSize: 8.5,
            cellPadding: { top: 4, right: 6, bottom: 4, left: 6 },
            lineColor: [220, 220, 220],
            lineWidth: 0.25,
          },
          headStyles: {
            fillColor: [30, 34, 48],
            textColor: [248, 191, 53],
            fontStyle: 'bold',
            fontSize: 8,
          },
          footStyles: {
            fillColor: [15, 120, 60],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 9,
          },
          alternateRowStyles: { fillColor: [247, 248, 250] },
          columnStyles: {
            1: { halign: 'right' },
            2: { halign: 'right' },
            3: { halign: 'right', fontStyle: 'bold' },
          },
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
