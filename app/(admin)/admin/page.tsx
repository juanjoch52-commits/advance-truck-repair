'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  created_at: string;
}

interface TempPasswordResult {
  userId: string;
  password: string;
}

// Roles disponibles para asignar (super_admin solo puede asignarlo otro super_admin)
const ASSIGNABLE_ROLES = [
  { value: 'admin', label: 'Administrador' },
  { value: 'owner', label: 'Dueño' },
];

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  owner: 'Dueño',
  admin: 'Administrador',
};

const ROLE_COLORS: Record<string, string> = {
  super_admin: 'text-amber-400 bg-amber-500/15 border-amber-500/30',
  owner: 'text-purple-400 bg-purple-500/15 border-purple-500/30',
  admin: 'text-blue-400 bg-blue-500/15 border-blue-500/30',
};

export default function AdminPage() {
  const supabase = createClient();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<string>('');
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState<string | null>(null);
  const [changingRole, setChangingRole] = useState<string | null>(null);
  const [tempPasswords, setTempPasswords] = useState<TempPasswordResult[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'owner'>('admin');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  async function load() {
    const { data: session } = await supabase.auth.getUser();
    if (session.user) {
      setCurrentUserId(session.user.id);
      const { data: profile } = await (supabase as any)
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();
      setCurrentUserRole(profile?.role ?? '');
    }

    const { data } = await (supabase as any)
      .from('profiles')
      .select('id, email, full_name, role, created_at')
      .order('created_at');
    setUsers(data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  // Reglas de acceso:
  // super_admin: puede cambiar roles de cualquiera excepto su propio rol
  // owner: puede cambiar roles de admin/owner pero NUNCA tocar un super_admin
  function canChangeRole(targetUser: UserProfile): boolean {
    if (targetUser.id === currentUserId) return false; // No puedes cambiarte a ti mismo
    if (targetUser.role === 'super_admin') return false; // Nadie puede tocar al super_admin
    if (currentUserRole === 'super_admin') return true;
    if (currentUserRole === 'owner') return true;
    return false;
  }

  function canResetPassword(targetUser: UserProfile): boolean {
    if (targetUser.role === 'super_admin' && currentUserRole !== 'super_admin') return false;
    if (currentUserRole === 'super_admin' || currentUserRole === 'owner') return true;
    return false;
  }

  async function handleChangeRole(userId: string, newRole: string) {
    setChangingRole(userId);
    const { error } = await (supabase as any)
      .from('profiles')
      .update({ role: newRole })
      .eq('id', userId);
    if (error) alert('Error al cambiar rol: ' + error.message);
    setChangingRole(null);
    load();
  }

  async function handleResetPassword(userId: string) {
    setResetting(userId);
    try {
      const res = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (data.error) {
        alert('Error: ' + data.error);
      } else {
        setTempPasswords(prev => {
          const filtered = prev.filter(p => p.userId !== userId);
          return [...filtered, { userId, password: data.tempPassword }];
        });
      }
    } catch {
      alert('Error de conexión');
    }
    setResetting(null);
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError('');
    try {
      const res = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ createUser: true, email: newEmail, name: newName, role: newRole }),
      });
      const data = await res.json();
      if (data.error) {
        setCreateError(data.error);
      } else {
        setTempPasswords(prev => [...prev, { userId: data.userId, password: data.tempPassword }]);
        setNewEmail(''); setNewName(''); setNewRole('admin');
        setShowForm(false);
        load();
      }
    } catch {
      setCreateError('Error de conexión');
    }
    setCreating(false);
  }

  const isSuperAdmin = currentUserRole === 'super_admin';
  const isOwner = currentUserRole === 'owner';
  const canManage = isSuperAdmin || isOwner;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full display-font tracking-wide border ${ROLE_COLORS[currentUserRole] ?? 'text-slate-400 bg-slate-500/15 border-slate-500/30'}`}>
              {ROLE_LABELS[currentUserRole] ?? currentUserRole.toUpperCase()}
            </span>
          </div>
          <h1 className="display-font text-3xl font-bold text-slate-100 tracking-wide">USUARIOS DEL SISTEMA</h1>
          <p className="text-slate-400 mt-1">{users.length} usuarios registrados</p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 px-5 rounded-lg transition display-font tracking-wide flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            NUEVO USUARIO
          </button>
        )}
      </div>

      {/* Crear usuario */}
      {showForm && canManage && (
        <div className="bg-slate-900/80 border border-amber-500/20 rounded-xl p-6 mb-6">
          <h2 className="display-font text-slate-200 font-semibold mb-4 tracking-wide">CREAR USUARIO</h2>
          <form onSubmit={handleCreateUser} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-slate-400 text-sm mb-1.5">Email *</label>
              <input required type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                placeholder="usuario@taller.com"
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/50 transition" />
            </div>
            <div>
              <label className="block text-slate-400 text-sm mb-1.5">Nombre</label>
              <input value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="Nombre completo"
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/50 transition" />
            </div>
            <div>
              <label className="block text-slate-400 text-sm mb-1.5">Rol</label>
              <select value={newRole} onChange={e => setNewRole(e.target.value as any)}
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 focus:outline-none focus:border-amber-400/50 transition">
                {ASSIGNABLE_ROLES.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            {createError && (
              <div className="md:col-span-3 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2.5 text-red-400 text-sm">{createError}</div>
            )}
            <div className="md:col-span-3 flex gap-3">
              <button type="submit" disabled={creating}
                className="bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/50 text-slate-950 font-bold py-2.5 px-6 rounded-lg transition display-font tracking-wide">
                {creating ? 'CREANDO...' : 'CREAR Y GENERAR CONTRASEÑA'}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="bg-slate-700 hover:bg-slate-600 text-slate-300 py-2.5 px-5 rounded-lg transition text-sm">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Contraseñas temporales generadas */}
      {tempPasswords.length > 0 && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-5 mb-6">
          <h3 className="text-emerald-400 font-semibold mb-1 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            Contraseñas Temporales
          </h3>
          <p className="text-emerald-300/60 text-xs mb-3">Cópielas ahora — desaparecen al salir de esta página.</p>
          <div className="space-y-2">
            {tempPasswords.map(tp => {
              const user = users.find(u => u.id === tp.userId);
              return (
                <div key={tp.userId} className="flex items-center gap-4 bg-slate-900/60 rounded-lg px-4 py-3">
                  <span className="text-slate-300 text-sm flex-1">{user?.email ?? tp.userId}</span>
                  <span className="font-mono text-emerald-400 text-base font-bold tracking-wider">{tp.password}</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(tp.password)}
                    className="text-slate-500 hover:text-emerald-400 transition"
                    title="Copiar contraseña"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Lista de usuarios */}
      {loading ? (
        <div className="text-center py-12 text-slate-500">Cargando...</div>
      ) : (
        <div className="bg-slate-900/60 border border-white/5 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-5 py-3 text-slate-500 font-medium">Nombre</th>
                <th className="text-left px-5 py-3 text-slate-500 font-medium">Email</th>
                <th className="text-left px-5 py-3 text-slate-500 font-medium">Rol</th>
                <th className="text-left px-5 py-3 text-slate-500 font-medium">Creado</th>
                <th className="px-5 py-3 text-right text-slate-500 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => {
                const isMe = user.id === currentUserId;
                const isSuperAdminTarget = user.role === 'super_admin';
                const showRoleChange = canChangeRole(user);
                const showReset = canResetPassword(user);

                return (
                  <tr key={user.id} className={`border-b border-white/5 transition-colors ${isMe ? 'bg-amber-500/5' : 'hover:bg-white/2'}`}>
                    <td className="px-5 py-3.5 text-slate-200 font-medium">
                      {user.full_name ?? <span className="text-slate-600 italic">Sin nombre</span>}
                      {isMe && <span className="ml-2 text-xs text-amber-500/70">(tú)</span>}
                    </td>
                    <td className="px-5 py-3.5 text-slate-400 font-mono text-xs">{user.email}</td>
                    <td className="px-5 py-3.5">
                      {showRoleChange ? (
                        <select
                          value={user.role}
                          disabled={changingRole === user.id}
                          onChange={e => handleChangeRole(user.id, e.target.value)}
                          className="bg-slate-800 border border-white/10 rounded-lg px-3 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-amber-400/50 transition cursor-pointer"
                        >
                          {ASSIGNABLE_ROLES.map(r => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full border display-font tracking-wide ${ROLE_COLORS[user.role] ?? 'text-slate-400 bg-slate-500/15 border-slate-500/30'}`}>
                          {ROLE_LABELS[user.role] ?? user.role}
                          {isSuperAdminTarget && <span className="ml-1">🔒</span>}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 text-xs">
                      {new Date(user.created_at).toLocaleDateString('es-MX')}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {showReset ? (
                        <button
                          onClick={() => handleResetPassword(user.id)}
                          disabled={resetting === user.id}
                          className="bg-slate-800 hover:bg-amber-500/20 hover:text-amber-400 hover:border-amber-500/30 border border-white/10 text-slate-400 text-xs font-medium py-1.5 px-3 rounded-lg transition flex items-center gap-1.5 ml-auto"
                        >
                          {resetting === user.id ? (
                            <span>Generando...</span>
                          ) : (
                            <>
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                              </svg>
                              Contraseña temp.
                            </>
                          )}
                        </button>
                      ) : (
                        <span className="text-slate-700 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Nota de protección */}
      <p className="text-slate-600 text-xs mt-4 text-center">
        🔒 El rol Super Admin está protegido y no puede ser modificado por otros usuarios.
      </p>
    </div>
  );
}
