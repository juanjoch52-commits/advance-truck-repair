'use client';

import { useMemo, useState } from 'react';
import type { AnalysisResult, EstimateResult, ServiceType } from '@/lib/estimation/types';
import { calculateEstimate } from '@/lib/estimation/pricingEngine';

const inputClass =
  'w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-amber-300/60 focus:ring-1 focus:ring-amber-300/30 transition';

const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-400';

export function ImageEstimatorCard() {
  const [serviceType, setServiceType] = useState<ServiceType>('pressure_washing');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [estimate, setEstimate] = useState<EstimateResult | null>(null);
  const [whatsappPreview, setWhatsappPreview] = useState('');

  const [manualArea, setManualArea] = useState('');

  async function handleAnalyze() {
    if (!file) {
      setError('Sube una imagen primero.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('serviceType', serviceType);

      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        body: formData,
      });

      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        analysis?: AnalysisResult;
        estimate?: EstimateResult;
        whatsappPreview?: string;
      };

      if (!res.ok || !data.ok || !data.analysis || !data.estimate) {
        setError(data.error ?? 'No se pudo analizar la imagen.');
        return;
      }

      setAnalysis(data.analysis);
      setEstimate(data.estimate);
      setWhatsappPreview(data.whatsappPreview ?? '');
      setManualArea(String(data.analysis.areaSqFtNet));
    } catch {
      setError('Error de red al analizar la imagen.');
    } finally {
      setLoading(false);
    }
  }

  const adjustedEstimate = useMemo(() => {
    if (!analysis) {
      return null;
    }

    const parsedArea = Number(manualArea);
    if (Number.isNaN(parsedArea) || parsedArea <= 0) {
      return null;
    }

    return calculateEstimate({
      serviceType,
      areaSqFtNet: parsedArea,
      conditionTags: analysis.conditionTags,
    });
  }, [analysis, manualArea, serviceType]);

  return (
    <section className="rounded-[28px] border border-white/10 bg-slate-950/60 p-6 shadow-2xl backdrop-blur">
      <h2 className="display-font text-2xl font-bold uppercase text-white">AI Visual Estimator</h2>
      <p className="mt-2 text-sm text-slate-300">
        Sube una foto del trabajo y genera un estimado inicial con datos de superficie, condicion y area.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Tipo de servicio</label>
          <select
            value={serviceType}
            onChange={(e) => setServiceType(e.target.value as ServiceType)}
            className={inputClass}
          >
            <option value="pressure_washing">Pressure Washing</option>
            <option value="painting">Pintura</option>
          </select>
        </div>

        <div>
          <label className={labelClass}>Foto del sitio</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className={inputClass}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={handleAnalyze}
        disabled={loading || !file}
        className="mt-5 rounded-xl bg-amber-300 px-5 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-amber-200 disabled:opacity-50"
      >
        {loading ? 'Analizando imagen...' : 'Analizar y estimar'}
      </button>

      {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}

      {analysis && (
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">Datos extraidos por IA</p>
          <div className="mt-3 grid gap-2 text-sm text-slate-200 sm:grid-cols-2">
            <p>Superficie: <strong>{analysis.surfaceType}</strong></p>
            <p>Condicion: <strong>{analysis.conditionTags.join(', ')}</strong></p>
            <p>Area bruta: <strong>{analysis.areaSqFtGross} sq ft</strong></p>
            <p>Area excluida: <strong>{analysis.areaSqFtExcluded} sq ft</strong></p>
            <p>Area neta: <strong>{analysis.areaSqFtNet} sq ft</strong></p>
            <p>Obstaculos: <strong>{analysis.obstacles.join(', ')}</strong></p>
          </div>

          <div className="mt-4 grid gap-2 sm:max-w-xs">
            <label className={labelClass}>Ajuste manual de area (sq ft)</label>
            <input
              type="number"
              min={1}
              step="1"
              value={manualArea}
              onChange={(e) => setManualArea(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      )}

      {adjustedEstimate && (
        <div className="mt-6 rounded-2xl border border-emerald-400/25 bg-emerald-900/20 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Estimate Preview</p>
          <div className="mt-3 space-y-1 text-sm text-emerald-100">
            <p>Area neta facturable: <strong>{adjustedEstimate.areaSqFtNet} sq ft</strong></p>
            <p>Subtotal: <strong>${adjustedEstimate.subtotal.toFixed(2)}</strong></p>
            <p>Recargos: <strong>${adjustedEstimate.surcharge.toFixed(2)}</strong></p>
            <p className="text-base">Total estimado: <strong>${adjustedEstimate.total.toFixed(2)}</strong></p>
          </div>
        </div>
      )}

      {whatsappPreview && (
        <div className="mt-6 rounded-2xl border border-sky-400/20 bg-sky-950/20 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">Mensaje para WhatsApp</p>
          <pre className="mt-3 whitespace-pre-wrap text-sm leading-6 text-sky-100">{whatsappPreview}</pre>
        </div>
      )}
    </section>
  );
}
