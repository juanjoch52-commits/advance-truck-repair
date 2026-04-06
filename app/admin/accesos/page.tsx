'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BackButton } from '@/components/BackButton';
import { SuperViewSelector } from '@/components/SuperViewSelector';
import { Toast } from '@/components/Toast';

type CredentialRow = {
  id: string;
  full_name: string;
  role: 'mechanic' | 'admin' | 'SUPER_USER' | 'owner';
  is_temporary_pin: boolean;
  temporary_pin_plain: string | null;
  pin_display: string;
};

const roleLabel: Record<CredentialRow['role'], string> = {
  mechanic: 'Mecánico',
  admin: 'Administradora',
  SUPER_USER: 'Super-Usuario',
  owner: 'Dueño',
};

type MeResponse = {
  authenticated: boolean;
  user?: { is_super_user: boolean };
};

export default function GestionAccesosPage() {
  const [rows, setRows] = useState<CredentialRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<'all' | 'temporary'>('all');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isSuperUser, setIsSuperUser] = useState(false);
  const [cleanupStep, setCleanupStep] = useState<'idle' | 'confirm' | 'running'>('idle');
  const [pinInputs, setPinInputs] = useState<Record<string, string>>({});

  const loadRows = useCallback(() => {
    setLoading(true);
    fetch('/api/accesos/credenciales')
      .then((res) => res.json())
      .then((json: { credentials?: CredentialRow[]; error?: string }) => {
        if (!json.credentials) throw new Error(json.error ?? 'No se pudieron cargar credenciales');
        setRows(json.credentials);
        setPinInputs(Object.fromEntries(json.credentials.map((row) => [row.id, row.pin_display])));
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Error al cargar credenciales';
        setToast({ message, type: 'error' });
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadRows();
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((json: MeResponse) => {
        if (json.authenticated && json.user?.is_super_user) {
          setIsSuperUser(true);
        }
      })
      .catch(() => {/* silent */});
  }, [loadRows]);

  async function handleLimpiarDatos() {
    if (cleanupStep === 'idle') {
      setCleanupStep('confirm');
      return;
    }
    setCleanupStep('running');
    try {
      const res = await fetch('/api/admin/limpiar-datos', { method: 'POST' });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setToast({ message: json.error ?? 'Error al limpiar datos.', type: 'error' });
      } else {
        setToast({ message: '✅ Datos de prueba eliminados. Dashboard en $0.00.', type: 'success' });
      }
    } catch {
      setToast({ message: 'Error de conexión.', type: 'error' });
    } finally {
      setCleanupStep('idle');
    }
  }

  const filteredRows = useMemo(
    () => (filterMode === 'temporary' ? rows.filter((row) => row.is_temporary_pin) : rows),
    [rows, filterMode],
  );

  async function handleResetPin(employeeId: string) {
    setResettingId(employeeId);
    try {
      const res = await fetch(`/api/accesos/${employeeId}/reset-pin`, { method: 'POST' });
      const json = await res.json() as { ok?: boolean; temporary_pin?: string; error?: string };

      if (!res.ok || !json.ok) {
        setToast({ message: json.error ?? 'No se pudo resetear el PIN.', type: 'error' });
        return;
      }

      setToast({ message: `PIN temporal generado: ${json.temporary_pin}`, type: 'success' });
      loadRows();
    } catch {
      setToast({ message: 'Error de conexión al resetear PIN.', type: 'error' });
    } finally {
      setResettingId(null);
    }
  }

  async function handleSavePin(employeeId: string) {
    const pin = String(pinInputs[employeeId] ?? '').trim();

    if (!/^\d{4,6}$/.test(pin)) {
      setToast({ message: 'El PIN debe tener entre 4 y 6 dígitos.', type: 'error' });
      return;
    }

    setResettingId(employeeId);
    try {
      const res = await fetch(`/api/accesos/${employeeId}/reset-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const json = await res.json() as { ok?: boolean; error?: string };

      if (!res.ok || !json.ok) {
        setToast({ message: json.error ?? 'No se pudo guardar el PIN.', type: 'error' });
        return;
      }

      setToast({ message: `PIN actualizado: ${pin}`, type: 'success' });
      loadRows();
    } catch {
      setToast({ message: 'Error de conexión al actualizar PIN.', type: 'error' });
    } finally {
      setResettingId(null);
    }
  }

  return (
    <main className="brand-bg min-h-screen px-4 py-8 text-slate-100 sm:px-6">
      <section className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center gap-4">
          <BackButton fallbackHref="/dashboard" label="Volver" />
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">Seguridad de Acceso</p>
            <h1 className="display-font text-3xl font-bold uppercase text-white sm:text-4xl">Gestión de Accesos</h1>
          </div>
          <SuperViewSelector />
        </div>

        <div className="rounded-2xl border border-fuchsia-300/20 bg-fuchsia-300/5 px-5 py-3 text-sm text-fuchsia-100/80">
          Pantalla restringida: solo Dueño y Super-Usuario pueden ver/gestionar PINes temporales.
        </div>

        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3">
          <p className="text-sm text-slate-300">Total empleados: <span className="font-semibold text-white">{rows.length}</span></p>
          <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            Filtro
            <select
              value={filterMode}
              onChange={(event) => setFilterMode(event.target.value as 'all' | 'temporary')}
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-200 outline-none"
            >
              <option value="all">Todos</option>
              <option value="temporary">Solo PIN temporal</option>
            </select>
          </label>
        </div>

        <div className="overflow-x-auto rounded-[24px] border border-white/10 bg-slate-950/60 shadow-2xl backdrop-blur">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-[0.2em] text-slate-400">
                <th className="px-4 py-3">Empleado</th>
                <th className="px-4 py-3">Rol</th>
                <th className="px-4 py-3">PIN Actual (o Temporal)</th>
                <th className="px-4 py-3">Estado PIN</th>
                <th className="px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">Cargando credenciales...</td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">Sin resultados para este filtro.</td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.id} className="border-b border-white/5 text-slate-200">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-white">{row.full_name}</p>
                      <p className="text-xs uppercase tracking-[0.14em] text-slate-500">ID {row.id.slice(0, 8)}</p>
                    </td>
                    <td className="px-4 py-3">{roleLabel[row.role]}</td>
                    <td className="px-4 py-3 font-mono tracking-wider text-amber-200">{row.pin_display}</td>
                    <td className="px-4 py-3">
                      {row.is_temporary_pin ? (
                        <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-amber-300">
                          Temporal
                        </span>
                      ) : (
                        <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300">
                          Personalizado
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex min-w-[280px] flex-wrap items-center gap-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={6}
                          value={pinInputs[row.id] ?? ''}
                          onChange={(event) => setPinInputs((prev) => ({
                            ...prev,
                            [row.id]: event.target.value.replace(/\D/g, '').slice(0, 6),
                          }))}
                          className="w-28 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white outline-none focus:border-amber-300/50"
                        />
                        <button
                          type="button"
                          disabled={resettingId === row.id}
                          onClick={() => void handleSavePin(row.id)}
                          className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-200 transition hover:bg-emerald-400/20 disabled:opacity-50"
                        >
                          {resettingId === row.id ? 'Guardando...' : 'Guardar PIN'}
                        </button>
                        <button
                          type="button"
                          disabled={resettingId === row.id}
                          onClick={() => void handleResetPin(row.id)}
                          className="rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-red-200 transition hover:bg-red-400/20 disabled:opacity-50"
                        >
                          {resettingId === row.id ? 'Reseteando...' : 'PIN aleatorio'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {/* ── Zona de peligro (solo super-usuario) ─────────────────────── */}
        {isSuperUser && (
          <div className="rounded-[24px] border border-red-500/30 bg-red-950/20 p-6 shadow-xl backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-400">Zona de Peligro · Solo Super-Usuario</p>
            <h2 className="mt-2 text-lg font-bold text-white">Limpieza total de datos de prueba</h2>
            <p className="mt-1 text-sm text-slate-400">
              Elimina <strong className="text-slate-200">todos</strong> los registros de órdenes de trabajo, asignaciones, deudas y deducciones.
              Los empleados <span className="text-emerald-300">no se borran</span>. Esta acción es <span className="text-red-300 font-semibold">irreversible</span>.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              {cleanupStep === 'idle' && (
                <button
                  type="button"
                  onClick={() => void handleLimpiarDatos()}
                  className="rounded-xl border border-red-400/40 bg-red-500/15 px-5 py-2.5 text-sm font-bold uppercase tracking-[0.14em] text-red-300 transition hover:bg-red-500/25"
                >
                  🗑 Limpiar datos de prueba
                </button>
              )}
              {cleanupStep === 'confirm' && (
                <>
                  <p className="text-sm font-semibold text-amber-300">⚠️ ¿Estás seguro? Esta acción no se puede deshacer.</p>
                  <button
                    type="button"
                    onClick={() => void handleLimpiarDatos()}
                    className="rounded-xl border border-red-400/60 bg-red-500 px-5 py-2.5 text-sm font-bold uppercase tracking-[0.14em] text-white transition hover:bg-red-400"
                  >
                    Sí, eliminar todo
                  </button>
                  <button
                    type="button"
                    onClick={() => setCleanupStep('idle')}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-slate-300 transition hover:bg-white/10"
                  >
                    Cancelar
                  </button>
                </>
              )}
              {cleanupStep === 'running' && (
                <p className="text-sm text-slate-400">Limpiando datos…</p>
              )}
            </div>
          </div>
        )}
      </section>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </main>
  );
}
