import type { EstimateResult, ServiceType } from '@/lib/estimation/types';

type PricingInput = {
  serviceType: ServiceType;
  areaSqFtNet: number;
  conditionTags?: string[];
};

export function calculateEstimate(input: PricingInput): EstimateResult {
  const safeArea = Math.max(0, Number(input.areaSqFtNet || 0));
  const tags = (input.conditionTags ?? []).map((tag) => tag.toLowerCase());

  let unitRate = 0;
  let surchargeRate = 0;
  const notes: string[] = [];

  if (input.serviceType === 'pressure_washing') {
    unitRate = 0.4;

    if (tags.includes('heavily soiled')) {
      surchargeRate += 0.2;
      notes.push('20% por suciedad pesada');
    }
  } else if (input.serviceType === 'painting') {
    unitRate = 2.5;

    if (tags.includes('peeling paint')) {
      surchargeRate += 0.15;
      notes.push('15% por preparacion de pintura descascarada');
    }
  } else {
    throw new Error('Tipo de servicio no soportado');
  }

  const subtotal = safeArea * unitRate;
  const surcharge = subtotal * surchargeRate;
  const total = subtotal + surcharge;

  return {
    serviceType: input.serviceType,
    areaSqFtNet: safeArea,
    unitRate,
    subtotal: Number(subtotal.toFixed(2)),
    surchargeRate,
    surcharge: Number(surcharge.toFixed(2)),
    total: Number(total.toFixed(2)),
    notes,
  };
}
