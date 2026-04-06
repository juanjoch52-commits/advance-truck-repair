'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

type DashboardAutoRefreshProps = {
  intervalMs?: number;
};

export function DashboardAutoRefresh({ intervalMs = 10000 }: DashboardAutoRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => {
      router.refresh();
    }, intervalMs);

    return () => clearInterval(timer);
  }, [intervalMs, router]);

  return null;
}
