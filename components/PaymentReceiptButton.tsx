'use client';

import { useState } from 'react';
import { jsPDF } from 'jspdf';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const PM_LABEL: Record<string, string> = {
  cash: 'Cash', check: 'Check', card: 'Card', deposit: 'Deposit / Transfer', credit: 'Credit (terms)',
};
const TYPE_LABEL: Record<string, string> = {
  deposit: 'Deposit', advance: 'Advance', settlement: 'Settlement', payment: 'Payment',
};

// Carga un logo y lo devuelve como dataURL escalado a una caja máxima.
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

// Comprobante de pago (recibo) imprimible/descargable para un pago de factura.
// Carga la factura (que ya trae cliente, taller y la lista de pagos) y arma el
// recibo del pago indicado por paymentId. Muestra solo el monto pagado (no el saldo).
export function PaymentReceiptButton({ invoiceId, paymentId, className, mode = 'download', label }: {
  invoiceId: string; paymentId: string; className?: string; mode?: 'download' | 'print'; label?: string;
}) {
  const [generating, setGenerating] = useState(false);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await fetch(`/api/facturas/${invoiceId}`);
      if (!res.ok) { alert('No se pudo cargar el comprobante.'); return; }
      const { invoice, client, shop, payments } = await res.json();
      const payment = (payments ?? []).find((p: any) => p.id === paymentId);
      if (!payment) { alert('Pago no encontrado.'); return; }

      const PAGE_W = 612, PAGE_H = 792, M = 40;
      const FOOTER_Y = PAGE_H - 22;
      const INK = 30, SOFT = 110, LINE = 175;
      const doc = new jsPDF({ unit: 'pt', format: 'letter' });
      const now = new Date();
      const stamp = `${now.toLocaleDateString('en-US')} ${now.toLocaleTimeString('en-US')}`;

      const shopName = shop?.legal_name || shop?.name || 'Advance Truck Repair';
      const addr = (o: any) => [o?.billing_address_line, [o?.city, o?.state, o?.zip].filter(Boolean).join(', ')].filter(Boolean);

      // Encabezado: logo + datos del taller.
      const logo = await loadLogo(shop?.logo_url || '/logo.png', 120, 48);
      let y = M;
      if (logo) doc.addImage(logo.dataUrl, logo.fmt, M, y, logo.w, logo.h);
      const headX = logo ? M + logo.w + 14 : M;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(INK, INK, INK);
      doc.text(shopName, headX, y + 12);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(SOFT, SOFT, SOFT);
      let hy = y + 24;
      for (const l of addr(shop)) { doc.text(l, headX, hy); hy += 10; }
      if (shop?.phone) { doc.text(`Tel: ${shop.phone}`, headX, hy); hy += 10; }
      if (shop?.ein) { doc.text(`EIN: ${shop.ein}`, headX, hy); hy += 10; }

      // Título + meta (derecha).
      doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(INK, INK, INK);
      doc.text('PAYMENT RECEIPT', PAGE_W - M, y + 14, { align: 'right' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(SOFT, SOFT, SOFT);
      doc.text('COMPROBANTE DE PAGO', PAGE_W - M, y + 24, { align: 'right' });
      const metaY = y + 36;
      const metaRows = [
        ['Receipt #', payment.receipt_number || '—'],
        ['Date', payment.paid_at || '—'],
        ['Invoice #', invoice.document_number || '—'],
      ];
      metaRows.forEach((r, i) => {
        doc.setTextColor(SOFT, SOFT, SOFT);
        doc.text(r[0], PAGE_W - M - 130, metaY + i * 11);
        doc.setTextColor(INK, INK, INK);
        doc.text(String(r[1]), PAGE_W - M, metaY + i * 11, { align: 'right' });
      });

      y = Math.max(hy, metaY + metaRows.length * 11) + 8;
      doc.setDrawColor(LINE, LINE, LINE); doc.setLineWidth(0.4);
      doc.line(M, y, PAGE_W - M, y);
      y += 16;

      // Recibido de (cliente).
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(SOFT, SOFT, SOFT);
      doc.text('RECEIVED FROM', M, y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(INK, INK, INK);
      doc.text(client?.name || 'Cliente', M, y + 14);
      y += 36;

      // Monto pagado (destacado).
      doc.setDrawColor(LINE, LINE, LINE); doc.setLineWidth(0.5);
      doc.rect(M, y, PAGE_W - M * 2, 44);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(SOFT, SOFT, SOFT);
      doc.text('AMOUNT PAID', M + 12, y + 18);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(INK, INK, INK);
      doc.text(money.format(Number(payment.amount)), PAGE_W - M - 12, y + 30, { align: 'right' });
      y += 64;

      // Detalle del pago.
      const row = (label: string, val: string) => {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
        doc.setTextColor(SOFT, SOFT, SOFT); doc.text(label, M, y);
        doc.setTextColor(INK, INK, INK); doc.text(val, M + 140, y);
        y += 16;
      };
      row('Payment type', TYPE_LABEL[payment.payment_type] || payment.payment_type || '—');
      row('Method', PM_LABEL[payment.method] || payment.method || '—');
      if (payment.reference) row('Reference', String(payment.reference));
      row('Recorded by', payment.created_by_name || '—');
      if (payment.notes) row('Notes', String(payment.notes));

      // Pie.
      doc.setDrawColor(LINE, LINE, LINE); doc.setLineWidth(0.2);
      doc.line(M, FOOTER_Y - 10, PAGE_W - M, FOOTER_Y - 10);
      doc.setFontSize(7); doc.setTextColor(SOFT, SOFT, SOFT);
      doc.text(`Printed: ${stamp}`, M, FOOTER_Y);
      doc.text('Thank you for your payment', PAGE_W - M, FOOTER_Y, { align: 'right' });

      const fileName = `RECEIPT_${payment.receipt_number || paymentId}.pdf`;
      if (mode === 'print') {
        doc.autoPrint();
        const url = doc.output('bloburl');
        const w = window.open(url, '_blank');
        if (!w) doc.save(fileName);
      } else {
        doc.save(fileName);
      }
    } finally {
      setGenerating(false);
    }
  }

  if (label) {
    return (
      <button type="button" onClick={() => void handleGenerate()} disabled={generating}
        className={className ?? 'inline-flex items-center gap-1.5 text-xs font-medium text-sky-400 hover:text-sky-300 border border-sky-500/30 rounded px-2.5 py-1.5 transition disabled:opacity-50'}>
        {mode === 'print' ? (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" /></svg>
        )}
        {label}
      </button>
    );
  }

  return (
    <button type="button" onClick={() => void handleGenerate()} disabled={generating}
      title={mode === 'print' ? 'Imprimir comprobante' : 'Comprobante PDF'}
      className={className ?? 'p-1.5 rounded text-slate-500 hover:text-sky-400 hover:bg-sky-500/10 transition disabled:opacity-50'}>
      {mode === 'print' ? (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
      ) : (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" /></svg>
      )}
    </button>
  );
}
