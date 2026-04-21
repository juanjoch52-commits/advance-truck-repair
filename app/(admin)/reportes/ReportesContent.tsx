'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';
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
  const supabase = createClient();

  const now = new Date();
  const { start: defaultWeekStart, end: defaultWeekEnd } = getWeekRange();

  const [tipo, setTipo] = useState<TipoReporte>((searchParams.get('tipo') as TipoReporte) ?? 'semanal');
  const [desde, setDesde] = useState(searchParams.get('desde') ?? defaultWeekStart);
  const [hasta, setHasta] = useState(searchParams.get('hasta') ?? defaultWeekEnd);
  const [mes, setMes] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [anio, setAnio] = useState(String(now.getFullYear()));
  const [loading, setLoading] = useState(false);

  const formatMoney = (n: number) =>
    '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const formatDate = (d: string) =>
    new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });

  async function generarPDF() {
    setLoading(true);

    let fechaDesde = desde;
    let fechaHasta = hasta;
    let titulo = '';
    let subtitulo = '';

    if (tipo === 'mensual') {
      const [y, m] = mes.split('-').map(Number);
      fechaDesde = new Date(y, m - 1, 1).toISOString().split('T')[0];
      fechaHasta = new Date(y, m, 0).toISOString().split('T')[0];
      const mesNombre = new Date(y, m - 1, 15).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
      titulo = 'REPORTE MENSUAL DE NOMINA';
      subtitulo = `Periodo: ${mesNombre.toUpperCase()}`;
    } else if (tipo === 'anual') {
      fechaDesde = `${anio}-01-01`;
      fechaHasta = `${anio}-12-31`;
      titulo = 'REPORTE ANUAL DE NOMINA';
      subtitulo = `Anio: ${anio}`;
    } else {
      titulo = 'REPORTE SEMANAL DE NOMINA';
      subtitulo = `Semana: ${formatDate(desde)} - ${formatDate(hasta)}`;
    }

    const { data: entries } = await supabase
      .from('earned_entries')
      .select(`
        id, amount, work_date, truck_number, mechanic_role,
        employees!earned_entries_employee_id_fkey(full_name),
        work_orders!earned_entries_work_order_id_fkey(company, invoice_number)
      `)
      .gte('work_date', fechaDesde)
      .lte('work_date', fechaHasta)
      .order('work_date', { ascending: true });

    const data = entries ?? [];

    if (data.length === 0) {
      alert('No hay datos para el periodo seleccionado.');
      setLoading(false);
      return;
    }

    const byEmployee: Record<string, { name: string; total: number; rows: any[] }> = {};
    for (const e of data) {
      const name = (e.employees as any)?.full_name ?? 'Sin nombre';
      if (!byEmployee[name]) byEmployee[name] = { name, total: 0, rows: [] };
      byEmployee[name].total += Number(e.amount);
      byEmployee[name].rows.push(e);
    }
    const mechanics = Object.values(byEmployee).sort((a, b) => b.total - a.total);
    const totalGeneral = mechanics.reduce((s, m) => s + m.total, 0);

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 15;

    // Encabezado oscuro
    doc.setFillColor(15, 23, 36);
    doc.rect(0, 0, pageW, 40, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(251, 191, 36);
    doc.text('ADVANCE TRUCK REPAIR', margin, 16);
    doc.setFontSize(10);
    doc.setTextColor(148, 163, 184);
    doc.text('Sistema Administrativo de Nomina', margin, 23);
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    const fechaEmision = new Date().toLocaleDateString('es-MX', {
      day: '2-digit', month: 'long', year: 'numeric',
    });
    doc.text(`Emitido: ${fechaEmision}`, pageW - margin, 23, { align: 'right' });

    // Linea dorada
    doc.setFillColor(245, 158, 11);
    doc.rect(0, 40, pageW, 1, 'F');

    // Titulo
    doc.setFillColor(248, 250, 252);
    doc.rect(0, 41, pageW, 22, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59);
    doc.text(titulo, margin, 52);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(subtitulo, margin, 59);

    let y = 72;

    // Resumen
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(margin, y, pageW - margin * 2, 20, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text('TOTAL NOMINA', margin + 5, y + 7);
    doc.setFontSize(14);
    doc.setTextColor(5, 150, 105);
    doc.text(formatMoney(totalGeneral), margin + 5, y + 15);
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text('MECANICOS', pageW / 2 - 10, y + 7);
    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59);
    doc.text(String(mechanics.length), pageW / 2 - 10, y + 15);
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text('REGISTROS', pageW - margin - 50, y + 7);
    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59);
    doc.text(String(data.length), pageW - margin - 50, y + 15);
    y += 28;

    if (tipo === 'semanal') {
      // Tabla de cheques
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(30, 41, 59);
      doc.text('TABLA DE CHEQUES', margin, y);
      y += 6;

      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [['#', 'Mecanico', 'Trabajos', 'Monto a Pagar']],
        body: mechanics.map((m, i) => [i + 1, m.name, m.rows.length, formatMoney(m.total)]),
        foot: [['', 'TOTAL GENERAL', mechanics.reduce((s, m) => s + m.rows.length, 0), formatMoney(totalGeneral)]],
        headStyles: { fillColor: [15, 23, 36], textColor: [251, 191, 36], fontStyle: 'bold', fontSize: 9 },
        footStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fontSize: 9, textColor: [51, 65, 85] },
        columnStyles: {
          0: { halign: 'center', cellWidth: 10 },
          2: { halign: 'center', cellWidth: 25 },
          3: { halign: 'right', cellWidth: 40, textColor: [5, 150, 105], fontStyle: 'bold' },
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });

      y = (doc as any).lastAutoTable.finalY + 10;

      // Detalle por mecanico
      for (const m of mechanics) {
        if (y > 230) { doc.addPage(); y = 20; }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(30, 41, 59);
        doc.setFillColor(241, 245, 249);
        doc.rect(margin, y, pageW - margin * 2, 8, 'F');
        doc.text(m.name.toUpperCase(), margin + 3, y + 5.5);
        doc.setTextColor(5, 150, 105);
        doc.text(formatMoney(m.total), pageW - margin - 3, y + 5.5, { align: 'right' });
        y += 10;

        autoTable(doc, {
          startY: y,
          margin: { left: margin, right: margin },
          head: [['Fecha', 'Camion', 'Empresa', 'Rol', 'Monto']],
          body: m.rows.map((e: any) => [
            new Date(e.work_date + 'T12:00:00').toLocaleDateString('es-MX'),
            e.truck_number ?? '-',
            e.work_orders?.company ?? '-',
            e.mechanic_role === 'principal' ? 'Principal' : 'Ayudante',
            formatMoney(Number(e.amount)),
          ]),
          headStyles: { fillColor: [51, 65, 85], textColor: [203, 213, 225], fontStyle: 'bold', fontSize: 8 },
          bodyStyles: { fontSize: 8, textColor: [71, 85, 105] },
          columnStyles: { 4: { halign: 'right', textColor: [5, 150, 105] } },
          alternateRowStyles: { fillColor: [248, 250, 252] },
        });

        y = (doc as any).lastAutoTable.finalY + 8;
      }
    } else {
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [['#', 'Mecanico', 'Trabajos', 'Total Devengado']],
        body: mechanics.map((m, i) => [i + 1, m.name, m.rows.length, formatMoney(m.total)]),
        foot: [['', 'TOTAL GENERAL', mechanics.reduce((s, m) => s + m.rows.length, 0), formatMoney(totalGeneral)]],
        headStyles: { fillColor: [15, 23, 36], textColor: [251, 191, 36], fontStyle: 'bold', fontSize: 10 },
        footStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: 'bold', fontSize: 10 },
        bodyStyles: { fontSize: 10, textColor: [51, 65, 85] },
        columnStyles: {
          0: { halign: 'center', cellWidth: 12 },
          2: { halign: 'center', cellWidth: 30 },
          3: { halign: 'right', cellWidth: 45, textColor: [5, 150, 105], fontStyle: 'bold' },
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });
    }

    // Pie de pagina
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Advance Truck Repair | Sistema de Nomina | Pagina ${i} de ${totalPages}`,
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
    setLoading(false);
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="display-font text-3xl font-bold text-slate-100 tracking-wide">REPORTES PDF</h1>
        <p className="text-slate-400 mt-1">Generar reportes imprimibles de nomina</p>
      </div>

      <div className="max-w-2xl space-y-6">
        <div className="bg-slate-900/60 border border-white/5 rounded-xl p-6">
          <h2 className="display-font text-slate-300 font-semibold mb-4 tracking-wide">TIPO DE REPORTE</h2>
          <div className="grid grid-cols-3 gap-3">
            {([ 
              { key: 'semanal' as TipoReporte, label: 'Semanal', desc: 'Detalle por mecanico para cheques' },
              { key: 'mensual' as TipoReporte, label: 'Mensual', desc: 'Resumen de pagos del mes' },
              { key: 'anual' as TipoReporte, label: 'Anual', desc: 'Consolidado de pagos del anio' },
            ]).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTipo(t.key)}
                className={`p-4 rounded-xl border text-left transition-all ${
                  tipo === t.key
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                    : 'bg-slate-800/50 border-white/5 text-slate-400 hover:border-white/10'
                }`}
              >
                <p className="display-font font-bold text-sm tracking-wide mb-1">{t.label.toUpperCase()}</p>
                <p className="text-xs opacity-75">{t.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-slate-900/60 border border-white/5 rounded-xl p-6">
          <h2 className="display-font text-slate-300 font-semibold mb-4 tracking-wide">PERIODO</h2>

          {tipo === 'semanal' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-400 text-sm mb-1.5">Inicio de semana</label>
                <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
                  className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 focus:outline-none focus:border-amber-400/50 transition" />
              </div>
              <div>
                <label className="block text-slate-400 text-sm mb-1.5">Fin de semana</label>
                <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
                  className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 focus:outline-none focus:border-amber-400/50 transition" />
              </div>
            </div>
          )}

          {tipo === 'mensual' && (
            <div>
              <label className="block text-slate-400 text-sm mb-1.5">Mes</label>
              <input type="month" value={mes} onChange={e => setMes(e.target.value)}
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 focus:outline-none focus:border-amber-400/50 transition" />
            </div>
          )}

          {tipo === 'anual' && (
            <div>
              <label className="block text-slate-400 text-sm mb-1.5">Anio</label>
              <select value={anio} onChange={e => setAnio(e.target.value)}
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 focus:outline-none focus:border-amber-400/50 transition">
                {[2024, 2025, 2026, 2027].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <button
          onClick={generarPDF}
          disabled={loading}
          className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/50 text-slate-950 font-bold py-4 rounded-xl transition display-font tracking-wide text-lg flex items-center justify-center gap-3"
        >
          {loading ? (
            <>
              <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              GENERANDO PDF...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              DESCARGAR PDF {tipo.toUpperCase()}
            </>
          )}
        </button>

        <p className="text-slate-600 text-xs text-center">
          El PDF se descargara directamente en su dispositivo listo para imprimir.
        </p>
      </div>
    </div>
  );
}
