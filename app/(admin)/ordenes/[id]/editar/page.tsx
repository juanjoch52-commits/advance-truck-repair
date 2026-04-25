'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { useLanguage } from '@/contexts/LanguageContext';
import ReportForm, { uid, type Employee, type ReportFormData, type ReportTask } from '@/components/reports/ReportForm';

function getWeekRange(dateStr: string) {
  const date = new Date(dateStr + 'T12:00:00');
  const day = date.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + diffToMon);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday.toISOString().split('T')[0],
    end: sunday.toISOString().split('T')[0],
  };
}

export default function EditarOrdenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: reportId } = use(params);
  const { t } = useLanguage();
  const router = useRouter();
  const supabase = createClient();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [initialData, setInitialData] = useState<ReportFormData | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    // Detect role from BOTH auth flows (PIN session + Supabase Auth)
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

      setAllowed(role === 'super_user' || role === 'super_admin' || role === 'owner' || role === 'admin');
    })();

    // Load mechanics only for the assignment dropdown (exclude suspended)
    (supabase as any)
      .from('employees')
      .select('id, full_name, role, payment_type, is_active')
      .eq('is_active', true)
      .order('full_name')
      .then(({ data }: any) => {
        const mechanics = (data ?? []).filter((e: any) =>
          e.role === 'mechanic' || e.payment_type === 'mechanic_commission'
        );
        setEmployees(mechanics.map((e: any) => ({ id: e.id, full_name: e.full_name })));
      });

    // Load report
    (async () => {
      const { data: header, error: headerErr } = await (supabase as any)
        .from('work_reports')
        .select('id, external_order_number, truck_number, company, work_date, notes')
        .eq('id', reportId)
        .single();

      if (headerErr || !header) {
        setLoadError(t('editReport.notFound'));
        return;
      }

      const { data: rawTasks } = await (supabase as any)
        .from('report_tasks')
        .select('id, description, amount_charged_to_client, sort_order')
        .eq('report_id', reportId)
        .order('sort_order', { ascending: true });

      const taskIds: string[] = (rawTasks ?? []).map((trow: any) => trow.id);

      let assignments: any[] = [];
      if (taskIds.length > 0) {
        const { data: ass } = await (supabase as any)
          .from('task_assignments')
          .select('id, task_id, employee_id, commission_percentage')
          .in('task_id', taskIds);
        assignments = ass ?? [];
      }

      const tasks: ReportTask[] = (rawTasks ?? []).map((trow: any) => ({
        id: uid(),
        description: trow.description,
        amount_charged_to_client: String(Number(trow.amount_charged_to_client)),
        mechanics: assignments
          .filter((a: any) => a.task_id === trow.id)
          .map((a: any) => ({
            id: uid(),
            employee_id: a.employee_id,
            commission_percentage: String(Number(a.commission_percentage)),
          })),
      }));

      setInitialData({
        externalOrderNumber: header.external_order_number ?? '',
        truckNumber: header.truck_number,
        company: header.company,
        workDate: header.work_date,
        notes: header.notes ?? '',
        tasks: tasks.length > 0 ? tasks : [],
      });
    })();
  }, [reportId]);

  async function handleSubmit(data: ReportFormData): Promise<{ ok: boolean; error?: string }> {
    const { start: weekStart, end: weekEnd } = getWeekRange(data.workDate);

    // Strategy: replace all child rows (tasks/assignments/earned_entries) and update header.
    try {
      // 1) Update header
      const { error: updErr } = await (supabase as any)
        .from('work_reports')
        .update({
          external_order_number: data.externalOrderNumber.trim() || null,
          truck_number: data.truckNumber.trim(),
          company: data.company.trim(),
          work_date: data.workDate,
          notes: data.notes.trim() || null,
        })
        .eq('id', reportId);
      if (updErr) return { ok: false, error: 'Error al actualizar reporte: ' + updErr.message };

      // 2) Get current task IDs to clean up
      const { data: oldTasks } = await (supabase as any)
        .from('report_tasks').select('id').eq('report_id', reportId);
      const oldTaskIds = (oldTasks ?? []).map((trow: any) => trow.id);

      // 3) Delete earned_entries first (FK to work_report_id)
      await (supabase as any).from('earned_entries').delete().eq('work_report_id', reportId);

      // 4) Delete assignments tied to those tasks
      if (oldTaskIds.length > 0) {
        await (supabase as any).from('task_assignments').delete().in('task_id', oldTaskIds);
      }

      // 5) Delete old tasks
      await (supabase as any).from('report_tasks').delete().eq('report_id', reportId);

      // 6) Re-create tasks/assignments/entries
      for (let sortOrder = 0; sortOrder < data.tasks.length; sortOrder++) {
        const task = data.tasks[sortOrder];
        const amountCharged = parseFloat(task.amount_charged_to_client);

        const { data: dbTask, error: taskErr } = await (supabase as any)
          .from('report_tasks')
          .insert({
            report_id: reportId,
            description: task.description.trim(),
            amount_charged_to_client: amountCharged,
            sort_order: sortOrder,
          })
          .select('id')
          .single();
        if (taskErr || !dbTask) return { ok: false, error: 'Error al guardar tarea: ' + (taskErr?.message ?? 'desconocido') };

        for (const m of task.mechanics) {
          const pct = parseFloat(m.commission_percentage);
          const payout = parseFloat(((amountCharged * pct) / 100).toFixed(2));

          const { data: assignment, error: assignErr } = await (supabase as any)
            .from('task_assignments')
            .insert({
              task_id: dbTask.id,
              employee_id: m.employee_id,
              commission_percentage: pct,
              mechanic_payout: payout,
            })
            .select('id')
            .single();
          if (assignErr || !assignment) return { ok: false, error: 'Error al guardar asignación: ' + (assignErr?.message ?? 'desconocido') };

          await (supabase as any).from('earned_entries').insert({
            task_assignment_id: assignment.id,
            work_report_id: reportId,
            employee_id: m.employee_id,
            amount: payout,
            work_date: data.workDate,
            truck_number: data.truckNumber.trim(),
            mechanic_role: 'mechanic',
            entry_type: 'mechanic',
            description: task.description.trim(),
            week_start: weekStart,
            week_end: weekEnd,
          });
        }
      }

      setTimeout(() => router.push('/ordenes'), 1500);
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? 'Error desconocido' };
    }
  }

  if (allowed === false) {
    return (
      <div className="max-w-2xl mx-auto bg-red-500/10 border border-red-500/30 rounded-xl p-8 text-center">
        <h2 className="display-font text-red-400 font-bold text-xl mb-2">{t('editReport.notAllowedTitle')}</h2>
        <p className="text-slate-400 text-sm">{t('editReport.notAllowedMsg')}</p>
        <a href="/ordenes" className="inline-block mt-4 text-amber-400 hover:text-amber-300 text-sm">
          {t('newReport.back')}
        </a>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-2xl mx-auto bg-slate-900/60 border border-white/10 rounded-xl p-8 text-center">
        <p className="text-slate-400">{loadError}</p>
        <a href="/ordenes" className="inline-block mt-4 text-amber-400 hover:text-amber-300 text-sm">
          {t('newReport.back')}
        </a>
      </div>
    );
  }

  if (!initialData || allowed === null) {
    return <div className="text-center py-12 text-slate-500">{t('common.loading')}</div>;
  }

  return (
    <ReportForm
      mode="edit"
      initialData={initialData}
      employees={employees}
      onSubmit={handleSubmit}
      title={t('editReport.title')}
      submitLabel={t('editReport.save')}
      submitLabelLoading={t('newReport.saving')}
      successMessage={t('editReport.success')}
    />
  );
}
