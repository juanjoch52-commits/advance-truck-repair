'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { useLanguage } from '@/contexts/LanguageContext';
import ReportForm, { newTask, type Employee, type ReportFormData, type ClientOption } from '@/components/reports/ReportForm';
import { computePayout } from '@/lib/money';

interface CurrentUser {
  id: string;
  full_name: string;
  role: string;
  effective_role: string;
}

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

export default function NuevaOrdenPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const supabase = createClient();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    // Árbol de clientes (cliente → distritos → camiones) para los selects.
    fetch('/api/clientes?tree=1')
      .then(r => r.ok ? r.json() : { clients: [] })
      .then(j => setClients((j.clients ?? []) as ClientOption[]))
      .catch(() => setClients([]));

    // Only show mechanics in the dropdown.
    // We accept rows where role='mechanic' OR payment_type='mechanic_commission'
    // (covers legacy rows where payment_type was never set).
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

    // Detect creator from PIN session OR Supabase auth + profiles
    (async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const j = await res.json();
          if (j?.authenticated && j.user) {
            setCurrentUser({
              id: j.user.id,
              full_name: j.user.full_name,
              role: j.user.role,
              effective_role: j.user.effective_role,
            });
            return;
          }
        }
      } catch {}

      // Fallback: Supabase auth
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await (supabase as any)
            .from('profiles')
            .select('id, full_name, email, role')
            .eq('id', user.id)
            .single();
          if (profile) {
            setCurrentUser({
              id: (profile as any).id,
              full_name: (profile as any).full_name || (profile as any).email || 'Admin',
              role: (profile as any).role || 'admin',
              effective_role: (profile as any).role || 'admin',
            });
          }
        }
      } catch {}
    })();
  }, []);

  async function handleSubmit(data: ReportFormData): Promise<{ ok: boolean; error?: string }> {
    const { start: weekStart, end: weekEnd } = getWeekRange(data.workDate);

    // 1. Insert work_report
    const { data: report, error: reportErr } = await (supabase as any)
      .from('work_reports')
      .insert({
        external_order_number: data.externalOrderNumber.trim() || null,
        truck_number: data.truckNumber.trim(),
        company: data.company.trim(),
        work_date: data.workDate,
        notes: data.notes.trim() || null,
        client_id: data.clientId || null,
        location_id: data.locationId || null,
        truck_id: data.truckId || null,
        created_by: currentUser?.id ?? null,
        created_by_name: currentUser?.full_name ?? null,
        created_by_role: currentUser?.role ?? null,
      })
      .select('id')
      .single();

    if (reportErr || !report) {
      return { ok: false, error: 'Error al crear reporte: ' + (reportErr?.message ?? 'desconocido') };
    }

    // 2. Insert tasks + assignments + earned_entries
    for (let sortOrder = 0; sortOrder < data.tasks.length; sortOrder++) {
      const task = data.tasks[sortOrder];
      const amountCharged = parseFloat(task.amount_charged_to_client);

      const { data: dbTask, error: taskErr } = await (supabase as any)
        .from('report_tasks')
        .insert({
          report_id: report.id,
          description: task.description.trim(),
          amount_charged_to_client: amountCharged,
          sort_order: sortOrder,
        })
        .select('id')
        .single();

      if (taskErr || !dbTask) {
        return { ok: false, error: 'Error al guardar tarea: ' + (taskErr?.message ?? 'desconocido') };
      }

      for (const m of task.mechanics) {
        const pct = parseFloat(m.commission_percentage);
        const payout = computePayout(amountCharged, pct);

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

        if (assignErr || !assignment) {
          return { ok: false, error: 'Error al guardar asignación: ' + (assignErr?.message ?? 'desconocido') };
        }

        await (supabase as any).from('earned_entries').insert({
          task_assignment_id: assignment.id,
          work_report_id: report.id,
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
  }

  const initialData: ReportFormData = {
    externalOrderNumber: '',
    truckNumber: '',
    company: '',
    workDate: new Date().toISOString().split('T')[0],
    notes: '',
    tasks: [newTask()],
    clientId: '',
    locationId: '',
    truckId: '',
  };

  return (
    <ReportForm
      mode="create"
      initialData={initialData}
      employees={employees}
      clients={clients}
      onSubmit={handleSubmit}
      title={t('newReport.title')}
      submitLabel={t('newReport.save')}
      submitLabelLoading={t('newReport.saving')}
      successMessage={t('newReport.success')}
    />
  );
}
