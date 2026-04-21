'use client';

import { Suspense } from 'react';
import ReportesContent from './ReportesContent';

export default function ReportesPage() {
  return (
    <Suspense fallback={<div className="text-slate-500 py-8 text-center">Cargando...</div>}>
      <ReportesContent />
    </Suspense>
  );
}
