'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import { useLanguage } from '@/contexts/LanguageContext';

interface Employee {
  id: string;
  full_name: string;
  role: string | null;
  payment_type: string | null;
}

interface Debt {
  id: string;
  employee_id: string;
  description: string;
  total_amount: number;
  remaining_balance: number;
  weekly_installment: number;
  is_active: boolean;
  created_at: string;
  start_week_ending: string | null;
  employees: { full_name: string } | null;
}

/** Genera los próximos N domingos como opciones de semana */
function getUpcomingSundays(n: number): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  const day = now.getDay();
  // Próximo domingo (o hoy si es domingo)
  const daysUntilSun = day === 0 ? 0 : 7 - day;
  const firstSun = new Date(now);
  firstSun.setDate(now.getDate() + daysUntilSun);
  for (let i = 0; i < n; i++) {
    const sun = new Date(firstSun);
    sun.setDate(firstSun.getDate() + i * 7);
    const value = sun.toISOString().split('T')[0];
    // Lunes de esa semana
    const mon = new Date(sun);
    mon.setDate(sun.getDate() - 6);
    const fmtDate = (d: Date) =>
      d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
    const label = `${fmtDate(mon)} – ${fmtDate(sun)} ${sun.getFullYear()}`;
    options.push({ value, label });
  }
  return options;
}

interface DebtPayment {
  debt_id: string;
  week_ending: string;
  amount: number;
}

function getCurrentWeekEnd() {
  // Domingo de la semana actual
  const now = new Date();
  const day = now.getDay();
  const diff = 7 - day === 7 ? 0 : 7 - day;
  const sun = new Date(now);
  sun.setDate(now.getDate() + (day === 0 ? 0 : diff));
  return sun.toISOString().split('T')[0];
}

function getCurrentWeekStart() {
  const now = new Date();
  const day = now.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const mon = new Date(now);
  mon.setDate(now.getDate() + diffToMon);
  return mon.toISOString().split('T')[0];
}

export default function DeduccionesPage() {
  const { t, lang } = useLanguage();
  const supabase = createClient();
  const locale = lang === 'en' ? 'en-US' : 'es-MX';

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [paymentsThisWeek, setPaymentsThisWeek] = useState<DebtPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [empId, setEmpId] = useState('');
  const [description, setDescription] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [weeks, setWeeks] = useState('');
  const [startWeekEnding, setStartWeekEnding] = useState(getCurrentWeekEnd());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const sundayOptions = getUpcomingSundays(12);

  // Per-debt applying state
  const [applying, setApplying] = useState<Record<string, boolean>>({});

  const weekEnd = getCurrentWeekEnd();
  const weekStart = getCurrentWeekStart();

  const fmtMoney = (n: number) =>
    '$' + Number(n).toLocaleString(locale, { minimumFractionDigits: 2 });

  const weeklyInstallment = totalAmount && weeks
    ? Math.ceil((parseFloat(totalAmount) / parseInt(weeks)) * 100) / 100
    : null;

  const load = useCallback(async () => {
    setLoading(true);

    // Cargar todos los empleados
    const { data: empData } = await (supabase as any)
      .from('employees')
      .select('id, full_name, role, payment_type')
      .order('full_name');
    setEmployees((empData ?? []) as Employee[]);

    // Cargar deudas activas con nombre del empleado
    const { data: debtData } = await (supabase as any)
      .from('debts')
      .select('id, employee_id, description, total_amount, remaining_balance, weekly_installment, is_active, created_at, start_week_ending, employees(full_name)')
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    setDebts((debtData ?? []) as Debt[]);

    // Pagos aplicados esta semana
    const { data: paymentsData } = await (supabase as any)
      .from('debt_payments')
      .select('debt_id, week_ending, amount')
      .gte('week_ending', weekStart)
      .lte('week_ending', weekEnd);
    setPaymentsThisWeek((paymentsData ?? []) as DebtPayment[]);

    setLoading(false);
  }, [weekStart, weekEnd]);

  useEffect(() => { load(); }, [load]);

  async function handleCreateDebt(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');

    if (!empId) { setFormError(t('deductions.form.errorEmployee')); return; }
    if (!description.trim()) { setFormError(t('deductions.form.errorDescription')); return; }
    const total = parseFloat(totalAmount);
    if (!total || total <= 0) { setFormError(t('deductions.form.errorAmount')); return; }
    const w = parseInt(weeks);
    if (!w || w < 1) { setFormError(t('deductions.form.errorWeeks')); return; }

    const installment = parseFloat((total / w).toFixed(2));
    setSaving(true);

    const { error } = await (supabase as any).from('debts').insert({
      employee_id: empId,
      description: description.trim(),
      total_amount: total,
      weekly_installment: installment,
      remaining_balance: total,
      is_active: true,
      start_week_ending: startWeekEnding,
    });

    setSaving(false);
    if (error) { setFormError(error.message); return; }

    setEmpId(''); setDescription(''); setTotalAmount(''); setWeeks('');
    setStartWeekEnding(getCurrentWeekEnd());
    setShowForm(false);
    load();
  }

  async function handleApplyInstallment(debt: Debt) {
    setApplying(prev => ({ ...prev, [debt.id]: true }));

    const amount = Math.min(Number(debt.weekly_installment), Number(debt.remaining_balance));
    const newBalance = Math.max(0, Number(debt.remaining_balance) - amount);

    // Insertar pago
    const { error: payErr } = await (supabase as any).from('debt_payments').insert({
      debt_id: debt.id,
      week_ending: weekEnd,
      amount,
    });

    if (payErr) {
      alert(payErr.message);
      setApplying(prev => ({ ...prev, [debt.id]: false }));
      return;
    }

    // Actualizar saldo y marcar inactiva si se pagó completo
    await (supabase as any).from('debts').update({
      remaining_balance: newBalance,
      is_active: newBalance > 0,
    }).eq('id', debt.id);

    setApplying(prev => ({ ...prev, [debt.id]: false }));
    load();
  }

  async function handleCancelDebt(debtId: string) {
    if (!confirm(t('deductions.card.cancelConfirm'))) return;
    await (supabase as any).from('debts').update({ is_active: false }).eq('id', debtId);
    load();
  }

  const isAppliedThisWeek = (debtId: string) =>
    paymentsThisWeek.some(p => p.debt_id === debtId);

  /** La deducción ya comenzó: la semana actual >= semana de inicio */
  const isActiveThisWeek = (debt: Debt) => {
    if (!debt.start_week_ending) return true;
    return weekEnd >= debt.start_week_ending;
  };

  const weeksRemaining = (debt: Debt) =>
    Math.ceil(Number(debt.remaining_balance) / Number(debt.weekly_installment));

  const progressPct = (debt: Debt) =>
    Math.round(((Number(debt.total_amount) - Number(debt.remaining_balance)) / Number(debt.total_amount)) * 100);

  // Stats
  const totalRemaining = debts.reduce((s, d) => s + Number(d.remaining_balance), 0);
  const totalWeekly = debts.reduce((s, d) => s + Number(d.weekly_installment), 0);
  const appliedThisWeek = paymentsThisWeek.reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="display-font text-3xl font-bold text-slate-100 tracking-wide">{t('deductions.title')}</h1>
          <p className="text-slate-400 mt-1">{t('deductions.subtitle')}</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 px-5 rounded-lg transition display-font tracking-wide flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('deductions.newDebt')}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-slate-900/60 border border-white/5 rounded-xl p-5">
          <p className="text-slate-400 text-sm mb-1">{t('deductions.activeDebts')}</p>
          <p className="display-font text-2xl font-bold text-slate-100">{debts.length}</p>
        </div>
        <div className="bg-slate-900/60 border border-white/5 rounded-xl p-5">
          <p className="text-slate-400 text-sm mb-1">Saldo total pendiente</p>
          <p className="display-font text-2xl font-bold text-red-400">{fmtMoney(totalRemaining)}</p>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-5">
          <p className="text-slate-400 text-sm mb-1">Cuotas esta semana</p>
          <p className="display-font text-2xl font-bold text-amber-400">
            {fmtMoney(appliedThisWeek)} <span className="text-slate-500 text-sm font-normal">/ {fmtMoney(totalWeekly)}</span>
          </p>
        </div>
      </div>

      {/* Formulario nueva deuda */}
      {showForm && (
        <div className="bg-slate-900/80 border border-amber-500/20 rounded-xl p-6 mb-6">
          <h2 className="display-font text-slate-200 font-semibold mb-4 tracking-wide">{t('deductions.newDebt')}</h2>
          <form onSubmit={handleCreateDebt} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Empleado */}
            <div>
              <label className="block text-slate-400 text-sm mb-1.5">{t('deductions.form.employee')}</label>
              <select value={empId} onChange={e => setEmpId(e.target.value)} required
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 focus:outline-none focus:border-amber-400/50 transition">
                <option value="">{t('deductions.form.selectEmployee')}</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                ))}
              </select>
            </div>

            {/* Descripción */}
            <div>
              <label className="block text-slate-400 text-sm mb-1.5">{t('deductions.form.description')}</label>
              <input type="text" value={description} onChange={e => setDescription(e.target.value)} required
                placeholder={t('deductions.form.descriptionPlaceholder')}
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/50 transition" />
            </div>

            {/* Monto total */}
            <div>
              <label className="block text-slate-400 text-sm mb-1.5">{t('deductions.form.totalAmount')}</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-400 font-bold">$</span>
                <input type="number" min="0.01" step="0.01" value={totalAmount}
                  onChange={e => setTotalAmount(e.target.value)} required
                  placeholder="0.00"
                  className="w-full bg-slate-800 border border-white/10 rounded-lg pl-7 pr-4 py-2.5 text-slate-100 focus:outline-none focus:border-amber-400/50 transition" />
              </div>
            </div>

            {/* Número de semanas */}
            <div>
              <label className="block text-slate-400 text-sm mb-1.5">{t('deductions.form.weeks')}</label>
              <input type="number" min="1" step="1" value={weeks}
                onChange={e => setWeeks(e.target.value)} required
                placeholder="4"
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 focus:outline-none focus:border-amber-400/50 transition" />
            </div>

            {/* Primera semana de descuento */}
            <div className="md:col-span-2">
              <label className="block text-slate-400 text-sm mb-1.5">{t('deductions.form.startWeek')}</label>
              <select value={startWeekEnding} onChange={e => setStartWeekEnding(e.target.value)}
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 focus:outline-none focus:border-amber-400/50 transition">
                {sundayOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <p className="text-slate-600 text-xs mt-1">{t('deductions.form.startWeekHelp')}</p>
            </div>

            {/* Cuota calculada */}
            {weeklyInstallment && (
              <div className="md:col-span-2">
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3 flex items-center gap-3">
                  <svg className="w-5 h-5 text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  <span className="text-slate-400 text-sm">{t('deductions.form.weeklyInstallment')}:</span>
                  <span className="text-amber-400 font-bold display-font text-lg">{fmtMoney(weeklyInstallment)}</span>
                  <span className="text-slate-500 text-xs">por semana × {weeks} semanas</span>
                </div>
              </div>
            )}

            {formError && (
              <div className="md:col-span-2 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2.5 text-red-400 text-sm">
                {formError}
              </div>
            )}

            <div className="md:col-span-2 flex gap-3">
              <button type="submit" disabled={saving}
                className="bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/50 text-slate-950 font-bold py-2.5 px-6 rounded-lg transition display-font tracking-wide">
                {saving ? t('deductions.form.saving') : t('deductions.form.submit')}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setFormError(''); }}
                className="bg-slate-700 hover:bg-slate-600 text-slate-300 py-2.5 px-5 rounded-lg transition text-sm">
                {t('common.cancel')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Lista de deudas activas */}
      {loading ? (
        <div className="text-center py-12 text-slate-500">{t('common.loading')}</div>
      ) : debts.length === 0 ? (
        <div className="bg-slate-900/60 border border-white/5 rounded-xl p-12 text-center">
          <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-slate-500">{t('deductions.noDebts')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {debts.map(debt => {
            const applied = isAppliedThisWeek(debt.id);
            const activeNow = isActiveThisWeek(debt);
            const pct = progressPct(debt);
            const wksLeft = weeksRemaining(debt);
            const empName = (debt.employees as any)?.full_name ?? '—';

            // Formatear la semana de inicio legible
            const startLabel = (() => {
              if (!debt.start_week_ending) return null;
              const sun = new Date(debt.start_week_ending + 'T12:00:00');
              const mon = new Date(sun);
              mon.setDate(sun.getDate() - 6);
              const fmt = (d: Date) => d.toLocaleDateString(locale, { day: '2-digit', month: 'short' });
              return `${fmt(mon)} – ${fmt(sun)}`;
            })();

            return (
              <div key={debt.id} className={`bg-slate-900/60 border rounded-xl overflow-hidden ${!activeNow ? 'border-slate-700/40 opacity-80' : 'border-white/5'}`}>
                {/* Header de la tarjeta */}
                <div className="px-5 py-4 flex items-start justify-between gap-4 flex-wrap border-b border-white/5">
                  <div>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className="display-font text-slate-100 font-bold tracking-wide">{empName}</p>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400">
                        {debt.description}
                      </span>
                      {!activeNow && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700/60 border border-slate-600/30 text-slate-400">
                          ⏳ Pendiente
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-wrap text-slate-500 text-xs">
                      {startLabel && (
                        <span className={`flex items-center gap-1 ${!activeNow ? 'text-amber-400/70' : 'text-slate-500'}`}>
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          {t('deductions.card.startsWeek')}: {startLabel}
                        </span>
                      )}
                      <span>{wksLeft} {t('deductions.card.weeksLeft')}</span>
                    </div>
                  </div>

                  {/* Monto del cheque semanal */}
                  <div className="text-right">
                    <p className="text-slate-500 text-xs mb-0.5">{t('deductions.card.weekly')}</p>
                    <p className="display-font text-xl font-bold text-red-400">-{fmtMoney(Number(debt.weekly_installment))}</p>
                  </div>
                </div>

                {/* Cuerpo: stats + barra de progreso */}
                <div className="px-5 py-4">
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div>
                      <p className="text-slate-500 text-xs mb-0.5">{t('deductions.card.total')}</p>
                      <p className="text-slate-300 font-semibold">{fmtMoney(Number(debt.total_amount))}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-xs mb-0.5">{t('deductions.card.remaining')}</p>
                      <p className="text-red-400 font-semibold">{fmtMoney(Number(debt.remaining_balance))}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-xs mb-0.5">{t('deductions.card.progress')}</p>
                      <p className="text-green-400 font-semibold">{pct}%</p>
                    </div>
                  </div>

                  {/* Barra de progreso */}
                  <div className="w-full bg-slate-800 rounded-full h-2 mb-4">
                    <div
                      className="bg-gradient-to-r from-amber-500 to-green-500 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  {/* Acciones */}
                  <div className="flex items-center gap-3 flex-wrap">
                    {!activeNow ? (
                      /* Aún no ha comenzado la semana de inicio */
                      <div className="flex items-center gap-2 bg-slate-800/60 border border-slate-600/30 text-slate-500 text-sm px-4 py-2 rounded-lg">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        {t('deductions.card.notYetActive')} {startLabel}
                      </div>
                    ) : applied ? (
                      <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 text-green-400 text-sm px-4 py-2 rounded-lg">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {t('deductions.card.alreadyApplied')}
                      </div>
                    ) : (
                      <button
                        onClick={() => handleApplyInstallment(debt)}
                        disabled={applying[debt.id]}
                        className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold py-2 px-4 rounded-lg text-sm transition display-font flex items-center gap-2"
                      >
                        {applying[debt.id] ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                            {t('deductions.card.applying')}
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {t('deductions.card.applyInstallment')} (-{fmtMoney(Math.min(Number(debt.weekly_installment), Number(debt.remaining_balance)))})
                          </>
                        )}
                      </button>
                    )}

                    <button
                      onClick={() => handleCancelDebt(debt.id)}
                      className="text-slate-600 hover:text-red-400 text-sm px-3 py-2 rounded-lg hover:bg-red-500/10 transition border border-transparent hover:border-red-500/20"
                    >
                      {t('deductions.card.cancelDebt')}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
