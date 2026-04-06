'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Toast } from '@/components/Toast';

type EmployeeProfileEditModalProps = {
  employeeId: string;
  initialPhone: string | null;
  initialEmail: string | null;
  initialAddress: string | null;
  initialNotes: string | null;
};

export function EmployeeProfileEditModal({
  employeeId,
  initialPhone,
  initialEmail,
  initialAddress,
  initialNotes,
}: EmployeeProfileEditModalProps) {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [form, setForm] = useState({
    phone: initialPhone ?? '',
    email: initialEmail ?? '',
    address: initialAddress ?? '',
    access_pin: '',
    notes: initialNotes ?? '',
  });

  async function handleSave() {
    if (form.access_pin && !/^\d{4}$/.test(form.access_pin)) {
      setToast({ message: 'El PIN debe tener 4 dígitos.', type: 'error' });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/empleados/${employeeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: form.phone,
          email: form.email,
          address: form.address,
          access_pin: form.access_pin || null,
          notes: form.notes,
        }),
      });

      const json = await response.json() as { ok?: boolean; error?: string };

      if (!response.ok || !json.ok) {
        setToast({ message: json.error ?? 'No se pudo actualizar la información.', type: 'error' });
        return;
      }

      setOpen(false);
      setForm((current) => ({ ...current, access_pin: '' }));
      setToast({ message: 'Información actualizada correctamente.', type: 'success' });
      router.refresh();
    } catch {
      setToast({ message: 'Error de conexión al guardar.', type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-sm font-semibold text-amber-200 transition hover:bg-amber-300 hover:text-slate-950"
      >
        Editar Información
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-slate-950 p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="display-font text-2xl font-bold uppercase text-white">Editar Información</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.16em] text-slate-400 hover:text-white"
              >
                Cerrar
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              <label className="text-sm text-slate-300">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Teléfono</span>
                <input
                  value={form.phone}
                  onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 outline-none focus:border-amber-300/60"
                />
              </label>

              <label className="text-sm text-slate-300">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Correo</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 outline-none focus:border-amber-300/60"
                />
              </label>

              <label className="text-sm text-slate-300">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Dirección</span>
                <input
                  value={form.address}
                  onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 outline-none focus:border-amber-300/60"
                />
              </label>

              <label className="text-sm text-slate-300">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">PIN de acceso (4 dígitos)</span>
                <input
                  inputMode="numeric"
                  maxLength={4}
                  value={form.access_pin}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    access_pin: event.target.value.replace(/\D/g, '').slice(0, 4),
                  }))}
                  placeholder="Dejar vacío para mantener el PIN actual"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 outline-none focus:border-amber-300/60"
                />
              </label>

              <label className="text-sm text-slate-300">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Notas personales</span>
                <textarea
                  rows={4}
                  value={form.notes}
                  onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 outline-none focus:border-amber-300/60"
                />
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="rounded-xl bg-amber-400 px-5 py-2 text-sm font-bold uppercase tracking-[0.14em] text-slate-950 transition hover:bg-amber-300 disabled:opacity-50"
              >
                {saving ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}
