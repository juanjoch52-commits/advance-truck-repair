'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import { useLanguage } from '@/contexts/LanguageContext';

interface Employee { id: string; full_name: string; }

interface WorkReport {
  id: string;
  external_order_number: string | null;
  truck_number: string;
  company: string;
  work_date: string;
  task_count: number;
  total_charged: number;
  total_payout: number;
}

export default function OrdenesPage() {
  const { t } = useLanguage();
  const supabase = createClient();

  const now = new Date();
  const [dateFrom, setDateFrom] = useState(
    new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  );
  const [dateTo, setDateTo] = useState(
    new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]
  );
  const [selectedMechanic, setSelectedMechanic] = useState('');
  const [globalView, setGlobalView] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [reports, setReports] = useState<WorkReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserRole, setCurrentUserRole] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<WorkReport | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fmt = (n: number) =>
    '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  useEffect(() => {
    // Fetch current user role
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        const { data } = await (supabase as any)
          .from('profiles').select('role').eq('id', user.id).single();
        setCurrentUserRole((data as any)?.role ?? '');
      }
    });
    // Fetch employees
    supabase.from('employees' as any).select('id, full_name').order('full_name')
      .then(({ data }) => setEmployees((data as any) ?? []));
  }, []);

  useEffect(() => { loadReports(); }, [dateFrom, dateTo, selectedMechanic, globalView]);

  async function loadReports() {
    setLoading(true);

    let query = (supabase as any)
      .from('work_reports')
      .select('id, external_order_number, truck_number, company, work_date')
      .order('work_date', { ascending: false });

    if (!globalView) {
      query = query.gte('work_date', dateFrom).lte('work_date', dateTo);
    }

    const { data: rawReports } = await query;
    if (!rawReports || rawReports.length === 0) {
      setReports([]);
      setLoading(false);
      return;
    }

    const rids: string[] = rawReports.map((r: any) => r.id);

    const { data: tasks } = await (supabase as any)
      .from('report_tasks')
      .select('id, report_id, amount_charged_to_client')
      .in('report_id', rids);

    const taskIds: string[] = (tasks ?? []).map((t: any) => t.id);

    let assignQuery = (supabase as any)
      .from('task_assignments')
      .select('task_id, employee_id, mechanic_payout')
      .in('task_id', taskIds.length > 0 ? taskIds : ['00000000-0000-0000-0000-000000000000']);

    if (selectedMechanic) {
      assignQuery = assignQuery.eq('employee_id', selectedMechanic);
    }

    const { data: assignments } = await assignQuery;

    const taskToReport: Record<string, string> = {};
    const taskCharged: Record<string, number> = {};
    for (const t of tasks ?? []) {
      taskToReport[t.id] = t.report_id;
      taskCharged[t.id] = Number(t.amount_charged_to_client);
    }

    const tasksByReport: Record<string, Set<string>> = {};
    const payoutByReport: Record<string, number> = {};
    const reportsWithMechanic = new Set<string>();

    for (const a of assignments ?? []) {
      const rid = taskToReport[a.task_id];
      if (!rid) continue;
      if (!tasksByReport[rid]) tasksByReport[rid] = new Set();
      tasksByReport[rid].add(a.task_id);
      payoutByReport[rid] = (payoutByReport[rid] ?? 0) + Number(a.mechanic_payout);
      if (selectedMechanic) reportsWithMechanic.add(rid);
    }

    const chargedByReport: Record<string, number> = {};
    for (const t of tasks ?? []) {
      chargedByReport[t.report_id] = (chargedByReport[t.report_id] ?? 0) + Number(t.amount_charged_to_client);
    }

    const result: WorkReport[] = rawReports
      .filter((r: any) => !selectedMechanic || reportsWithMechanic.has(r.id))
      .map((r: any) => ({
        id: r.id,
        external_order_number: r.external_order_number,
        truck_number: r.truck_number,
        company: r.company,
        work_date: r.work_date,
        task_count: tasksByReport[r.id]?.size ?? 0,
        total_charged: chargedByReport[r.id] ?? 0,
        total_payout: payoutByReport[r.id] ?? 0,
      }));

    setReports(result);
    setLoading(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const rid = deleteTarget.id;
    try {
      // 1. Get task IDs
      const { data: tasks } = await (supabase as any)
        .from('report_tasks').select('id').eq('report_id', rid);
      const taskIds = (tasks ?? []).map((t: any) => t.id);

      // 2. Delete earned_entries for this report
      await (supabase as any).from('earned_entries').delete().eq('work_report_id', rid);

      // 3. Delete task_assignments for these tasks
      if (taskIds.length > 0) {
        await (supabase as any).from('task_assignments').delete().in('task_id', taskIds);
      }

      // 4. Delete report_tasks
      await (supabase as any).from('report_tasks').delete().eq('report_id', rid);

      // 5. Delete work_report
      await (supabase as any).from('work_reports').delete().eq('id', rid);

      setReports(prev => prev.filter(r => r.id !== rid));
      setDeleteTarget(null);
    } catch (err) {
      console.error('Delete error:', err);
    }
    setDeleting(false);
  }

  // Client-side text search filter
  const filtered = reports.filter(r => {
    if (!searchText.trim()) return true;
    const q = searchText.toLowerCase();
    return (
      r.truck_number?.toLowerCase().includes(q) ||
      r.company?.toLowerCase().includes(q) ||
      (r.external_order_number ?? '').toLowerCase().includes(q)
    );
  });

  const totalCharged = filtered.reduce((s, r) => s + r.total_charged, 0);
  const totalPayout  = filtered.reduce((s, r) => s + r.total_payout, 0);
  const totalProfit  = totalCharged - totalPayout;

  const isSuperAdmin = currentUserRole === 'super_admin';

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="display-font text-3xl font-bold text-slate-100 tracking-wide">
            {t('workReports.title')}
          </h1>
          <p className="text-slate-400 mt-1">{filtered.length} {t('workReports.records')}</p>
        </div>
        <Link
          href="/ordenes/nueva"
          className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 px-5 rounded-lg transition display-font tracking-wide flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('workReports.newButton')}
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-slate-900/60 border border-white/5 rounded-xl p-4 mb-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-slate-500 text-xs mb-1.5">{t('workReports.filters.dateFrom')}</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            disabled={globalView}
            className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-amber-400/50 transition disabled:opacity-40" />
        </div>
        <div>
          <label className="block text-slate-500 text-xs mb-1.5">{t('workReports.filters.dateTo')}</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            disabled={globalView}
            className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-amber-400/50 transition disabled:opacity-40" />
        </div>
        <div>
          <label className="block text-slate-500 text-xs mb-1.5">{t('workReports.filters.mechanic')}</label>
          <select value={selectedMechanic} onChange={e => setSelectedMechanic(e.target.value)}
            className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-amber-400/50 transition">
            <option value="">{t('workReports.filters.allMechanics')}</option>
            {employees.map(e => (
              <option key={e.id} value={e.id}>{e.full_name}</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => setGlobalView(v => !v)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition border ${
            globalView
              ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
              : 'bg-slate-800 border-white/10 text-slate-400 hover:text-slate-200'
          }`}
        >
          {t('workReports.filters.globalView')}
        </button>
      </div>

      {/* Search bar */}
      <div className="mb-5">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder={t('workReports.filters.search')}
            className="w-full bg-slate-900/60 border border-white/5 rounded-xl pl-9 pr-4 py-2.5 text-slate-100 placeholder-slate-600 text-sm focus:outline-none focus:border-amber-400/30 transition"
          />
          {searchText && (
            <button onClick={() => setSearchText('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-5">
          <div className="bg-slate-900/60 border border-white/5 rounded-xl p-4">
            <p className="text-slate-500 text-xs mb-1">{t('workReports.table.totalCharged')}</p>
            <p className="display-font text-xl font-bold text-slate-100">{fmt(totalCharged)}</p>
          </div>
          <div className="bg-slate-900/60 border border-white/5 rounded-xl p-4">
            <p className="text-slate-500 text-xs mb-1">{t('workReports.table.totalPayout')}</p>
            <p className="display-font text-xl font-bold text-amber-400">{fmt(totalPayout)}</p>
          </div>
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
            <p className="text-slate-500 text-xs mb-1">{t('workReports.table.companyProfit')}</p>
            <p className="display-font text-xl font-bold text-emerald-400">{fmt(totalProfit)}</p>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-slate-500">Cargando...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-slate-900/60 border border-white/5 rounded-xl p-12 text-center">
          <p className="text-slate-500">{t('workReports.empty')}</p>
          <Link href="/ordenes/nueva" className="text-amber-400 hover:text-amber-300 text-sm mt-2 inline-block">
            {t('workReports.emptyAction')}
          </Link>
        </div>
      ) : (
        <div className="bg-slate-900/60 border border-white/5 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-4 py-3 text-slate-500 font-medium">{t('workReports.table.date')}</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">{t('workReports.table.truck')}</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">{t('workReports.table.company')}</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">{t('workReports.table.orderNumber')}</th>
                <th className="text-center px-4 py-3 text-slate-500 font-medium">{t('workReports.table.tasks')}</th>
                <th className="text-right px-4 py-3 text-slate-500 font-medium">{t('workReports.table.totalCharged')}</th>
                <th className="text-right px-4 py-3 text-slate-500 font-medium">{t('workReports.table.totalPayout')}</th>
                <th className="text-right px-4 py-3 text-slate-500 font-medium">{t('workReports.table.companyProfit')}</th>
                {isSuperAdmin && (
                  <th className="text-center px-4 py-3 text-slate-500 font-medium">{t('workReports.table.actions')}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-white/5 hover:bg-white/2 transition-colors">
                  <td className="px-4 py-3.5 text-slate-400">
                    {new Date(r.work_date + 'T12:00:00').toLocaleDateString('es-MX')}
                  </td>
                  <td className="px-4 py-3.5 text-slate-200 font-medium">{r.truck_number}</td>
                  <td className="px-4 py-3.5 text-slate-400">{r.company}</td>
                  <td className="px-4 py-3.5 text-slate-500 font-mono text-xs">{r.external_order_number ?? '—'}</td>
                  <td className="px-4 py-3.5 text-center">
                    <span className="bg-slate-700 text-slate-300 text-xs px-2 py-0.5 rounded-full">{r.task_count}</span>
                  </td>
                  <td className="px-4 py-3.5 text-right text-slate-300 font-medium">{fmt(r.total_charged)}</td>
                  <td className="px-4 py-3.5 text-right text-amber-400">{fmt(r.total_payout)}</td>
                  <td className="px-4 py-3.5 text-right text-emerald-400 font-semibold">
                    {fmt(r.total_charged - r.total_payout)}
                  </td>
                  {isSuperAdmin && (
                    <td className="px-4 py-3.5 text-center">
                      <button
                        onClick={() => setDeleteTarget(r)}
                        title={t('workReports.delete')}
                        className="text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg p-1.5 transition"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-8 w-full max-w-md shadow-2xl">
            <div className="w-12 h-12 bg-red-500/15 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <h2 className="display-font text-slate-100 font-bold text-lg tracking-wide text-center mb-2">
              {t('workReports.deleteConfirmTitle')}
            </h2>
            <div className="bg-slate-800/60 rounded-xl p-3 mb-4 text-center">
              <p className="text-slate-300 text-sm font-medium">{deleteTarget.company} — {deleteTarget.truck_number}</p>
              <p className="text-slate-500 text-xs mt-0.5">
                {new Date(deleteTarget.work_date + 'T12:00:00').toLocaleDateString('es-MX')}
                {deleteTarget.external_order_number ? ` · ${deleteTarget.external_order_number}` : ''}
              </p>
            </div>
            <p className="text-slate-400 text-sm text-center mb-6">{t('workReports.deleteConfirmMsg')}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2.5 rounded-lg text-sm font-medium transition"
              >
                {t('workReports.deleteCancelBtn')}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-400 py-2.5 rounded-lg text-sm font-medium transition"
              >
                {deleting ? t('workReports.deleting') : t('workReports.deleteConfirmBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
