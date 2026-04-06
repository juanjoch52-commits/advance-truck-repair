import Link from 'next/link';
import { BackButton } from '@/components/BackButton';
import { getServerSession } from '@/lib/authSession';
import { redirect } from 'next/navigation';

export default async function AyudaPage() {
  const session = await getServerSession();
  if (!session) redirect('/');

  const isMechanic = session.effective_role === 'mechanic';

  return (
    <main className="brand-bg min-h-screen px-4 py-8 text-slate-100 sm:px-6">
      <section className="mx-auto max-w-4xl space-y-10">

        {/* Header */}
        <div className="flex items-center gap-4">
          <BackButton fallbackHref={isMechanic ? '/taller' : '/dashboard'} label="Volver" />
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">Guía del sistema</p>
            <h1 className="display-font text-3xl font-bold uppercase text-white sm:text-4xl">Centro de Ayuda</h1>
          </div>
        </div>

        {/* Flowchart */}
        <section className="rounded-[28px] border border-white/10 bg-slate-950/60 p-6 shadow-xl backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-300">Flujo de trabajo</p>
          <h2 className="display-font mt-2 text-2xl font-bold text-white">¿Cómo funciona el sistema?</h2>
          <p className="mt-2 text-sm text-slate-400">
            El flujo completo desde que un mecánico registra un trabajo hasta que recibe su pago.
          </p>

          {/* Flowchart steps */}
          <div className="mt-8 flex flex-col items-center gap-0 sm:flex-row sm:items-stretch sm:justify-center">

            {/* Step 1 */}
            <div className="flex flex-col items-center gap-2 sm:flex-1 sm:max-w-[180px]">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-sky-400/60 bg-sky-400/15 text-3xl">
                🔧
              </div>
              <div className="text-center">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-300">Paso 1</p>
                <p className="mt-0.5 text-sm font-bold text-white">Mecánico Reporta</p>
                <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                  Ingresa unidad, compañía, labor y sube fotos (paperwork + pieza).
                </p>
              </div>
            </div>

            {/* Arrow */}
            <div className="flex items-center justify-center py-2 sm:px-3 sm:py-0">
              <span className="text-2xl text-slate-600 sm:rotate-0 rotate-90">→</span>
            </div>

            {/* Step 2 */}
            <div className="flex flex-col items-center gap-2 sm:flex-1 sm:max-w-[180px]">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-amber-400/60 bg-amber-400/15 text-3xl">
                ✅
              </div>
              <div className="text-center">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300">Paso 2</p>
                <p className="mt-0.5 text-sm font-bold text-white">Administración Aprueba</p>
                <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                  Administración revisa fotos, confirma montos y aprueba o rechaza con motivo.
                </p>
              </div>
            </div>

            {/* Arrow */}
            <div className="flex items-center justify-center py-2 sm:px-3 sm:py-0">
              <span className="text-2xl text-slate-600 sm:rotate-0 rotate-90">→</span>
            </div>

            {/* Step 3 */}
            <div className="flex flex-col items-center gap-2 sm:flex-1 sm:max-w-[180px]">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-emerald-400/60 bg-emerald-400/15 text-3xl">
                💰
              </div>
              <div className="text-center">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">Paso 3</p>
                <p className="mt-0.5 text-sm font-bold text-white">Dueño Revisa</p>
                <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                  Consulta la nómina semanal, deducciones y autoriza el pago.
                </p>
              </div>
            </div>

            {/* Arrow */}
            <div className="flex items-center justify-center py-2 sm:px-3 sm:py-0">
              <span className="text-2xl text-slate-600 sm:rotate-0 rotate-90">→</span>
            </div>

            {/* Step 4 */}
            <div className="flex flex-col items-center gap-2 sm:flex-1 sm:max-w-[180px]">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-fuchsia-400/60 bg-fuchsia-400/15 text-3xl">
                🧾
              </div>
              <div className="text-center">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-fuchsia-300">Paso 4</p>
                <p className="mt-0.5 text-sm font-bold text-white">Mecánico Cobra</p>
                <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                  Puede ver su historial y resumen semanal desde el Portal Mecánico.
                </p>
              </div>
            </div>

          </div>

          {/* Rejection path */}
          <div className="mt-6 rounded-2xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-sm text-slate-400">
            <span className="font-semibold text-red-300">⚠ Ruta de rechazo:</span> Si Administración rechaza un trabajo, el mecánico ve el motivo en su historial y puede registrar el trabajo de nuevo con las correcciones.
          </div>
        </section>

        {/* Role tutorials */}
        <section className="grid gap-6 md:grid-cols-3">

          {/* Mecánico */}
          <div className="rounded-[24px] border border-sky-400/20 bg-sky-400/5 p-5">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🔧</span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">Rol</p>
                <h3 className="font-bold text-white">Mecánico</h3>
              </div>
            </div>
            <ol className="mt-4 space-y-3">
              <li className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-400/20 text-[10px] font-bold text-sky-300">1</span>
                <div>
                  <p className="text-sm font-semibold text-white">Reportar un trabajo</p>
                  <p className="text-xs text-slate-400">Desde el Portal Mecánico: llena el formulario con unidad, compañía, labor y sube las 2 fotos.</p>
                </div>
              </li>
              <li className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-400/20 text-[10px] font-bold text-sky-300">2</span>
                <div>
                  <p className="text-sm font-semibold text-white">Ver estado de trabajos</p>
                  <p className="text-xs text-slate-400">En la sección "Mi Semana" verás si cada trabajo está Pendiente, Aprobado o Rechazado.</p>
                </div>
              </li>
              <li className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-400/20 text-[10px] font-bold text-sky-300">3</span>
                <div>
                  <p className="text-sm font-semibold text-white">Ver motivo de rechazo</p>
                  <p className="text-xs text-slate-400">Si fue rechazado, verás el motivo en rojo. Corrige y registra de nuevo.</p>
                </div>
              </li>
            </ol>
          </div>

          {/* Administración */}
          <div className="rounded-[24px] border border-amber-400/20 bg-amber-400/5 p-5">
            <div className="flex items-center gap-3">
              <span className="text-3xl">✅</span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">Rol</p>
                <h3 className="font-bold text-white">Administración</h3>
              </div>
            </div>
            <ol className="mt-4 space-y-3">
              <li className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-400/20 text-[10px] font-bold text-amber-300">1</span>
                <div>
                  <p className="text-sm font-semibold text-white">Aprobar o rechazar trabajos</p>
                  <p className="text-xs text-slate-400">En "Aprobaciones": revisa fotos, ajusta montos y aprueba. Si hay un problema, rechaza con un motivo claro.</p>
                </div>
              </li>
              <li className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-400/20 text-[10px] font-bold text-amber-300">2</span>
                <div>
                  <p className="text-sm font-semibold text-white">Revisar nómina</p>
                  <p className="text-xs text-slate-400">En "Nómina" puedes ver el resumen semanal por mecánico con deducciones.</p>
                </div>
              </li>
              <li className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-400/20 text-[10px] font-bold text-amber-300">3</span>
                <div>
                  <p className="text-sm font-semibold text-white">Ver deudas</p>
                  <p className="text-xs text-slate-400">En "Deudas" controlas los adelantos y en "Mi Perfil" ves tus propias deudas personales.</p>
                </div>
              </li>
            </ol>
          </div>

          {/* Dueño */}
          <div className="rounded-[24px] border border-emerald-400/20 bg-emerald-400/5 p-5">
            <div className="flex items-center gap-3">
              <span className="text-3xl">👑</span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Rol</p>
                <h3 className="font-bold text-white">Dueño</h3>
              </div>
            </div>
            <ol className="mt-4 space-y-3">
              <li className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-400/20 text-[10px] font-bold text-emerald-300">1</span>
                <div>
                  <p className="text-sm font-semibold text-white">Monitorear producción</p>
                  <p className="text-xs text-slate-400">El Dashboard principal muestra la producción semanal total y el desglose por mecánico.</p>
                </div>
              </li>
              <li className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-400/20 text-[10px] font-bold text-emerald-300">2</span>
                <div>
                  <p className="text-sm font-semibold text-white">Buscar trabajos por unidad</p>
                  <p className="text-xs text-slate-400">En "Buscar Unidad" filtra todos los trabajos hechos a un camión específico con sus fotos.</p>
                </div>
              </li>
              <li className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-400/20 text-[10px] font-bold text-emerald-300">3</span>
                <div>
                  <p className="text-sm font-semibold text-white">Ver nómina y pagar</p>
                  <p className="text-xs text-slate-400">En "Nómina" genera el reporte completo, revisa deducciones de deuda y autoriza el pago semanal.</p>
                </div>
              </li>
            </ol>
          </div>
        </section>

        {/* Glossary */}
        <section className="rounded-[28px] border border-white/10 bg-slate-950/60 p-6 backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Referencia rápida</p>
          <h2 className="display-font mt-2 text-xl font-bold text-white">Glosario de estados</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              { label: 'Pendiente', color: 'amber', desc: 'El trabajo fue registrado pero aún no revisado por Administración.' },
              { label: 'Aprobado', color: 'emerald', desc: 'Administración confirmó el trabajo. Ya se suma a la nómina.' },
              { label: 'Rechazado', color: 'red', desc: 'Administración encontró un problema. Verás el motivo en el historial.' },
              { label: 'Pagado',    color: 'sky',    desc: 'El dueño marcó el trabajo como pagado en la nómina.' },
            ].map((item) => (
              <div key={item.label} className={`rounded-xl border border-${item.color}-400/20 bg-${item.color}-400/5 px-4 py-3`}>
                <p className={`text-sm font-bold text-${item.color}-300`}>{item.label}</p>
                <p className="mt-0.5 text-xs text-slate-400">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="pb-4 text-center">
          <Link
            href={isMechanic ? '/taller' : '/dashboard'}
            className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 transition hover:text-slate-300"
          >
            ← Volver
          </Link>
        </div>
      </section>
    </main>
  );
}
