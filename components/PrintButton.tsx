'use client';

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300 transition hover:border-amber-300/30 hover:text-white"
    >
      Imprimir / PDF
    </button>
  );
}
