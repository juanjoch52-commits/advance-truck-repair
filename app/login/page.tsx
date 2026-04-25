'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';

export default function LoginPage() {
  const { t, lang, setLang } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(t('login.errorWrong'));
      setLoading(false);
      return;
    }

    // Guardar cookie para que el middleware pueda verificar la sesión
    document.cookie = 'atr_auth=1; path=/; max-age=86400; SameSite=Lax';

    // Verificar si el usuario debe cambiar su contraseña
    const userId = authData.user?.id;
    if (userId) {
      const { data: profile } = await (supabase as any)
        .from('profiles')
        .select('must_change_password')
        .eq('id', userId)
        .single();

      if (profile?.must_change_password) {
        // Marcar cookie para que el middleware redirija
        document.cookie = 'atr_force_change=1; path=/; max-age=86400; SameSite=Lax';
        router.push('/cambiar-contrasena');
        return;
      }
    }

    // Limpiar bandera por si acaso
    document.cookie = 'atr_force_change=; path=/; max-age=0';
    router.push('/dashboard');
    router.refresh();
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

          {/* Language toggle */}
          <div className="flex gap-2 mt-4">
            <button
              type="button"
              onClick={() => setLang('es')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                lang === 'es'
                  ? 'bg-amber-500/20 border border-amber-500/40 text-amber-400'
                  : 'border border-white/10 text-slate-500 hover:text-slate-300'
              }`}
            >
              ES
            </button>
            <button
              type="button"
              onClick={() => setLang('en')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                lang === 'en'
                  ? 'bg-sky-500/20 border border-sky-500/40 text-sky-400'
                  : 'border border-white/10 text-slate-500 hover:text-slate-300'
              }`}
            >
              EN
            </button>
          </div>
        </div>

        {/* Card de login */}
        <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-8 shadow-2xl backdrop-blur-sm">
          <h2 className="display-font text-xl text-slate-100 mb-6 text-center tracking-wide">
            {t('login.title')}
          </h2>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-slate-400 text-sm mb-2" htmlFor="email">
                {t('login.email')}
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/30 transition"
                placeholder={t('login.emailPlaceholder')}
              />
            </div>

            <div>
              <label className="block text-slate-400 text-sm mb-2" htmlFor="password">
                {t('login.password')}
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/30 transition"
                placeholder="••••••••"
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
              {loading ? t('login.verifying') : t('login.submit')}
            </button>

            <div className="text-center pt-1">
              <Link
                href="/recuperar-contrasena"
                className="text-slate-500 hover:text-amber-400 text-sm transition"
              >
                {t('resetPassword.forgotPassword')}
              </Link>
            </div>
          </form>
        </div>

        <p className="text-center text-slate-600 text-xs mt-6">
          Powered by <span className="text-slate-500">JRC Smart Systems</span>
        </p>
      </div>
    </div>
  );
}
