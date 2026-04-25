'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useLanguage } from '@/contexts/LanguageContext';
import Image from 'next/image';
import Link from 'next/link';

export default function RecuperarContrasenaPage() {
  const { t } = useLanguage();
  const supabase = createClient();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Construir la URL de redirección dinámicamente para funcionar en local y en producción
    const redirectTo = `${window.location.origin}/nueva-contrasena`;

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (resetError) {
      // Supabase no revela si el email existe o no por seguridad,
      // así que mostramos error genérico
      setError(t('resetPassword.errorGeneric'));
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
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

        {/* Card */}
        <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-8 shadow-2xl backdrop-blur-sm">
          {sent ? (
            /* Estado: correo enviado */
            <div className="text-center py-4">
              {/* Ícono check */}
              <div className="mx-auto w-16 h-16 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center mb-5">
                <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="display-font text-xl text-slate-100 font-bold mb-2 tracking-wide">
                {t('resetPassword.successTitle')}
              </h2>
              <p className="text-slate-400 text-sm leading-relaxed mb-6">
                {t('resetPassword.successMsg')}
              </p>
              <Link
                href="/login"
                className="inline-block text-amber-400 hover:text-amber-300 text-sm font-medium transition"
              >
                ← {t('resetPassword.backToLogin')}
              </Link>
            </div>
          ) : (
            /* Estado: formulario */
            <>
              <h2 className="display-font text-xl text-slate-100 mb-2 text-center tracking-wide">
                {t('resetPassword.title')}
              </h2>
              <p className="text-slate-400 text-sm text-center mb-6 leading-relaxed">
                {t('resetPassword.subtitle')}
              </p>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-slate-400 text-sm mb-2" htmlFor="email">
                    {t('resetPassword.email')}
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/30 transition"
                    placeholder={t('resetPassword.emailPlaceholder')}
                  />
                </div>

                {error && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/50 text-slate-950 font-bold py-3 rounded-lg transition-all duration-200 display-font tracking-wide text-lg mt-2"
                >
                  {loading ? t('resetPassword.sending') : t('resetPassword.submit')}
                </button>

                <div className="text-center pt-1">
                  <Link
                    href="/login"
                    className="text-slate-500 hover:text-slate-300 text-sm transition"
                  >
                    ← {t('resetPassword.backToLogin')}
                  </Link>
                </div>
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
