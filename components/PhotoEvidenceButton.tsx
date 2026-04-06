'use client';

import { useState } from 'react';

type PhotoEvidenceButtonProps = {
  paperworkPath: string | null;
  partPhotoPath: string | null;
  uploadedAt?: string | null;
};

export function PhotoEvidenceButton({ paperworkPath, partPhotoPath, uploadedAt }: PhotoEvidenceButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [zoomedPhoto, setZoomedPhoto] = useState<string | null>(null);

  const photoCount = [paperworkPath, partPhotoPath].filter(Boolean).length;

  const uploadedLabel = uploadedAt
    ? new Date(uploadedAt).toLocaleString('es-HN', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
      })
    : null;

  if (photoCount === 0) return null;

  function closeModal() {
    setIsOpen(false);
    setZoomedPhoto(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-sky-400/30 bg-sky-400/10 px-3 py-1.5 text-xs font-semibold text-sky-300 transition hover:bg-sky-400/20"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
          <circle cx="12" cy="13" r="3" />
        </svg>
        {photoCount} foto{photoCount !== 1 ? 's' : ''}
      </button>

      {isOpen && (
        <>
          {/* Modal backdrop */}
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
            onClick={closeModal}
          >
            <div
              className="relative w-full max-w-4xl rounded-[28px] border border-white/10 bg-slate-950 p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">
                    Evidencia fotográfica
                  </p>
                  <h3 className="mt-1 text-lg font-bold text-white">Documentación del trabajo</h3>
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 transition hover:bg-white/10"
                >
                  ✕ Cerrar
                </button>
              </div>

              {uploadedLabel && (
                <p className="mt-0.5 text-xs text-slate-500">
                  Subido el: <span className="text-slate-400">{uploadedLabel}</span>
                </p>
              )}

              <div className={`grid gap-5 ${paperworkPath && partPhotoPath ? 'sm:grid-cols-2' : ''}`}>
                {paperworkPath && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                      📄 Paperwork
                    </p>
                    <div className="overflow-hidden rounded-xl border border-white/10 bg-slate-900">
                      <img
                        src={paperworkPath}
                        alt="Paperwork"
                        className="w-full cursor-zoom-in object-contain transition-opacity hover:opacity-90"
                        onClick={() => setZoomedPhoto(paperworkPath)}
                      />
                    </div>
                    <a
                      href={paperworkPath}
                      target="_blank"
                      rel="noreferrer"
                      className="block text-center text-xs text-slate-500 underline hover:text-slate-300"
                    >
                      Abrir en nueva pestaña ↗
                    </a>
                  </div>
                )}
                {partPhotoPath && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                      🔧 Foto de pieza
                    </p>
                    <div className="overflow-hidden rounded-xl border border-white/10 bg-slate-900">
                      <img
                        src={partPhotoPath}
                        alt="Foto de pieza"
                        className="w-full cursor-zoom-in object-contain transition-opacity hover:opacity-90"
                        onClick={() => setZoomedPhoto(partPhotoPath)}
                      />
                    </div>
                    <a
                      href={partPhotoPath}
                      target="_blank"
                      rel="noreferrer"
                      className="block text-center text-xs text-slate-500 underline hover:text-slate-300"
                    >
                      Abrir en nueva pestaña ↗
                    </a>
                  </div>
                )}
              </div>

              <p className="mt-5 text-center text-xs text-slate-500">
                Haz clic en una foto para ampliar · Haz clic fuera del modal para cerrar
              </p>
            </div>
          </div>

          {/* Zoom overlay - full screen */}
          {zoomedPhoto && (
            <div
              className="fixed inset-0 z-[60] flex cursor-zoom-out items-center justify-center bg-black/95 p-4"
              onClick={() => setZoomedPhoto(null)}
            >
              <img
                src={zoomedPhoto}
                alt="Foto ampliada"
                className="max-h-[calc(100vh-4rem)] max-w-full object-contain"
              />
              {uploadedLabel && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-lg bg-black/70 px-4 py-2 text-xs font-semibold text-slate-200 backdrop-blur">
                  📅 Subido el: {uploadedLabel}
                </div>
              )}
              <button
                type="button"
                className="absolute right-4 top-4 rounded-xl border border-white/10 bg-slate-950/80 px-4 py-2 text-sm text-slate-300 transition hover:bg-white/10"
                onClick={() => setZoomedPhoto(null)}
              >
                ✕ Cerrar zoom
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
