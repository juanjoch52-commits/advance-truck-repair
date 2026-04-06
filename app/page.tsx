'use client';

import { useState } from 'react';

type LoginResponse = {
  ok?: boolean;
  error?: string;
  user?: {
    role: 'owner' | 'admin' | 'mechanic';
  };
};

const inputClass =
  'w-full rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-center text-2xl font-bold tracking-[0.35em] text-slate-100 placeholder-slate-500 outline-none focus:border-amber-300/60 focus:ring-1 focus:ring-amber-300/30 transition';

export default function LoginPage() {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!/^\d{4,6}$/.test(pin)) {
      setError('Ingresa un PIN válido de 4 a 6 dígitos.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/auth/pin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });

      const json = await response.json() as LoginResponse;

      if (!response.ok || !json.ok || !json.user) {
        setError(json.error ?? 'PIN incorrecto.');
        setPin('');
        return;
      }

      window.location.href = '/dashboard';
    } catch {
      setError('Error de conexión. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="brand-bg min-h-screen px-4 py-10 text-slate-100 sm:px-6">
      <section className="mx-auto flex min-h-[80vh] w-full max-w-sm items-center justify-center">
        <div className="w-full space-y-6 rounded-[28px] border border-white/10 bg-slate-950/70 p-6 shadow-2xl backdrop-blur">
          <div className="text-center">
            <div className="mx-auto mb-4 w-40 rounded-2xl border border-amber-300/20 bg-transparent p-3">
              <img
                src="/logo.png"
                alt="Advance Truck Repair"
                className="h-auto w-full object-contain [mix-blend-mode:multiply]"
                loading="eager"
                decoding="async"
              />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">Acceso Seguro</p>
            <h1 className="display-font mt-2 text-3xl font-bold uppercase text-white">Bienvenido</h1>
            <p className="mt-2 text-sm text-slate-400">Ingresa tu PIN para abrir tu panel según tu rol.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <label htmlFor="pin" className="block text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
              PIN de seguridad
            </label>
            <input
              id="pin"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="••••"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
              className={inputClass}
            />

            {error && (
              <p className="rounded-xl border border-red-500/30 bg-red-950/40 px-3 py-2 text-sm text-red-200">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-amber-400 px-6 py-4 text-sm font-bold uppercase tracking-[0.2em] text-slate-950 transition hover:bg-amber-300 disabled:opacity-50"
            >
              {loading ? 'Verificando...' : 'Entrar'}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
