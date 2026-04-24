import type { AnalysisResult, EstimateResult } from '@/lib/estimation/types';

function titleCase(value: string) {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function buildWhatsappEstimatePreview(params: {
  customerName: string;
  companyName: string;
  serviceLabel: string;
  analysis: AnalysisResult;
  estimate: EstimateResult;
}) {
  const { customerName, companyName, serviceLabel, analysis, estimate } = params;
  const surchargePct = `${Math.round(estimate.surchargeRate * 100)}%`;
  const condition = analysis.conditionTags.length > 0 ? analysis.conditionTags.join(', ') : 'General';

  return [
    `Hola ${customerName}, aqui va tu estimado de ${companyName}:`,
    '',
    `Servicio: ${serviceLabel}`,
    `Superficie: ${titleCase(analysis.surfaceType)}`,
    `Area estimada: ${analysis.areaSqFtNet} sq ft`,
    `Condicion: ${condition}`,
    `Tarifa base: $${estimate.unitRate.toFixed(2)} / sq ft`,
    '',
    `Subtotal: $${estimate.subtotal.toFixed(2)}`,
    `Recargo de condicion (${surchargePct}): $${estimate.surcharge.toFixed(2)}`,
    `Total estimado: $${estimate.total.toFixed(2)}`,
    '',
    'Incluye limpieza y retiro de residuos ligeros.',
    'Precio final sujeto a verificacion en sitio.',
  ].join('\n');
}
