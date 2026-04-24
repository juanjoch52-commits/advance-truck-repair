import Link from 'next/link';
import { BackButton } from '@/components/BackButton';
import { ImageEstimatorCard } from '@/components/estimator/ImageEstimatorCard';

export default function EstimadorIaPage() {
  return (
    <main className="brand-bg min-h-screen px-4 py-8 text-slate-100 sm:px-6">
      <section className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center gap-4">
          <BackButton fallbackHref="/dashboard" label="Volver" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">Vertical SaaS</p>
            <h1 className="display-font text-3xl font-bold uppercase text-white sm:text-4xl">Estimador Visual IA</h1>
          </div>
        </div>

        <ImageEstimatorCard />

        <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4 text-sm text-slate-300">
          <p>
            Este flujo usa un analizador mock para acelerar implementacion. Cuando quieras, lo conectamos a un modelo de vision real
            y guardamos resultados en Supabase.
          </p>
          <p className="mt-2">
            Puedes regresar al <Link className="font-semibold text-amber-300 hover:text-amber-200" href="/dashboard">dashboard</Link> o abrir esta pagina desde el menu de herramientas.
          </p>
        </div>
      </section>
    </main>
  );
}
