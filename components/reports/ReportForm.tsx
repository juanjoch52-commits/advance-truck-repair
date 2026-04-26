'use client';

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

export interface Employee {
  id: string;
  full_name: string;
}

export interface MechanicAssignment {
  id: string;
  employee_id: string;
  commission_percentage: string;
}

export interface ReportTask {
  id: string;
  description: string;
  amount_charged_to_client: string;
  mechanics: MechanicAssignment[];
}

export interface ReportFormData {
  externalOrderNumber: string;
  truckNumber: string;
  company: string;
  workDate: string;
  notes: string;
  tasks: ReportTask[];
}

interface Props {
  mode: 'create' | 'edit';
  initialData: ReportFormData;
  employees: Employee[];
  onSubmit: (data: ReportFormData) => Promise<{ ok: boolean; error?: string }>;
  title: string;
  backHref?: string;
  submitLabel: string;
  submitLabelLoading: string;
  successMessage: string;
  /** ID del reporte actual (edit mode) para excluirse del chequeo de duplicados */
  reportId?: string;
}

export function uid() {
  return Math.random().toString(36).slice(2);
}

export function newTask(defaultPct = 50): ReportTask {
  return {
    id: uid(),
    description: '',
    amount_charged_to_client: '',
    mechanics: [{ id: uid(), employee_id: '', commission_percentage: String(defaultPct) }],
  };
}

// Soft warning above this (asks for confirmation), hard cap at 100% of amount charged.
const SOFT_WARNING_PCT = 50;
const HARD_CAP_PCT = 100;

export default function ReportForm({
  mode,
  initialData,
  employees,
  onSubmit,
  title,
  backHref = '/ordenes',
  submitLabel,
  submitLabelLoading,
  successMessage,
  reportId,
}: Props) {
  const { t } = useLanguage();

  const [externalOrderNumber, setExternalOrderNumber] = useState(initialData.externalOrderNumber);
  const [truckNumber, setTruckNumber] = useState(initialData.truckNumber);
  const [company, setCompany] = useState(initialData.company);
  const [workDate, setWorkDate] = useState(initialData.workDate);
  const [notes, setNotes] = useState(initialData.notes);
  const [tasks, setTasks] = useState<ReportTask[]>(initialData.tasks);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [confirmHighCommission, setConfirmHighCommission] = useState(false);

  // ─── Task helpers ─────────────────────────────────────────────────────────
  function addTask() {
    setTasks(prev => [...prev, newTask(SOFT_WARNING_PCT)]);
  }
  function removeTask(taskId: string) {
    setTasks(prev => prev.filter(t => t.id !== taskId));
  }
  function updateTask(taskId: string, field: 'description' | 'amount_charged_to_client', value: string) {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, [field]: value } : t));
  }

  function addMechanic(taskId: string) {
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      const usedPct = t.mechanics.reduce((s, m) => s + (parseFloat(m.commission_percentage) || 0), 0);
      const remaining = Math.max(0, HARD_CAP_PCT - usedPct);
      return {
        ...t,
        mechanics: [...t.mechanics, { id: uid(), employee_id: '', commission_percentage: String(Math.min(remaining, SOFT_WARNING_PCT)) }],
      };
    }));
  }
  function removeMechanic(taskId: string, mechId: string) {
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, mechanics: t.mechanics.filter(m => m.id !== mechId) } : t
    ));
  }
  function updateMechanic(taskId: string, mechId: string, field: keyof MechanicAssignment, value: string) {
    setTasks(prev => prev.map(t =>
      t.id === taskId
        ? { ...t, mechanics: t.mechanics.map(m => m.id === mechId ? { ...m, [field]: value } : m) }
        : t
    ));
  }

  // ─── Calculations ─────────────────────────────────────────────────────────
  function totalCommissionPct(task: ReportTask) {
    return task.mechanics.reduce((s, m) => s + (parseFloat(m.commission_percentage) || 0), 0);
  }
  function mechanicPayout(amount: string, pct: string) {
    const a = parseFloat(amount) || 0;
    const p = parseFloat(pct) || 0;
    return (a * p) / 100;
  }
  function taskProfit(task: ReportTask) {
    const amount = parseFloat(task.amount_charged_to_client) || 0;
    const totalPayout = task.mechanics.reduce(
      (s, m) => s + mechanicPayout(task.amount_charged_to_client, m.commission_percentage), 0
    );
    return amount - totalPayout;
  }

  // ─── Validation ───────────────────────────────────────────────────────────
  function validate(): string | null {
    if (!truckNumber.trim()) return t('newReport.errors.truckRequired');
    if (!company.trim()) return t('newReport.errors.companyRequired');
    if (tasks.length === 0) return t('newReport.errors.atLeastOneTask');

    for (const task of tasks) {
      if (!task.description.trim()) return t('newReport.errors.taskDescRequired');
      if ((parseFloat(task.amount_charged_to_client) || 0) <= 0) return t('newReport.errors.taskAmountRequired');
      if (task.mechanics.length === 0) return t('newReport.errors.atLeastOneMechanic');
      // Hard cap: total commission cannot exceed 100% of the amount charged
      if (totalCommissionPct(task) > HARD_CAP_PCT) return t('newReport.errors.commissionExceedsHardCap');
      for (const m of task.mechanics) {
        if (!m.employee_id) return t('newReport.errors.mechanicRequired');
        if ((parseFloat(m.commission_percentage) || 0) <= 0) return t('newReport.errors.commissionRequired');
      }
    }
    return null;
  }

  function tasksOverWarning(): number[] {
    return tasks
      .map((task, i) => totalCommissionPct(task) > SOFT_WARNING_PCT ? i + 1 : -1)
      .filter(i => i > 0);
  }

  // ─── Submit ───────────────────────────────────────────────────────────────
  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const err = validate();
    if (err) { setError(err); return; }

    // If any task exceeds 50%, ask for confirmation first
    if (tasksOverWarning().length > 0 && !confirmHighCommission) {
      setConfirmHighCommission(true);
      return;
    }

    await doSubmit();
  }

  async function doSubmit() {
    setConfirmHighCommission(false);
    setLoading(true);

    const result = await onSubmit({
      externalOrderNumber,
      truckNumber,
      company,
      workDate,
      notes,
      tasks,
    });

    if (!result.ok) {
      setError(result.error ?? 'Error');
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  }

  const grandTotalCharged = tasks.reduce((s, ttask) => s + (parseFloat(ttask.amount_charged_to_client) || 0), 0);
  const grandTotalPayout = tasks.reduce((s, task) =>
    s + task.mechanics.reduce((ms, m) => ms + mechanicPayout(task.amount_charged_to_client, m.commission_percentage), 0), 0
  );
  const grandTotalProfit = grandTotalCharged - grandTotalPayout;

  const fmt = (n: number) => '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (success) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="display-font text-xl text-emerald-400">{successMessage}</p>
          <p className="text-slate-400 text-sm mt-1">{t('newReport.successSub')}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <a href={backHref} className="text-slate-500 hover:text-slate-300 text-sm flex items-center gap-1 mb-3">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t('newReport.back')}
        </a>
        <h1 className="display-font text-3xl font-bold text-slate-100 tracking-wide">{title}</h1>
      </div>

      <form onSubmit={handleFormSubmit} className="space-y-6 max-w-4xl">
        {/* ─── Header ─── */}
        <div className="bg-slate-900/60 border border-white/5 rounded-xl p-6">
          <h2 className="display-font text-slate-300 font-semibold mb-5 tracking-wide text-lg">
            {t('newReport.header.sectionTitle')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-400 text-sm mb-2">{t('newReport.header.orderNumber')}</label>
              <input type="text" value={externalOrderNumber} onChange={e => setExternalOrderNumber(e.target.value)}
                placeholder={t('newReport.header.orderNumberPlaceholder')}
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/50 transition" />
            </div>
            <div>
              <label className="block text-slate-400 text-sm mb-2">{t('newReport.header.truck')}</label>
              <input type="text" required value={truckNumber} onChange={e => setTruckNumber(e.target.value)}
                placeholder={t('newReport.header.truckPlaceholder')}
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/50 transition" />
            </div>
            <div>
              <label className="block text-slate-400 text-sm mb-2">{t('newReport.header.company')}</label>
              <input type="text" required value={company} onChange={e => setCompany(e.target.value)}
                placeholder={t('newReport.header.companyPlaceholder')}
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/50 transition" />
            </div>
            <div>
              <label className="block text-slate-400 text-sm mb-2">{t('newReport.header.date')}</label>
              <input type="date" required value={workDate} onChange={e => setWorkDate(e.target.value)}
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 focus:outline-none focus:border-amber-400/50 transition" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-slate-400 text-sm mb-2">{t('newReport.header.notes')}</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                placeholder={t('newReport.header.notesPlaceholder')}
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/50 transition resize-none" />
            </div>
          </div>
        </div>

        {/* ─── Tasks ─── */}
        <div className="bg-slate-900/60 border border-white/5 rounded-xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="display-font text-slate-300 font-semibold tracking-wide text-lg">
              {t('newReport.tasks.sectionTitle')}
            </h2>
            <button type="button" onClick={addTask}
              className="text-amber-400 hover:text-amber-300 text-sm flex items-center gap-1.5 border border-amber-500/30 hover:border-amber-400/50 rounded-lg px-3 py-1.5 transition">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {t('newReport.tasks.addTask')}
            </button>
          </div>

          <div className="space-y-4">
            {tasks.map((task, taskIdx) => {
              const amount = parseFloat(task.amount_charged_to_client) || 0;
              const profit = taskProfit(task);
              const usedPct = totalCommissionPct(task);
              const overWarning = usedPct > SOFT_WARNING_PCT;
              const overHardCap = usedPct > HARD_CAP_PCT;

              return (
                <div key={task.id} className={`border rounded-xl bg-slate-800/40 overflow-hidden ${overHardCap ? 'border-red-500/40' : overWarning ? 'border-amber-500/40' : 'border-white/8'}`}>
                  <div className="flex items-center justify-between px-4 py-2.5 bg-slate-800/60 border-b border-white/5">
                    <span className="display-font text-slate-400 text-xs tracking-widest">
                      {t('newReport.tasks.task').toUpperCase()} {taskIdx + 1}
                    </span>
                    {tasks.length > 1 && (
                      <button type="button" onClick={() => removeTask(task.id)}
                        className="text-slate-600 hover:text-red-400 transition text-xs flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        {t('newReport.tasks.removeTask')}
                      </button>
                    )}
                  </div>

                  <div className="p-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="md:col-span-2">
                        <label className="block text-slate-500 text-xs mb-1.5">{t('newReport.tasks.description')}</label>
                        <input type="text" required
                          value={task.description}
                          onChange={e => updateTask(task.id, 'description', e.target.value)}
                          placeholder={t('newReport.tasks.descriptionPlaceholder')}
                          className="w-full bg-slate-700/60 border border-white/10 rounded-lg px-3 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/50 text-sm transition" />
                      </div>
                      <div>
                        <label className="block text-slate-500 text-xs mb-1.5">{t('newReport.tasks.amountCharged')}</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-400 text-sm font-bold">$</span>
                          <input type="number" min="0" step="0.01" required
                            value={task.amount_charged_to_client}
                            onChange={e => updateTask(task.id, 'amount_charged_to_client', e.target.value)}
                            placeholder="0.00"
                            className="w-full bg-slate-700/60 border border-amber-500/20 rounded-lg pl-7 pr-3 py-2.5 text-amber-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/60 text-sm transition" />
                        </div>
                      </div>
                    </div>

                    {/* Commission progress */}
                    {task.mechanics.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-slate-600 text-xs">
                            {t('newReport.tasks.commissionUsed')}:{' '}
                            <span className={overHardCap ? 'text-red-400 font-bold' : overWarning ? 'text-amber-400 font-bold' : 'text-slate-400'}>
                              {usedPct.toFixed(1)}%
                            </span>
                          </span>
                          {amount > 0 && (
                            <span className="text-xs text-slate-500">
                              {t('newReport.tasks.shopShare')}:{' '}
                              <span className={profit >= 0 ? 'text-emerald-400 font-medium' : 'text-red-400 font-medium'}>
                                {(100 - usedPct).toFixed(1)}%
                              </span>
                            </span>
                          )}
                        </div>
                        <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${overHardCap ? 'bg-red-500' : overWarning ? 'bg-amber-500' : 'bg-emerald-500'}`}
                            style={{ width: `${Math.min(100, usedPct)}%` }}
                          />
                        </div>
                        {overHardCap && (
                          <p className="text-red-400 text-xs mt-1">{t('newReport.errors.commissionExceedsHardCap')}</p>
                        )}
                        {!overHardCap && overWarning && (
                          <p className="text-amber-400/80 text-xs mt-1">{t('newReport.tasks.warnOver50')}</p>
                        )}
                      </div>
                    )}

                    {/* Mechanics */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-slate-500 text-xs">{t('newReport.tasks.mechanicsTitle')}</label>
                        <button type="button" onClick={() => addMechanic(task.id)}
                          disabled={usedPct >= HARD_CAP_PCT}
                          className="text-sky-400 hover:text-sky-300 text-xs flex items-center gap-1 border border-sky-500/20 hover:border-sky-400/30 rounded px-2 py-1 transition disabled:opacity-40 disabled:cursor-not-allowed">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          {t('newReport.tasks.addMechanic')}
                        </button>
                      </div>

                      <div className="space-y-2">
                        {task.mechanics.map((m) => {
                          const payout = mechanicPayout(task.amount_charged_to_client, m.commission_percentage);
                          return (
                            <div key={m.id} className="flex items-center gap-2 bg-slate-700/30 rounded-lg px-3 py-2">
                              <select required value={m.employee_id}
                                onChange={e => updateMechanic(task.id, m.id, 'employee_id', e.target.value)}
                                className="flex-1 bg-slate-700 border border-white/10 rounded-lg px-2 py-1.5 text-slate-100 focus:outline-none focus:border-amber-400/50 text-sm transition">
                                <option value="">{t('newReport.tasks.selectMechanic')}</option>
                                {employees.map(emp => (
                                  <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                                ))}
                              </select>

                              <div className="relative w-24">
                                <input type="number" min="0.1" max={HARD_CAP_PCT} step="0.1" required
                                  value={m.commission_percentage}
                                  onChange={e => updateMechanic(task.id, m.id, 'commission_percentage', e.target.value)}
                                  placeholder="25"
                                  className={`w-full border rounded-lg px-2 pr-6 py-1.5 text-slate-100 focus:outline-none text-sm transition ${
                                    overHardCap ? 'bg-red-900/20 border-red-500/40 focus:border-red-400/60'
                                    : overWarning ? 'bg-amber-900/10 border-amber-500/30 focus:border-amber-400/60'
                                    : 'bg-slate-700 border-white/10 focus:border-amber-400/50'
                                  }`} />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 text-xs">%</span>
                              </div>

                              <div className="w-28 text-right">
                                <span className="text-xs text-slate-500">{t('newReport.tasks.payout')}: </span>
                                <span className="text-sm font-semibold text-emerald-400">{fmt(payout)}</span>
                              </div>

                              {task.mechanics.length > 1 && (
                                <button type="button" onClick={() => removeMechanic(task.id, m.id)}
                                  className="text-slate-600 hover:text-red-400 transition p-1 flex-shrink-0">
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {amount > 0 && (
                      <div className="flex justify-end">
                        <div className="text-right">
                          <p className="text-slate-600 text-xs">{t('newReport.tasks.companyProfit')}</p>
                          <p className={`text-sm font-semibold ${profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {fmt(profit)}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ─── Summary ─── */}
        {grandTotalCharged > 0 && (
          <div className="bg-slate-900/60 border border-white/5 rounded-xl p-6">
            <h2 className="display-font text-slate-300 font-semibold mb-4 tracking-wide text-lg">
              {t('newReport.summary.title')}
            </h2>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-slate-800/60 rounded-xl p-4">
                <p className="text-slate-500 text-xs mb-1">{t('newReport.summary.totalCharged')}</p>
                <p className="display-font text-xl font-bold text-slate-100">{fmt(grandTotalCharged)}</p>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                <p className="text-slate-500 text-xs mb-1">{t('newReport.summary.totalMechanicPayout')}</p>
                <p className="display-font text-xl font-bold text-amber-400">{fmt(grandTotalPayout)}</p>
              </div>
              <div className={`rounded-xl p-4 ${grandTotalProfit >= 0 ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                <p className="text-slate-500 text-xs mb-1">{t('newReport.summary.totalCompanyProfit')}</p>
                <p className={`display-font text-xl font-bold ${grandTotalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(grandTotalProfit)}</p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button type="submit" disabled={loading}
            className="bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/50 text-slate-950 font-bold py-3 px-8 rounded-lg transition-all display-font tracking-wide">
            {loading ? submitLabelLoading : submitLabel}
          </button>
          <a href={backHref}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-3 px-6 rounded-lg transition-all text-sm flex items-center">
            {t('newReport.cancel')}
          </a>
        </div>
      </form>

      {/* ─── High-commission confirm modal ─── */}
      {confirmHighCommission && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-amber-500/30 rounded-2xl p-7 w-full max-w-md shadow-2xl">
            <div className="w-12 h-12 bg-amber-500/15 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <h3 className="display-font text-slate-100 font-bold text-lg tracking-wide text-center mb-2">
              {t('newReport.confirmHighCommissionTitle')}
            </h3>
            <p className="text-slate-300 text-sm text-center mb-2">
              {t('newReport.confirmHighCommissionMsg')}
            </p>
            <p className="text-slate-500 text-xs text-center mb-5">
              {t('newReport.confirmHighCommissionTasks')}: {tasksOverWarning().join(', ')}
            </p>
            <div className="flex gap-3">
              <button type="button"
                onClick={() => setConfirmHighCommission(false)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2.5 rounded-lg text-sm font-medium transition">
                {t('newReport.confirmHighCommissionReview')}
              </button>
              <button type="button"
                onClick={() => doSubmit()}
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 py-2.5 rounded-lg text-sm font-bold transition">
                {t('newReport.confirmHighCommissionContinue')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { SOFT_WARNING_PCT, HARD_CAP_PCT };
