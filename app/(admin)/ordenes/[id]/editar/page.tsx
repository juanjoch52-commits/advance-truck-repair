'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import ReportForm, { uid, type Employee, type ReportFormData, type ReportTask, type ClientOption } from '@/components/reports/ReportForm';

export default function EditarOrdenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: reportId } = use(params);
  const { t } = useLanguage();
  const router = useRouter();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [initialData, setInitialData] = useState<ReportFormData | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    // Rol de la sesión (cookie de PIN validada en el servidor).
    (async () => {
      let role = '';
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const j = await res.json();
          role = (j?.user?.role ?? '').toLowerCase();
        }
      } catch {}

      setAllowed(role === 'super_user' || role === 'super_admin' || role === 'owner' || role === 'admin');
    })();

    // Solo mecánicos activos para el dropdown de asignaciones.
    fetch('/api/empleados')
      .then(r => r.ok ? r.json() : { employees: [] })
      .then(j => {
        const mechanics = ((j.employees ?? []) as any[]).filter((e: any) =>
          e.is_active && (e.role === 'mechanic' || e.payment_type === 'mechanic_commission')
        );
        setEmployees(mechanics.map((e: any) => ({ id: e.id, full_name: e.full_name })));
      })
      .catch(() => setEmployees([]));

    // Árbol de clientes para los selects encadenados.
    fetch('/api/clientes?tree=1')
      .then(r => r.ok ? r.json() : { clients: [] })
      .then(j => setClients((j.clients ?? []) as ClientOption[]))
      .catch(() => setClients([]));

    // Cargar la orden desde la API server-side.
    (async () => {
      try {
        const res = await fetch(`/api/ordenes/${reportId}`);
        if (!res.ok) {
          setLoadError(t('editReport.notFound'));
          return;
        }
        const j = await res.json();
        const header = j.report;
        if (!header) {
          setLoadError(t('editReport.notFound'));
          return;
        }

        const rawTasks: any[] = j.tasks ?? [];
        const assignments: any[] = j.assignments ?? [];

        const tasks: ReportTask[] = rawTasks.map((trow: any) => ({
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
          clientId: header.client_id ?? '',
          locationId: header.location_id ?? '',
          truckId: header.truck_id ?? '',
        });
      } catch {
        setLoadError(t('editReport.notFound'));
      }
    })();
  }, [reportId]);

  async function handleSubmit(data: ReportFormData): Promise<{ ok: boolean; error?: string }> {
    // La edición (actualizar encabezado + reemplazar tareas/asignaciones/
    // earned_entries) vive ahora en el servidor.
    try {
      const res = await fetch(`/api/ordenes/${reportId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report: {
            external_order_number: data.externalOrderNumber.trim() || null,
            truck_number: data.truckNumber.trim(),
            company: data.company.trim(),
            work_date: data.workDate,
            notes: data.notes.trim() || null,
            client_id: data.clientId || null,
            location_id: data.locationId || null,
            truck_id: data.truckId || null,
          },
          tasks: data.tasks.map((task, sortOrder) => ({
            description: task.description.trim(),
            amount_charged_to_client: parseFloat(task.amount_charged_to_client),
            sort_order: sortOrder,
            assignments: task.mechanics.map(m => ({
              employee_id: m.employee_id,
              commission_percentage: parseFloat(m.commission_percentage),
            })),
          })),
        }),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, error: 'Error al actualizar reporte: ' + (j?.error ?? 'desconocido') };
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
      reportId={reportId}
      initialData={initialData}
      employees={employees}
      clients={clients}
      onSubmit={handleSubmit}
      title={t('editReport.title')}
      submitLabel={t('editReport.save')}
      submitLabelLoading={t('newReport.saving')}
      successMessage={t('editReport.success')}
    />
  );
}
