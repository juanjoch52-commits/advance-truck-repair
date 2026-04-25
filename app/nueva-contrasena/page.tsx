'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';

export default function NuevaContrasenaPage() {
  const { t } = useLanguage();
  const supabase = createClient();
  const router = useRouter();

  const [ready, setReady] = useState(false);        // tokens procesados por Supabase
  const [invalidLink, setInvalidLink] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Supabase detecta automáticamente los tokens de la URL (hash #access_token=...&type=recovery)
    // y dispara el evento PASSWORD_RECOVERY. Escuchamos eso para saber que el enlace es válido.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true);
      } else if (event === 'SIGNED_IN') {
        // También puede llegar como SIGNED_IN en algunas versiones del SDK
        setReady(true);
      }
    });

    // Timeout: si en 4 segundos no llega el evento, el enlace es inválido
    const timeout = setTimeout(() => {
      setInvalidLink(true);
    }, 4000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [supabase]);

  // Cuando se confirma que los tokens son válidos, cancelamos el timeout de enlace inválido
  useEffect(() => {
    if (ready) {
      setInvalidLink(false);
    }
  }, [ready]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError(t('newPassword.errorMin'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('newPassword.errorMatch'));
      return;
    }

    setSaving(true);

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });

    if (updateError) {
      setError(t('newPassword.errorUpdate') + updateError.message);
      setSaving(false);
      return;
    }

    setSuccess(true);

    // Cerrar sesión y redirigir al login después de 2.5 segundos
    setTimeout(async () => {
      await supabase.auth.signOut();
      // Limpiar cookies de sesión
      document.cookie = 'atr_auth=; path=/; max-age=0';
      document.cookie = 'atr_force_change=; path=/; max-age=0';
      router.push('/login');
    }, 2500);
  }

  /* ---- Estados de la UI ---- */

  // Cargando: esperando que Supabase procese los tokens del hash
  if (!ready && !invalidLink) {
    return (
      <div className="brand-bg min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400 text-sm">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  // Enlace inválido o expirado
  if (invalidLink && !ready) {
    return (
      <div className="brand-bg min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-8 shadow-2xl backdrop-blur-sm text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center mb-5">
              <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="display-font text-xl text-slate-100 font-bold mb-2 tracking-wide">
              {t('newPassword.errorInvalidLink').split('.')[0]}
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed mb-6">
              {t('newPassword.errorInvalidLink')}
            </p>
            <Link
              href="/recuperar-contrasena"
              className="inline-block bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-6 py-3 rounded-lg transition display-font tracking-wide text-sm"
            >
              Solicitar nuevo enlace
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="brand-bg min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-24 h-24 relative mb-4">
            <Image
              src="/logo.png"
              alt="Advance Truck Repair"
              fill
              className="object-contain"
              priority
            />
          </div>
          <h1 className="display-font text-3xl font-bold text-amber-400 tracking-wide">
            ADVANCE TRUCK REPAIR
          </h1>
          <p className="text-slate-400 text-sm mt-1">{t('login.subtitle')}</p>
        </div>

        <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-8 shadow-2xl backdrop-blur-sm">
          {success ? (
            /* Estado: contraseña actualizada */
            <div className="text-center py-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center mb-5">
                <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="display-font text-xl text-slate-100 font-bold mb-2 tracking-wide">
                {t('newPassword.successTitle')}
              </h2>
              <p className="text-slate-400 text-sm leading-relaxed">
                {t('newPassword.successMsg')}
              </p>
            </div>
          ) : (
            /* Estado: formulario */
            <>
              <h2 className="display-font text-xl text-slate-100 mb-2 text-center tracking-wide">
                {t('newPassword.title')}
              </h2>
              <p className="text-slate-400 text-sm text-center mb-6 leading-relaxed">
                {t('newPassword.subtitle')}
              </p>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-slate-400 text-sm mb-2">
                    {t('newPassword.newPassword')}
                  </label>
                  <input
                    type="password"
                    required
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={t('newPassword.newPasswordPlaceholder')}
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/30 transition"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 text-sm mb-2">
                    {t('newPassword.confirmPassword')}
                  </label>
                  <input
                    type="password"
                    required
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t('newPassword.confirmPlaceholder')}
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/30 transition"
                  />
                </div>

                {error && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/50 text-slate-950 font-bold py-3 rounded-lg transition-all duration-200 display-font tracking-wide text-lg mt-2"
                >
                  {saving ? t('newPassword.saving') : t('newPassword.submit')}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-slate-600 text-xs mt-6">
          Powered by <span className="text-slate-500">JRC Smart Systems</span>
        </p>
      </div>
    </div>
  );
}
