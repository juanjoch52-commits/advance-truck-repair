import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireRole, authErrorResponse } from '@/lib/apiAuth';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function generateTempPassword() {
  // 6-char password: easy to communicate verbally, mix of letters and digits
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let pass = '';
  for (let i = 0; i < 6; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass;
}

export async function POST(req: NextRequest) {
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
    const { email, name, role } = body;
    if (!email) return NextResponse.json({ error: 'Email requerido' }, { status: 400 });

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
    await supabaseAdmin.from('profiles').upsert({
      id: newUser.user.id,
      email,
      full_name: name || null,
      role: role || 'admin',
      must_change_password: true,
    });

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
