// ─── Envío de correo (APAGADO por defecto) ───────────────────────────────────
// Capa de abstracción para mandar correos (facturas al cliente). Hoy el único
// adaptador es Resend (https://resend.com), llamado por HTTP con fetch — SIN
// dependencias npm. Todo queda INACTIVO hasta que se configuren las variables
// de entorno; mientras tanto isEmailEnabled() = false y las rutas responden
// "email_not_enabled". Para ACTIVARLO cuando lo tengan disponible:
//   1) Crear cuenta en Resend y verificar un dominio de envío.
//   2) En Vercel (Production) definir:
//        RESEND_API_KEY   = re_xxx...           (clave del API)
//        EMAIL_FROM       = "Advance Truck Repair <facturas@tudominio.com>"
//        EMAIL_ENABLED    = true                (interruptor maestro; opcional)
//      y en el front, para que aparezca el botón:
//        NEXT_PUBLIC_EMAIL_ENABLED = true
//   3) Redesplegar. No hace falta tocar código.
// Cambiar de proveedor luego = escribir otro adaptador y enrutarlo en sendEmail.

export class EmailNotConfiguredError extends Error {
  constructor() { super('email_not_enabled'); this.name = 'EmailNotConfiguredError'; }
}

export interface EmailAttachment {
  filename: string;
  /** Contenido del archivo en base64 (sin el prefijo data:). */
  content: string;
}

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/** True solo si el envío está configurado y no fue apagado explícitamente. */
export function isEmailEnabled(): boolean {
  if (String(process.env.EMAIL_ENABLED ?? '').toLowerCase() === 'false') return false;
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

/** Validación básica de correo (no exhaustiva, solo evita basura obvia). */
export function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
}

/**
 * Envía un correo con el proveedor configurado. Lanza EmailNotConfiguredError
 * si el envío está apagado (para que la ruta responda 503 sin intentar nada).
 */
export async function sendEmail(input: SendEmailInput): Promise<{ id: string | null }> {
  if (!isEmailEnabled()) throw new EmailNotConfiguredError();
  return sendViaResend(input);
}

async function sendViaResend(input: SendEmailInput): Promise<{ id: string | null }> {
  const apiKey = process.env.RESEND_API_KEY!;
  const from = process.env.EMAIL_FROM!;
  const payload: Record<string, unknown> = {
    from,
    to: Array.isArray(input.to) ? input.to : [input.to],
    subject: input.subject,
  };
  if (input.html) payload.html = input.html;
  if (input.text) payload.text = input.text;
  if (input.replyTo) payload.reply_to = input.replyTo;
  if (input.attachments?.length) {
    payload.attachments = input.attachments.map(a => ({ filename: a.filename, content: a.content }));
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`resend_error_${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json().catch(() => ({}));
  return { id: (data as any)?.id ?? null };
}
