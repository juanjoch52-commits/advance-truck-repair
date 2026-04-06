'use client';

import { useEffect } from 'react';

type ToastProps = {
  message: string;
  type?: 'success' | 'error';
  onClose: () => void;
};

export function Toast({ message, type = 'success', onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3500);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl border px-5 py-4 shadow-2xl backdrop-blur animate-in slide-in-from-bottom-4 duration-300 ${
        type === 'success'
          ? 'border-emerald-500/30 bg-emerald-950/95 text-emerald-200'
          : 'border-red-500/30 bg-red-950/95 text-red-200'
      }`}
    >
      <span className="text-lg">{type === 'success' ? '✓' : '✕'}</span>
      <span className="text-sm font-semibold">{message}</span>
      <button
        onClick={onClose}
        className="ml-3 rounded-full p-1 opacity-50 transition hover:opacity-100"
        aria-label="Cerrar"
      >
        ✕
      </button>
    </div>
  );
}
