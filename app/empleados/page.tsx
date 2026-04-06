'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Toast } from '@/components/Toast';

type Employee = {
  id: string;
  full_name: string;
  phone: string | null;
  hire_date: string;
  role: 'mechanic' | 'admin';
  notes: string | null;
};

const inputClass =
  'w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-amber-300/60 focus:ring-1 focus:ring-amber-300/30 transition';

const labelClass =
  'mb-1.5 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-400';

export default function EmployeesManagementPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    access_pin: '',
    hire_date: new Date().toISOString().slice(0, 10),
    notes: '',
    role: 'mechanic' as 'mechanic' | 'admin',
  });

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/empleados');
      const data = await response.json() as { employees?: Employee[]; error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? 'No se pudieron cargar los empleados');
      }

      setEmployees(data.employees ?? []);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al cargar empleados';
      setToast({ message, type: 'error' });
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!/^\d{4}$/.test(form.access_pin)) {
      setToast({ message: 'El PIN debe tener exactamente 4 dígitos.', type: 'error' });
      return;
    }

    setSaving(true);

    try {
      const response = await fetch('/api/empleados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = await response.json() as { ok?: boolean; error?: string };

      if (!response.ok || !data.ok) {
        setToast({ message: data.error ?? 'No se pudo registrar el empleado.', type: 'error' });
        return;
      }

      setForm({
        full_name: '',
        phone: '',
        access_pin: '',
        hire_date: new Date().toISOString().slice(0, 10),
        notes: '',
        role: 'mechanic',
      });
      setToast({ message: 'Empleado registrado correctamente.', type: 'success' });
      await loadEmployees();
    } catch {
      setToast({ message: 'Error de conexión al registrar el empleado.', type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="brand-bg min-h-screen px-4 py-8 text-slate-100 sm:px-6">
      <section className="mx-auto grid max-w-7xl gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <section className="rounded-[28px] border border-white/10 bg-slate-950/60 p-6 shadow-2xl shadow-black/20 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">Gestión de Empleados</p>
              <h1 className="display-font mt-2 text-3xl font-bold uppercase text-white">Registrar Mecánico</h1>
            </div>
            <Link
              href="/dashboard"
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300 transition hover:border-amber-300/30 hover:text-white"
            >
              Dashboard
            </Link>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <div>
              <label htmlFor="full_name" className={labelClass}>Nombre Completo</label>
              <input
                id="full_name"
                required
                value={form.full_name}
                onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))}
                className={inputClass}
                placeholder="Ej. Carlos Mendoza"
              />
            </div>

            <div>
              <label htmlFor="phone" className={labelClass}>Teléfono</label>
              <input
                id="phone"
                value={form.phone}
                onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                className={inputClass}
                placeholder="Ej. (503) 555-0101"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="access_pin" className={labelClass}>PIN de acceso</label>
                <input
                  id="access_pin"
                  required
                  inputMode="numeric"
                  maxLength={4}
                  value={form.access_pin}
                  onChange={(event) => setForm((current) => ({ ...current, access_pin: event.target.value.replace(/\D/g, '').slice(0, 4) }))}
                  className={inputClass}
                  placeholder="4 dígitos"
                />
              </div>
              <div>
                <label htmlFor="hire_date" className={labelClass}>Fecha de contratación</label>
                <input
                  id="hire_date"
                  type="date"
                  required
                  value={form.hire_date}
                  onChange={(event) => setForm((current) => ({ ...current, hire_date: event.target.value }))}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label htmlFor="role" className={labelClass}>Rol</label>
              <select
                id="role"
                value={form.role}
                onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as 'mechanic' | 'admin' }))}
                className={inputClass}
              >
                <option value="mechanic">Mecánico</option>
                <option value="admin">Administración</option>
              </select>
            </div>

            <div>
              <label htmlFor="notes" className={labelClass}>Notas</label>
              <textarea
                id="notes"
                rows={4}
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                className={inputClass}
                placeholder="Información personal, observaciones, dirección, contacto de emergencia..."
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-xl bg-amber-400 px-6 py-3.5 text-sm font-bold uppercase tracking-[0.2em] text-slate-950 transition hover:bg-amber-300 disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Registrar empleado'}
            </button>
          </form>
        </section>

        <section className="rounded-[28px] border border-white/10 bg-slate-950/60 p-6 shadow-2xl shadow-black/20 backdrop-blur">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-slate-400">Equipo actual</p>
              <h2 className="display-font mt-2 text-3xl font-bold text-white">Plantilla registrada</h2>
            </div>
            <p className="max-w-md text-sm text-slate-400">
              Cada nombre abre su perfil individual con producción, deudas y el historial operativo del taller.
            </p>
          </div>

          {loading ? (
            <div className="mt-8 rounded-2xl border border-dashed border-white/10 p-8 text-center text-slate-400">
              Cargando empleados...
            </div>
          ) : employees.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-dashed border-white/10 p-8 text-center text-slate-400">
              No hay empleados registrados todavía.
            </div>
          ) : (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {employees.map((employee) => (
                <Link
                  key={employee.id}
                  href={`/empleados/${employee.id}`}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:border-amber-300/30 hover:bg-white/10"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-white">{employee.full_name}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">{employee.role === 'admin' ? 'Administración' : 'Mecánico'}</p>
                    </div>
                    <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-amber-200">
                      Ver perfil
                    </span>
                  </div>
                  <div className="mt-4 space-y-1 text-sm text-slate-300">
                    <p>Teléfono: {employee.phone ?? 'N/A'}</p>
                    <p>Contratación: {employee.hire_date}</p>
                    <p className="line-clamp-2 text-slate-400">{employee.notes ?? 'Sin notas registradas.'}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </section>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </main>
  );
}
