'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SuperViewSelector } from '@/components/SuperViewSelector';
import { Toast } from '@/components/Toast';

// ─── Types ───────────────────────────────────────────────────────────────────

type Employee = { id: string; full_name: string };

type SessionEmployee = { id: string; full_name: string; role: string };
type AuthSessionEmployee = SessionEmployee & {
  effective_role?: 'owner' | 'admin' | 'mechanic';
  is_super_user?: boolean;
};

type WorkSummary = {
  id: string;
  work_date: string;
  company: string;
  unit: string;
  invoice_number: string | null;
  labor_amount: number;
  status: string;
  approved_amount: number;
  rejection_reason?: string | null;
};

type PendingLoan = {
  id: string;
  amount: number;
  description: string;
  date: string;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const inputCls =
  'w-full rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-base text-slate-100 placeholder-slate-500 outline-none focus:border-amber-300/70 focus:ring-2 focus:ring-amber-300/20 transition';

const labelCls = 'mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-slate-400';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  if (status === 'approved') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-0.5 text-xs font-bold text-emerald-300">
        ✅ Aprobado
      </span>
    );
  }
  if (status === 'rejected') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-400/30 bg-red-400/10 px-3 py-0.5 text-xs font-bold text-red-300">
        ❌ Rechazado
      </span>
    );
  }
  if (status === 'paid') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-0.5 text-xs font-bold text-sky-300">
        💰 Pagado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-0.5 text-xs font-bold text-amber-300">
      ⏳ Pendiente
    </span>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LogoHeader({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 pb-2">
      <div className="w-40 rounded-2xl border border-amber-300/20 bg-transparent p-3">
        <Image
          src="/logo.png"
          alt="Advance Truck Repair"
          width={320}
          height={320}
          className="h-auto w-full object-contain [mix-blend-mode:multiply]"
          priority
          unoptimized
        />
      </div>
      {subtitle && (
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-amber-300">{subtitle}</p>
      )}
    </div>
  );
}

// ─── PIN Pad ─────────────────────────────────────────────────────────────────

type PinPadProps = {
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
};

function PinPad({ value, onChange, maxLength = 6 }: PinPadProps) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓'];

  function press(key: string) {
    if (key === '⌫') {
      onChange(value.slice(0, -1));
    } else if (key === '✓') {
      // handled by parent submit button
    } else if (value.length < maxLength) {
      onChange(value + key);
    }
  }

  return (
    <div className="space-y-3">
      {/* dots */}
      <div className="flex justify-center gap-3">
        {Array.from({ length: maxLength }).map((_, i) => (
          <span
            key={i}
            className={`h-3.5 w-3.5 rounded-full border-2 transition ${
              i < value.length
                ? 'border-amber-300 bg-amber-300'
                : 'border-white/20 bg-transparent'
            }`}
          />
        ))}
      </div>
      {/* grid */}
      <div className="grid grid-cols-3 gap-3">
        {keys.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            className={`rounded-2xl py-5 text-xl font-bold transition select-none active:scale-95 ${
              k === '✓'
                ? 'border border-emerald-400/30 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20'
                : k === '⌫'
                  ? 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                  : 'border border-white/10 bg-white/5 text-white hover:bg-white/10'
            }`}
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Login Screen ─────────────────────────────────────────────────────────────

type LoginScreenProps = {
  employees: Employee[];
  loadingEmployees: boolean;
  onLogin: (employee: SessionEmployee) => void;
  setToast: (t: { message: string; type: 'success' | 'error' }) => void;
};

function LoginScreen({ employees, loadingEmployees, onLogin, setToast }: LoginScreenProps) {
  const [selectedId, setSelectedId] = useState('');
  const [pin, setPin] = useState('');
  const [logging, setLogging] = useState(false);

  async function handleLogin() {
    if (!selectedId) {
      setToast({ message: 'Selecciona tu nombre primero.', type: 'error' });
      return;
    }
    if (pin.length < 4) {
      setToast({ message: 'El PIN debe tener al menos 4 dígitos.', type: 'error' });
      return;
    }

    setLogging(true);
    try {
      const res = await fetch('/api/mecanico/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: selectedId, pin }),
      });
      const json = await res.json() as { ok?: boolean; employee?: SessionEmployee; error?: string };

      if (!res.ok || !json.ok || !json.employee) {
        setPin('');
        setToast({ message: json.error ?? 'PIN incorrecto.', type: 'error' });
        return;
      }

      onLogin(json.employee);
    } catch {
      setPin('');
      setToast({ message: 'Error de conexión.', type: 'error' });
    } finally {
      setLogging(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm space-y-7">
        <LogoHeader subtitle="Portal del Mecánico" />

        <div className="rounded-[28px] border border-white/10 bg-slate-950/70 p-6 shadow-2xl backdrop-blur space-y-5">
          <div>
            <label htmlFor="employee-select" className={labelCls}>
              Tu nombre
            </label>
            {loadingEmployees ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-slate-400">
                Cargando lista…
              </div>
            ) : (
              <select
                id="employee-select"
                value={selectedId}
                onChange={(e) => { setSelectedId(e.target.value); setPin(''); }}
                className={inputCls}
              >
                <option value="">— Selecciona tu nombre —</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                ))}
              </select>
            )}
          </div>

          {selectedId && (
            <div className="space-y-3">
              <p className={labelCls}>Ingresa tu PIN</p>
              <PinPad value={pin} onChange={setPin} />
            </div>
          )}

          {selectedId && pin.length >= 4 && (
            <button
              type="button"
              onClick={() => void handleLogin()}
              disabled={logging}
              className="w-full rounded-2xl bg-amber-400 py-4 text-base font-bold uppercase tracking-[0.18em] text-slate-950 shadow-lg shadow-amber-900/40 transition hover:bg-amber-300 active:scale-95 disabled:opacity-50"
            >
              {logging ? 'Verificando…' : 'Entrar →'}
            </button>
          )}
        </div>

        <p className="text-center text-xs text-slate-600">
          ¿Olvidaste tu PIN? Contacta al mánager.
        </p>
      </div>
    </div>
  );
}

// ─── Work Form ────────────────────────────────────────────────────────────────

type WorkFormProps = {
  employeeId: string;
  onSaved: () => void;
  setToast: (t: { message: string; type: 'success' | 'error' }) => void;
};

function WorkForm({ employeeId, onSaved, setToast }: WorkFormProps) {
  const [form, setForm] = useState({
    company: '',
    unit: '',
    description: '',
    labor_amount: '',
  });
  const [paperworkPhoto, setPaperworkPhoto] = useState<File | null>(null);
  const [partPhoto, setPartPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const paperworkRef = useRef<HTMLInputElement>(null);
  const partRef = useRef<HTMLInputElement>(null);

  function field(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((p) => ({ ...p, [key]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.company || !form.unit || !form.labor_amount) {
      setToast({ message: 'Completa todos los campos obligatorios.', type: 'error' });
      return;
    }
    if (!paperworkPhoto || !partPhoto) {
      setToast({ message: 'Debes subir la foto del Paperwork y la de la pieza.', type: 'error' });
      return;
    }
    const labor = parseFloat(form.labor_amount);
    if (Number.isNaN(labor) || labor < 0) {
      setToast({ message: 'El monto debe ser un número válido.', type: 'error' });
      return;
    }

    setSaving(true);
    try {
      const payload = new FormData();
      payload.append('employee_id', employeeId);
      payload.append('work_date', new Date().toISOString().slice(0, 10));
      payload.append('company', form.company);
      payload.append('unit', form.unit);
      payload.append('invoice_number', form.description); // description maps to invoice_number
      payload.append('labor_amount', String(labor));
      payload.append('paperwork_photo', paperworkPhoto);
      payload.append('part_photo', partPhoto);

      const res = await fetch('/api/trabajos', { method: 'POST', body: payload });
      const json = await res.json() as { ok?: boolean; error?: string };

      if (!res.ok || !json.ok) {
        setToast({ message: json.error ?? 'Error al guardar.', type: 'error' });
        return;
      }

      setToast({ message: 'Trabajo registrado con éxito. Pendiente de aprobación por el mánager.', type: 'success' });
      setForm({ company: '', unit: '', description: '', labor_amount: '' });
      setPaperworkPhoto(null);
      setPartPhoto(null);
      if (paperworkRef.current) paperworkRef.current.value = '';
      if (partRef.current) partRef.current.value = '';
      onSaved();
    } catch {
      setToast({ message: 'Error de conexión.', type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-[28px] border border-white/10 bg-slate-950/70 p-5 shadow-2xl backdrop-blur space-y-5">
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-amber-300">Registrar Trabajo</p>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Unidad / Truck #</label>
          <input
            type="text"
            placeholder="Ej: TK-4821"
            value={form.unit}
            onChange={field('unit')}
            className={inputCls}
            required
          />
        </div>
        <div>
          <label className={labelCls}>Compañía</label>
          <input
            type="text"
            placeholder="Ej: FedEx"
            value={form.company}
            onChange={field('company')}
            className={inputCls}
            required
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>Descripción / Invoice</label>
        <textarea
          placeholder="Descripción del trabajo realizado…"
          value={form.description}
          onChange={field('description')}
          rows={3}
          className={`${inputCls} resize-none`}
        />
      </div>

      <div>
        <label className={labelCls}>Labor ($)</label>
        <input
          type="number"
          inputMode="decimal"
          placeholder="0.00"
          min={0}
          step="0.01"
          value={form.labor_amount}
          onChange={field('labor_amount')}
          className={inputCls}
          required
        />
      </div>

      {/* Photo uploads */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className={labelCls}>
            📄 Paperwork
            {paperworkPhoto && <span className="ml-1 text-emerald-400">✓</span>}
          </p>
          <button
            type="button"
            onClick={() => paperworkRef.current?.click()}
            className={`w-full rounded-2xl border py-4 text-sm font-bold transition active:scale-95 ${
              paperworkPhoto
                ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
                : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            {paperworkPhoto ? '✓ Cargada' : '📸 Subir'}
          </button>
          <input
            ref={paperworkRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => setPaperworkPhoto(e.target.files?.[0] ?? null)}
          />
        </div>

        <div>
          <p className={labelCls}>
            🔩 Pieza
            {partPhoto && <span className="ml-1 text-emerald-400">✓</span>}
          </p>
          <button
            type="button"
            onClick={() => partRef.current?.click()}
            className={`w-full rounded-2xl border py-4 text-sm font-bold transition active:scale-95 ${
              partPhoto
                ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
                : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            {partPhoto ? '✓ Cargada' : '📸 Subir'}
          </button>
          <input
            ref={partRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => setPartPhoto(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="w-full rounded-2xl bg-amber-400 py-5 text-base font-bold uppercase tracking-[0.18em] text-slate-950 shadow-lg shadow-amber-900/30 transition hover:bg-amber-300 active:scale-95 disabled:opacity-50"
      >
        {saving ? 'Guardando…' : '💾 Guardar Trabajo'}
      </button>
    </form>
  );
}

// ─── Weekly Summary ───────────────────────────────────────────────────────────

type WeeklySummaryProps = {
  employeeId: string;
  refreshKey: number;
};

function WeeklySummary({ employeeId, refreshKey }: WeeklySummaryProps) {
  const [orders, setOrders] = useState<WorkSummary[]>([]);
  const [week, setWeek] = useState({ start: '', end: '' });
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/mecanico/${employeeId}/semana`)
      .then((r) => r.json())
      .then((json: { orders?: WorkSummary[]; week?: { start: string; end: string }; error?: string }) => {
        setOrders(json.orders ?? []);
        if (json.week) setWeek(json.week);
      })
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, [employeeId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const totalApproved = orders
    .filter((o) => o.status === 'approved' || o.status === 'paid')
    .reduce((s, o) => s + o.approved_amount, 0);

  const totalPending = orders
    .filter((o) => o.status === 'pending' || o.status === 'pending_approval')
    .reduce((s, o) => s + o.labor_amount * 0.5, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-amber-300">Mi Semana</p>
        {week.start && (
          <span className="text-xs text-slate-500">{week.start} → {week.end}</span>
        )}
      </div>

      {/* Mini totals */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-4">
          <p className="text-xs text-slate-400 uppercase tracking-[0.18em]">Aprobado</p>
          <p className="mt-1 text-xl font-bold text-emerald-300">{money.format(totalApproved)}</p>
        </div>
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4">
          <p className="text-xs text-slate-400 uppercase tracking-[0.18em]">Pendiente</p>
          <p className="mt-1 text-xl font-bold text-amber-300">~{money.format(totalPending)}</p>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-6 text-center text-sm text-slate-400">
          Cargando trabajos…
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-6 text-center space-y-1">
          <p className="text-2xl">📋</p>
          <p className="text-slate-400 text-sm">Sin trabajos registrados esta semana.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <div key={o.id} className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-white leading-tight">
                    {o.company} · {o.unit}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">{o.work_date}</p>
                  {o.invoice_number && (
                    <p className="mt-0.5 text-xs text-slate-500 truncate">{o.invoice_number}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  {statusBadge(o.status)}
                  <span className="text-sm font-bold text-slate-200">
                    {money.format(
                      (o.status === 'approved' || o.status === 'paid')
                        ? o.approved_amount
                        : o.labor_amount * 0.5,
                    )}
                  </span>
                </div>
              </div>
              {o.status === 'rejected' && o.rejection_reason && (
                <div className="mt-2 rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-xs text-red-200">
                  <span className="font-bold text-red-300">Motivo del rechazo: </span>
                  {o.rejection_reason}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type AccountSummaryProps = {
  employeeId: string;
  refreshKey: number;
};

function AccountSummaryCard({ employeeId, refreshKey }: AccountSummaryProps) {
  const [loading, setLoading] = useState(true);
  const [approvedProduction, setApprovedProduction] = useState(0);
  const [pendingLoansTotal, setPendingLoansTotal] = useState(0);
  const [netEstimated, setNetEstimated] = useState(0);
  const [loans, setLoans] = useState<PendingLoan[]>([]);
  const [showDetails, setShowDetails] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/mecanico/${employeeId}/estado-cuenta`)
      .then((r) => r.json())
      .then((json: {
        approvedProduction?: number;
        pendingLoansTotal?: number;
        netEstimated?: number;
        pendingLoans?: PendingLoan[];
      }) => {
        setApprovedProduction(Number(json.approvedProduction ?? 0));
        setPendingLoansTotal(Number(json.pendingLoansTotal ?? 0));
        setNetEstimated(Number(json.netEstimated ?? 0));
        setLoans(json.pendingLoans ?? []);
      })
      .catch(() => {
        setApprovedProduction(0);
        setPendingLoansTotal(0);
        setNetEstimated(0);
        setLoans([]);
      })
      .finally(() => setLoading(false));
  }, [employeeId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  return (
    <section className="rounded-[28px] border border-sky-300/20 bg-gradient-to-br from-slate-950/80 via-slate-900/75 to-sky-950/70 p-5 shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-[0.22em] text-sky-200">Mi Resumen Semanal</h2>
        {loading && <span className="text-xs text-slate-400">Actualizando…</span>}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <article className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-4">
          <p className="text-[11px] uppercase tracking-[0.16em] text-emerald-200">Producción Aprobada</p>
          <p className="mt-1 text-xl font-bold text-emerald-300">{money.format(approvedProduction)}</p>
        </article>

        <article className="rounded-2xl border border-orange-300/25 bg-orange-400/10 p-4">
          <p className="text-[11px] uppercase tracking-[0.16em] text-orange-200">Deudas/Adelantos Pendientes</p>
          <p className="mt-1 text-xl font-bold text-orange-300">{money.format(pendingLoansTotal)}</p>
        </article>

        <article className="rounded-2xl border border-sky-300/30 bg-sky-400/10 p-4">
          <p className="text-[11px] uppercase tracking-[0.16em] text-sky-200">Neto Estimado</p>
          <p className="mt-1 text-2xl font-extrabold text-sky-100">{money.format(netEstimated)}</p>
        </article>
      </div>

      {loans.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowDetails((current) => !current)}
            className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-300 transition hover:bg-white/10"
          >
            {showDetails ? 'Ocultar detalles' : 'Ver detalles'}
          </button>

          {showDetails && (
            <div className="mt-3 space-y-2">
              {loans.map((loan) => {
                const formattedDate = new Date(loan.date).toLocaleDateString('en-US', {
                  month: '2-digit',
                  day: '2-digit',
                });

                return (
                  <div
                    key={loan.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-orange-300/20 bg-orange-400/5 px-3 py-2"
                  >
                    <p className="min-w-0 truncate text-sm text-slate-200">
                      {formattedDate} - {loan.description}
                    </p>
                    <p className="shrink-0 text-sm font-bold text-orange-300">{money.format(loan.amount)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TallerPage() {
  const [bootLoading, setBootLoading] = useState(true);
  const [session, setSession] = useState<SessionEmployee | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((json: { authenticated?: boolean; user?: AuthSessionEmployee }) => {
        if (!json.authenticated || !json.user) {
          window.location.href = '/';
          return;
        }

        if (json.user.effective_role !== 'mechanic') {
          window.location.href = '/dashboard';
          return;
        }

        setSession(json.user);
      })
      .catch(() => {
        window.location.href = '/';
      })
      .finally(() => setBootLoading(false));
  }, []);

  function handleLogout() {
    window.location.href = '/salir';
  }

  if (bootLoading) {
    return (
      <main className="brand-bg min-h-screen flex items-center justify-center text-slate-300">
        Cargando sesión...
      </main>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <main className="brand-bg min-h-screen text-slate-100">
      <div className="mx-auto max-w-lg px-4 py-6 space-y-6">
        {/* App header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
              <div className="w-10 rounded-xl border border-amber-300/20 bg-transparent p-1">
              <Image
                src="/logo.png"
                alt="ATR"
                width={80}
                height={80}
                  className="h-auto w-full object-contain [mix-blend-mode:multiply]"
                unoptimized
              />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">Mecánico</p>
              <p className="text-sm font-bold text-white leading-none">{session.full_name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400 transition hover:text-white"
          >
            Salir
          </button>
        </div>

        <div className="flex justify-end">
          <SuperViewSelector />
        </div>

        <AccountSummaryCard employeeId={session.id} refreshKey={refreshKey} />

        {/* Work form */}
        <WorkForm
          employeeId={session.id}
          onSaved={() => setRefreshKey((k) => k + 1)}
          setToast={(t) => setToast(t)}
        />

        {/* Weekly summary */}
        <div className="rounded-[28px] border border-white/10 bg-slate-950/70 p-5 shadow-2xl backdrop-blur">
          <WeeklySummary employeeId={session.id} refreshKey={refreshKey} />
        </div>

        <p className="pb-4 text-center text-xs text-slate-600">
          Advance Truck Repair · JRC Smart Systems
        </p>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </main>
  );
}
