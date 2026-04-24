export type ServiceType = 'pressure_washing' | 'painting';

export type SurfaceType = 'concrete' | 'brick' | 'siding' | 'drywall' | 'grass' | 'unknown';

export type AnalysisResult = {
  surfaceType: SurfaceType;
  conditionTags: string[];
  areaSqFtGross: number;
  areaSqFtExcluded: number;
  areaSqFtNet: number;
  obstacles: string[];
  confidence: {
    surface: number;
    condition: number;
    area: number;
  };
};

export type EstimateResult = {
  serviceType: ServiceType;
  areaSqFtNet: number;
  unitRate: number;
  subtotal: number;
  surchargeRate: number;
  surcharge: number;
  total: number;
  notes: string[];
};
