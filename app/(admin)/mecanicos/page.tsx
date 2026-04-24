'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';

interface Employee {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  hire_date: string;
  notes: string | null;
}

export default function PersonalPage() {
  const supabase = createClient();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [hireDate, setHireDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  async function load() {
    const { data } = await supabase.from('employees')
      .select('id, full_name, phone, email, hire_date, notes')
      .order('full_name');
    setEmployees(data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const { error: err } = await (supabase as any).from('employees').insert({
      full_name: fullName.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
      hire_date: hireDate,
      notes: notes.trim() || null,
      access_pin: '0000',
      role: 'mechanic',
    });
    if (err) { setError(err.message); setSaving(false); return; }
    setFullName(''); setPhone(''); setEmail(''); setNotes('');
    setShowForm(false);
    setSaving(false);
    load();
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`¿Eliminar a ${name} de la lista? Esta acción no se puede deshacer.`)) return;
    setDeletingId(id);
    const { error: err } = await (supabase as any).from('employees').delete().eq('id', id);
    if (err) { alert('Error al eliminar: ' + err.message); }
    setDeletingId(null);
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="display-font text-3xl font-bold text-slate-100 tracking-wide">PERSONAL</h1>
          <p className="text-slate-400 mt-1">{employees.length} personas registradas</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 px-5 rounded-lg transition display-font tracking-wide flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          AGREGAR PERSONA
        </button>
      </div>

      {showForm && (
        <div className="bg-slate-900/80 border border-amber-500/20 rounded-xl p-6 mb-6">
          <h2 className="display-font text-slate-200 font-semibold mb-4 tracking-wide">REGISTRAR PERSONA</h2>
          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-400 text-sm mb-1.5">Nombre Completo *</label>
              <input required value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Juan Perez"
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/50 transition" />
            </div>
            <div>
              <label className="block text-slate-400 text-sm mb-1.5">Telefono</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 123-4567"
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/50 transition" />
            </div>
            <div>
              <label className="block text-slate-400 text-sm mb-1.5">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="persona@taller.com"
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/50 transition" />
            </div>
            <div>
              <label className="block text-slate-400 text-sm mb-1.5">Fecha de Ingreso</label>
              <input type="date" value={hireDate} onChange={e => setHireDate(e.target.value)}
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 focus:outline-none focus:border-amber-400/50 transition" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-slate-400 text-sm mb-1.5">Notas</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Especialidad, cargo, observaciones..."
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/50 transition" />
            </div>
            {error && (
              <div className="md:col-span-2 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2.5 text-red-400 text-sm">{error}</div>
            )}
            <div className="md:col-span-2 flex gap-3">
              <button type="submit" disabled={saving}
                className="bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/50 text-slate-950 font-bold py-2.5 px-6 rounded-lg transition display-font tracking-wide">
                {saving ? 'GUARDANDO...' : 'GUARDAR'}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="bg-slate-700 hover:bg-slate-600 text-slate-300 py-2.5 px-5 rounded-lg transition text-sm">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-slate-500">Cargando...</div>
      ) : employees.length === 0 ? (
        <div className="bg-slate-900/60 border border-white/5 rounded-xl p-12 text-center">
          <p className="text-slate-500">No hay personas registradas.</p>
        </div>
      ) : (
        <div className="bg-slate-900/60 border border-white/5 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-5 py-3 text-slate-500 font-medium">Nombre</th>
                <th className="text-left px-5 py-3 text-slate-500 font-medium">Telefono</th>
                <th className="text-left px-5 py-3 text-slate-500 font-medium">Email</th>
                <th className="text-left px-5 py-3 text-slate-500 font-medium">Ingreso</th>
                <th className="text-left px-5 py-3 text-slate-500 font-medium">Notas</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {employees.map(emp => (
                <tr key={emp.id} className="border-b border-white/5 hover:bg-white/2 transition-colors">
                  <td className="px-5 py-3.5 text-slate-200 font-medium">{emp.full_name}</td>
                  <td className="px-5 py-3.5 text-slate-400">{emp.phone ?? '—'}</td>
                  <td className="px-5 py-3.5 text-slate-400">{emp.email ?? '—'}</td>
                  <td className="px-5 py-3.5 text-slate-500">
                    {new Date(emp.hire_date + 'T12:00:00').toLocaleDateString('es-MX')}
                  </td>
                  <td className="px-5 py-3.5 text-slate-500 italic">{emp.notes ?? '—'}</td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => handleDelete(emp.id, emp.full_name)}
                      disabled={deletingId === emp.id}
                      className="text-slate-600 hover:text-red-400 transition p-1.5 rounded hover:bg-red-500/10"
                      title="Eliminar"
                    >
                      {deletingId === emp.id ? (
                        <span className="text-xs text-slate-500">...</span>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
