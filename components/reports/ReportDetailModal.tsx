'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

interface Props {
  reportId: string | null;
  onClose: () => void;
}

interface ReportHeader {
  id: string;
  external_order_number: string | null;
  truck_number: string;
  company: string;
  work_date: string;
  notes: string | null;
  created_at: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_by_role: string | null;
}

interface MechanicAssignmentRow {
  id: string;
  employee_id: string;
  commission_percentage: number;
  mechanic_payout: number;
  employee_name: string;
}

interface TaskRow {
  id: string;
  description: string;
  amount_charged_to_client: number;
  sort_order: number;
  mechanics: MechanicAssignmentRow[];
}

const ROLE_LABEL: Record<string, { es: string; en: string }> = {
  super_user:  { es: 'Super Usuario',   en: 'Super Admin' },
  owner:       { es: 'Dueño',           en: 'Owner' },
  admin:       { es: 'Administración',  en: 'Admin' },
  mechanic:    { es: 'Mecánico',        en: 'Mechanic' },
};

export default function ReportDetailModal({ reportId, onClose }: Props) {
  const { t, lang } = useLanguage();

  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [report, setReport]   = useState<ReportHeader | null>(null);
  const [tasks, setTasks]     = useState<TaskRow[]>([]);

  const fmt = (n: number) =>
    '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const formatDate = (d: string) => {
    if (!d) return '-';
    const dt = d.includes('T') ? new Date(d) : new Date(d + 'T12:00:00');
    return dt.toLocaleDateString(lang === 'en' ? 'en-US' : 'es-MX', {
      day: '2-digit', month: 'long', year: 'numeric'
    });
  };

  const formatDateTime = (d: string) => {
    if (!d) return '-';
    const dt = new Date(d);
    return dt.toLocaleString(lang === 'en' ? 'en-US' : 'es-MX', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  useEffect(() => {
    if (!reportId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        // Todo el detalle (encabezado + tareas + asignaciones + nombres de
        // empleados, con el fallback del creador resuelto) sale de la API.
        const res = await fetch(`/api/ordenes/${reportId}`);
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j?.error ?? 'Error');
        if (cancelled) return;

        setReport(j.report as ReportHeader);

        const rawTasks: any[] = j.tasks ?? [];
        const assignments: any[] = j.assignments ?? [];

        const employeeNameById: Record<string, string> = {};
        for (const e of (j.employees ?? [])) {
          employeeNameById[(e as any).id] = (e as any).full_name;
        }

        const tasksByGroup: Record<string, MechanicAssignmentRow[]> = {};
        for (const a of assignments) {
          if (!tasksByGroup[a.task_id]) tasksByGroup[a.task_id] = [];
          tasksByGroup[a.task_id].push({
            id: a.id,
            employee_id: a.employee_id,
            commission_percentage: Number(a.commission_percentage),
            mechanic_payout: Number(a.mechanic_payout),
            employee_name: employeeNameById[a.employee_id] ?? '—',
          });
        }

        const result: TaskRow[] = (rawTasks ?? []).map((tr: any) => ({
          id: tr.id,
          description: tr.description,
          amount_charged_to_client: Number(tr.amount_charged_to_client),
          sort_order: tr.sort_order,
          mechanics: tasksByGroup[tr.id] ?? [],
        }));

        if (!cancelled) setTasks(result);
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? 'Error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [reportId]);

  if (!reportId) return null;

  const totalCharged = tasks.reduce((s, t) => s + t.amount_charged_to_client, 0);
  const totalPayout  = tasks.reduce((s, t) => s + t.mechanics.reduce((ms, m) => ms + m.mechanic_payout, 0), 0);
  const totalProfit  = totalCharged - totalPayout;

  const creatorRoleLabel = (role: string | null | undefined) => {
    if (!role) return null;
    const key = String(role).toLowerCase();
    const entry = ROLE_LABEL[key];
    if (!entry) return role;
    return lang === 'en' ? entry.en : entry.es;
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-4xl my-8 shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-white/5 sticky top-0 bg-slate-900 rounded-t-2xl">
          <div>
            <h2 className="display-font text-slate-100 font-bold text-xl tracking-wide">
              {t('reportDetail.title')}
            </h2>
            {report && (
              <p className="text-slate-500 text-xs mt-0.5">
                {report.company} · {report.truck_number}
                {report.external_order_number ? ` · ${report.external_order_number}` : ''}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-200 hover:bg-white/5 rounded-lg p-1.5 transition"
            aria-label={t('reportDetail.close')}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-5 space-y-5">
          {loading ? (
            <div className="text-center py-12 text-slate-500">{t('reportDetail.loading')}</div>
          ) : error ? (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          ) : !report ? (
            <div className="text-center py-12 text-slate-500">{t('reportDetail.notFound')}</div>
          ) : (
            <>
              {/* Audit / Creator info */}
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
                <p className="text-amber-400/70 text-xs uppercase tracking-widest font-semibold mb-2">
                  {t('reportDetail.audit')}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-slate-500 text-xs">{t('reportDetail.createdBy')}</p>
                    <p className="text-slate-100 font-semibold">
                      {report.created_by_name ?? <span className="italic text-slate-500">{t('reportDetail.unknownUser')}</span>}
                    </p>
                    {report.created_by_role && (
                      <p className="text-slate-500 text-xs mt-0.5">{creatorRoleLabel(report.created_by_role)}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs">{t('reportDetail.createdAt')}</p>
                    <p className="text-slate-100 font-semibold">
                      {report.created_at ? formatDateTime(report.created_at) : '—'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Header / metadata */}
              <div className="bg-slate-800/60 border border-white/5 rounded-xl p-4">
                <p className="text-slate-500 text-xs uppercase tracking-widest font-semibold mb-3">
                  {t('reportDetail.headerSection')}
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-slate-500 text-xs">{t('reportDetail.workDate')}</p>
                    <p className="text-slate-100 font-medium">{formatDate(report.work_date)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs">{t('reportDetail.truck')}</p>
                    <p className="text-slate-100 font-medium">{report.truck_number}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs">{t('reportDetail.company')}</p>
                    <p className="text-slate-100 font-medium">{report.company}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs">{t('reportDetail.orderNumber')}</p>
                    <p className="text-slate-100 font-medium font-mono text-xs">
                      {report.external_order_number ?? '—'}
                    </p>
                  </div>
                </div>
                {report.notes && (
                  <div className="mt-4 pt-3 border-t border-white/5">
                    <p className="text-slate-500 text-xs mb-1">{t('reportDetail.notes')}</p>
                    <p className="text-slate-300 text-sm whitespace-pre-wrap">{report.notes}</p>
                  </div>
                )}
              </div>

              {/* Tasks list */}
              <div>
                <p className="text-slate-500 text-xs uppercase tracking-widest font-semibold mb-3">
                  {t('reportDetail.tasksSection')} ({tasks.length})
                </p>
                <div className="space-y-3">
                  {tasks.map((task, i) => {
                    const totalTaskPayout = task.mechanics.reduce((s, m) => s + m.mechanic_payout, 0);
                    const taskProfit = task.amount_charged_to_client - totalTaskPayout;
                    return (
                      <div key={task.id} className="bg-slate-800/40 border border-white/5 rounded-xl overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-800/60 border-b border-white/5">
                          <span className="display-font text-slate-400 text-xs tracking-widest">
                            {t('reportDetail.task').toUpperCase()} {i + 1}
                          </span>
                          <span className="text-amber-400 font-semibold text-sm">
                            {fmt(task.amount_charged_to_client)}
                          </span>
                        </div>
                        <div className="p-4 space-y-3">
                          <p className="text-slate-200 text-sm">{task.description}</p>

                          {/* Mechanics */}
                          {task.mechanics.length > 0 ? (
                            <div className="bg-slate-900/40 rounded-lg overflow-hidden">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-white/5">
                                    <th className="text-left px-3 py-2 text-slate-500 font-medium">{t('reportDetail.mechanic')}</th>
                                    <th className="text-center px-3 py-2 text-slate-500 font-medium">{t('reportDetail.commission')}</th>
                                    <th className="text-right px-3 py-2 text-slate-500 font-medium">{t('reportDetail.payout')}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {task.mechanics.map(m => (
                                    <tr key={m.id} className="border-b border-white/5 last:border-0">
                                      <td className="px-3 py-2 text-slate-200">{m.employee_name}</td>
                                      <td className="px-3 py-2 text-center text-slate-300">{m.commission_percentage.toFixed(1)}%</td>
                                      <td className="px-3 py-2 text-right text-emerald-400 font-medium">{fmt(m.mechanic_payout)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <p className="text-slate-600 text-xs italic">{t('reportDetail.noMechanics')}</p>
                          )}

                          {/* Per-task summary */}
                          <div className="flex items-center justify-end gap-4 pt-2 border-t border-white/5 text-xs">
                            <span className="text-slate-500">
                              {t('reportDetail.taskPayout')}:
                              <span className="text-amber-400 font-semibold ml-1">{fmt(totalTaskPayout)}</span>
                            </span>
                            <span className="text-slate-500">
                              {t('reportDetail.taskProfit')}:
                              <span className={`font-semibold ml-1 ${taskProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {fmt(taskProfit)}
                              </span>
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {tasks.length === 0 && (
                    <p className="text-slate-500 text-sm text-center py-6">{t('reportDetail.noTasks')}</p>
                  )}
                </div>
              </div>

              {/* Totals */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-800/60 border border-white/5 rounded-xl p-3">
                  <p className="text-slate-500 text-xs">{t('reportDetail.totalCharged')}</p>
                  <p className="display-font text-lg font-bold text-slate-100">{fmt(totalCharged)}</p>
                </div>
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                  <p className="text-slate-500 text-xs">{t('reportDetail.totalPayout')}</p>
                  <p className="display-font text-lg font-bold text-amber-400">{fmt(totalPayout)}</p>
                </div>
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                  <p className="text-slate-500 text-xs">{t('reportDetail.totalProfit')}</p>
                  <p className="display-font text-lg font-bold text-emerald-400">{fmt(totalProfit)}</p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-white/5 flex justify-end">
          <button
            onClick={onClose}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 px-5 rounded-lg text-sm font-medium transition"
          >
            {t('reportDetail.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
