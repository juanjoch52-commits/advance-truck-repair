'use client';

import { useState } from 'react';

export default function ActualizarPinPage() {
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!/^\d{4,}$/.test(newPin)) {
      setError('El nuevo PIN debe tener al menos 4 dígitos.');
      return;
    }

    if (newPin !== confirmPin) {
      setError('La confirmación del PIN no coincide.');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/auth/update-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_pin: newPin }),
      });

      const json = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !json.ok) {
        setError(json.error ?? 'No se pudo actualizar el PIN.');
        return;
      }

      window.location.href = '/dashboard';
    } catch {
      setError('Error de conexión. Intenta nuevamente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="brand-bg min-h-screen px-4 py-10 text-slate-100 sm:px-6">
      <section className="mx-auto max-w-md rounded-[28px] border border-white/10 bg-slate-950/70 p-6 shadow-2xl backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">Seguridad</p>
        <h1 className="display-font mt-2 text-3xl font-bold uppercase text-white">Actualizar PIN</h1>
        <p className="mt-3 text-sm text-slate-400">
          Tu PIN actual es temporal. Debes crear un PIN personal para continuar.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block text-sm text-slate-300">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Nuevo PIN</span>
            <input
              type="password"
              inputMode="numeric"
              maxLength={10}
              value={newPin}
              onChange={(event) => setNewPin(event.target.value.replace(/\D/g, ''))}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 outline-none focus:border-amber-300/60"
            />
          </label>

          <label className="block text-sm text-slate-300">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Confirmar PIN</span>
            <input
              type="password"
              inputMode="numeric"
              maxLength={10}
              value={confirmPin}
              onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, ''))}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 outline-none focus:border-amber-300/60"
            />
          </label>

          {error && (
            <p className="rounded-xl border border-red-500/30 bg-red-950/40 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-amber-400 px-6 py-3 text-sm font-bold uppercase tracking-[0.2em] text-slate-950 transition hover:bg-amber-300 disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Guardar nuevo PIN'}
          </button>
        </form>
      </section>
    </main>
  );
}
