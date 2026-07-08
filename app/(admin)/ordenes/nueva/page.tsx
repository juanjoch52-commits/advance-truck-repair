'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import ReportForm, { newTask, type Employee, type ReportFormData, type ClientOption } from '@/components/reports/ReportForm';

export default function NuevaOrdenPage() {
  const { t } = useLanguage();
  const router = useRouter();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);

  useEffect(() => {
    // Árbol de clientes (cliente → distritos → camiones) para los selects.
    fetch('/api/clientes?tree=1')
      .then(r => r.ok ? r.json() : { clients: [] })
      .then(j => setClients((j.clients ?? []) as ClientOption[]))
      .catch(() => setClients([]));

    // Solo mecánicos activos en el dropdown. Aceptamos role='mechanic' O
    // payment_type='mechanic_commission' (cubre filas legadas sin payment_type).
    fetch('/api/empleados')
      .then(r => r.ok ? r.json() : { employees: [] })
      .then(j => {
        const mechanics = ((j.employees ?? []) as any[]).filter((e: any) =>
          e.is_active && (e.role === 'mechanic' || e.payment_type === 'mechanic_commission')
        );
        setEmployees(mechanics.map((e: any) => ({ id: e.id, full_name: e.full_name })));
      })
      .catch(() => setEmployees([]));
  }, []);

  async function handleSubmit(data: ReportFormData): Promise<{ ok: boolean; error?: string }> {
    // Toda la creación (reporte + tareas + asignaciones + earned_entries)
    // vive en el servidor; la auditoría se estampa con la sesión.
    try {
      const res = await fetch('/api/ordenes', {
        method: 'POST',
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
        return { ok: false, error: 'Error al crear reporte: ' + (j?.error ?? 'desconocido') };
      }

      setTimeout(() => router.push('/ordenes'), 1500);
      return { ok: true };
    } catch {
      return { ok: false, error: 'Error al crear reporte: sin conexión' };
    }
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
