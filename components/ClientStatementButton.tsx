'use client';

import { useState } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const T = {
  es: { title: 'ESTADO DE CUENTA', sub: 'Account Statement', billTo: 'CLIENTE', date: 'Fecha', doc: 'Documento', truck: 'Camión', total: 'Total', paid: 'Pagado', balance: 'Saldo', status: 'Estado', billed: 'Total facturado', tpaid: 'Total pagado', due: 'Saldo pendiente', printed: 'Impreso', none: 'Sin facturas', btn: 'Estado de cuenta' },
  en: { title: 'ACCOUNT STATEMENT', sub: 'Estado de Cuenta', billTo: 'CLIENT', date: 'Date', doc: 'Document', truck: 'Truck', total: 'Total', paid: 'Paid', balance: 'Balance', status: 'Status', billed: 'Total billed', tpaid: 'Total paid', due: 'Balance due', printed: 'Printed', none: 'No invoices', btn: 'Account statement' },
};
const STATUS_LABEL: Record<string, { es: string; en: string }> = {
  open: { es: 'Abierta', en: 'Open' }, partial: { es: 'Parcial', en: 'Partial' },
  paid: { es: 'Pagada', en: 'Paid' }, void: { es: 'Anulada', en: 'Void' }, draft: { es: 'Borrador', en: 'Draft' },
};

async function loadLogo(url: string, maxW: number, maxH: number) {
  try {
    const res = await fetch(url); if (!res.ok) return null;
    const blob = await res.blob();
    const fmt = blob.type.includes('jpeg') || blob.type.includes('jpg') ? 'JPEG' : 'PNG';
    const dataUrl: string = await new Promise((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(String(fr.result)); fr.onerror = reject; fr.readAsDataURL(blob); });
    const dims: { w: number; h: number } = await new Promise((resolve) => { const img = new Image(); img.onload = () => resolve({ w: img.naturalWidth || maxW, h: img.naturalHeight || maxH }); img.onerror = () => resolve({ w: maxW, h: maxH }); img.src = dataUrl; });
    const ratio = Math.min(maxW / dims.w, maxH / dims.h, 1);
    return { dataUrl, w: dims.w * ratio, h: dims.h * ratio, fmt };
  } catch { return null; }
}

interface HistInvoice { id: string; document_number: string | null; document_type: string; truck_id: string | null; issue_date: string; status: string; total: number; amount_paid: number; balance: number }
interface Summary { total_billed: number; total_paid: number; balance_due: number; count: number }
interface ClientInfo { name: string; billing_address_line?: string | null; city?: string | null; state?: string | null; zip?: string | null }

// Estado de cuenta del cliente: todas sus facturas + total facturado/pagado/saldo,
// en un PDF imprimible/enviable. Solo facturas reales (no borradores).
export function ClientStatementButton({ client, invoices, summary, truckLabel, lang }: {
  client: ClientInfo; invoices: HistInvoice[]; summary: Summary | null; truckLabel: (id: string | null) => string; lang: 'es' | 'en';
}) {
  const [busy, setBusy] = useState(false);
  const L = T[lang];

  async function generate() {
    setBusy(true);
    try {
      const PAGE_W = 612, M = 40;
      const INK = 30, SOFT = 110, LINE = 175;
      const doc = new jsPDF({ unit: 'pt', format: 'letter' });
      const now = new Date();
      const logo = await loadLogo('/logo.png', 110, 44);
      let y = M;
      if (logo) doc.addImage(logo.dataUrl, logo.fmt, M, y, logo.w, logo.h);
      const headX = logo ? M + logo.w + 14 : M;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(INK, INK, INK);
      doc.text('Advance Truck Repair', headX, y + 14);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(INK, INK, INK);
      doc.text(L.title, PAGE_W - M, y + 14, { align: 'right' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(SOFT, SOFT, SOFT);
      doc.text(L.sub, PAGE_W - M, y + 24, { align: 'right' });
      doc.text(`${L.printed}: ${now.toLocaleDateString('en-US')}`, PAGE_W - M, y + 34, { align: 'right' });

      y += 54;
      doc.setDrawColor(LINE, LINE, LINE); doc.setLineWidth(0.4); doc.line(M, y, PAGE_W - M, y); y += 16;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(SOFT, SOFT, SOFT);
      doc.text(L.billTo, M, y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(INK, INK, INK);
      doc.text(client.name || '—', M, y + 14);
      doc.setFontSize(8); doc.setTextColor(SOFT, SOFT, SOFT);
      const addr = [client.billing_address_line, [client.city, client.state, client.zip].filter(Boolean).join(', ')].filter(Boolean);
      let by = y + 26; for (const l of addr) { doc.text(String(l), M, by); by += 10; }
      y = by + 8;

      const rows = invoices.map(i => [
        i.issue_date || '—',
        (i.document_number || '—') + (i.document_type !== 'invoice' ? ` (${i.document_type})` : ''),
        truckLabel(i.truck_id),
        money.format(Number(i.total)),
        money.format(Number(i.amount_paid)),
        money.format(Number(i.balance)),
        (STATUS_LABEL[i.status]?.[lang]) || i.status,
      ]);
      autoTable(doc, {
        startY: y,
        head: [[L.date, L.doc, L.truck, L.total, L.paid, L.balance, L.status]],
        body: rows.length ? rows : [[L.none, '', '', '', '', '', '']],
        styles: { fontSize: 8.5, textColor: [INK, INK, INK], cellPadding: 4, lineColor: [LINE, LINE, LINE], lineWidth: 0.1 },
        headStyles: { fillColor: [240, 240, 240], textColor: [INK, INK, INK], fontStyle: 'bold' as const, fontSize: 8 },
        columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
      });
      y = ((doc as any).lastAutoTable?.finalY ?? y) + 16;

      if (summary) {
        const tX = PAGE_W - M - 200;
        const line = (label: string, val: number, bold = false) => {
          doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(bold ? 11 : 9);
          doc.setTextColor(bold ? INK : SOFT, bold ? INK : SOFT, bold ? INK : SOFT);
          doc.text(label, tX, y);
          doc.setTextColor(INK, INK, INK); doc.text(money.format(val), PAGE_W - M, y, { align: 'right' });
          y += bold ? 17 : 14;
        };
        line(L.billed, Number(summary.total_billed));
        line(L.tpaid, Number(summary.total_paid));
        doc.setDrawColor(LINE, LINE, LINE); doc.line(tX, y - 4, PAGE_W - M, y - 4); y += 4;
        line(L.due, Number(summary.balance_due), true);
      }

      doc.save(`estado_cuenta_${(client.name || 'cliente').replace(/[^a-z0-9]+/gi, '_')}.pdf`);
    } finally { setBusy(false); }
  }

  return (
    <button type="button" onClick={() => void generate()} disabled={busy}
      className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 border border-white/10 text-slate-200 text-sm px-4 py-2 rounded-lg transition flex items-center gap-2">
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
      {L.btn}
    </button>
  );
}
