'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useLanguage } from '@/contexts/LanguageContext';
import { fmtDate } from '@/lib/fmt';

interface Employee {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  hire_date: string;
  notes: string | null;
  role: string | null;
  payment_type: string | null;
  weekly_salary: number | null;
  hourly_rate: number | null;
  is_active: boolean;
}

type Profile = 'mechanic' | 'admin';
type PayType = 'fixed_weekly' | 'hourly' | 'manual';

export interface FormState {
  fullName: string;
  phone: string;
  email: string;
  hireDate: string;
  notes: string;
  profile: Profile;
  payType: PayType;
  weeklySalary: string;
  hourlyRate: string;
}

const BLANK_FORM: FormState = {
  fullName: '',
  phone: '',
  email: '',
  hireDate: new Date().toISOString().split('T')[0],
  notes: '',
  profile: 'mechanic',
  payType: 'fixed_weekly',
  weeklySalary: '',
  hourlyRate: '',
};

// ─── FormBody is defined OUTSIDE PersonalPage so React never remounts it on re-render ───
function FormBody({
  form,
  onChange,
  saving,
  error,
  onSubmit,
  onCancel,
  isEdit,
  t,
}: {
  form: FormState;
  onChange: (patch: Partial<FormState>) => void;
  saving: boolean;
  error: string;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  isEdit: boolean;
  t: (key: string) => string;
}) {
  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Nombre */}
      <div>
        <label className="block text-slate-400 text-sm mb-1.5">{t('staff.fullName')} *</label>
        <input
          required
          value={form.fullName}
          onChange={e => onChange({ fullName: e.target.value })}
          placeholder={t('staff.fullNamePlaceholder')}
          className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/50 transition"
        />
      </div>

      {/* Teléfono */}
      <div>
        <label className="block text-slate-400 text-sm mb-1.5">{t('common.phone')}</label>
        <input
          value={form.phone}
          onChange={e => onChange({ phone: e.target.value })}
          placeholder={t('staff.phonePlaceholder')}
          className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/50 transition"
        />
      </div>

      {/* Email */}
      <div>
        <label className="block text-slate-400 text-sm mb-1.5">{t('common.email')}</label>
        <input
          type="email"
          value={form.email}
          onChange={e => onChange({ email: e.target.value })}
          placeholder={t('staff.emailPlaceholder')}
          className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/50 transition"
        />
      </div>

      {/* Fecha contratación */}
      <div>
        <label className="block text-slate-400 text-sm mb-1.5">{t('staff.hireDate')}</label>
        <input
          type="date"
          value={form.hireDate}
          onChange={e => onChange({ hireDate: e.target.value })}
          className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 focus:outline-none focus:border-amber-400/50 transition"
        />
      </div>

      {/* Notas */}
      <div className="md:col-span-2">
        <label className="block text-slate-400 text-sm mb-1.5">{t('staff.notes')}</label>
        <input
          value={form.notes}
          onChange={e => onChange({ notes: e.target.value })}
          placeholder={t('staff.notesPlaceholder')}
          className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/50 transition"
        />
      </div>

      {/* Perfil */}
      <div className="md:col-span-2 border-t border-white/5 pt-4 mt-1">
        <label className="block text-slate-400 text-sm mb-2">{t('staff.profile.label')}</label>
        <div className="grid grid-cols-2 gap-3">
          {(['mechanic', 'admin'] as Profile[]).map(p => (
            <button
              key={p} type="button"
              onClick={() => onChange({ profile: p })}
              className={`px-4 py-3 rounded-lg border transition text-left ${
                form.profile === p
                  ? p === 'mechanic'
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                    : 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                  : 'bg-slate-800 border-white/10 text-slate-400 hover:text-slate-200'
              }`}
            >
              <p className="font-semibold text-sm">{t(`staff.profile.${p}`)}</p>
              <p className="text-xs opacity-70 mt-1">{t(`staff.profile.${p}Desc`)}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Tipo de pago (solo admin) */}
      {form.profile === 'admin' && (
        <div className="md:col-span-2 bg-slate-800/40 border border-white/5 rounded-xl p-4">
          <label className="block text-slate-400 text-sm mb-3">{t('staff.payment.type')}</label>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {([
              { val: 'fixed_weekly' as PayType, label: 'Sueldo fijo',  desc: 'Mismo monto cada semana' },
              { val: 'hourly'       as PayType, label: 'Por hora',     desc: 'Horas × tarifa'          },
              { val: 'manual'       as PayType, label: 'Manual',       desc: 'Tú defines el monto'     },
            ]).map(opt => (
              <button
                key={opt.val} type="button"
                onClick={() => onChange({ payType: opt.val })}
                className={`px-3 py-2.5 rounded-lg border transition text-left ${
                  form.payType === opt.val
                    ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                    : 'bg-slate-800 border-white/10 text-slate-400 hover:text-slate-200'
                }`}
              >
                <p className="font-semibold text-xs">{opt.label}</p>
                <p className="text-xs opacity-60 mt-0.5">{opt.desc}</p>
              </button>
            ))}
          </div>

          {form.payType === 'fixed_weekly' && (
            <div>
              <label className="block text-slate-400 text-xs mb-1.5">Sueldo semanal ($)</label>
              <div className="relative w-48">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-400 font-bold text-sm">$</span>
                <input
                  type="number" min="0" step="0.01"
                  value={form.weeklySalary}
                  onChange={e => onChange({ weeklySalary: e.target.value })}
                  placeholder="0.00"
                  className="w-full bg-slate-800 border border-white/10 rounded-lg pl-7 pr-3 py-2.5 text-slate-100 text-sm focus:outline-none focus:border-amber-400/50"
                />
              </div>
            </div>
          )}

          {form.payType === 'hourly' && (
            <div>
              <label className="block text-slate-400 text-xs mb-1.5">Tarifa por hora ($)</label>
              <div className="relative w-48">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-400 font-bold text-sm">$</span>
                <input
                  type="number" min="0" step="0.01"
                  value={form.hourlyRate}
                  onChange={e => onChange({ hourlyRate: e.target.value })}
                  placeholder="0.00"
                  className="w-full bg-slate-800 border border-white/10 rounded-lg pl-7 pr-3 py-2.5 text-slate-100 text-sm focus:outline-none focus:border-amber-400/50"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="md:col-span-2 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2.5 text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="md:col-span-2 flex gap-3">
        <button
          type="submit" disabled={saving}
          className="bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/50 text-slate-950 font-bold py-2.5 px-6 rounded-lg transition display-font tracking-wide"
        >
          {saving ? t('staff.saving') : isEdit ? 'Guardar cambios' : t('staff.save')}
        </button>
        <button
          type="button" onClick={onCancel}
          className="bg-slate-700 hover:bg-slate-600 text-slate-300 py-2.5 px-5 rounded-lg transition text-sm"
        >
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function PersonalPage() {
  const { t, lang } = useLanguage();
  const supabase = createClient();
  const locale = lang === 'en' ? 'en-US' : 'es-MX';

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // ── Add form ──
  const [showForm, setShowForm] = useState(false);
  const [addForm, setAddForm] = useState<FormState>(BLANK_FORM);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState('');

  // ── Edit form ──
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [editForm, setEditForm] = useState<FormState>(BLANK_FORM);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  async function load() {
    const { data } = await (supabase as any).from('employees')
      .select('id, full_name, phone, email, hire_date, notes, role, payment_type, weekly_salary, hourly_rate, is_active')
      .order('full_name');
    setEmployees((data ?? []) as Employee[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  // ── Helpers ──
  function empToForm(emp: Employee): FormState {
    const isMech = emp.payment_type === 'mechanic_commission' || emp.role === 'mechanic';
    let payType: PayType = 'manual';
    if (!isMech) {
      if (emp.payment_type === 'fixed_weekly') payType = 'fixed_weekly';
      else if (emp.payment_type === 'hourly') payType = 'hourly';
    }
    return {
      fullName: emp.full_name,
      phone: emp.phone ?? '',
      email: emp.email ?? '',
      hireDate: emp.hire_date,
      notes: emp.notes ?? '',
      profile: isMech ? 'mechanic' : 'admin',
      payType,
      weeklySalary: emp.weekly_salary != null ? String(emp.weekly_salary) : '',
      hourlyRate: emp.hourly_rate != null ? String(emp.hourly_rate) : '',
    };
  }

  function buildPayload(form: FormState) {
    const isAdmin = form.profile === 'admin';
    return {
      full_name: form.fullName.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      hire_date: form.hireDate,
      notes: form.notes.trim() || null,
      role: isAdmin ? 'admin' : 'mechanic',
      payment_type: isAdmin ? form.payType : 'mechanic_commission',
      weekly_salary: isAdmin && form.payType === 'fixed_weekly' ? parseFloat(form.weeklySalary) || null : null,
      hourly_rate: isAdmin && form.payType === 'hourly' ? parseFloat(form.hourlyRate) || null : null,
    };
  }

  // ── Add ──
  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddSaving(true); setAddError('');
    const { error: err } = await (supabase as any).from('employees').insert(buildPayload(addForm));
    if (err) { setAddError(err.message); setAddSaving(false); return; }
    setAddForm(BLANK_FORM); setShowForm(false); setAddSaving(false);
    load();
  }

  // ── Edit ──
  function openEdit(emp: Employee) {
    setEditingEmp(emp);
    setEditForm(empToForm(emp));
    setEditError('');
  }

  function closeEdit() { setEditingEmp(null); setEditError(''); }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editingEmp) return;
    setEditSaving(true); setEditError('');
    const { error: err } = await (supabase as any).from('employees').update(buildPayload(editForm)).eq('id', editingEmp.id);
    if (err) { setEditError(err.message); setEditSaving(false); return; }
    setEditSaving(false); closeEdit(); load();
  }

  // ── Delete ──
  async function handleDelete(id: string, name: string) {
    if (!confirm(t('staff.deleteConfirm').replace('{name}', name))) return;
    setDeletingId(id);
    const { error: err } = await (supabase as any).from('employees').delete().eq('id', id);
    if (err) alert(t('staff.deleteError') + err.message);
    setDeletingId(null); load();
  }

  // ── Suspend / activate ──
  async function handleToggleActive(emp: Employee) {
    if (!confirm(
      emp.is_active
        ? `¿Suspender a ${emp.full_name}? Ya no aparecerá al asignar reportes.`
        : `¿Reactivar a ${emp.full_name}?`
    )) return;
    setTogglingId(emp.id);
    await (supabase as any).from('employees').update({ is_active: !emp.is_active }).eq('id', emp.id);
    setTogglingId(null); load();
  }

  // ── Display helpers ──
  function salaryDisplay(emp: Employee) {
    if (emp.payment_type === 'fixed_weekly' && emp.weekly_salary != null)
      return `$${Number(emp.weekly_salary).toLocaleString(locale, { minimumFractionDigits: 2 })}/sem`;
    if (emp.payment_type === 'hourly' && emp.hourly_rate != null)
      return `$${Number(emp.hourly_rate).toLocaleString(locale, { minimumFractionDigits: 2 })}/h`;
    return null;
  }

  function payTypeLabel(emp: Employee) {
    if (emp.payment_type === 'fixed_weekly') return 'Fijo semanal';
    if (emp.payment_type === 'hourly') return 'Por hora';
    if (emp.payment_type === 'mechanic_commission') return 'Comisión';
    return 'Manual';
  }

  const isMechanic = (e: Employee) => e.payment_type === 'mechanic_commission' || e.role === 'mechanic';

  // ── Action buttons ──
  const SuspendBtn = ({ emp }: { emp: Employee }) => (
    <button
      onClick={() => handleToggleActive(emp)}
      disabled={togglingId === emp.id}
      title={emp.is_active ? 'Suspender' : 'Reactivar'}
      className={`p-1.5 rounded transition ${
        emp.is_active
          ? 'text-slate-500 hover:text-orange-400 hover:bg-orange-500/10'
          : 'text-green-500 hover:text-green-400 hover:bg-green-500/10'
      }`}
    >
      {togglingId === emp.id ? <span className="text-xs">...</span> : emp.is_active ? (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )}
    </button>
  );

  const EditBtn = ({ emp }: { emp: Employee }) => (
    <button
      onClick={() => openEdit(emp)}
      title="Editar"
      className="p-1.5 rounded text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 transition"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-1.414.586H9v-1.414a2 2 0 01.586-1.414z" />
      </svg>
    </button>
  );

  const DeleteBtn = ({ emp }: { emp: Employee }) => (
    <button
      onClick={() => handleDelete(emp.id, emp.full_name)}
      disabled={deletingId === emp.id}
      title="Eliminar"
      className="p-1.5 rounded text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition"
    >
      {deletingId === emp.id ? <span className="text-xs text-slate-500">...</span> : (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      )}
    </button>
  );

  // ── Tables / cards ──
  const mechanics = employees.filter(isMechanic);
  const adminStaff = employees.filter(e => !isMechanic(e));

  const renderMechanicsTable = (rows: Employee[]) => (
    <div className="bg-slate-900/60 border border-white/5 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/5">
            <th className="text-left px-5 py-3 text-slate-500 font-medium">{t('common.name')}</th>
            <th className="text-left px-5 py-3 text-slate-500 font-medium">{t('staff.table.phone')}</th>
            <th className="text-left px-5 py-3 text-slate-500 font-medium">{t('staff.table.hireDateCol')}</th>
            <th className="text-left px-5 py-3 text-slate-500 font-medium">{t('staff.notes')}</th>
            <th className="px-5 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(emp => (
            <tr key={emp.id} className={`border-b border-white/5 transition-colors ${emp.is_active ? 'hover:bg-white/2' : 'opacity-60'}`}>
              <td className="px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <span className={`font-medium ${emp.is_active ? 'text-slate-200' : 'text-slate-500 line-through'}`}>
                    {emp.full_name}
                  </span>
                  {!emp.is_active && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-400">
                      Suspendido
                    </span>
                  )}
                </div>
              </td>
              <td className="px-5 py-3.5 text-slate-400">{emp.phone ?? '—'}</td>
              <td className="px-5 py-3.5 text-slate-500 text-xs">
                {fmtDate(emp.hire_date)}
              </td>
              <td className="px-5 py-3.5 text-slate-500 italic text-xs max-w-xs truncate">{emp.notes ?? '—'}</td>
              <td className="px-5 py-3.5">
                <div className="flex items-center justify-end gap-1">
                  <EditBtn emp={emp} />
                  <SuspendBtn emp={emp} />
                  <DeleteBtn emp={emp} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderAdminCards = (rows: Employee[]) => (
    <div className="space-y-3">
      {rows.map(emp => {
        const sal = salaryDisplay(emp);
        return (
          <div key={emp.id} className={`bg-slate-900/60 border border-white/5 rounded-xl px-5 py-4 flex items-center justify-between gap-4 flex-wrap ${!emp.is_active ? 'opacity-60' : ''}`}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className={`display-font font-semibold tracking-wide ${emp.is_active ? 'text-slate-200' : 'text-slate-500 line-through'}`}>
                  {emp.full_name}
                </p>
                {!emp.is_active && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-400">
                    Suspendido
                  </span>
                )}
                <span className="text-xs px-2 py-0.5 rounded-full border bg-sky-500/10 border-sky-500/30 text-sky-300">
                  {payTypeLabel(emp)}
                </span>
                {sal && <span className="text-amber-400 font-semibold text-sm">{sal}</span>}
                {!sal && (emp.payment_type === 'fixed_weekly' || emp.payment_type === 'hourly') && (
                  <span className="text-slate-500 text-xs italic">Sin monto — usar editar</span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-slate-500">
                {emp.phone && <span>{emp.phone}</span>}
                {emp.email && <span>{emp.email}</span>}
                {emp.notes && <span className="italic">{emp.notes}</span>}
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <EditBtn emp={emp} />
              <SuspendBtn emp={emp} />
              <DeleteBtn emp={emp} />
            </div>
          </div>
        );
      })}
    </div>
  );

  // ── Edit modal ──
  const EditModal = () => {
    if (!editingEmp) return null;
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto">
        <div className="bg-slate-900 border border-amber-500/20 rounded-2xl p-6 w-full max-w-2xl my-8 shadow-2xl">
          <div className="flex items-center justify-between mb-5">
            <h2 className="display-font text-slate-100 font-bold text-lg tracking-wide">
              Editar — {editingEmp.full_name}
            </h2>
            <button
              onClick={closeEdit}
              className="text-slate-500 hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-700 transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <FormBody
            form={editForm}
            onChange={patch => setEditForm(prev => ({ ...prev, ...patch }))}
            saving={editSaving}
            error={editError}
            onSubmit={handleEditSave}
            onCancel={closeEdit}
            isEdit={true}
            t={t}
          />
        </div>
      </div>
    );
  };

  // ── Render ──
  return (
    <div>
      <EditModal />

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="display-font text-3xl font-bold text-slate-100 tracking-wide">{t('staff.title')}</h1>
          <p className="text-slate-400 mt-1">{employees.length} {t('staff.registered')}</p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setAddForm(BLANK_FORM); setAddError(''); }}
          className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 px-5 rounded-lg transition display-font tracking-wide flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('staff.addPerson')}
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-slate-900/80 border border-amber-500/20 rounded-xl p-6 mb-6">
          <h2 className="display-font text-slate-200 font-semibold mb-4 tracking-wide">{t('staff.registerPerson')}</h2>
          <FormBody
            form={addForm}
            onChange={patch => setAddForm(prev => ({ ...prev, ...patch }))}
            saving={addSaving}
            error={addError}
            onSubmit={handleAdd}
            onCancel={() => { setShowForm(false); setAddForm(BLANK_FORM); }}
            isEdit={false}
            t={t}
          />
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-slate-500">{t('common.loading')}</div>
      ) : employees.length === 0 ? (
        <div className="bg-slate-900/60 border border-white/5 rounded-xl p-12 text-center">
          <p className="text-slate-500">{t('staff.empty')}</p>
        </div>
      ) : (
        <div className="space-y-8">
          <section>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="display-font text-amber-400 font-semibold tracking-wider text-sm uppercase">
                {t('staff.section.mechanics')}
              </h2>
              <span className="text-slate-500 text-xs">{mechanics.length}</span>
            </div>
            {mechanics.length === 0
              ? <div className="bg-slate-900/40 border border-white/5 rounded-xl p-6 text-center text-slate-500 text-sm">{t('staff.section.noMechanics')}</div>
              : renderMechanicsTable(mechanics)}
          </section>

          <section>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="display-font text-sky-400 font-semibold tracking-wider text-sm uppercase">
                {t('staff.section.admin')}
              </h2>
              <span className="text-slate-500 text-xs">{adminStaff.length}</span>
            </div>
            {adminStaff.length === 0
              ? <div className="bg-slate-900/40 border border-white/5 rounded-xl p-6 text-center text-slate-500 text-sm">{t('staff.section.noAdmin')}</div>
              : renderAdminCards(adminStaff)}
          </section>
        </div>
      )}
    </div>
  );
}
