'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useLanguage } from '@/contexts/LanguageContext';

interface Employee {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  hire_date: string;
  notes: string | null;
  payment_type: string | null;
  weekly_salary: number | null;
  hourly_rate: number | null;
}

type PaymentType = 'mechanic_commission' | 'fixed_weekly' | 'hourly' | 'manual';

export default function PersonalPage() {
  const { t, lang } = useLanguage();
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
  const [paymentType, setPaymentType] = useState<PaymentType>('mechanic_commission');
  const [weeklySalary, setWeeklySalary] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');

  async function load() {
    const { data } = await (supabase as any).from('employees')
      .select('id, full_name, phone, email, hire_date, notes, payment_type, weekly_salary, hourly_rate')
      .order('full_name');
    setEmployees((data ?? []) as Employee[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function resetForm() {
    setFullName(''); setPhone(''); setEmail(''); setNotes('');
    setPaymentType('mechanic_commission'); setWeeklySalary(''); setHourlyRate('');
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    const payload: any = {
      full_name: fullName.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
      hire_date: hireDate,
      notes: notes.trim() || null,
      access_pin: '0000',
      role: paymentType === 'mechanic_commission' ? 'mechanic' : 'admin',
      payment_type: paymentType,
      weekly_salary: paymentType === 'fixed_weekly' && weeklySalary ? Number(weeklySalary) : null,
      hourly_rate: paymentType === 'hourly' && hourlyRate ? Number(hourlyRate) : null,
    };

    const { error: err } = await (supabase as any).from('employees').insert(payload);
    if (err) { setError(err.message); setSaving(false); return; }
    resetForm();
    setShowForm(false);
    setSaving(false);
    load();
  }

  function paymentTypeLabel(pt: string | null) {
    if (!pt || pt === 'mechanic_commission') return t('staff.payment.mechanic');
    if (pt === 'fixed_weekly') return t('staff.payment.fixedWeekly');
    if (pt === 'hourly') return t('staff.payment.hourly');
    if (pt === 'manual') return t('staff.payment.manual');
    return pt;
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(t('staff.deleteConfirm').replace('{name}', name))) return;
    setDeletingId(id);
    const { error: err } = await (supabase as any).from('employees').delete().eq('id', id);
    if (err) { alert(t('staff.deleteError') + err.message); }
    setDeletingId(null);
    load();
  }

  const locale = lang === 'en' ? 'en-US' : 'es-MX';

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="display-font text-3xl font-bold text-slate-100 tracking-wide">{t('staff.title')}</h1>
          <p className="text-slate-400 mt-1">{employees.length} {t('staff.registered')}</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 px-5 rounded-lg transition display-font tracking-wide flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('staff.addPerson')}
        </button>
      </div>

      {showForm && (
        <div className="bg-slate-900/80 border border-amber-500/20 rounded-xl p-6 mb-6">
          <h2 className="display-font text-slate-200 font-semibold mb-4 tracking-wide">{t('staff.registerPerson')}</h2>
          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-400 text-sm mb-1.5">{t('staff.fullName')}</label>
              <input required value={fullName} onChange={e => setFullName(e.target.value)} placeholder={t('staff.fullNamePlaceholder')}
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/50 transition" />
            </div>
            <div>
              <label className="block text-slate-400 text-sm mb-1.5">{t('common.phone')}</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder={t('staff.phonePlaceholder')}
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/50 transition" />
            </div>
            <div>
              <label className="block text-slate-400 text-sm mb-1.5">{t('common.email')}</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t('staff.emailPlaceholder')}
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/50 transition" />
            </div>
            <div>
              <label className="block text-slate-400 text-sm mb-1.5">{t('staff.hireDate')}</label>
              <input type="date" value={hireDate} onChange={e => setHireDate(e.target.value)}
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 focus:outline-none focus:border-amber-400/50 transition" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-slate-400 text-sm mb-1.5">{t('staff.notes')}</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('staff.notesPlaceholder')}
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/50 transition" />
            </div>

            {/* Payment type */}
            <div className="md:col-span-2 border-t border-white/5 pt-4 mt-2">
              <label className="block text-slate-400 text-sm mb-2">{t('staff.payment.type')}</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {(['mechanic_commission','fixed_weekly','hourly','manual'] as PaymentType[]).map(pt => (
                  <button type="button" key={pt}
                    onClick={() => setPaymentType(pt)}
                    className={`text-xs px-3 py-2 rounded-lg border transition text-left ${
                      paymentType === pt
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                        : 'bg-slate-800 border-white/10 text-slate-400 hover:text-slate-200'
                    }`}>
                    <p className="font-semibold">{paymentTypeLabel(pt)}</p>
                    <p className="text-[10px] opacity-70 mt-0.5">{t(`staff.payment.${pt}Desc`)}</p>
                  </button>
                ))}
              </div>
            </div>

            {paymentType === 'fixed_weekly' && (
              <div>
                <label className="block text-slate-400 text-sm mb-1.5">{t('staff.payment.weeklySalary')}</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-400 text-sm font-bold">$</span>
                  <input type="number" min="0" step="0.01" value={weeklySalary} onChange={e => setWeeklySalary(e.target.value)} placeholder="800.00"
                    className="w-full bg-slate-800 border border-white/10 rounded-lg pl-7 pr-3 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/50 transition" />
                </div>
              </div>
            )}
            {paymentType === 'hourly' && (
              <div>
                <label className="block text-slate-400 text-sm mb-1.5">{t('staff.payment.hourlyRate')}</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-400 text-sm font-bold">$</span>
                  <input type="number" min="0" step="0.01" value={hourlyRate} onChange={e => setHourlyRate(e.target.value)} placeholder="20.00"
                    className="w-full bg-slate-800 border border-white/10 rounded-lg pl-7 pr-3 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/50 transition" />
                </div>
              </div>
            )}

            {error && (
              <div className="md:col-span-2 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2.5 text-red-400 text-sm">{error}</div>
            )}
            <div className="md:col-span-2 flex gap-3">
              <button type="submit" disabled={saving}
                className="bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/50 text-slate-950 font-bold py-2.5 px-6 rounded-lg transition display-font tracking-wide">
                {saving ? t('staff.saving') : t('staff.save')}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="bg-slate-700 hover:bg-slate-600 text-slate-300 py-2.5 px-5 rounded-lg transition text-sm">
                {t('common.cancel')}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-slate-500">{t('common.loading')}</div>
      ) : employees.length === 0 ? (
        <div className="bg-slate-900/60 border border-white/5 rounded-xl p-12 text-center">
          <p className="text-slate-500">{t('staff.empty')}</p>
        </div>
      ) : (() => {
        const isMechanic = (e: Employee) => e.payment_type === 'mechanic_commission' || (!e.payment_type && true);
        const mechanics = employees.filter(isMechanic);
        const adminStaff = employees.filter(e => !isMechanic(e));

        const renderTable = (rows: Employee[]) => (
          <div className="bg-slate-900/60 border border-white/5 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left px-5 py-3 text-slate-500 font-medium">{t('common.name')}</th>
                  <th className="text-left px-5 py-3 text-slate-500 font-medium">{t('staff.payment.type')}</th>
                  <th className="text-left px-5 py-3 text-slate-500 font-medium">{t('staff.table.phone')}</th>
                  <th className="text-left px-5 py-3 text-slate-500 font-medium">{t('staff.table.hireDateCol')}</th>
                  <th className="text-left px-5 py-3 text-slate-500 font-medium">{t('staff.notes')}</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(emp => (
                  <tr key={emp.id} className="border-b border-white/5 hover:bg-white/2 transition-colors">
                    <td className="px-5 py-3.5 text-slate-200 font-medium">{emp.full_name}</td>
                    <td className="px-5 py-3.5">
                      <div className="text-xs">
                        <p className="text-slate-300">{paymentTypeLabel(emp.payment_type)}</p>
                        {emp.payment_type === 'fixed_weekly' && emp.weekly_salary != null && (
                          <p className="text-amber-400 mt-0.5">${Number(emp.weekly_salary).toLocaleString(locale, { minimumFractionDigits: 2 })}/sem</p>
                        )}
                        {emp.payment_type === 'hourly' && emp.hourly_rate != null && (
                          <p className="text-amber-400 mt-0.5">${Number(emp.hourly_rate).toLocaleString(locale, { minimumFractionDigits: 2 })}/h</p>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-400">{emp.phone ?? '—'}</td>
                    <td className="px-5 py-3.5 text-slate-500">
                      {new Date(emp.hire_date + 'T12:00:00').toLocaleDateString(locale)}
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 italic">{emp.notes ?? '—'}</td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => handleDelete(emp.id, emp.full_name)}
                        disabled={deletingId === emp.id}
                        className="text-slate-600 hover:text-red-400 transition p-1.5 rounded hover:bg-red-500/10"
                        title={t('common.delete')}
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
        );

        return (
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
                : renderTable(mechanics)}
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
                : renderTable(adminStaff)}
            </section>
          </div>
        );
      })()}
    </div>
  );
}
