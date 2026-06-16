'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useLanguage } from '@/contexts/LanguageContext';

export default function CambiarContrasenaPage() {
  const { t } = useLanguage();
  const supabase = createClient();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError(t('changePassword.errorMin'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('changePassword.errorMatch'));
      return;
    }

    setSaving(true);

    // 1. Actualizar contraseña en Supabase Auth
    const { error: authError } = await supabase.auth.updateUser({ password: newPassword });
    if (authError) {
      setError(t('changePassword.errorUpdate') + authError.message);
      setSaving(false);
      return;
    }

    // 2. Limpiar la bandera must_change_password en el perfil
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await (supabase as any).from('profiles').update({ must_change_password: false }).eq('id', user.id);
    }

    // 3. Re-emitir la cookie de sesión firmada para que requires_pin_update
    //    quede en falso (evita el loop de redirección al cambio de contraseña).
    const { data: { session } } = await supabase.auth.getSession();
    await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: session?.access_token }),
    }).catch(() => undefined);

    // 4. Redirigir al dashboard (full reload para que el middleware re-evalúe)
    window.location.href = '/dashboard';
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo / encabezado */}
        <div className="text-center mb-8">
          <p className="display-font text-amber-400 font-bold text-2xl tracking-widest">ADVANCE TRUCK REPAIR</p>
          <p className="text-slate-400 text-sm mt-1">{t('sidebar.subtitle')}</p>
        </div>

        <div className="bg-slate-900 border border-amber-500/20 rounded-2xl p-8">
          {/* Alerta informativa */}
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 mb-6 flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <div>
              <p className="text-amber-400 text-sm font-semibold">{t('changePassword.tempDetectedTitle')}</p>
              <p className="text-amber-300/70 text-xs mt-0.5">
                {t('changePassword.tempDetectedMsg')}
              </p>
            </div>
          </div>

          <h1 className="display-font text-slate-100 font-bold text-lg tracking-wide mb-6">
            {t('changePassword.title')}
          </h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-slate-400 text-sm mb-1.5">{t('changePassword.newPassword')}</label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder={t('changePassword.newPasswordPlaceholder')}
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/50 transition"
              />
            </div>

            <div>
              <label className="block text-slate-400 text-sm mb-1.5">{t('changePassword.confirmPassword')}</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder={t('changePassword.confirmPlaceholder')}
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/50 transition"
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2.5 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/50 text-slate-950 font-bold py-3 rounded-lg transition display-font tracking-wide mt-2"
            >
              {saving ? t('changePassword.saving') : t('changePassword.submit')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
