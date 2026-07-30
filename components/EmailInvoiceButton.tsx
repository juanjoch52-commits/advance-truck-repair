'use client';

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { buildInvoicePdf } from './InvoicePdfButton';

// Botón "Enviar por correo" — OCULTO hasta activar NEXT_PUBLIC_EMAIL_ENABLED.
// Genera el mismo PDF de la factura en el navegador, lo manda en base64 a
// /api/facturas/[id]/enviar (que a su vez usa Resend). El correo se escribe al
// momento (prellenado con el del cliente registrado). Mientras el envío esté
// apagado, este componente devuelve null y el endpoint responde 503.
const EMAIL_ON = process.env.NEXT_PUBLIC_EMAIL_ENABLED === 'true';

export function EmailInvoiceButton({ invoiceId, defaultEmail = '', className }: {
  invoiceId: string; defaultEmail?: string; className?: string;
}) {
  const { lang } = useLanguage();
  const L = lang === 'en' ? EN : ES;
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(defaultEmail);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (!EMAIL_ON) return null; // apagado: no se muestra

  function openModal() { setTo(defaultEmail); setMsg(null); setOpen(true); }

  async function send() {
    if (!to.trim()) { setMsg({ ok: false, text: L.needEmail }); return; }
    setSending(true); setMsg(null);
    try {
      const { doc, filename } = await buildInvoicePdf(invoiceId);
      const dataUri = doc.output('datauristring'); // data:application/pdf;...;base64,XXXX
      const base64 = dataUri.split('base64,')[1] ?? '';
      const res = await fetch(`/api/facturas/${invoiceId}/enviar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: to.trim(), pdf_base64: base64, filename }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ ok: false, text: j?.message || j?.error || L.failed }); setSending(false); return; }
      setMsg({ ok: true, text: L.sentTo.replace('{to}', j.to || to.trim()) });
      setSending(false);
      setTimeout(() => setOpen(false), 1600);
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || L.failed });
      setSending(false);
    }
  }

  return (
    <>
      <button type="button" onClick={openModal} title={L.send}
        className={className ?? 'bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-300 p-2.5 rounded-lg transition'}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start md:items-center justify-center bg-black/60 p-4 overflow-y-auto" onClick={() => !sending && setOpen(false)}>
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-md my-8" onClick={e => e.stopPropagation()}>
            <h2 className="display-font text-slate-100 font-bold text-xl tracking-wide mb-1">{L.title}</h2>
            <p className="text-slate-500 text-sm mb-5">{L.desc}</p>

            <label className="block text-slate-300 text-sm font-medium mb-2">{L.emailLabel}</label>
            <input type="email" value={to} onChange={e => setTo(e.target.value)} placeholder="cliente@correo.com"
              className="w-full bg-slate-800 border border-white/15 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/60 transition" />

            {msg && (
              <div className={`mt-4 rounded-xl px-4 py-3 text-sm ${msg.ok ? 'bg-emerald-500/10 border border-emerald-500/40 text-emerald-300' : 'bg-red-500/10 border border-red-500/40 text-red-300'}`}>
                {msg.text}
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button type="button" disabled={sending} onClick={send}
                className="bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/50 text-slate-950 font-bold py-3 px-6 rounded-xl transition">
                {sending ? L.sending : L.send}
              </button>
              <button type="button" disabled={sending} onClick={() => setOpen(false)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 py-3 px-5 rounded-xl transition">
                {L.cancel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const ES = {
  send: 'Enviar por correo', title: 'Enviar factura por correo',
  desc: 'Se adjunta el PDF de la factura y se envía al cliente.',
  emailLabel: 'Correo del cliente', needEmail: 'Escriba un correo.',
  sending: 'Enviando...', cancel: 'Cancelar', failed: 'No se pudo enviar.',
  sentTo: 'Enviado a {to}',
};
const EN = {
  send: 'Send by email', title: 'Email invoice',
  desc: 'The invoice PDF is attached and sent to the customer.',
  emailLabel: 'Customer email', needEmail: 'Enter an email.',
  sending: 'Sending...', cancel: 'Cancel', failed: 'Could not send.',
  sentTo: 'Sent to {to}',
};
