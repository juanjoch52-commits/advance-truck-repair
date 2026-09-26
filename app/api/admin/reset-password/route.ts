import { randomInt } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireRole, authErrorResponse } from '@/lib/apiAuth';

// Creación perezosa: a nivel de módulo rompería el build cuando faltan las
// variables de entorno (p. ej. en previews de Vercel sin env configurado).
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function generateTempPassword() {
  // 6-char password: easy to communicate verbally, mix of letters and digits
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let pass = '';
  for (let i = 0; i < 6; i++) {
    pass += chars.charAt(randomInt(chars.length));
  }
  return pass;
}

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  try {
    await requireRole('owner', 'super_user');
  } catch (e) {
    const resp = authErrorResponse(e);
    if (resp) return resp;
    throw e;
  }

  const body = await req.json();

  // Crear nuevo usuario
  if (body.createUser) {
    const { email, name, role, shop_id } = body;
    if (!email) return NextResponse.json({ error: 'Email requerido' }, { status: 400 });

    // Roles asignables al crear. 'contable' es un usuario de SOLO LECTURA
    // limitado a un taller: exige shop_id.
    const ALLOWED = ['admin', 'owner', 'contable'];
    const finalRole = ALLOWED.includes(role) ? role : 'admin';
    const finalShopId = finalRole === 'contable' ? String(shop_id ?? '').trim() : null;
    if (finalRole === 'contable' && !finalShopId) {
      return NextResponse.json({ error: 'La contable necesita un taller asignado' }, { status: 400 });
    }
    // profiles.full_name es NOT NULL: exigir nombre.
    const fullName = String(name ?? '').trim();
    if (!fullName) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 });

    const tempPassword = generateTempPassword();

    const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    });

    if (createErr || !newUser.user) {
      return NextResponse.json({ error: createErr?.message ?? 'Error creando usuario' }, { status: 500 });
    }

    // Insertar perfil con must_change_password=true
    const { error: profErr } = await supabaseAdmin.from('profiles').upsert({
      id: newUser.user.id,
      email,
      full_name: fullName,
      role: finalRole,
      shop_id: finalShopId,
      must_change_password: true,
    });
    if (profErr) {
      // El usuario de Auth quedó creado pero el perfil falló: revertir para no
      // dejar una cuenta huérfana sin perfil (no podría iniciar sesión bien).
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id).catch(() => {});
      return NextResponse.json({ error: profErr.message }, { status: 500 });
    }

    return NextResponse.json({ userId: newUser.user.id, tempPassword });
  }

  // Resetear contraseña de usuario existente
  const { userId } = body;
  if (!userId) return NextResponse.json({ error: 'userId requerido' }, { status: 400 });

  const tempPassword = generateTempPassword();

  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    password: tempPassword,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Marcar que debe cambiar contraseña al siguiente inicio de sesión
  await supabaseAdmin.from('profiles').update({ must_change_password: true }).eq('id', userId);

  return NextResponse.json({ tempPassword });
}
