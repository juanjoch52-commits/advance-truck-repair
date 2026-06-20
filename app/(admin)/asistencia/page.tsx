'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import { useLanguage } from '@/contexts/LanguageContext';
import { fmtDate } from '@/lib/fmt';
import { weekDates, normalizeWorkDays, dailyRate, computeWeekPay, WEEKDAY_KEYS } from '@/lib/attendance';

interface SalariedEmployee {
  id: string;
  full_name: string;
  weekly_salary: number | null;
  work_days: number[] | null;
}

interface AttendanceRow {
  id: string;
  employee_id: string;
  work_date: string;
  status: 'present' | 'absent';
  absence_reason: string | null;
}

function getWeekRange(offsetWeeks = 0) {
  const now = new Date();
  const day = now.getDay(); // 0=Dom .. 6=Sáb
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - day + offsetWeeks * 7);
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  return { start: sunday.toISOString().split('T')[0], end: saturday.toISOString().split('T')[0] };
}

export default function AsistenciaPage() {
  const { t, lang } = useLanguage();
  const supabase = createClient();
  const locale = lang === 'en' ? 'en-US' : 'es-MX';
  const fmtMoney = (n: number) => '$' + (Number(n) || 0).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const initialWeek = getWeekRange(0);
  const [weekStart, setWeekStart] = useState(initialWeek.start);
  const [weekEnd, setWeekEnd] = useState(initialWeek.end);

  const [employees, setEmployees] = useState<SalariedEmployee[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  // allowed: puede entrar (admin + owner/super). privileged: ve los montos de salario (solo owner/super).
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [privileged, setPrivileged] = useState<boolean | null>(null);
  const [busyCell, setBusyCell] = useState<string | null>(null);
  const [editDaysFor, setEditDaysFor] = useState<string | null>(null);
  // Nombre de quien está registrando, para la auditoría (quién marcó/modificó la falta).
  const [meName, setMeName] = useState<string>('');

  const days = weekDates(weekStart); // 7 fechas Dom..Sáb de la semana

  useEffect(() => {
    (async () => {
      let role = '';
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) { const j = await res.json(); role = (j?.user?.role ?? '').toLowerCase(); setMeName(j?.user?.full_name ?? ''); }
      } catch {}
      const priv = role === 'super_user' || role === 'super_admin' || role === 'owner';
      setPrivileged(priv);
      // La administración registra asistencia; el salario solo lo ven los privilegiados.
      setAllowed(priv || role === 'admin');
    })();
  }, []);

  const load = useCallback(async () => {
    if (privileged === null) return; // esperar a saber el rol (para no pedir el salario si es admin)
    setLoading(true);
    // A la administración NO se le envía weekly_salary (no solo se oculta en UI).
    const cols = privileged
      ? 'id, full_name, weekly_salary, work_days'
      : 'id, full_name, work_days';
    const { data: empData } = await (supabase as any)
      .from('employees')
      .select(cols)
      .eq('payment_type', 'fixed_weekly')
      .order('full_name');
    setEmployees((empData ?? []) as SalariedEmployee[]);

    const { data: attData } = await (supabase as any)
      .from('attendance')
      .select('id, employee_id, work_date, status, absence_reason')
      .gte('work_date', weekStart)
      .lte('work_date', weekEnd);
    setAttendance((attData ?? []) as AttendanceRow[]);
    setLoading(false);
  }, [weekStart, weekEnd, privileged]);

  useEffect(() => { load(); }, [load]);

  function shiftWeek(weeks: number) {
    const s = new Date(weekStart + 'T12:00:00'); s.setDate(s.getDate() + weeks * 7);
    const e = new Date(weekEnd + 'T12:00:00'); e.setDate(e.getDate() + weeks * 7);
    setWeekStart(s.toISOString().split('T')[0]);
    setWeekEnd(e.toISOString().split('T')[0]);
  }

  // Faltas (status='absent') por empleado+fecha. Lo no registrado = presente.
  const absenceAt = (empId: string, iso: string) =>
    attendance.find(a => a.employee_id === empId && a.work_date === iso && a.status === 'absent');

  function absencesForEmp(empId: string) {
    return attendance
      .filter(a => a.employee_id === empId && a.status === 'absent')
      .sort((x, y) => x.work_date.localeCompare(y.work_date));
  }

  // Marca FALTA (inserta) o vuelve a PRESENTE (borra) un día laboral.
  async function toggleDay(emp: SalariedEmployee, iso: string) {
    const key = emp.id + iso;
    setBusyCell(key);
    const existing = absenceAt(emp.id, iso);
    if (existing) {
      await (supabase as any).from('attendance').delete().eq('id', existing.id);
    } else {
      await (supabase as any).from('attendance').upsert(
        { employee_id: emp.id, work_date: iso, status: 'absent', absence_reason: '', created_by_name: meName, updated_by_name: meName },
        { onConflict: 'employee_id,work_date' }
      );
    }
    setBusyCell(null);
    await load();
  }

  async function saveReason(rowId: string, reason: string) {
    await (supabase as any).from('attendance').update({ absence_reason: reason, updated_by_name: meName }).eq('id', rowId);
    setAttendance(prev => prev.map(a => a.id === rowId ? { ...a, absence_reason: reason } : a));
  }

  // Quitar todas las faltas de la semana (marcar semana completa presente).
  async function markAllPresent(emp: SalariedEmployee) {
    const ids = absencesForEmp(emp.id).map(a => a.id);
    if (ids.length === 0) return;
    await (supabase as any).from('attendance').delete().in('id', ids);
    await load();
  }

  async function saveWorkDays(emp: SalariedEmployee, workDays: number[]) {
    await (supabase as any).from('employees').update({ work_days: workDays }).eq('id', emp.id);
    setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, work_days: workDays } : e));
  }

  if (allowed === null) return <div className="text-center py-12 text-slate-500">{t('common.loading')}</div>;
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
        <h1 className="display-font text-3xl font-bold text-slate-100 tracking-wide">{t('attendance.title')}</h1>
        <p className="text-slate-400 mt-1">{t('attendance.subtitle')}</p>
      </div>

      {/* Navegación de semana */}
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <button onClick={() => shiftWeek(-1)} className="bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 px-3 py-2 rounded-lg transition flex items-center gap-1 text-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          {t('weeklyCut.prevWeek')}
        </button>
        <div className="flex-1 bg-slate-900/60 border border-white/5 rounded-xl px-5 py-3 text-center min-w-64">
          <p className="text-slate-500 text-xs mb-0.5">{t('weeklyCut.cutWeek')}</p>
          <p className="display-font text-amber-400 font-bold text-lg tracking-wide">{fmtDate(weekStart)} — {fmtDate(weekEnd)}</p>
        </div>
        <button onClick={() => shiftWeek(1)} className="bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 px-3 py-2 rounded-lg transition flex items-center gap-1 text-sm">
          {t('weeklyCut.nextWeek')}
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-500">{t('common.loading')}</div>
      ) : employees.length === 0 ? (
        <div className="bg-slate-900/60 border border-white/5 rounded-xl p-12 text-center">
          <p className="text-slate-500 mb-2">{t('attendance.noStaff')}</p>
          <a href="/mecanicos" className="text-amber-400 hover:text-amber-300 text-sm">{t('adminPayroll.goToStaff')}</a>
        </div>
      ) : (
        <div className="space-y-3">
          {employees.map(emp => {
            const workDays = normalizeWorkDays(emp.work_days);
            const weekly = Number(emp.weekly_salary ?? 0);
            const rate = dailyRate(weekly, workDays.length);
            const empAbsences = absencesForEmp(emp.id);
            const absentCount = empAbsences.length;
            const presentCount = Math.max(0, workDays.length - absentCount);
            const pay = computeWeekPay(weekly, workDays.length, absentCount);
            const isEditingDays = editDaysFor === emp.id;

            return (
              <div key={emp.id} className="bg-slate-900/60 border border-white/5 rounded-xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/5 flex-wrap gap-3">
                  <div>
                    <p className="display-font text-slate-200 font-semibold tracking-wide">{emp.full_name}</p>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                      {privileged && <span>{fmtMoney(weekly)}/sem · {fmtMoney(rate)}/{t('attendance.dayUnit')}</span>}
                      <button onClick={() => setEditDaysFor(isEditingDays ? null : emp.id)} className="text-slate-600 hover:text-amber-400 transition underline">
                        {t('attendance.editWorkDays')}
                      </button>
                    </div>
                  </div>
                  <div className="text-right">
                    {privileged ? (
                      <>
                        <p className={`display-font font-bold text-lg ${absentCount > 0 ? 'text-amber-400' : 'text-green-400'}`}>{fmtMoney(pay)}</p>
                        <p className="text-slate-500 text-xs">{t('attendance.daysPresent').replace('{p}', String(presentCount)).replace('{t}', String(workDays.length))}</p>
                      </>
                    ) : (
                      <p className={`display-font font-bold text-lg ${absentCount > 0 ? 'text-amber-400' : 'text-green-400'}`}>
                        {t('attendance.daysPresent').replace('{p}', String(presentCount)).replace('{t}', String(workDays.length))}
                      </p>
                    )}
                  </div>
                </div>

                {/* Editor de días laborales */}
                {isEditingDays && (
                  <div className="px-5 py-3 border-b border-white/5 bg-slate-800/30 flex items-center gap-2 flex-wrap">
                    <span className="text-slate-400 text-xs mr-1">{t('attendance.workDays')}:</span>
                    {WEEKDAY_KEYS.map((k, dow) => {
                      const on = workDays.includes(dow);
                      return (
                        <button key={k} onClick={() => {
                          const next = on ? workDays.filter(d => d !== dow) : [...workDays, dow].sort((a, b) => a - b);
                          if (next.length === 0) return; // al menos 1 día laboral
                          saveWorkDays(emp, next);
                        }} className={`px-2.5 py-1 rounded text-xs border transition ${on ? 'bg-amber-500/15 border-amber-500/40 text-amber-300' : 'bg-slate-800 border-white/10 text-slate-500 hover:text-slate-300'}`}>
                          {t(`attendance.dow.${k}`)}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Grilla de días */}
                <div className="px-5 py-3">
                  <div className="grid grid-cols-7 gap-1.5">
                    {days.map(({ iso, dow }) => {
                      const isWorkDay = workDays.includes(dow);
                      const absent = !!absenceAt(emp.id, iso);
                      const key = emp.id + iso;
                      const dayNum = Number(iso.split('-')[2]);
                      if (!isWorkDay) {
                        return (
                          <div key={iso} className="rounded-lg border border-white/5 bg-slate-800/20 px-1 py-2 text-center">
                            <p className="text-[10px] text-slate-600">{t(`attendance.dow.${WEEKDAY_KEYS[dow]}`)}</p>
                            <p className="text-[10px] text-slate-600 mt-1">{t('attendance.rest')}</p>
                          </div>
                        );
                      }
                      return (
                        <button key={iso} disabled={busyCell === key} onClick={() => toggleDay(emp, iso)}
                          className={`rounded-lg border px-1 py-2 text-center transition disabled:opacity-50 ${absent ? 'bg-red-500/10 border-red-500/40 hover:bg-red-500/20' : 'bg-green-500/10 border-green-500/30 hover:bg-green-500/20'}`}>
                          <p className={`text-[10px] ${absent ? 'text-red-300/70' : 'text-green-300/70'}`}>{t(`attendance.dow.${WEEKDAY_KEYS[dow]}`)} {dayNum}</p>
                          <p className={`text-xs font-semibold mt-1 ${absent ? 'text-red-300' : 'text-green-300'}`}>{absent ? t('attendance.absentShort') : t('attendance.presentShort')}</p>
                        </button>
                      );
                    })}
                  </div>

                  {/* Faltas con razón */}
                  {empAbsences.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <p className="text-slate-400 text-xs">{t('attendance.absencesTitle')}:</p>
                      {empAbsences.map(a => (
                        <div key={a.id} className="flex items-center gap-2 flex-wrap">
                          <span className="text-red-300 text-xs w-24 flex-shrink-0">{fmtDate(a.work_date)}</span>
                          <input
                            defaultValue={a.absence_reason ?? ''}
                            onBlur={e => saveReason(a.id, e.target.value.trim())}
                            placeholder={t('attendance.reasonPlaceholder')}
                            className="flex-1 min-w-48 bg-slate-800 border border-white/10 rounded-lg px-3 py-1.5 text-slate-100 text-xs focus:outline-none focus:border-amber-400/50"
                          />
                          {!a.absence_reason && <span className="text-amber-400/70 text-[10px]">{t('attendance.reasonRequired')}</span>}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
                    <p className="text-slate-600 text-xs">{t('attendance.tapHint')}</p>
                    {absentCount > 0 && (
                      <button onClick={() => markAllPresent(emp)} className="text-green-400 hover:text-green-300 text-xs border border-green-500/20 rounded px-2.5 py-1 transition">
                        {t('attendance.markAllPresent')}
                      </button>
                    )}
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
