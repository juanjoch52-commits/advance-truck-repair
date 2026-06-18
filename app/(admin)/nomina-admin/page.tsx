'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import { useLanguage } from '@/contexts/LanguageContext';
import { fmtDate } from '@/lib/fmt';
import { normalizeWorkDays, computeWeekPay } from '@/lib/attendance';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface AdminEmployee {
  id: string;
  full_name: string;
  payment_type: string;
  weekly_salary: number | null;
  hourly_rate: number | null;
  work_days: number[] | null;
}

interface AdminEntry {
  id: string;
  employee_id: string;
  amount: number;
  hours_worked: number | null;
  description: string | null;
  work_date: string;
  week_start: string;
  week_end: string;
  entry_type: string;
}

interface DeductionItem {
  desc: string;
  amount: number;
}

function getWeekRange(offsetWeeks = 0) {
  const now = new Date();
  const day = now.getDay(); // 0=Dom, 6=Sáb
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - day + offsetWeeks * 7); // retroceder al domingo
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  return {
    start: sunday.toISOString().split('T')[0],
    end: saturday.toISOString().split('T')[0],
  };
}

export default function NominaAdminPage() {
  const { t, lang } = useLanguage();
  const supabase = createClient();
  const locale = lang === 'en' ? 'en-US' : 'es-MX';

  const initialWeek = getWeekRange(0);
  const [weekStart, setWeekStart] = useState(initialWeek.start);
  const [weekEnd, setWeekEnd] = useState(initialWeek.end);

  const [admins, setAdmins] = useState<AdminEmployee[]>([]);
  const [entries, setEntries] = useState<AdminEntry[]>([]);
  const [absencesByEmp, setAbsencesByEmp] = useState<Record<string, number>>({});
  const [deductionsByEmp, setDeductionsByEmp] = useState<Record<string, DeductionItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);

  // Check role
  useEffect(() => {
    (async () => {
      let role = '';
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) { const j = await res.json(); role = (j?.user?.role ?? '').toLowerCase(); }
      } catch {}
      if (!role) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data } = await (supabase as any).from('profiles').select('role').eq('id', user.id).single();
            role = ((data as any)?.role ?? '').toLowerCase();
          }
        } catch {}
      }
      setAllowed(role === 'super_user' || role === 'super_admin' || role === 'owner');
    })();
  }, []);

  // Per-employee form state
  const [formByEmp, setFormByEmp] = useState<Record<string, {
    amount: string; hours: string; description: string; saving: boolean;
  }>>({});

  function setForm(empId: string, patch: Partial<{ amount: string; hours: string; description: string; saving: boolean }>) {
    setFormByEmp(prev => ({
      ...prev,
      [empId]: { amount: '', hours: '', description: '', saving: false, ...prev[empId], ...patch },
    }));
  }

  const fmtMoney = (n: number) => '$' + n.toLocaleString(locale, { minimumFractionDigits: 2 });

  const load = useCallback(async () => {
    setLoading(true);

    const { data: empData } = await (supabase as any)
      .from('employees')
      .select('id, full_name, payment_type, weekly_salary, hourly_rate, work_days')
      .neq('payment_type', 'mechanic_commission')
      .order('full_name');
    const adminList = (empData ?? []) as AdminEmployee[];
    setAdmins(adminList);

    // Faltas de la semana (status='absent') por empleado → prorratea el sueldo fijo.
    const { data: attData } = await (supabase as any)
      .from('attendance')
      .select('employee_id, status')
      .eq('status', 'absent')
      .gte('work_date', weekStart)
      .lte('work_date', weekEnd);
    const absMap: Record<string, number> = {};
    for (const a of attData ?? []) absMap[a.employee_id] = (absMap[a.employee_id] ?? 0) + 1;
    setAbsencesByEmp(absMap);

    const { data: entryData } = await (supabase as any)
      .from('earned_entries')
      .select('id, employee_id, amount, hours_worked, description, work_date, week_start, week_end, entry_type')
      .gte('work_date', weekStart)
      .lte('work_date', weekEnd)
      .in('entry_type', ['admin_fixed', 'admin_hourly', 'admin_manual']);

    setEntries((entryData ?? []) as AdminEntry[]);

    // Deducciones por deuda aplicadas esta semana
    const { data: dpData } = await (supabase as any)
      .from('debt_payments')
      .select('debt_id, amount, debts!inner(employee_id, description)')
      .gte('week_ending', weekStart)
      .lte('week_ending', weekEnd);

    const dedMap: Record<string, DeductionItem[]> = {};
    for (const dp of dpData ?? []) {
      const empId = (dp.debts as any)?.employee_id;
      const desc = (dp.debts as any)?.description ?? 'Deducción';
      if (!empId) continue;
      if (!dedMap[empId]) dedMap[empId] = [];
      dedMap[empId].push({ desc, amount: Number(dp.amount) });
    }
    setDeductionsByEmp(dedMap);

    setLoading(false);
  }, [weekStart, weekEnd]);

  useEffect(() => { load(); }, [load]);

  function entryTypeForEmployee(emp: AdminEmployee): 'admin_fixed' | 'admin_hourly' | 'admin_manual' {
    if (emp.payment_type === 'fixed_weekly') return 'admin_fixed';
    if (emp.payment_type === 'hourly') return 'admin_hourly';
    return 'admin_manual';
  }

  // Sueldo fijo prorrateado por asistencia: salario − (faltas × salario/díasLaborales).
  function fixedPayForEmp(emp: AdminEmployee) {
    const workDays = normalizeWorkDays(emp.work_days).length;
    const absent = absencesByEmp[emp.id] ?? 0;
    const present = Math.max(0, workDays - absent);
    const amount = computeWeekPay(Number(emp.weekly_salary ?? 0), workDays, absent);
    return { amount, present, workDays, absent };
  }

  function entriesForEmp(empId: string) {
    return entries.filter(e => e.employee_id === empId);
  }

  function totalForEmp(empId: string) {
    return entriesForEmp(empId).reduce((s, e) => s + Number(e.amount), 0);
  }

  const grandTotal = entries.reduce((s, e) => s + Number(e.amount), 0);
  const totalDeductions = Object.values(deductionsByEmp).flat().reduce((s, d) => s + d.amount, 0);
  const grandNet = grandTotal - totalDeductions;

  // Empleados de sueldo fijo que aún no tienen entrada esta semana
  const fixedPending = admins.filter(emp =>
    emp.payment_type === 'fixed_weekly' &&
    Number(emp.weekly_salary ?? 0) > 0 &&
    entriesForEmp(emp.id).length === 0
  );

  // Generar planilla completa: agrega todos los fijos pendientes de una vez
  async function handleGenerarTodos() {
    if (fixedPending.length === 0) return;
    setGeneratingAll(true);

    const rows = fixedPending.map(emp => {
      const { amount, present, workDays, absent } = fixedPayForEmp(emp);
      return {
        employee_id: emp.id,
        amount,
        hours_worked: null,
        work_date: weekEnd,
        week_start: weekStart,
        week_end: weekEnd,
        description: absent > 0 ? `${present}/${workDays} ${t('attendance.daysWorkedShort')}` : null,
        entry_type: 'admin_fixed',
        mechanic_role: 'admin',
      };
    });

    const { error } = await (supabase as any).from('earned_entries').insert(rows);
    if (error) alert(error.message);
    setGeneratingAll(false);
    load();
  }

  async function handleAdd(emp: AdminEmployee) {
    const f = formByEmp[emp.id] ?? { amount: '', hours: '', description: '', saving: false };
    let amount = 0;
    let hours: number | null = null;

    if (emp.payment_type === 'fixed_weekly') {
      amount = fixedPayForEmp(emp).amount;
    } else if (emp.payment_type === 'hourly') {
      hours = Number(f.hours || 0);
      amount = hours * Number(emp.hourly_rate ?? 0);
    } else {
      amount = Number(f.amount || 0);
    }

    if (amount <= 0) return;
    setForm(emp.id, { saving: true });

    const { error } = await (supabase as any).from('earned_entries').insert({
      employee_id: emp.id,
      amount: parseFloat(amount.toFixed(2)),
      hours_worked: hours,
      work_date: weekEnd,
      week_start: weekStart,
      week_end: weekEnd,
      description: f.description?.trim() || null,
      entry_type: entryTypeForEmployee(emp),
      mechanic_role: 'admin',
    });

    setForm(emp.id, { saving: false, amount: '', hours: '', description: '' });
    if (error) { alert(error.message); return; }
    load();
  }

  async function handleDelete(entryId: string) {
    if (!confirm(t('adminPayroll.confirmDelete'))) return;
    await (supabase as any).from('earned_entries').delete().eq('id', entryId);
    load();
  }

  // Edit salary inline
  const [editingSalary, setEditingSalary] = useState<string | null>(null);
  const [salaryInput, setSalaryInput] = useState('');
  const [savingSalary, setSavingSalary] = useState(false);

  async function handleSaveSalary(emp: AdminEmployee) {
    setSavingSalary(true);
    const val = parseFloat(salaryInput);
    if (isNaN(val) || val < 0) { setSavingSalary(false); return; }
    await (supabase as any).from('employees').update({ weekly_salary: val }).eq('id', emp.id);
    setSavingSalary(false);
    setEditingSalary(null);
    load();
  }

  function shiftWeek(weeks: number) {
    const baseStart = new Date(weekStart + 'T12:00:00');
    baseStart.setDate(baseStart.getDate() + weeks * 7);
    const baseEnd = new Date(weekEnd + 'T12:00:00');
    baseEnd.setDate(baseEnd.getDate() + weeks * 7);
    setWeekStart(baseStart.toISOString().split('T')[0]);
    setWeekEnd(baseEnd.toISOString().split('T')[0]);
  }

  const formatFecha = (d: string) => fmtDate(d);

  const [generatingPdf, setGeneratingPdf] = useState(false);

  function generatePdf() {
    setGeneratingPdf(true);
    try {
      const INK = 30; const SOFT = 110; const LINE = 170;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
      const pageW = doc.internal.pageSize.getWidth();
      const margin = 15;

      doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(INK, INK, INK);
      doc.text('ADVANCE TRUCK REPAIR', margin, 14);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(SOFT, SOFT, SOFT);
      doc.text(t('adminPayroll.title'), margin, 20);
      const issued = fmtDate(new Date().toISOString().split('T')[0]);
      doc.text(`${t('pdf.header.issued')}: ${issued}`, pageW - margin, 20, { align: 'right' });
      doc.setDrawColor(LINE, LINE, LINE); doc.setLineWidth(0.2);
      doc.line(margin, 24, pageW - margin, 24);

      doc.setFontSize(11); doc.setTextColor(INK, INK, INK);
      doc.text(t('weeklyCut.cutWeek') + ': ' + formatFecha(weekStart) + ' — ' + formatFecha(weekEnd), margin, 32);
      doc.setFontSize(9); doc.setTextColor(SOFT, SOFT, SOFT);
      doc.text(t('adminPayroll.totalToPay') + ':', margin, 40);
      doc.setTextColor(INK, INK, INK);
      doc.text(fmtMoney(grandTotal), margin + 70, 40);

      let y = 48;
      for (const emp of admins) {
        const empEntries = entriesForEmp(emp.id);
        if (empEntries.length === 0) continue;
        if (y > 230) { doc.addPage(); y = 20; }

        doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(INK, INK, INK);
        doc.text(emp.full_name.toUpperCase(), margin, y + 4);
        doc.setFontSize(8); doc.setTextColor(SOFT, SOFT, SOFT);
        let meta = '';
        if (emp.payment_type === 'fixed_weekly') meta = `${t('staff.payment.fixedWeekly')} · ${fmtMoney(Number(emp.weekly_salary ?? 0))}/sem`;
        else if (emp.payment_type === 'hourly') meta = `${t('staff.payment.hourly')} · ${fmtMoney(Number(emp.hourly_rate ?? 0))}/h`;
        else meta = t('staff.payment.manual');
        doc.text(meta, margin, y + 9);
        doc.setFontSize(10); doc.setTextColor(INK, INK, INK);
        doc.text(fmtMoney(totalForEmp(emp.id)), pageW - margin, y + 4, { align: 'right' });
        doc.setDrawColor(LINE, LINE, LINE); doc.setLineWidth(0.2);
        doc.line(margin, y + 11, pageW - margin, y + 11);
        y += 14;

        autoTable(doc, {
          startY: y, margin: { left: margin, right: margin }, theme: 'plain',
          head: [[t('common.date'), t('adminPayroll.hours'), t('adminPayroll.note'), t('adminPayroll.amount')]],
          body: empEntries.map((en) => [
            fmtDate(en.work_date),
            en.hours_worked != null ? String(en.hours_worked) : '—',
            en.description ?? '—',
            fmtMoney(Number(en.amount)),
          ]),
          styles: { fontSize: 9, textColor: [INK, INK, INK] as [number, number, number], cellPadding: { top: 2.2, right: 3, bottom: 2.2, left: 3 }, lineColor: [LINE, LINE, LINE] as [number, number, number], lineWidth: 0.15 },
          headStyles: { fillColor: [255, 255, 255] as [number, number, number], textColor: [INK, INK, INK] as [number, number, number], fontStyle: 'normal' as const, fontSize: 9 },
          columnStyles: { 1: { halign: 'center', cellWidth: 20 }, 3: { halign: 'right', cellWidth: 35 } },
        });
        y = ((doc as any).lastAutoTable?.finalY ?? y + 16) + 10;
      }

      if (y > 250) { doc.addPage(); y = 20; }
      doc.setDrawColor(LINE, LINE, LINE); doc.setLineWidth(0.3); doc.line(margin, y, pageW - margin, y); y += 7;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(INK, INK, INK);
      doc.text(t('adminPayroll.totalToPay'), margin, y);
      doc.text(fmtMoney(grandTotal), pageW - margin, y, { align: 'right' });

      const pages = doc.getNumberOfPages();
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i); doc.setFontSize(8); doc.setTextColor(SOFT, SOFT, SOFT);
        doc.text(`${i} / ${pages}`, pageW / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' });
      }
      doc.save(`nomina_admin_${weekStart}_${weekEnd}.pdf`);
    } finally { setGeneratingPdf(false); }
  }

  /* ---- Render ---- */

  if (allowed === null) return <div className="text-center py-12 text-slate-500">{t('common.loading')}</div>;

  if (!allowed) {
    return (
      <div className="max-w-2xl mx-auto bg-red-500/10 border border-red-500/30 rounded-xl p-8 text-center">
        <h2 className="display-font text-red-400 font-bold text-xl mb-2">{t('adminPayroll.notAllowedTitle')}</h2>
        <p className="text-slate-400 text-sm">{t('adminPayroll.notAllowedMsg')}</p>
      </div>
    );
  }

  const allFixedDone = fixedPending.length === 0 && admins.some(e => e.payment_type === 'fixed_weekly');

  return (
    <div>
      <div className="mb-6">
        <h1 className="display-font text-3xl font-bold text-slate-100 tracking-wide">{t('adminPayroll.title')}</h1>
        <p className="text-slate-400 mt-1">{t('adminPayroll.subtitle')}</p>
      </div>

      {/* Week controls */}
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <button onClick={() => shiftWeek(-1)}
          className="bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 px-3 py-2 rounded-lg transition flex items-center gap-1 text-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t('weeklyCut.prevWeek')}
        </button>

        <div className="flex-1 bg-slate-900/60 border border-white/5 rounded-xl px-5 py-3 text-center min-w-64">
          <p className="text-slate-500 text-xs mb-0.5">{t('weeklyCut.cutWeek')}</p>
          <p className="display-font text-amber-400 font-bold text-lg tracking-wide">
            {formatFecha(weekStart)} — {formatFecha(weekEnd)}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input type="date" value={weekStart} onChange={e => setWeekStart(e.target.value)}
            className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-slate-100 text-xs focus:outline-none focus:border-amber-400/50" />
          <span className="text-slate-600 text-xs">—</span>
          <input type="date" value={weekEnd} onChange={e => setWeekEnd(e.target.value)}
            className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-slate-100 text-xs focus:outline-none focus:border-amber-400/50" />
        </div>

        <button onClick={() => shiftWeek(1)}
          className="bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 px-3 py-2 rounded-lg transition flex items-center gap-1 text-sm">
          {t('weeklyCut.nextWeek')}
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Botón GENERAR PLANILLA + totales */}
      <div className="bg-slate-900/60 border border-white/5 rounded-xl p-5 mb-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-slate-400 text-sm mb-1">{t('adminPayroll.totalToPay')}</p>
            <p className="display-font text-2xl font-bold text-amber-400">{fmtMoney(grandNet)}</p>
            {totalDeductions > 0 && (
              <p className="text-slate-500 text-xs mt-0.5">
                Devengado: {fmtMoney(grandTotal)} — Ded: -{fmtMoney(totalDeductions)}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Botón principal: Generar planilla */}
            {!loading && fixedPending.length > 0 && (
              <button
                onClick={handleGenerarTodos}
                disabled={generatingAll}
                className="bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/50 text-slate-950 font-bold py-2.5 px-5 rounded-lg transition display-font tracking-wide flex items-center gap-2 text-sm"
              >
                {generatingAll ? (
                  <>
                    <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    Generando...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    GENERAR PLANILLA ({fixedPending.length})
                  </>
                )}
              </button>
            )}

            {/* Ya generada */}
            {!loading && allFixedDone && (
              <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 text-green-400 text-sm px-4 py-2.5 rounded-lg">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Planilla generada
              </div>
            )}

            {/* Descargar PDF */}
            <button
              onClick={generatePdf}
              disabled={generatingPdf || entries.length === 0}
              className="bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed border border-white/10 text-slate-200 text-sm px-4 py-2.5 rounded-lg transition flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {generatingPdf ? t('adminPayroll.generatingPdf') : t('adminPayroll.downloadPdf')}
            </button>
          </div>
        </div>

        {/* Hint cuando hay fijos pendientes */}
        {!loading && fixedPending.length > 0 && (
          <p className="text-slate-500 text-xs mt-3 border-t border-white/5 pt-3">
            {fixedPending.length} empleado{fixedPending.length > 1 ? 's' : ''} con sueldo fijo pendiente{fixedPending.length > 1 ? 's' : ''} de agregar esta semana:
            {' '}<span className="text-slate-400">{fixedPending.map(e => e.full_name).join(', ')}</span>
          </p>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-500">{t('common.loading')}</div>
      ) : admins.length === 0 ? (
        <div className="bg-slate-900/60 border border-white/5 rounded-xl p-12 text-center">
          <p className="text-slate-500 mb-2">{t('adminPayroll.noAdmins')}</p>
          <a href="/mecanicos" className="text-amber-400 hover:text-amber-300 text-sm">{t('adminPayroll.goToStaff')}</a>
        </div>
      ) : (
        <div className="space-y-3">
          {admins.map(emp => {
            const f = formByEmp[emp.id] ?? { amount: '', hours: '', description: '', saving: false };
            const empEntries = entriesForEmp(emp.id);
            const empTotal = totalForEmp(emp.id);
            const empDeds = deductionsByEmp[emp.id] ?? [];
            const empDedTotal = empDeds.reduce((s, d) => s + d.amount, 0);
            const empNet = empTotal - empDedTotal;
            const isFixed = emp.payment_type === 'fixed_weekly';
            const isHourly = emp.payment_type === 'hourly';
            const hasEntryThisWeek = empEntries.length > 0;
            const isEditingSalary = editingSalary === emp.id;

            return (
              <div key={emp.id} className={`bg-slate-900/60 border rounded-xl overflow-hidden transition ${
                hasEntryThisWeek && isFixed ? 'border-green-500/20' : 'border-white/5'
              }`}>
                {/* Header del empleado */}
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/5">
                  <div className="flex items-center gap-3">
                    {/* Indicador de estado */}
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                      hasEntryThisWeek ? 'bg-green-400' : isFixed ? 'bg-amber-400/60' : 'bg-slate-600'
                    }`} />
                    <div>
                      <p className="display-font text-slate-200 font-semibold tracking-wide">{emp.full_name}</p>

                      {/* Tipo de pago + salario (editable) */}
                      <div className="flex items-center gap-2 mt-0.5">
                        {isFixed && !isEditingSalary && (
                          <span className="text-slate-500 text-xs">
                            Sueldo fijo:{' '}
                            <span className="text-amber-400 font-semibold">{fmtMoney(Number(emp.weekly_salary ?? 0))}/sem</span>
                          </span>
                        )}
                        {isHourly && (
                          <span className="text-slate-500 text-xs">
                            Por hora · {fmtMoney(Number(emp.hourly_rate ?? 0))}/h
                          </span>
                        )}
                        {!isFixed && !isHourly && (
                          <span className="text-slate-500 text-xs">Manual</span>
                        )}

                        {/* Botón editar salario (solo fijo) */}
                        {isFixed && !isEditingSalary && (
                          <button
                            onClick={() => { setEditingSalary(emp.id); setSalaryInput(String(emp.weekly_salary ?? '')); }}
                            className="text-slate-600 hover:text-amber-400 transition text-xs flex items-center gap-0.5"
                            title="Cambiar salario"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-1.414.586H9v-1.414a2 2 0 01.586-1.414z" />
                            </svg>
                            editar
                          </button>
                        )}

                        {/* Editar salario inline */}
                        {isEditingSalary && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-amber-400 text-xs">$</span>
                            <input
                              type="number" min="0" step="0.01"
                              value={salaryInput}
                              onChange={e => setSalaryInput(e.target.value)}
                              className="w-24 bg-slate-800 border border-amber-400/40 rounded px-2 py-0.5 text-slate-100 text-xs focus:outline-none"
                              autoFocus
                            />
                            <button
                              onClick={() => handleSaveSalary(emp)}
                              disabled={savingSalary}
                              className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-bold px-2 py-0.5 rounded transition"
                            >
                              {savingSalary ? '...' : 'OK'}
                            </button>
                            <button onClick={() => setEditingSalary(null)} className="text-slate-500 hover:text-slate-300 text-xs px-1">✕</button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    {empDedTotal > 0 ? (
                      <>
                        <p className="text-slate-500 text-xs line-through">{fmtMoney(empTotal)}</p>
                        <p className="text-red-400 text-xs">-{fmtMoney(empDedTotal)}</p>
                        <p className="display-font font-bold text-lg text-green-400">{fmtMoney(empNet)}</p>
                        {empDeds.map((d, i) => (
                          <p key={i} className="text-red-400/60 text-xs">↓ {d.desc}</p>
                        ))}
                      </>
                    ) : (
                      <>
                        <p className={`display-font font-bold text-lg ${hasEntryThisWeek ? 'text-green-400' : 'text-slate-600'}`}>
                          {fmtMoney(empTotal)}
                        </p>
                        {hasEntryThisWeek && (
                          <p className="text-green-500/60 text-xs">✓ Esta semana</p>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Entradas existentes */}
                {empEntries.length > 0 && (
                  <div className="px-5 py-2 border-b border-white/5 bg-green-500/3">
                    {empEntries.map(en => (
                      <div key={en.id} className="flex items-center justify-between text-sm py-1.5">
                        <span className="text-slate-400 text-xs">
                          {fmtDate(en.work_date)}
                          {en.hours_worked != null ? ` · ${en.hours_worked}h` : ''}
                          {en.description ? ` · ${en.description}` : ''}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="text-green-400 font-medium text-sm">{fmtMoney(Number(en.amount))}</span>
                          <button onClick={() => handleDelete(en.id)}
                            className="text-slate-600 hover:text-red-400 transition p-1 rounded hover:bg-red-500/10"
                            title={t('common.delete')}>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Formulario para agregar entrada */}
                <div className="px-5 py-3 flex items-end gap-3 flex-wrap">
                  {/* Fijo: solo muestra el formulario si aún no tiene pago esta semana */}
                  {isFixed && !hasEntryThisWeek && (
                    <>
                      <div className="flex-1 min-w-32">
                        <label className="block text-slate-500 text-xs mb-1">Monto</label>
                        <input type="text" disabled value={fmtMoney(fixedPayForEmp(emp).amount)}
                          className="w-full bg-slate-800/40 border border-white/5 rounded-lg px-3 py-2 text-slate-400 text-sm" />
                        {fixedPayForEmp(emp).absent > 0 && (
                          <p className="text-amber-400/80 text-[11px] mt-1">
                            {fixedPayForEmp(emp).present}/{fixedPayForEmp(emp).workDays} {t('attendance.daysWorkedShort')} · {fixedPayForEmp(emp).absent} {t('attendance.absencesShort')}
                          </p>
                        )}
                      </div>
                      <div className="flex-1 min-w-40">
                        <label className="block text-slate-500 text-xs mb-1">{t('adminPayroll.note')} (opcional)</label>
                        <input type="text" value={f.description}
                          onChange={e => setForm(emp.id, { description: e.target.value })}
                          placeholder={t('adminPayroll.notePlaceholder')}
                          className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-amber-400/50" />
                      </div>
                      <button onClick={() => handleAdd(emp)} disabled={f.saving}
                        className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold py-2 px-4 rounded-lg text-sm transition display-font">
                        {f.saving ? t('common.saving') : t('adminPayroll.add')}
                      </button>
                    </>
                  )}

                  {/* Por horas */}
                  {isHourly && (
                    <>
                      <div>
                        <label className="block text-slate-500 text-xs mb-1">{t('adminPayroll.hours')}</label>
                        <input type="number" min="0" step="0.25" value={f.hours}
                          onChange={e => setForm(emp.id, { hours: e.target.value })}
                          placeholder="40"
                          className="w-24 bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-amber-400/50" />
                      </div>
                      <div className="text-slate-500 text-xs self-center mt-4">
                        × {fmtMoney(Number(emp.hourly_rate ?? 0))}/h ={' '}
                        <span className="text-amber-400 font-semibold">
                          {fmtMoney((Number(f.hours || 0)) * Number(emp.hourly_rate ?? 0))}
                        </span>
                      </div>
                      <div className="flex-1 min-w-40">
                        <label className="block text-slate-500 text-xs mb-1">{t('adminPayroll.note')}</label>
                        <input type="text" value={f.description}
                          onChange={e => setForm(emp.id, { description: e.target.value })}
                          placeholder={t('adminPayroll.notePlaceholder')}
                          className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-amber-400/50" />
                      </div>
                      <button onClick={() => handleAdd(emp)} disabled={f.saving}
                        className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold py-2 px-4 rounded-lg text-sm transition">
                        {f.saving ? t('common.saving') : t('adminPayroll.add')}
                      </button>
                    </>
                  )}

                  {/* Manual */}
                  {!isFixed && !isHourly && (
                    <>
                      <div>
                        <label className="block text-slate-500 text-xs mb-1">{t('adminPayroll.amount')}</label>
                        <div className="relative w-32">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-400 text-sm font-bold">$</span>
                          <input type="number" min="0" step="0.01" value={f.amount}
                            onChange={e => setForm(emp.id, { amount: e.target.value })}
                            placeholder="0.00"
                            className="w-full bg-slate-800 border border-white/10 rounded-lg pl-7 pr-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-amber-400/50" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-40">
                        <label className="block text-slate-500 text-xs mb-1">{t('adminPayroll.note')}</label>
                        <input type="text" value={f.description}
                          onChange={e => setForm(emp.id, { description: e.target.value })}
                          placeholder={t('adminPayroll.notePlaceholder')}
                          className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-amber-400/50" />
                      </div>
                      <button onClick={() => handleAdd(emp)} disabled={f.saving}
                        className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold py-2 px-4 rounded-lg text-sm transition">
                        {f.saving ? t('common.saving') : t('adminPayroll.add')}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
