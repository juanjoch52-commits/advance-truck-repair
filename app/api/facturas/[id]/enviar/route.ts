import { NextResponse } from 'next/server';
import { requireInvoicesAccess } from '@/lib/invoicesApi';
import { sanitizeDbError } from '@/lib/clientsApi';
import { authErrorResponse } from '@/lib/apiAuth';
import { sendEmail, isEmailEnabled, isValidEmail, EmailNotConfiguredError } from '@/lib/mailer';

// POST /api/facturas/[id]/enviar → envía la factura al cliente por correo.
//
// ⚠️ INACTIVO por defecto: si el envío no está configurado (ver lib/mailer.ts)
// responde 503 { error: 'email_not_enabled' } sin mandar nada. El botón del
// front también está oculto hasta activar NEXT_PUBLIC_EMAIL_ENABLED, así que
// este endpoint no hace nada hasta que se decida encenderlo.
//
// Body: { to?: string, pdf_base64?: string, filename?: string, message?: string }
//   - to: correo destino. Si no viene, usa el email del cliente registrado.
//         Para clientes ocasionales (walk-in) SIEMPRE debe venir en el body
//         (se escribe al momento de enviar).
//   - pdf_base64: el PDF de la factura (base64 sin prefijo data:), generado en
//         el navegador con el mismo diseño de descarga/impresión. Opcional: si
//         no viene, el correo va sin adjunto (solo el resumen).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await requireInvoicesAccess();
    const { id } = await params;

    // Barrera "apagado": no intentamos nada si no está configurado.
    if (!isEmailEnabled()) {
      return NextResponse.json(
        { error: 'email_not_enabled', message: 'El envío por correo aún no está activado.' },
        { status: 503 },
      );
    }

    const body = await request.json().catch(() => ({} as any));

    const { data: invoice, error } = await supabase
      .from('invoices')
      .select('id,document_number,document_type,client_id,customer_name,total,shop_id')
      .eq('id', id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: sanitizeDbError('facturas/enviar', error.message) }, { status: 500 });
    if (!invoice) return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });

    // Destinatario: el del body (obligatorio para walk-in), o el del cliente.
    let to = String(body.to ?? '').trim();
    let clientName = invoice.customer_name || 'Cliente';
    if (!to && invoice.client_id) {
      const { data: client } = await supabase
        .from('clients').select('name,email').eq('id', invoice.client_id).maybeSingle();
      to = String(client?.email ?? '').trim();
      clientName = client?.name || clientName;
    }
    if (!to) return NextResponse.json({ error: 'no_recipient', message: 'Falta el correo del cliente.' }, { status: 400 });
    if (!isValidEmail(to)) return NextResponse.json({ error: 'invalid_email', message: 'Correo no válido.' }, { status: 400 });

    // Nombre del taller para el asunto/firma.
    let shopName = 'Advance Truck Repair';
    if (invoice.shop_id) {
      const { data: shop } = await supabase.from('shops').select('name,legal_name,email').eq('id', invoice.shop_id).maybeSingle();
      shopName = shop?.legal_name || shop?.name || shopName;
    }

    const docLabel = invoice.document_type === 'estimate' ? 'Estimate' : 'Invoice';
    const number = invoice.document_number || id.slice(0, 8);
    const totalStr = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(invoice.total) || 0);
    const customMsg = String(body.message ?? '').trim();

    const subject = `${docLabel} ${number} — ${shopName}`;
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;line-height:1.5">
        <p>Hello ${escapeHtml(clientName)},</p>
        <p>${customMsg ? escapeHtml(customMsg) : `Please find attached your ${docLabel.toLowerCase()} <strong>${escapeHtml(number)}</strong> for a total of <strong>${totalStr}</strong>.`}</p>
        <p>Thank you for your business.</p>
        <p style="color:#6b7280;font-size:13px">${escapeHtml(shopName)}</p>
      </div>`;
    const text = `Hello ${clientName},\n\n${customMsg || `Attached is your ${docLabel.toLowerCase()} ${number} for a total of ${totalStr}.`}\n\nThank you for your business.\n${shopName}`;

    const attachments = [];
    const pdf64 = String(body.pdf_base64 ?? '').trim();
    if (pdf64) {
      const filename = String(body.filename ?? '').trim() || `${docLabel}_${number}.pdf`;
      attachments.push({ filename, content: pdf64 });
    }

    const result = await sendEmail({ to, subject, html, text, attachments });

    // Auditoría best-effort (no rompe el envío si las columnas no existen aún;
    // se agregan con la migración 20260730_invoice_email cuando se active).
    try {
      await supabase.from('invoices')
        .update({ last_emailed_at: new Date().toISOString(), last_emailed_to: to })
        .eq('id', id);
    } catch { /* columnas opcionales; ignorar */ }

    return NextResponse.json({ ok: true, id: result.id, to });
  } catch (err) {
    if (err instanceof EmailNotConfiguredError) {
      return NextResponse.json({ error: 'email_not_enabled' }, { status: 503 });
    }
    const authResp = authErrorResponse(err);
    if (authResp) return authResp;
    // Error del proveedor u otro: mensaje controlado.
    return NextResponse.json({ error: 'send_failed', message: (err as any)?.message?.slice(0, 300) || 'No se pudo enviar.' }, { status: 502 });
  }
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
