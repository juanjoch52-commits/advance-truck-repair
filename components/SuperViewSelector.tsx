'use client';

import { useEffect, useState } from 'react';

type EffectiveRole = 'owner' | 'admin' | 'mechanic';

type AuthMe = {
  authenticated?: boolean;
  user?: {
    full_name: string;
    role: 'owner' | 'admin' | 'mechanic' | 'super_user';
    is_super_user?: boolean;
    effective_role?: EffectiveRole;
  };
};

type SuperViewSelectorProps = {
  className?: string;
};

export function SuperViewSelector({ className }: SuperViewSelectorProps) {
  const [visible, setVisible] = useState(false);
  const [current, setCurrent] = useState<EffectiveRole>('owner');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((json: AuthMe) => {
        if (!json.authenticated || !json.user?.is_super_user) return;
        setVisible(true);
        setCurrent((json.user.effective_role ?? 'owner') as EffectiveRole);
      })
      .catch(() => undefined);
  }, []);

  async function handleChange(viewAs: EffectiveRole) {
    setCurrent(viewAs);
    setSaving(true);
    try {
      const response = await fetch('/api/auth/switch-view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ view_as: viewAs }),
      });
      const json = await response.json() as { ok?: boolean; redirectTo?: string };
      if (!response.ok || !json.ok) return;
      window.location.href = json.redirectTo || '/dashboard';
    } finally {
      setSaving(false);
    }
  }

  if (!visible) return null;

  return (
    <div className={className}>
      <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-fuchsia-300">
        Vista Super-User
        <select
          disabled={saving}
          value={current}
          onChange={(event) => void handleChange(event.target.value as EffectiveRole)}
          className="rounded-lg border border-fuchsia-300/30 bg-fuchsia-950/30 px-2 py-1 text-xs text-fuchsia-100 outline-none"
        >
          <option value="owner">Vista Dueño</option>
          <option value="admin">Vista Administradora</option>
          <option value="mechanic">Vista Mecánico</option>
        </select>
      </label>
    </div>
  );
}
