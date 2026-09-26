'use client';

import { useEffect, useState } from 'react';

// Rol de la sesión firmada (server-side), para adaptar la UI. El rol viene de
// /api/auth/me (misma fuente que el sidebar); NO se consultan tablas desde el
// navegador. La seguridad real la aplican los endpoints; esto es solo UX.
export function useSessionRole(): { role: string; readOnly: boolean; loaded: boolean } {
  const [role, setRole] = useState<string>('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const j = await res.json();
          if (alive && j?.authenticated && j.user?.role) {
            setRole(String(j.user.role).toLowerCase());
          }
        }
      } catch {}
      if (alive) setLoaded(true);
    })();
    return () => { alive = false; };
  }, []);

  // La contable es el único rol de solo lectura del panel.
  return { role, readOnly: role === 'contable', loaded };
}
