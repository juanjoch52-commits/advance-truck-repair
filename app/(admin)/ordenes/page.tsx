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
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [reports, setReports] = useState<WorkReport[]>([]);
  const [loading, setLoading] = useState(true);

  const fmt = (n: number) =>
    '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  useEffect(() => {
    supabase.from('employees' as any).select('id, full_name').order('full_name')
      .then(({ data }) => setEmployees((data as any) ?? []));
  }, []);

  useEffect(() => { loadReports(); }, [dateFrom, dateTo, selectedMechanic, globalView]);

  async function loadReports() {
    setLoading(true);

    // Build base query for work_reports
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

    // Get tasks for aggregation
    const { data: tasks } = await (supabase as any)
      .from('report_tasks')
      .select('id, report_id, amount_charged_to_client')
      .in('report_id', rids);

    const taskIds: string[] = (tasks ?? []).map((t: any) => t.id);

    // Get all assignments (optionally filtered by mechanic)
    let assignQuery = (supabase as any)
      .from('task_assignments')
      .select('task_id, employee_id, mechanic_payout')
      .in('task_id', taskIds.length > 0 ? taskIds : ['00000000-0000-0000-0000-000000000000']);

    if (selectedMechanic) {
      assignQuery = assignQuery.eq('employee_id', selectedMechanic);
    }

    const { data: assignments } = await assignQuery;

    // Build lookup: taskId → reportId
    const taskToReport: Record<string, string> = {};
    const taskCharged: Record<string, number> = {};
    for (const t of tasks ?? []) {
      taskToReport[t.id] = t.report_id;
      taskCharged[t.id] = Number(t.amount_charged_to_client);
    }

    // Aggregate per report
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

    // Charged per report = sum of all tasks in that report (regardless of mechanic filter)
    const chargedByReport: Record<string, number> = {};
    for (const t of tasks ?? []) {
      chargedByReport[t.report_id] = (chargedByReport[t.report_id] ?? 0) + Number(t.amount_charged_to_client);
    }

    let result: WorkReport[] = rawReports
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

  const totalCharged = reports.reduce((s, r) => s + r.total_charged, 0);
  const totalPayout  = reports.reduce((s, r) => s + r.total_payout, 0);
  const totalProfit  = totalCharged - totalPayout;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="display-font text-3xl font-bold text-slate-100 tracking-wide">
            {t('workReports.title')}
          </h1>
          <p className="text-slate-400 mt-1">{reports.length} {t('workReports.records')}</p>
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
      <div className="bg-slate-900/60 border border-white/5 rounded-xl p-4 mb-5 flex flex-wrap items-end gap-4">
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

      {/* Summary cards */}
      {reports.length > 0 && (
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
      ) : reports.length === 0 ? (
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
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
