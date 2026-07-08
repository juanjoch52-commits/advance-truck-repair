import { NextResponse } from 'next/server';
import { requireSession, authErrorResponse } from '@/lib/apiAuth';
import { buildWhatsappEstimatePreview } from '@/lib/estimation/formatEstimate';
import { calculateEstimate } from '@/lib/estimation/pricingEngine';
import type { AnalysisResult, ServiceType, SurfaceType } from '@/lib/estimation/types';

function inferAnalysisFromFilename(fileName: string, serviceType: ServiceType): AnalysisResult {
  const lowerName = fileName.toLowerCase();

  let surfaceType: SurfaceType = 'concrete';
  let conditionTags: string[] = ['heavily soiled'];
  let areaSqFtGross = 420;
  let areaSqFtExcluded = 20;
  let obstacles = ['bordes con jardin', 'entrada de garage'];

  if (lowerName.includes('wall') || lowerName.includes('paint') || serviceType === 'painting') {
    surfaceType = lowerName.includes('drywall') ? 'drywall' : 'siding';
    conditionTags = ['peeling paint'];
    areaSqFtGross = 560;
    areaSqFtExcluded = 40;
    obstacles = ['ventanas', 'puertas'];
  }

  if (lowerName.includes('brick')) {
    surfaceType = 'brick';
  }

  if (lowerName.includes('lawn') || lowerName.includes('grass') || lowerName.includes('garden')) {
    surfaceType = 'grass';
    conditionTags = ['light debris'];
    areaSqFtGross = 1000;
    areaSqFtExcluded = 120;
    obstacles = ['caminerias', 'bordes de jardin'];
  }

  const areaSqFtNet = Math.max(0, areaSqFtGross - areaSqFtExcluded);

  return {
    surfaceType,
    conditionTags,
    areaSqFtGross,
    areaSqFtExcluded,
    areaSqFtNet,
    obstacles,
    confidence: {
      surface: 0.93,
      condition: 0.85,
      area: 0.72,
    },
  };
}

export async function POST(request: Request) {
  // Solo usuarios con sesión válida (endpoint antes público).
  try {
    await requireSession();
  } catch (error) {
    const resp = authErrorResponse(error);
    if (resp) return resp;
    throw error;
  }

  const formData = await request.formData();
  const file = formData.get('image');
  const serviceTypeRaw = String(formData.get('serviceType') ?? 'pressure_washing');
  const serviceType = (serviceTypeRaw === 'painting' ? 'painting' : 'pressure_washing') as ServiceType;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Debes adjuntar una imagen.' }, { status: 400 });
  }

  const analysis = inferAnalysisFromFilename(file.name, serviceType);
  const estimate = calculateEstimate({
    serviceType,
    areaSqFtNet: analysis.areaSqFtNet,
    conditionTags: analysis.conditionTags,
  });

  const serviceLabel = serviceType === 'painting' ? 'Pintura' : 'Pressure Washing';
  const whatsappPreview = buildWhatsappEstimatePreview({
    customerName: 'Cliente',
    companyName: 'Tu Empresa',
    serviceLabel,
    analysis,
    estimate,
  });

  return NextResponse.json({
    ok: true,
    analysis,
    estimate,
    whatsappPreview,
    meta: {
      mode: 'mock-vision',
      note: 'Usa heuristicas por nombre de archivo. Sustituye por modelo de vision real en produccion.',
    },
  });
}
