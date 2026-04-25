'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useLanguage } from '@/contexts/LanguageContext';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface AdminEmployee {
  id: string;
  full_name: string;
  payment_type: string;
  weekly_salary: number | null;
  hourly_rate: number | null;
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

function getWeekRange(offsetWeeks = 0) {
  const now = new Date();
  const day = now.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMon + offsetWeeks * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday.toISOString().split('T')[0],
    end: sunday.toISOString().split('T')[0],
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
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState<boolean | null>(null);

  // Restrict access: only owner + super admin can manage admin payroll.
  useEffect(() => {
    (async () => {
      let role = '';
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const j = await res.json();
          role = (j?.user?.role ?? '').toLowerCase();
        }
      } catch {}
      if (!role) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data } = await (supabase as any)
              .from('profiles').select('role').eq('id', user.id).single();
            role = ((data as any)?.role ?? '').toLowerCase();
          }
        } catch {}
      }
      setAllowed(role === 'super_user' || role === 'super_admin' || role === 'owner');
    })();
  }, []);

  // Form state per-employee (keyed by employee id)
  const [formByEmp, setFormByEmp] = useState<Record<string, { amount: string; hours: string; description: string; saving: boolean }>>({});

  function setForm(empId: string, patch: Partial<{ amount: string; hours: string; description: string; saving: boolean }>) {
    setFormByEmp(prev => ({
      ...prev,
      [empId]: { amount: '', hours: '', description: '', saving: false, ...prev[empId], ...patch },
    }));
  }

  const fmtMoney = (n: number) => '$' + n.toLocaleString(locale, { minimumFractionDigits: 2 });

  async function load() {
    setLoading(true);

    // Admin staff = anyone NOT on mechanic_commission
    const { data: empData } = await (supabase as any)
      .from('employees')
      .select('id, full_name, payment_type, weekly_salary, hourly_rate')
      .neq('payment_type', 'mechanic_commission')
      .order('full_name');
    const adminList = (empData ?? []) as AdminEmployee[];
    setAdmins(adminList);

    // Existing admin entries this week
    const { data: entryData } = await (supabase as any)
      .from('earned_entries')
      .select('id, employee_id, amount, hours_worked, description, work_date, week_start, week_end, entry_type')
      .gte('work_date', weekStart)
      .lte('work_date', weekEnd)
      .in('entry_type', ['admin_fixed', 'admin_hourly', 'admin_manual']);

    setEntries((entryData ?? []) as AdminEntry[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, [weekStart, weekEnd]);

  function entryTypeForEmployee(emp: AdminEmployee): 'admin_fixed' | 'admin_hourly' | 'admin_manual' {
    if (emp.payment_type === 'fixed_weekly') return 'admin_fixed';
    if (emp.payment_type === 'hourly') return 'admin_hourly';
    return 'admin_manual';
  }

  async function handleAdd(emp: AdminEmployee) {
    const f = formByEmp[emp.id] ?? { amount: '', hours: '', description: '', saving: false };
    let amount = 0;
    let hours: number | null = null;

    if (emp.payment_type === 'fixed_weekly') {
      amount = Number(emp.weekly_salary ?? 0);
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
      work_date: weekEnd, // use week end as the entry date
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
    const { error } = await (supabase as any).from('earned_entries').delete().eq('id', entryId);
    if (error) { alert(error.message); return; }
    load();
  }

  function entriesForEmp(empId: string) {
    return entries.filter(e => e.employee_id === empId);
  }

  function totalForEmp(empId: string) {
    return entriesForEmp(empId).reduce((s, e) => s + Number(e.amount), 0);
  }

  const grandTotal = entries.reduce((s, e) => s + Number(e.amount), 0);

  const [generatingPdf, setGeneratingPdf] = useState(false);

  function generatePdf() {
    setGeneratingPdf(true);
    try {
      // Same ink-friendly style as the rest of the system: black text on white,
      // thin grey rules, no fills, no bold.
      const INK = 30;
      const SOFT = 110;
      const LINE = 170;

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
      const pageW = doc.internal.pageSize.getWidth();
      const margin = 15;

      // Header
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(INK, INK, INK);
      doc.text('ADVANCE TRUCK REPAIR', margin, 14);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(SOFT, SOFT, SOFT);
      doc.text(t('adminPayroll.title'), margin, 20);

      const issued = new Date().toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric' });
      doc.text(`${t('pdf.header.issued')}: ${issued}`, pageW - margin, 20, { align: 'right' });

      doc.setDrawColor(LINE, LINE, LINE);
      doc.setLineWidth(0.2);
      doc.line(margin, 24, pageW - margin, 24);

      // Period + total
      doc.setFontSize(11);
      doc.setTextColor(INK, INK, INK);
      doc.text(t('weeklyCut.cutWeek') + ': ' + formatFecha(weekStart) + ' — ' + formatFecha(weekEnd), margin, 32);

      doc.setFontSize(9);
      doc.setTextColor(SOFT, SOFT, SOFT);
      doc.text(t('adminPayroll.totalToPay') + ':', margin, 40);
      doc.setTextColor(INK, INK, INK);
      doc.text(fmtMoney(grandTotal), margin + 70, 40);

      let y = 48;

      // Per-employee section
      for (const emp of admins) {
        const empEntries = entriesForEmp(emp.id);
        if (empEntries.length === 0) continue;

        if (y > 230) { doc.addPage(); y = 20; }

        // Employee heading
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(INK, INK, INK);
        doc.text(emp.full_name.toUpperCase(), margin, y + 4);

        // Payment-type meta
        doc.setFontSize(8);
        doc.setTextColor(SOFT, SOFT, SOFT);
        let meta = '';
        if (emp.payment_type === 'fixed_weekly') meta = `${t('staff.payment.fixedWeekly')} · ${fmtMoney(Number(emp.weekly_salary ?? 0))}/sem`;
        else if (emp.payment_type === 'hourly') meta = `${t('staff.payment.hourly')} · ${fmtMoney(Number(emp.hourly_rate ?? 0))}/h`;
        else meta = t('staff.payment.manual');
        doc.text(meta, margin, y + 9);

        // Total
        doc.setFontSize(10);
        doc.setTextColor(INK, INK, INK);
        doc.text(fmtMoney(totalForEmp(emp.id)), pageW - margin, y + 4, { align: 'right' });

        doc.setDrawColor(LINE, LINE, LINE);
        doc.setLineWidth(0.2);
        doc.line(margin, y + 11, pageW - margin, y + 11);
        y += 14;

        autoTable(doc, {
          startY: y,
          margin: { left: margin, right: margin },
          theme: 'plain',
          head: [[t('common.date'), t('adminPayroll.hours'), t('adminPayroll.note'), t('adminPayroll.amount')]],
          body: empEntries.map((en) => [
            new Date(en.work_date + 'T12:00:00').toLocaleDateString(locale),
            en.hours_worked != null ? String(en.hours_worked) : '—',
            en.description ?? '—',
            fmtMoney(Number(en.amount)),
          ]),
          styles: {
            fontSize: 9,
            textColor: [INK, INK, INK] as [number, number, number],
            cellPadding: { top: 2.2, right: 3, bottom: 2.2, left: 3 },
            lineColor: [LINE, LINE, LINE] as [number, number, number],
            lineWidth: 0.15,
          },
          headStyles: {
            fillColor: [255, 255, 255] as [number, number, number],
            textColor: [INK, INK, INK] as [number, number, number],
            fontStyle: 'normal' as const,
            fontSize: 9,
          },
          columnStyles: {
            1: { halign: 'center', cellWidth: 20 },
            3: { halign: 'right', cellWidth: 35 },
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

        y = ((doc as any).lastAutoTable?.finalY ?? y + 16) + 10;
      }

      // Footer with grand total
      if (y > 250) { doc.addPage(); y = 20; }
      doc.setDrawColor(LINE, LINE, LINE);
      doc.setLineWidth(0.3);
      doc.line(margin, y, pageW - margin, y);
      y += 7;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(INK, INK, INK);
      doc.text(t('adminPayroll.totalToPay'), margin, y);
      doc.text(fmtMoney(grandTotal), pageW - margin, y, { align: 'right' });

      // Page numbers
      const pages = doc.getNumberOfPages();
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(SOFT, SOFT, SOFT);
        doc.text(`${i} / ${pages}`, pageW / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' });
      }

      doc.save(`nomina_admin_${weekStart}_${weekEnd}.pdf`);
    } finally {
      setGeneratingPdf(false);
    }
  }

  function shiftWeek(weeks: number) {
    const r = getWeekRange(0);
    const baseStart = new Date(weekStart + 'T12:00:00');
    baseStart.setDate(baseStart.getDate() + weeks * 7);
    const newStart = baseStart.toISOString().split('T')[0];
    const baseEnd = new Date(weekEnd + 'T12:00:00');
    baseEnd.setDate(baseEnd.getDate() + weeks * 7);
    const newEnd = baseEnd.toISOString().split('T')[0];
    setWeekStart(newStart);
    setWeekEnd(newEnd);
  }

  const formatFecha = (d: string) =>
    new Date(d + 'T12:00:00').toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });

  if (allowed === null) {
    return <div className="text-center py-12 text-slate-500">{t('common.loading')}</div>;
  }

  if (!allowed) {
    return (
      <div className="max-w-2xl mx-auto bg-red-500/10 border border-red-500/30 rounded-xl p-8 text-center">
        <h2 className="display-font text-red-400 font-bold text-xl mb-2">{t('adminPayroll.notAllowedTitle')}</h2>
        <p className="text-slate-400 text-sm">{t('adminPayroll.notAllowedMsg')}</p>
      </div>
    );
  }

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

      {/* Summary */}
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-5 mb-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-slate-400 text-sm mb-1">{t('adminPayroll.totalToPay')}</p>
          <p className="display-font text-2xl font-bold text-amber-400">{fmtMoney(grandTotal)}</p>
        </div>
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

      {loading ? (
        <div className="text-center py-12 text-slate-500">{t('common.loading')}</div>
      ) : admins.length === 0 ? (
        <div className="bg-slate-900/60 border border-white/5 rounded-xl p-12 text-center">
          <p className="text-slate-500 mb-2">{t('adminPayroll.noAdmins')}</p>
          <a href="/mecanicos" className="text-amber-400 hover:text-amber-300 text-sm">
            {t('adminPayroll.goToStaff')}
          </a>
        </div>
      ) : (
        <div className="space-y-4">
          {admins.map(emp => {
            const f = formByEmp[emp.id] ?? { amount: '', hours: '', description: '', saving: false };
            const empEntries = entriesForEmp(emp.id);
            const empTotal = totalForEmp(emp.id);

            return (
              <div key={emp.id} className="bg-slate-900/60 border border-white/5 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 bg-white/2">
                  <div>
                    <p className="display-font text-slate-200 font-semibold tracking-wide">{emp.full_name}</p>
                    <p className="text-slate-500 text-xs">
                      {emp.payment_type === 'fixed_weekly' && `${t('staff.payment.fixedWeekly')} · ${fmtMoney(Number(emp.weekly_salary ?? 0))}/sem`}
                      {emp.payment_type === 'hourly' && `${t('staff.payment.hourly')} · ${fmtMoney(Number(emp.hourly_rate ?? 0))}/h`}
                      {emp.payment_type === 'manual' && t('staff.payment.manual')}
                    </p>
                  </div>
                  <p className="display-font text-emerald-400 font-bold text-lg">{fmtMoney(empTotal)}</p>
                </div>

                {/* Existing entries */}
                {empEntries.length > 0 && (
                  <div className="px-5 py-2 border-b border-white/5">
                    {empEntries.map(en => (
                      <div key={en.id} className="flex items-center justify-between text-sm py-1.5">
                        <span className="text-slate-400 text-xs">
                          {new Date(en.work_date + 'T12:00:00').toLocaleDateString(locale)}
                          {en.hours_worked != null ? ` · ${en.hours_worked}h` : ''}
                          {en.description ? ` · ${en.description}` : ''}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="text-emerald-400 font-medium">{fmtMoney(Number(en.amount))}</span>
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

                {/* Add new entry */}
                <div className="px-5 py-3 flex items-end gap-3 flex-wrap">
                  {emp.payment_type === 'fixed_weekly' && (
                    <div className="flex-1 min-w-40">
                      <label className="block text-slate-500 text-xs mb-1">{t('adminPayroll.amount')}</label>
                      <input type="text" disabled value={fmtMoney(Number(emp.weekly_salary ?? 0))}
                        className="w-full bg-slate-800/50 border border-white/10 rounded-lg px-3 py-2 text-slate-300 text-sm" />
                    </div>
                  )}
                  {emp.payment_type === 'hourly' && (
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
                    </>
                  )}
                  {emp.payment_type === 'manual' && (
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
                  )}

                  <div className="flex-1 min-w-40">
                    <label className="block text-slate-500 text-xs mb-1">{t('adminPayroll.note')}</label>
                    <input type="text" value={f.description}
                      onChange={e => setForm(emp.id, { description: e.target.value })}
                      placeholder={t('adminPayroll.notePlaceholder')}
                      className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-amber-400/50" />
                  </div>

                  <button onClick={() => handleAdd(emp)} disabled={f.saving}
                    className="bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/50 text-slate-950 font-bold py-2 px-4 rounded-lg text-sm transition">
                    {f.saving ? t('common.saving') : t('adminPayroll.add')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
