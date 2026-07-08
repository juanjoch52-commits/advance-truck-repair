'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLanguage, getTranslator, type Lang } from '@/contexts/LanguageContext';
import { fmtDate } from '@/lib/fmt';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

type TipoReporte = 'semanal' | 'mensual' | 'anual';
type TipoEmp = 'mecanicos' | 'admin' | 'todos';

interface EmpOption { id: string; full_name: string; }
// Fila de GET /api/empleados (solo los campos que usa esta página).
interface EmpRow { id: string; full_name: string; payment_type: string | null; role: string | null; }

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

  const now = new Date();
  const { start: defaultWeekStart, end: defaultWeekEnd } = getWeekRange();

  const [tipo, setTipo] = useState<TipoReporte>((searchParams.get('tipo') as TipoReporte) ?? 'semanal');
  const [tipoEmp, setTipoEmp] = useState<TipoEmp>('mecanicos');
  const [selectedEmpId, setSelectedEmpId] = useState('');   // '' = todos
  const [empOptions, setEmpOptions] = useState<EmpOption[]>([]);
  const [empAll, setEmpAll] = useState<EmpRow[]>([]);
  // privileged: owner/super_user ven nómina administrativa; admin solo mecánicos.
  const [privileged, setPrivileged] = useState<boolean | null>(null);

  const [desde, setDesde] = useState(searchParams.get('desde') ?? defaultWeekStart);
  const [hasta, setHasta] = useState(searchParams.get('hasta') ?? defaultWeekEnd);
  const [mes, setMes]   = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [anio, setAnio] = useState(String(now.getFullYear()));
  const [loading, setLoading] = useState(false);
  const [showLangModal, setShowLangModal] = useState(false);

  // Lista de empleados + flag privileged desde el servidor (una sola vez).
  // El servidor decide el flag según la sesión; el cliente no puede forzarlo.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/empleados');
        if (!res.ok) { setPrivileged(false); setEmpAll([]); return; }
        const j = await res.json();
        setPrivileged(Boolean(j?.privileged));
        setEmpAll((j?.employees ?? []) as EmpRow[]);
      } catch {
        setPrivileged(false);
        setEmpAll([]);
      }
    })();
  }, []);

  // Si el rol NO es privilegiado (admin), solo hay reportes de mecánicos.
  useEffect(() => {
    if (privileged === false && tipoEmp !== 'mecanicos') setTipoEmp('mecanicos');
  }, [privileged, tipoEmp]);

  // Recalcular opciones de empleado cuando cambia el tipo o llega la lista.
  useEffect(() => {
    setSelectedEmpId('');
    if (tipoEmp === 'todos') { setEmpOptions([]); return; }

    const all: EmpOption[] = empAll
      .filter((e) => {
        const isMech = e.payment_type === 'mechanic_commission' || e.role === 'mechanic';
        return tipoEmp === 'mecanicos' ? isMech : !isMech;
      })
      .map((e) => ({ id: e.id, full_name: e.full_name }));
    setEmpOptions(all);
  }, [tipoEmp, empAll]);

  const formatMoney = (n: number) =>
    '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const formatDate = (d: string) => fmtDate(d);

  // ─── PDF generation ───────────────────────────────────────────────────────────
  async function generarPDF(pdfLang: Lang) {
    setShowLangModal(false);
    setLoading(true);
    const t = getTranslator(pdfLang);
    const locale = pdfLang === 'en' ? 'en-US' : 'es-MX';

    // Resolve date range
    let fechaDesde = desde;
    let fechaHasta = hasta;
    let titulo = '';
    let subtitulo = '';

    if (tipo === 'mensual') {
      const [y, m] = mes.split('-').map(Number);
      fechaDesde = new Date(y, m - 1, 1).toISOString().split('T')[0];
      fechaHasta = new Date(y, m, 0).toISOString().split('T')[0];
      const mesNombre = `${String(m).padStart(2, '0')}/${y}`;
      titulo = t('pdf.reportTitle.mensual');
      subtitulo = `${t('pdf.period.label')}: ${mesNombre.toUpperCase()}`;
    } else if (tipo === 'anual') {
      fechaDesde = `${anio}-01-01`;
      fechaHasta = `${anio}-12-31`;
      titulo = t('pdf.reportTitle.anual');
      subtitulo = `${t('pdf.period.year')}: ${anio}`;
    } else {
      titulo = t('pdf.reportTitle.semanal');
      subtitulo = `${t('pdf.period.week')}: ${fmtDate(desde)} — ${fmtDate(hasta)}`;
    }

    const INK = 30; const SOFT = 110; const LINE = 170;

    // Auditoría de generación: quién generó se estampa en el SERVIDOR.
    const logGeneration = async () => {
      try {
        await fetch('/api/reportes/nomina', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tipo, fecha_desde: fechaDesde, fecha_hasta: fechaHasta, pdf_language: pdfLang }),
        });
      } catch (_) {}
    };

    // ── Single-employee mode ───────────────────────────────────────────────────
    if (selectedEmpId) {
      const empName = empOptions.find(e => e.id === selectedEmpId)?.full_name ?? '—';
      const isMech = tipoEmp === 'mecanicos';

      // Entradas + deducciones desde el servidor (valida rol y aplica joins)
      let entries: any[] = [];
      let debtRaw: any[] = [];
      try {
        const params = new URLSearchParams({
          desde: fechaDesde,
          hasta: fechaHasta,
          scope: isMech ? 'mechanic' : 'admin',
          employee_id: selectedEmpId,
        });
        const res = await fetch(`/api/reportes/nomina?${params.toString()}`);
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          alert(j?.error ?? tUI('payroll.empty'));
          setLoading(false);
          return;
        }
        const j = await res.json();
        entries = j?.entries ?? [];
        debtRaw = j?.deductions ?? [];
      } catch {
        setLoading(false);
        return;
      }

      const deductions: { desc: string; amount: number; weekEnding: string }[] =
        (debtRaw ?? []).map((dp: any) => ({
          desc: dp.debts?.description ?? 'Deducción',
          amount: Number(dp.amount),
          weekEnding: dp.week_ending,
        }));

      const totalEarned = entries.reduce((s: number, e: any) => s + Number(e.amount), 0);
      const totalDed = deductions.reduce((s, d) => s + d.amount, 0);
      const netAmount = totalEarned - totalDed;

      if (entries.length === 0 && deductions.length === 0) {
        alert(tUI('payroll.empty'));
        setLoading(false);
        return;
      }

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
      const pageW = doc.internal.pageSize.getWidth();
      const margin = 15;

      // Header
      doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(INK, INK, INK);
      doc.text(t('pdf.header.company'), margin, 14);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(SOFT, SOFT, SOFT);
      doc.text(t('pdf.header.system'), margin, 20);
      const fechaEmision = fmtDate(new Date().toISOString().split('T')[0]);
      doc.text(`${t('pdf.header.issued')}: ${fechaEmision}`, pageW - margin, 20, { align: 'right' });
      doc.setDrawColor(LINE, LINE, LINE); doc.setLineWidth(0.2);
      doc.line(margin, 24, pageW - margin, 24);

      // Employee name block
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(INK, INK, INK);
      doc.text(empName.toUpperCase(), margin, 33);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(SOFT, SOFT, SOFT);
      doc.text(isMech ? t('pdf.section.mechanics') : t('pdf.section.admin'), margin, 39);
      doc.text(subtitulo, pageW - margin, 39, { align: 'right' });
      doc.setDrawColor(LINE, LINE, LINE); doc.line(margin, 43, pageW - margin, 43);

      let y = 51;

      const baseStyles = {
        fontSize: 9,
        textColor: [INK, INK, INK] as [number, number, number],
        lineColor: [LINE, LINE, LINE] as [number, number, number],
        lineWidth: 0.15,
        cellPadding: { top: 2.2, right: 3, bottom: 2.2, left: 3 },
      };
      const baseHead = {
        fillColor: [255, 255, 255] as [number, number, number],
        textColor: [INK, INK, INK] as [number, number, number],
        fontStyle: 'normal' as const, fontSize: 9,
      };
      const underline = (h: any) => {
        if (h.section === 'head') {
          const { x, y: cy, width, height } = h.cell;
          doc.setDrawColor(LINE, LINE, LINE); doc.setLineWidth(0.2);
          doc.line(x, cy + height, x + width, cy + height);
        }
      };

      // Earnings section header
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(INK, INK, INK);
      doc.text(t('pdf.slip.earningsTitle'), margin, y); y += 4;

      if (entries.length > 0) {
        if (isMech) {
          autoTable(doc, {
            startY: y, margin: { left: margin, right: margin }, theme: 'plain',
            head: [[t('pdf.table.date'), t('pdf.table.truck'), t('pdf.table.company'), t('pdf.table.task'), t('pdf.table.amount')]],
            body: entries.map((e: any) => [
              fmtDate(e.work_date),
              e.truck_number ?? '—',
              e.work_reports?.company ?? '—',
              e.description ?? '—',
              formatMoney(Number(e.amount)),
            ]),
            foot: [['', '', '', t('pdf.slip.subtotal'), formatMoney(totalEarned)]],
            styles: baseStyles,
            headStyles: baseHead,
            footStyles: { ...baseHead, fontStyle: 'normal' as const },
            columnStyles: { 4: { halign: 'right' } },
            didDrawCell: underline,
          });
        } else {
          autoTable(doc, {
            startY: y, margin: { left: margin, right: margin }, theme: 'plain',
            head: [[t('pdf.table.date'), t('pdf.table.hours'), t('pdf.table.note'), t('pdf.table.amount')]],
            body: entries.map((e: any) => [
              fmtDate(e.work_date),
              e.hours_worked != null ? String(e.hours_worked) : '—',
              e.description ?? '—',
              formatMoney(Number(e.amount)),
            ]),
            foot: [['', '', t('pdf.slip.subtotal'), formatMoney(totalEarned)]],
            styles: baseStyles,
            headStyles: baseHead,
            footStyles: { ...baseHead, fontStyle: 'normal' as const },
            columnStyles: { 1: { halign: 'center', cellWidth: 18 }, 3: { halign: 'right', cellWidth: 35 } },
            didDrawCell: underline,
          });
        }
        y = (doc as any).lastAutoTable.finalY + 8;
      } else {
        doc.setFontSize(9); doc.setTextColor(SOFT, SOFT, SOFT);
        doc.text(t('pdf.slip.noEarnings'), margin, y); y += 8;
      }

      // Deductions section
      if (deductions.length > 0) {
        if (y > 230) { doc.addPage(); y = 20; }
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(INK, INK, INK);
        doc.text(t('pdf.slip.deductionsTitle'), margin, y); y += 4;

        autoTable(doc, {
          startY: y, margin: { left: margin, right: margin }, theme: 'plain',
          head: [[t('pdf.table.date'), t('deductions.description'), t('pdf.table.amount')]],
          body: deductions.map(d => [
            fmtDate(d.weekEnding),
            d.desc,
            `- ${formatMoney(d.amount)}`,
          ]),
          foot: [['', t('pdf.slip.totalDeductions'), `- ${formatMoney(totalDed)}`]],
          styles: { ...baseStyles, textColor: [INK, INK, INK] as [number, number, number] },
          headStyles: baseHead,
          footStyles: { ...baseHead, fontStyle: 'normal' as const },
          columnStyles: { 2: { halign: 'right' } },
          didDrawCell: underline,
        });
        y = (doc as any).lastAutoTable.finalY + 8;
      }

      // Net total box
      if (y > 240) { doc.addPage(); y = 20; }
      doc.setDrawColor(LINE, LINE, LINE); doc.setLineWidth(0.3);
      doc.line(margin, y, pageW - margin, y); y += 8;

      if (deductions.length > 0) {
        doc.setFontSize(9); doc.setTextColor(SOFT, SOFT, SOFT);
        doc.text(t('pdf.slip.grossEarned'), margin, y);
        doc.setTextColor(INK, INK, INK);
        doc.text(formatMoney(totalEarned), pageW - margin, y, { align: 'right' }); y += 5;

        doc.setTextColor(SOFT, SOFT, SOFT);
        doc.text(t('pdf.slip.totalDeductions'), margin, y);
        doc.setTextColor(INK, INK, INK);
        doc.text(`- ${formatMoney(totalDed)}`, pageW - margin, y, { align: 'right' }); y += 6;

        doc.setDrawColor(LINE, LINE, LINE); doc.setLineWidth(0.15);
        doc.line(margin, y, pageW - margin, y); y += 6;
      }

      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(INK, INK, INK);
      doc.text(t('pdf.slip.netCheck'), margin, y);
      doc.text(formatMoney(netAmount), pageW - margin, y, { align: 'right' });

      // Pages footer
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(SOFT, SOFT, SOFT);
        doc.text(`${t('pdf.footer')} ${i} / ${totalPages}`, pageW / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' });
      }

      const safeName = empName.replace(/\s+/g, '_').toLowerCase();
      const suffix = tipo === 'semanal' ? `${desde}_${hasta}` : tipo === 'mensual' ? mes : anio;
      doc.save(`comprobante_${safeName}_${suffix}.pdf`);
      setLoading(false);

      // Audit log (servidor)
      await logGeneration();
      return;
    }

    // ── Multi-employee mode (existing logic) ──────────────────────────────────
    // El servidor devuelve las entradas por tipo según el alcance pedido
    // (scope 'admin'/'all' exige owner/super_user; 403 para admin).
    let mechData: any[] = [];
    let adminData: any[] = [];
    try {
      const scope = tipoEmp === 'mecanicos' ? 'mechanic' : tipoEmp === 'admin' ? 'admin' : 'all';
      const params = new URLSearchParams({ desde: fechaDesde, hasta: fechaHasta, scope });
      const res = await fetch(`/api/reportes/nomina?${params.toString()}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.error ?? tUI('payroll.empty'));
        setLoading(false);
        return;
      }
      const j = await res.json();
      mechData = j?.mechEntries ?? [];
      adminData = j?.adminEntries ?? [];
    } catch {
      setLoading(false);
      return;
    }

    if (mechData.length === 0 && adminData.length === 0) {
      alert(tUI('payroll.empty'));
      setLoading(false);
      return;
    }

    const byMechanic: Record<string, { name: string; total: number; rows: any[] }> = {};
    for (const e of mechData) {
      const name = (e as any).employees?.full_name ?? 'Sin nombre';
      if (!byMechanic[name]) byMechanic[name] = { name, total: 0, rows: [] };
      byMechanic[name].total += Number(e.amount);
      byMechanic[name].rows.push(e);
    }
    const mechanics = Object.values(byMechanic).sort((a, b) => b.total - a.total);
    const totalMechanics = mechanics.reduce((s, m) => s + m.total, 0);

    const byAdmin: Record<string, { name: string; total: number; rows: any[] }> = {};
    for (const e of adminData) {
      const name = (e as any).employees?.full_name ?? 'Sin nombre';
      if (!byAdmin[name]) byAdmin[name] = { name, total: 0, rows: [] };
      byAdmin[name].total += Number(e.amount);
      byAdmin[name].rows.push(e);
    }
    const admins = Object.values(byAdmin).sort((a, b) => b.total - a.total);
    const totalAdmins = admins.reduce((s, a) => s + a.total, 0);
    const totalGeneral = totalMechanics + totalAdmins;

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 15;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(INK, INK, INK);
    doc.text(t('pdf.header.company'), margin, 14);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(SOFT, SOFT, SOFT);
    doc.text(t('pdf.header.system'), margin, 20);
    const fechaEmision2 = fmtDate(new Date().toISOString().split('T')[0]);
    doc.text(`${t('pdf.header.issued')}: ${fechaEmision2}`, pageW - margin, 20, { align: 'right' });
    doc.setDrawColor(LINE, LINE, LINE); doc.setLineWidth(0.2);
    doc.line(margin, 24, pageW - margin, 24);

    doc.setFont('helvetica', 'normal'); doc.setFontSize(12); doc.setTextColor(INK, INK, INK);
    doc.text(titulo, margin, 32);
    doc.setFontSize(9); doc.setTextColor(SOFT, SOFT, SOFT);
    doc.text(subtitulo, margin, 38);

    let y = 46;

    doc.setFontSize(9); doc.setTextColor(SOFT, SOFT, SOFT);
    doc.text(t('pdf.summary.totalPayroll') + ':', margin, y);
    doc.setTextColor(INK, INK, INK);
    doc.text(formatMoney(totalGeneral), margin + 50, y);

    if (tipoEmp === 'todos') {
      doc.setTextColor(SOFT, SOFT, SOFT);
      doc.text(t('pdf.summary.mechanics') + ':', pageW / 2, y);
      doc.setTextColor(INK, INK, INK);
      doc.text(formatMoney(totalMechanics), pageW / 2 + 30, y); y += 5;
      doc.setTextColor(SOFT, SOFT, SOFT);
      doc.text(t('pdf.summary.admin') + ':', pageW / 2, y);
      doc.setTextColor(INK, INK, INK);
      doc.text(formatMoney(totalAdmins), pageW / 2 + 30, y);
    } else if (tipoEmp === 'mecanicos') {
      doc.setTextColor(SOFT, SOFT, SOFT);
      doc.text(t('pdf.summary.mechanics') + ':', pageW / 2, y);
      doc.setTextColor(INK, INK, INK);
      doc.text(String(mechanics.length), pageW / 2 + 30, y);
    } else {
      doc.setTextColor(SOFT, SOFT, SOFT);
      doc.text(t('pdf.summary.adminStaff') + ':', pageW / 2, y);
      doc.setTextColor(INK, INK, INK);
      doc.text(String(admins.length), pageW / 2 + 30, y);
    }

    y += 4;
    doc.setDrawColor(LINE, LINE, LINE); doc.setLineWidth(0.2);
    doc.line(margin, y, pageW - margin, y); y += 6;

    const baseTableStyles = {
      fontSize: 9, textColor: [INK, INK, INK] as [number, number, number],
      lineColor: [LINE, LINE, LINE] as [number, number, number], lineWidth: 0.15,
      cellPadding: { top: 2.2, right: 3, bottom: 2.2, left: 3 },
    };
    const baseHeadStyles = {
      fillColor: [255, 255, 255] as [number, number, number],
      textColor: [INK, INK, INK] as [number, number, number],
      fontStyle: 'normal' as const, fontSize: 9,
    };
    const baseFootStyles = { ...baseHeadStyles };
    const underlineHeader = (hookData: any) => {
      if (hookData.section === 'head') {
        const { x, y: cy, width, height } = hookData.cell;
        doc.setDrawColor(LINE, LINE, LINE); doc.setLineWidth(0.2);
        doc.line(x, cy + height, x + width, cy + height);
      }
    };

    // Mechanics section
    if (mechanics.length > 0) {
      if (tipoEmp === 'todos') {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(INK, INK, INK);
        doc.text(t('pdf.section.mechanics').toUpperCase(), margin, y); y += 5;
      }

      if (tipo === 'semanal') {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(INK, INK, INK);
        doc.text(t('pdf.checksTable'), margin, y); y += 4;

        autoTable(doc, {
          startY: y, margin: { left: margin, right: margin }, theme: 'plain',
          head: [[t('pdf.table.num'), t('pdf.table.mechanic'), t('pdf.table.jobs'), t('pdf.table.amount')]],
          body: mechanics.map((m, i) => [i + 1, m.name, m.rows.length, formatMoney(m.total)]),
          foot: [['', t('pdf.table.total'), mechanics.reduce((s, m) => s + m.rows.length, 0), formatMoney(totalMechanics)]],
          styles: baseTableStyles, headStyles: baseHeadStyles, footStyles: baseFootStyles,
          columnStyles: { 0: { halign: 'center', cellWidth: 10 }, 2: { halign: 'center', cellWidth: 25 }, 3: { halign: 'right', cellWidth: 40 } },
          didDrawCell: underlineHeader,
        });
        y = (doc as any).lastAutoTable.finalY + 10;

        for (const m of mechanics) {
          if (y > 230) { doc.addPage(); y = 20; }
          doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(INK, INK, INK);
          doc.text(m.name.toUpperCase(), margin, y + 4);
          doc.text(formatMoney(m.total), pageW - margin, y + 4, { align: 'right' });
          doc.setDrawColor(LINE, LINE, LINE); doc.setLineWidth(0.2);
          doc.line(margin, y + 6, pageW - margin, y + 6); y += 9;

          autoTable(doc, {
            startY: y, margin: { left: margin, right: margin }, theme: 'plain',
            head: [[t('pdf.table.date'), t('pdf.table.truck'), t('pdf.table.company'), t('pdf.table.task'), t('pdf.table.amount')]],
            body: m.rows.map((e: any) => [
              fmtDate(e.work_date),
              e.truck_number ?? '-', e.work_reports?.company ?? '-', e.description ?? '-',
              formatMoney(Number(e.amount)),
            ]),
            styles: { ...baseTableStyles, fontSize: 8 }, headStyles: { ...baseHeadStyles, fontSize: 8 },
            columnStyles: { 4: { halign: 'right' } }, didDrawCell: underlineHeader,
          });
          y = (doc as any).lastAutoTable.finalY + 8;
        }
      } else {
        autoTable(doc, {
          startY: y, margin: { left: margin, right: margin }, theme: 'plain',
          head: [[t('pdf.table.num'), t('pdf.table.mechanic'), t('pdf.table.jobs'), t('pdf.table.totalEarned')]],
          body: mechanics.map((m, i) => [i + 1, m.name, m.rows.length, formatMoney(m.total)]),
          foot: [['', t('pdf.table.total'), mechanics.reduce((s, m) => s + m.rows.length, 0), formatMoney(totalMechanics)]],
          styles: { ...baseTableStyles, fontSize: 10 }, headStyles: { ...baseHeadStyles, fontSize: 10 },
          footStyles: { ...baseFootStyles, fontSize: 10 },
          columnStyles: { 0: { halign: 'center', cellWidth: 12 }, 2: { halign: 'center', cellWidth: 30 }, 3: { halign: 'right', cellWidth: 45 } },
          didDrawCell: underlineHeader,
        });
        y = (doc as any).lastAutoTable.finalY + 10;
      }
    }

    // Admin section
    if (admins.length > 0) {
      if (y > 230) { doc.addPage(); y = 20; }
      if (tipoEmp === 'todos') {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(INK, INK, INK);
        doc.text(t('pdf.section.admin').toUpperCase(), margin, y); y += 5;
      }

      if (tipo === 'semanal') {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(INK, INK, INK);
        doc.text(t('pdf.checksTable'), margin, y); y += 4;

        autoTable(doc, {
          startY: y, margin: { left: margin, right: margin }, theme: 'plain',
          head: [[t('pdf.table.num'), t('pdf.table.employee'), t('pdf.table.records'), t('pdf.table.amount')]],
          body: admins.map((a, i) => [i + 1, a.name, a.rows.length, formatMoney(a.total)]),
          foot: [['', t('pdf.table.total'), admins.reduce((s, a) => s + a.rows.length, 0), formatMoney(totalAdmins)]],
          styles: baseTableStyles, headStyles: baseHeadStyles, footStyles: baseFootStyles,
          columnStyles: { 0: { halign: 'center', cellWidth: 10 }, 2: { halign: 'center', cellWidth: 25 }, 3: { halign: 'right', cellWidth: 40 } },
          didDrawCell: underlineHeader,
        });
        y = (doc as any).lastAutoTable.finalY + 10;

        for (const a of admins) {
          if (y > 230) { doc.addPage(); y = 20; }
          doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(INK, INK, INK);
          doc.text(a.name.toUpperCase(), margin, y + 4);
          doc.text(formatMoney(a.total), pageW - margin, y + 4, { align: 'right' });
          doc.setDrawColor(LINE, LINE, LINE); doc.setLineWidth(0.2);
          doc.line(margin, y + 6, pageW - margin, y + 6); y += 9;

          autoTable(doc, {
            startY: y, margin: { left: margin, right: margin }, theme: 'plain',
            head: [[t('pdf.table.date'), t('pdf.table.hours'), t('pdf.table.note'), t('pdf.table.amount')]],
            body: a.rows.map((e: any) => [
              fmtDate(e.work_date),
              e.hours_worked != null ? String(e.hours_worked) : '—', e.description ?? '—',
              formatMoney(Number(e.amount)),
            ]),
            styles: { ...baseTableStyles, fontSize: 8 }, headStyles: { ...baseHeadStyles, fontSize: 8 },
            columnStyles: { 1: { halign: 'center', cellWidth: 18 }, 3: { halign: 'right', cellWidth: 35 } },
            didDrawCell: underlineHeader,
          });
          y = (doc as any).lastAutoTable.finalY + 8;
        }
      } else {
        autoTable(doc, {
          startY: y, margin: { left: margin, right: margin }, theme: 'plain',
          head: [[t('pdf.table.num'), t('pdf.table.employee'), t('pdf.table.records'), t('pdf.table.totalEarned')]],
          body: admins.map((a, i) => [i + 1, a.name, a.rows.length, formatMoney(a.total)]),
          foot: [['', t('pdf.table.total'), admins.reduce((s, a) => s + a.rows.length, 0), formatMoney(totalAdmins)]],
          styles: { ...baseTableStyles, fontSize: 10 }, headStyles: { ...baseHeadStyles, fontSize: 10 },
          footStyles: { ...baseFootStyles, fontSize: 10 },
          columnStyles: { 0: { halign: 'center', cellWidth: 12 }, 2: { halign: 'center', cellWidth: 30 }, 3: { halign: 'right', cellWidth: 45 } },
          didDrawCell: underlineHeader,
        });
        y = (doc as any).lastAutoTable.finalY + 10;
      }
    }

    // Grand total for "todos"
    if (tipoEmp === 'todos' && mechanics.length > 0 && admins.length > 0) {
      if (y > 250) { doc.addPage(); y = 20; }
      doc.setDrawColor(LINE, LINE, LINE); doc.setLineWidth(0.3);
      doc.line(margin, y, pageW - margin, y); y += 7;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(INK, INK, INK);
      doc.text(t('pdf.table.grandTotal'), margin, y);
      doc.text(formatMoney(totalGeneral), pageW - margin, y, { align: 'right' });
    }

    // Pages footer
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(SOFT, SOFT, SOFT);
      doc.text(`${t('pdf.footer')} ${i} / ${totalPages}`, pageW / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' });
    }

    const empSuffix = tipoEmp === 'mecanicos' ? '_mecanicos' : tipoEmp === 'admin' ? '_admin' : '_todos';
    const fileName = tipo === 'semanal'
      ? `nomina_semanal_${desde}_${hasta}${empSuffix}.pdf`
      : tipo === 'mensual'
      ? `nomina_mensual_${mes}${empSuffix}.pdf`
      : `nomina_anual_${anio}${empSuffix}.pdf`;

    doc.save(fileName);

    // Audit log (servidor)
    await logGeneration();

    setLoading(false);
  }

  // ─── UI ───────────────────────────────────────────────────────────────────────
  const REPORT_TYPES = [
    { key: 'semanal' as TipoReporte, labelKey: 'reports.typeSemanal', descKey: 'reports.typeDescSemanal' },
    { key: 'mensual' as TipoReporte, labelKey: 'reports.typeMensual', descKey: 'reports.typeDescMensual' },
    { key: 'anual'   as TipoReporte, labelKey: 'reports.typeAnual',   descKey: 'reports.typeDescAnual'   },
  ];

  const EMP_TYPES: { key: TipoEmp; label: string; desc: string }[] = [
    { key: 'mecanicos', label: tUI('reports.empMechanics'), desc: tUI('reports.empMechanicsDesc') },
    { key: 'admin',     label: tUI('reports.empAdmin'),     desc: tUI('reports.empAdminDesc')     },
    { key: 'todos',     label: tUI('reports.empAll'),       desc: tUI('reports.empAllDesc')       },
  ];

  // El rol admin no ve montos de salarios administrativos: solo mecánicos.
  // (El servidor devuelve 403 igualmente si lo intentan por la API.)
  const visibleEmpTypes = privileged === true
    ? EMP_TYPES
    : EMP_TYPES.filter((et) => et.key === 'mecanicos');

  const selectedEmpName = empOptions.find(e => e.id === selectedEmpId)?.full_name ?? '';

  return (
    <div>
      <div className="mb-8">
        <h1 className="display-font text-3xl font-bold text-slate-100 tracking-wide">{tUI('reports.title')}</h1>
        <p className="text-slate-400 mt-1">{tUI('reports.subtitle')}</p>
      </div>

      <div className="max-w-2xl space-y-6">

        {/* Tipo de empleado */}
        <div className="bg-slate-900/60 border border-white/5 rounded-xl p-6">
          <h2 className="display-font text-slate-300 font-semibold mb-4 tracking-wide">{tUI('reports.empType')}</h2>
          <div className={`grid gap-3 ${visibleEmpTypes.length === 1 ? 'grid-cols-1' : 'grid-cols-3'}`}>
            {visibleEmpTypes.map((et) => (
              <button key={et.key} type="button" onClick={() => setTipoEmp(et.key)}
                className={`p-4 rounded-xl border text-left transition-all ${
                  tipoEmp === et.key
                    ? 'bg-violet-500/15 border-violet-500/40 text-violet-300'
                    : 'bg-slate-800/50 border-white/5 text-slate-400 hover:border-white/10'
                }`}>
                <p className="display-font font-bold text-sm tracking-wide mb-1">{et.label.toUpperCase()}</p>
                <p className="text-xs opacity-75">{et.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Empleado específico (cuando no es "todos") */}
        {tipoEmp !== 'todos' && empOptions.length > 0 && (
          <div className="bg-slate-900/60 border border-white/5 rounded-xl p-6">
            <h2 className="display-font text-slate-300 font-semibold mb-1 tracking-wide">
              {tUI('reports.specificEmployee')}
            </h2>
            <p className="text-slate-500 text-xs mb-4">{tUI('reports.specificEmployeeDesc')}</p>
            <div className="grid grid-cols-1 gap-2">
              {/* "Todos" option */}
              <button type="button" onClick={() => setSelectedEmpId('')}
                className={`px-4 py-2.5 rounded-lg border text-left text-sm transition-all flex items-center gap-2 ${
                  !selectedEmpId
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                    : 'bg-slate-800/50 border-white/5 text-slate-400 hover:border-white/10'
                }`}>
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="font-medium">{tUI('reports.allEmployees')}</span>
                <span className="text-xs opacity-60 ml-1">— {tUI('reports.allEmployeesDesc')}</span>
              </button>

              {/* Individual employees */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                {empOptions.map(emp => (
                  <button key={emp.id} type="button" onClick={() => setSelectedEmpId(emp.id)}
                    className={`px-4 py-2.5 rounded-lg border text-left text-sm transition-all flex items-center gap-2 ${
                      selectedEmpId === emp.id
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                        : 'bg-slate-800/50 border-white/5 text-slate-400 hover:border-white/10 hover:text-slate-200'
                    }`}>
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <span className="font-medium truncate">{emp.full_name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Badge when someone is selected */}
            {selectedEmpId && (
              <div className="mt-3 flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                <svg className="w-4 h-4 text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-amber-300 text-xs">
                  {tUI('reports.slipNote').replace('{name}', selectedEmpName)}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Tipo de reporte */}
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
              {selectedEmpId
                ? `${tUI('pdf.downloadSlip')} — ${selectedEmpName}`
                : `${tUI('pdf.download')} ${tUI(`pdf.type.${tipo}`).toUpperCase()}`}
            </>
          )}
        </button>

        <p className="text-slate-600 text-xs text-center">{tUI('reports.downloadNote')}</p>
      </div>

      {/* Language Modal */}
      {showLangModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-8 w-full max-w-sm shadow-2xl">
            <h2 className="display-font text-slate-100 font-bold text-lg tracking-wide mb-1">
              {tUI('pdf.modalTitle')}
            </h2>
            <p className="text-slate-400 text-sm mb-6">{tUI('pdf.modalSubtitle')}</p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => generarPDF('es')}
                className="flex flex-col items-center gap-2 p-5 rounded-xl border border-white/10 hover:border-amber-500/40 hover:bg-amber-500/10 transition group">
                <span className="text-3xl">🇪🇸</span>
                <span className="display-font text-slate-200 group-hover:text-amber-400 font-bold tracking-wide transition">{tUI('pdf.spanish')}</span>
              </button>
              <button onClick={() => generarPDF('en')}
                className="flex flex-col items-center gap-2 p-5 rounded-xl border border-white/10 hover:border-sky-500/40 hover:bg-sky-500/10 transition group">
                <span className="text-3xl">🇺🇸</span>
                <span className="display-font text-slate-200 group-hover:text-sky-400 font-bold tracking-wide transition">{tUI('pdf.english')}</span>
              </button>
            </div>
            <button onClick={() => setShowLangModal(false)}
              className="w-full mt-4 text-slate-500 hover:text-slate-300 text-sm py-2 transition">
              {tUI('pdf.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
