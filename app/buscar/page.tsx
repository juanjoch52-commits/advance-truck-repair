'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { BackButton } from '@/components/BackButton';
import { PhotoEvidenceButton } from '@/components/PhotoEvidenceButton';
import { Toast } from '@/components/Toast';

type Assignment = {
  approved_amount: number;
  employees: { full_name: string } | null;
};

type WorkOrderResult = {
  id: string;
  work_date: string;
  company: string;
  unit: string;
  invoice_number: string | null;
  labor_amount: number;
  mechanic_share: number;
  status: string;
  paperwork_path: string | null;
  part_photo_path: string | null;
  created_at: string;
  work_order_assignments: Assignment[];
};

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const statusColors: Record<string, string> = {
  approved: 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10',
  paid:     'text-sky-300 border-sky-400/30 bg-sky-400/10',
  pending:  'text-amber-300 border-amber-400/30 bg-amber-400/10',
  rejected: 'text-red-300 border-red-400/30 bg-red-400/10',
};

const statusLabels: Record<string, string> = {
  approved: 'Aprobado',
  paid:     'Pagado',
  pending:  'Pendiente',
  rejected: 'Rechazado',
};

export default function BuscarUnidadPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WorkOrderResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const handleSearch = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const q = query.trim();
      if (!q) return;

      setLoading(true);
      setResults(null);
      try {
        const res = await fetch(`/api/trabajos/buscar?unit=${encodeURIComponent(q)}`);
        const json = await res.json() as { work_orders?: WorkOrderResult[]; error?: string };

        if (!res.ok || !json.work_orders) {
          setToast({ message: json.error ?? 'Error al buscar.', type: 'error' });
          return;
        }
        setResults(json.work_orders);
      } catch {
        setToast({ message: 'Error de conexión.', type: 'error' });
      } finally {
        setLoading(false);
      }
    },
    [query],
  );

  return (
    <main className="brand-bg min-h-screen px-4 py-8 text-slate-100 sm:px-6">
      <section className="mx-auto max-w-5xl space-y-6">

        {/* Header */}
        <div className="flex items-center gap-4">
          <BackButton fallbackHref="/dashboard" label="Volver" />
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">Herramienta de búsqueda</p>
            <h1 className="display-font text-3xl font-bold uppercase text-white sm:text-4xl">Buscar por Unidad</h1>
          </div>
        </div>

        {/* Search form */}
        <form onSubmit={handleSearch} className="flex gap-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Número de unidad… ej: 1231, TK-4821"
            className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-base text-slate-100 placeholder-slate-500 outline-none focus:border-amber-300/60 focus:ring-1 focus:ring-amber-300/30 transition"
          />
          <button
            type="submit"
            disabled={loading || query.trim().length === 0}
            className="rounded-2xl bg-amber-400 px-6 py-4 text-sm font-bold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-amber-300 disabled:opacity-50"
          >
            {loading ? 'Buscando…' : '🔍 Buscar'}
          </button>
        </form>

        {/* Results */}
        {results !== null && (
          <>
            <p className="text-sm text-slate-400">
              {results.length === 0
                ? `Sin resultados para "${query}".`
                : `${results.length} trabajo${results.length !== 1 ? 's' : ''} encontrado${results.length !== 1 ? 's' : ''} para "${query}".`}
            </p>

            {results.length > 0 && (
              <div className="space-y-4">
                {results.map((order) => {
                  const mechanics = order.work_order_assignments
                    .map((a) => a.employees?.full_name ?? '—')
                    .join(', ');

                  const statusCls = statusColors[order.status] ?? statusColors['pending'];
                  const statusLabel = statusLabels[order.status] ?? order.status;

                  return (
                    <article
                      key={order.id}
                      className="rounded-[28px] border border-white/10 bg-slate-950/60 p-5 shadow-xl backdrop-blur"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="display-font text-lg font-bold text-white">
                              Unidad: <span className="text-amber-300">{order.unit}</span>
                            </h2>
                            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-[0.14em] ${statusCls}`}>
                              {statusLabel}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-slate-300">
                            {order.company} · {order.work_date}
                            {order.invoice_number ? ` · Invoice: ${order.invoice_number}` : ''}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            Mecánico{order.work_order_assignments.length !== 1 ? 's' : ''}: {mechanics || '—'}
                          </p>
                        </div>

                        <div className="flex flex-col items-end gap-1 text-right">
                          <p className="text-xs text-slate-400">Labor</p>
                          <p className="text-xl font-bold text-white">{money.format(order.labor_amount)}</p>
                          <p className="text-xs text-slate-500">
                            50% mec.: <span className="font-semibold text-emerald-300">{money.format(order.mechanic_share)}</span>
                          </p>
                        </div>
                      </div>

                      {(order.paperwork_path || order.part_photo_path) && (
                        <div className="mt-3">
                          <PhotoEvidenceButton
                            paperworkPath={order.paperwork_path}
                            partPhotoPath={order.part_photo_path}
                            uploadedAt={order.created_at}
                          />
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}

        {results === null && !loading && (
          <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-6 py-12 text-center">
            <p className="text-4xl">🔍</p>
            <p className="mt-3 text-lg font-semibold text-slate-200">Ingresa un número de unidad</p>
            <p className="mt-1 text-sm text-slate-400">Busca parcial o exacta. Por ejemplo: <code className="text-amber-300">1231</code> o <code className="text-amber-300">TK</code>.</p>
          </div>
        )}

        <div className="pt-2 text-center">
          <Link
            href="/dashboard"
            className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 transition hover:text-slate-300"
          >
            ← Volver al Dashboard
          </Link>
        </div>
      </section>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </main>
  );
}
