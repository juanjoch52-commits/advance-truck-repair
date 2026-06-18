'use client';

import { useState } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const PM_LABEL: Record<string, string> = {
  cash: 'Cash', check: 'Check', card: 'Card', deposit: 'Deposit / Transfer', credit: 'Credit (terms)',
};

// Carga una imagen (logo) y la devuelve como dataURL escalada a una caja máxima.
async function loadLogo(url: string, maxW: number, maxH: number): Promise<{ dataUrl: string; w: number; h: number; fmt: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const fmt = blob.type.includes('jpeg') || blob.type.includes('jpg') ? 'JPEG' : 'PNG';
    const dataUrl: string = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
    const dims: { w: number; h: number } = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth || maxW, h: img.naturalHeight || maxH });
      img.onerror = () => resolve({ w: maxW, h: maxH });
      img.src = dataUrl;
    });
    const ratio = Math.min(maxW / dims.w, maxH / dims.h, 1);
    return { dataUrl, w: dims.w * ratio, h: dims.h * ratio, fmt };
  } catch {
    return null;
  }
}

export function InvoicePdfButton({ invoiceId, className }: { invoiceId: string; className?: string }) {
  const [generating, setGenerating] = useState(false);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await fetch(`/api/facturas/${invoiceId}`);
      if (!res.ok) { alert('No se pudo cargar la factura.'); return; }
      const { invoice, items, client, shop } = await res.json();

      // ── Página / paleta ahorradora de tinta (solo grises) ──
      const PAGE_W = 612, PAGE_H = 792, M = 40;
      const FOOTER_Y = PAGE_H - 22;
      const INK = 30, SOFT = 110, LINE = 175;
      const doc = new jsPDF({ unit: 'pt', format: 'letter' });
      const now = new Date();
      const stamp = `${now.toLocaleDateString('en-US')} ${now.toLocaleTimeString('en-US')}`;

      const shopName = shop?.legal_name || shop?.name || 'Advance Truck Repair';
      const addr = (o: any) => [o?.billing_address_line, [o?.city, o?.state, o?.zip].filter(Boolean).join(', ')].filter(Boolean);

      // ── Logo (logo del taller o el del proyecto) ──
      const logo = await loadLogo(shop?.logo_url || '/logo.png', 120, 48);
      let y = M;
      if (logo) {
        doc.addImage(logo.dataUrl, logo.fmt, M, y, logo.w, logo.h);
      }

      // ── Encabezado: datos del taller (izquierda) ──
      const headX = logo ? M + logo.w + 14 : M;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(INK, INK, INK);
      doc.text(shopName, headX, y + 12);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(SOFT, SOFT, SOFT);
      let hy = y + 24;
      for (const l of addr(shop)) { doc.text(l, headX, hy); hy += 10; }
      if (shop?.phone) { doc.text(`Tel: ${shop.phone}`, headX, hy); hy += 10; }
      if (shop?.ein) { doc.text(`EIN: ${shop.ein}`, headX, hy); hy += 10; }
      if (shop?.sales_tax_certificate) { doc.text(`Sales Tax #: ${shop.sales_tax_certificate}`, headX, hy); hy += 10; }

      // ── Título INVOICE + meta (derecha) ──
      doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(INK, INK, INK);
      doc.text('INVOICE', PAGE_W - M, y + 14, { align: 'right' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(SOFT, SOFT, SOFT);
      const metaY = y + 30;
      const metaRows = [
        ['Invoice #', invoice.document_number || '—'],
        ['Date', invoice.issue_date || '—'],
        ...(invoice.due_date ? [['Due', invoice.due_date]] : []),
        ['Payment', PM_LABEL[invoice.payment_method] || invoice.payment_method],
      ];
      metaRows.forEach((r, i) => {
        doc.setTextColor(SOFT, SOFT, SOFT);
        doc.text(r[0], PAGE_W - M - 120, metaY + i * 11);
        doc.setTextColor(INK, INK, INK);
        doc.text(String(r[1]), PAGE_W - M, metaY + i * 11, { align: 'right' });
      });

      y = Math.max(hy, metaY + metaRows.length * 11) + 8;
      doc.setDrawColor(LINE, LINE, LINE); doc.setLineWidth(0.4);
      doc.line(M, y, PAGE_W - M, y);
      y += 14;

      // ── Bill To ──
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(SOFT, SOFT, SOFT);
      doc.text('BILL TO', M, y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(INK, INK, INK);
      doc.text(client?.name || 'Cliente', M, y + 13);
      doc.setFontSize(8); doc.setTextColor(SOFT, SOFT, SOFT);
      let by = y + 24;
      for (const l of addr(client)) { doc.text(l, M, by); by += 10; }
      y = by + 8;

      // ── Renglones ──
      const rows = (items && items.length)
        ? items.map((it: any) => [
            it.description || (it.line_type === 'labor' ? 'Labor' : it.line_type === 'fee' ? 'Fee' : 'Part'),
            String(Number(it.qty)),
            money.format(Number(it.unit_price)),
            money.format(Number(it.amount)),
          ])
        : [[invoice.description || 'Service', '1', money.format(Number(invoice.subtotal)), money.format(Number(invoice.subtotal))]];

      autoTable(doc, {
        startY: y,
        theme: 'plain',
        head: [['Description', 'Qty', 'Unit Price', 'Amount']],
        body: rows,
        styles: { fontSize: 9, textColor: [INK, INK, INK], cellPadding: { top: 4, right: 6, bottom: 4, left: 6 }, lineColor: [LINE, LINE, LINE], lineWidth: 0.1 },
        headStyles: { fillColor: [255, 255, 255], textColor: [INK, INK, INK], fontStyle: 'bold', fontSize: 8 },
        columnStyles: { 1: { halign: 'right', cellWidth: 50 }, 2: { halign: 'right', cellWidth: 80 }, 3: { halign: 'right', cellWidth: 80 } },
        didDrawCell: (h: any) => {
          if (h.section === 'head') {
            doc.setDrawColor(LINE, LINE, LINE); doc.setLineWidth(0.3);
            doc.line(h.cell.x, h.cell.y + h.cell.height, h.cell.x + h.cell.width, h.cell.y + h.cell.height);
          }
        },
      });
      y = ((doc as any).lastAutoTable?.finalY ?? y) + 10;

      // ── Totales (derecha) ──
      const tX = PAGE_W - M - 200;
      const tot = (label: string, val: number, bold = false) => {
        doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(bold ? 10 : 8.5);
        doc.setTextColor(bold ? INK : SOFT, bold ? INK : SOFT, bold ? INK : SOFT);
        doc.text(label, tX, y);
        doc.setTextColor(INK, INK, INK);
        doc.text(money.format(val), PAGE_W - M, y, { align: 'right' });
        y += bold ? 16 : 13;
      };
      tot('Subtotal', Number(invoice.subtotal));
      if (Number(invoice.tax_amount)) tot('Sales Tax', Number(invoice.tax_amount));
      if (Number(invoice.discount)) tot('Discount', -Number(invoice.discount));
      doc.setDrawColor(LINE, LINE, LINE); doc.setLineWidth(0.3); doc.line(tX, y - 4, PAGE_W - M, y - 4); y += 4;
      tot('TOTAL', Number(invoice.total), true);
      if (Number(invoice.amount_paid)) tot('Paid', Number(invoice.amount_paid));
      if (Number(invoice.balance) > 0.001) tot('Balance Due', Number(invoice.balance), true);

      // ── Nota de estado / pie ──
      if (invoice.status === 'paid') {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(SOFT, SOFT, SOFT);
        doc.text('PAID', M, ((doc as any).lastAutoTable?.finalY ?? M) + 30);
      }
      if (invoice.notes) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(SOFT, SOFT, SOFT);
        doc.text(`Notes: ${invoice.notes}`, M, PAGE_H - 60, { maxWidth: PAGE_W - M * 2 });
      }
      doc.setDrawColor(LINE, LINE, LINE); doc.setLineWidth(0.2);
      doc.line(M, FOOTER_Y - 10, PAGE_W - M, FOOTER_Y - 10);
      doc.setFontSize(7); doc.setTextColor(SOFT, SOFT, SOFT);
      doc.text(`Printed: ${stamp}`, M, FOOTER_Y);
      doc.text('Thank you for your business', PAGE_W - M, FOOTER_Y, { align: 'right' });

      doc.save(`Invoice_${invoice.document_number || invoiceId}.pdf`);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <button type="button" onClick={() => void handleGenerate()} disabled={generating}
      title="PDF" className={className ?? 'p-1.5 rounded text-slate-500 hover:text-sky-400 hover:bg-sky-500/10 transition disabled:opacity-50'}>
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
      </svg>
    </button>
  );
}
