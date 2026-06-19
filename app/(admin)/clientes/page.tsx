'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';

type ClientType = 'corporate' | 'individual';
type PaymentMethod = 'cash' | 'check' | 'card' | 'transfer' | 'credit';

interface Client {
  id: string;
  name: string;
  client_type: ClientType;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  billing_address_line: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  tax_id: string | null;
  default_payment_method: PaymentMethod;
  payment_terms_days: number;
  tax_exempt: boolean;
  tax_exempt_certificate: string | null;
  notes: string | null;
  is_active: boolean;
  locations?: { id: string }[];
  trucks?: { id: string }[];
}

export interface ClientFormState {
  name: string;
  clientType: ClientType;
  contactName: string;
  phone: string;
  email: string;
  billingAddress: string;
  city: string;
  state: string;
  zip: string;
  taxId: string;
  paymentMethod: PaymentMethod;
  paymentTermsDays: string;
  taxExempt: boolean;
  taxExemptCertificate: string;
  notes: string;
}

const BLANK_FORM: ClientFormState = {
  name: '',
  clientType: 'corporate',
  contactName: '',
  phone: '',
  email: '',
  billingAddress: '',
  city: '',
  state: '',
  zip: '',
  taxId: '',
  paymentMethod: 'cash',
  paymentTermsDays: '0',
  taxExempt: false,
  taxExemptCertificate: '',
  notes: '',
};

const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'check', 'card', 'transfer', 'credit'];
const inputCls =
  'w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/50 transition';

// ─── Form (fuera del componente para que React no lo remonte en cada render) ──
function ClientFormBody({
  form, onChange, saving, error, onSubmit, onCancel, isEdit, t,
}: {
  form: ClientFormState;
  onChange: (patch: Partial<ClientFormState>) => void;
  saving: boolean;
  error: string;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  isEdit: boolean;
  t: (key: string) => string;
}) {
  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="md:col-span-2 flex justify-end -mb-2">
        <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('atr:start-tour', { detail: { key: 'cliente-form' } }))} className="text-amber-400/80 hover:text-amber-300 text-xs flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          {t('tour.explainFields')}
        </button>
      </div>
      {/* Tipo de cliente */}
      <div className="md:col-span-2" data-tour="clif-type">
        <label className="block text-slate-400 text-sm mb-2">{t('clients.type.label')}</label>
        <div className="grid grid-cols-2 gap-3">
          {(['corporate', 'individual'] as ClientType[]).map(ct => (
            <button
              key={ct} type="button"
              onClick={() => onChange({ clientType: ct })}
              className={`px-4 py-3 rounded-lg border transition text-left ${
                form.clientType === ct
                  ? ct === 'corporate'
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                    : 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                  : 'bg-slate-800 border-white/10 text-slate-400 hover:text-slate-200'
              }`}
            >
              <p className="font-semibold text-sm">{t(`clients.type.${ct}`)}</p>
              <p className="text-xs opacity-70 mt-1">{t(`clients.type.${ct}Desc`)}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="md:col-span-2" data-tour="clif-name">
        <label className="block text-slate-400 text-sm mb-1.5">{t('clients.name')} *</label>
        <input required value={form.name} onChange={e => onChange({ name: e.target.value })}
          placeholder={t('clients.namePlaceholder')} className={inputCls} />
      </div>

      <div>
        <label className="block text-slate-400 text-sm mb-1.5">{t('clients.contactName')}</label>
        <input value={form.contactName} onChange={e => onChange({ contactName: e.target.value })} className={inputCls} />
      </div>
      <div>
        <label className="block text-slate-400 text-sm mb-1.5">{t('common.phone')}</label>
        <input value={form.phone} onChange={e => onChange({ phone: e.target.value })} className={inputCls} />
      </div>
      <div>
        <label className="block text-slate-400 text-sm mb-1.5">{t('common.email')}</label>
        <input type="email" value={form.email} onChange={e => onChange({ email: e.target.value })} className={inputCls} />
      </div>
      <div>
        <label className="block text-slate-400 text-sm mb-1.5">{t('clients.taxId')}</label>
        <input value={form.taxId} onChange={e => onChange({ taxId: e.target.value })}
          placeholder={t('clients.taxIdPlaceholder')} className={inputCls} />
      </div>

      {/* Dirección de facturación */}
      <div className="md:col-span-2">
        <label className="block text-slate-400 text-sm mb-1.5">{t('clients.billingAddress')}</label>
        <input value={form.billingAddress} onChange={e => onChange({ billingAddress: e.target.value })} className={inputCls} />
      </div>
      <div>
        <label className="block text-slate-400 text-sm mb-1.5">{t('clients.city')}</label>
        <input value={form.city} onChange={e => onChange({ city: e.target.value })} className={inputCls} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-slate-400 text-sm mb-1.5">{t('clients.state')}</label>
          <input value={form.state} onChange={e => onChange({ state: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className="block text-slate-400 text-sm mb-1.5">{t('clients.zip')}</label>
          <input value={form.zip} onChange={e => onChange({ zip: e.target.value })} className={inputCls} />
        </div>
      </div>

      {/* Pago */}
      <div data-tour="clif-pay">
        <label className="block text-slate-400 text-sm mb-1.5">{t('clients.paymentMethod')}</label>
        <select value={form.paymentMethod} onChange={e => onChange({ paymentMethod: e.target.value as PaymentMethod })} className={inputCls}>
          {PAYMENT_METHODS.map(pm => <option key={pm} value={pm}>{t(`clients.pm.${pm}`)}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-slate-400 text-sm mb-1.5">{t('clients.paymentTerms')}</label>
        <input type="number" min="0" step="1" value={form.paymentTermsDays}
          onChange={e => onChange({ paymentTermsDays: e.target.value })}
          placeholder="0" className={inputCls} />
        <p className="text-slate-600 text-xs mt-1">{t('clients.paymentTermsHint')}</p>
      </div>

      {/* Exención de sales tax (certificado) */}
      <div className="md:col-span-2 bg-slate-800/40 border border-white/5 rounded-xl p-3" data-tour="clif-exempt">
        <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
          <input type="checkbox" checked={form.taxExempt} onChange={e => onChange({ taxExempt: e.target.checked })} className="accent-amber-500 w-4 h-4" />
          {t('clients.taxExempt')}
        </label>
        {form.taxExempt && (
          <div className="mt-3">
            <label className="block text-slate-400 text-sm mb-1.5">{t('clients.taxExemptCert')}</label>
            <input value={form.taxExemptCertificate} onChange={e => onChange({ taxExemptCertificate: e.target.value })}
              placeholder={t('clients.taxExemptCertPlaceholder')} className={inputCls} />
            <p className="text-amber-400/80 text-xs mt-1.5">{t('clients.taxExemptHint')}</p>
          </div>
        )}
      </div>

      <div className="md:col-span-2">
        <label className="block text-slate-400 text-sm mb-1.5">{t('clients.notes')}</label>
        <input value={form.notes} onChange={e => onChange({ notes: e.target.value })} className={inputCls} />
      </div>

      {error && (
        <div className="md:col-span-2 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2.5 text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="md:col-span-2 flex gap-3">
        <button type="submit" disabled={saving}
          className="bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/50 text-slate-950 font-bold py-2.5 px-6 rounded-lg transition display-font tracking-wide">
          {saving ? t('common.saving') : isEdit ? t('common.save') : t('clients.save')}
        </button>
        <button type="button" onClick={onCancel}
          className="bg-slate-700 hover:bg-slate-600 text-slate-300 py-2.5 px-5 rounded-lg transition text-sm">
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}

export default function ClientesPage() {
  const { t } = useLanguage();

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [addForm, setAddForm] = useState<ClientFormState>(BLANK_FORM);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState('');

  const [editing, setEditing] = useState<Client | null>(null);
  const [editForm, setEditForm] = useState<ClientFormState>(BLANK_FORM);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  async function load() {
    try {
      const res = await fetch('/api/clientes?tree=1');
      const j = await res.json();
      setClients((j.clients ?? []) as Client[]);
    } catch {
      setClients([]);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function clientToForm(c: Client): ClientFormState {
    return {
      name: c.name,
      clientType: c.client_type,
      contactName: c.contact_name ?? '',
      phone: c.phone ?? '',
      email: c.email ?? '',
      billingAddress: c.billing_address_line ?? '',
      city: c.city ?? '',
      state: c.state ?? '',
      zip: c.zip ?? '',
      taxId: c.tax_id ?? '',
      paymentMethod: c.default_payment_method,
      paymentTermsDays: String(c.payment_terms_days ?? 0),
      taxExempt: !!c.tax_exempt,
      taxExemptCertificate: c.tax_exempt_certificate ?? '',
      notes: c.notes ?? '',
    };
  }

  function buildPayload(f: ClientFormState) {
    return {
      name: f.name.trim(),
      client_type: f.clientType,
      contact_name: f.contactName.trim() || null,
      phone: f.phone.trim() || null,
      email: f.email.trim() || null,
      billing_address_line: f.billingAddress.trim() || null,
      city: f.city.trim() || null,
      state: f.state.trim() || null,
      zip: f.zip.trim() || null,
      tax_id: f.taxId.trim() || null,
      default_payment_method: f.paymentMethod,
      payment_terms_days: parseInt(f.paymentTermsDays, 10) || 0,
      tax_exempt: f.taxExempt,
      tax_exempt_certificate: f.taxExempt ? (f.taxExemptCertificate.trim() || null) : null,
      notes: f.notes.trim() || null,
    };
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddSaving(true); setAddError('');
    const res = await fetch('/api/clientes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload(addForm)),
    });
    const j = await res.json();
    if (!res.ok) { setAddError(j.error ?? 'Error'); setAddSaving(false); return; }
    setAddForm(BLANK_FORM); setShowForm(false); setAddSaving(false); load();
  }

  function openEdit(c: Client) { setEditing(c); setEditForm(clientToForm(c)); setEditError(''); }
  function closeEdit() { setEditing(null); setEditError(''); }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setEditSaving(true); setEditError('');
    const res = await fetch(`/api/clientes/${editing.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload(editForm)),
    });
    const j = await res.json();
    if (!res.ok) { setEditError(j.error ?? 'Error'); setEditSaving(false); return; }
    setEditSaving(false); closeEdit(); load();
  }

  async function handleToggleActive(c: Client) {
    if (!confirm(c.is_active ? t('clients.suspendConfirm').replace('{name}', c.name) : t('clients.reactivateConfirm').replace('{name}', c.name))) return;
    setBusyId(c.id);
    await fetch(`/api/clientes/${c.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !c.is_active }),
    });
    setBusyId(null); load();
  }

  async function handleDelete(c: Client) {
    if (!confirm(t('clients.deleteConfirm').replace('{name}', c.name))) return;
    setBusyId(c.id);
    const res = await fetch(`/api/clientes/${c.id}`, { method: 'DELETE' });
    if (!res.ok) { const j = await res.json().catch(() => ({})); alert((j as any).error ?? t('clients.deleteError')); }
    setBusyId(null); load();
  }

  const filtered = clients.filter(c => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [c.name, c.contact_name, c.phone, c.email, c.city].some(v => (v ?? '').toLowerCase().includes(q));
  });

  function termsLabel(c: Client) {
    return c.payment_terms_days > 0 ? `Net-${c.payment_terms_days}` : t('clients.terms.cash');
  }

  return (
    <div>
      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-amber-500/20 rounded-2xl p-6 w-full max-w-2xl my-8 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="display-font text-slate-100 font-bold text-lg tracking-wide">{t('clients.editClient')} — {editing.name}</h2>
              <button onClick={closeEdit} className="text-slate-500 hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-700 transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <ClientFormBody form={editForm} onChange={p => setEditForm(prev => ({ ...prev, ...p }))}
              saving={editSaving} error={editError} onSubmit={handleEditSave} onCancel={closeEdit} isEdit={true} t={t} />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
        <div>
          <h1 className="display-font text-3xl font-bold text-slate-100 tracking-wide">{t('clients.title')}</h1>
          <p className="text-slate-400 mt-1">{clients.length} {t('clients.registered')}</p>
        </div>
        <button data-tour="cli-add" onClick={() => { setShowForm(!showForm); setAddForm(BLANK_FORM); setAddError(''); }}
          className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 px-5 rounded-lg transition display-font tracking-wide flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          {t('clients.addClient')}
        </button>
      </div>

      {showForm && (
        <div className="bg-slate-900/80 border border-amber-500/20 rounded-xl p-6 mb-6">
          <h2 className="display-font text-slate-200 font-semibold mb-4 tracking-wide">{t('clients.newClient')}</h2>
          <ClientFormBody form={addForm} onChange={p => setAddForm(prev => ({ ...prev, ...p }))}
            saving={addSaving} error={addError} onSubmit={handleAdd} onCancel={() => { setShowForm(false); setAddForm(BLANK_FORM); }} isEdit={false} t={t} />
        </div>
      )}

      {clients.length > 0 && (
        <div className="mb-5">
          <input data-tour="cli-search" value={search} onChange={e => setSearch(e.target.value)} placeholder={t('clients.searchPlaceholder')}
            className="w-full max-w-md bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/50 transition" />
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-slate-500">{t('common.loading')}</div>
      ) : clients.length === 0 ? (
        <div className="bg-slate-900/60 border border-white/5 rounded-xl p-12 text-center">
          <p className="text-slate-500">{t('clients.empty')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((c, ci) => (
            <div key={c.id} {...(ci === 0 ? { 'data-tour': 'cli-row' } : {})} className={`bg-slate-900/60 border border-white/5 rounded-xl px-5 py-4 flex items-center justify-between gap-4 flex-wrap ${!c.is_active ? 'opacity-60' : ''}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link href={`/clientes/${c.id}`} className={`display-font font-semibold tracking-wide hover:text-amber-300 transition ${c.is_active ? 'text-slate-200' : 'text-slate-500 line-through'}`}>
                    {c.name}
                  </Link>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${c.client_type === 'corporate' ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-sky-500/10 border-sky-500/30 text-sky-300'}`}>
                    {t(`clients.type.${c.client_type}`)}
                  </span>
                  {!c.is_active && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-400">{t('clients.suspended')}</span>
                  )}
                  <span className="text-xs px-2 py-0.5 rounded-full border bg-slate-700/40 border-white/10 text-slate-400">
                    {t(`clients.pm.${c.default_payment_method}`)} · {termsLabel(c)}
                  </span>
                  {c.tax_exempt && (
                    <span className="text-xs px-2 py-0.5 rounded-full border bg-emerald-500/10 border-emerald-500/30 text-emerald-300">{t('clients.taxExemptBadge')}</span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs text-slate-500">
                  {c.contact_name && <span>{c.contact_name}</span>}
                  {c.phone && <span>{c.phone}</span>}
                  {c.email && <span>{c.email}</span>}
                  <span className="text-slate-600">{(c.locations?.length ?? 0)} {t('clients.districtsCount')}</span>
                  <span className="text-slate-600">{(c.trucks?.length ?? 0)} {t('clients.trucksCount')}</span>
                </div>
              </div>
              <div data-tour="cli-actions" className="flex items-center gap-1 flex-shrink-0">
                <Link href={`/clientes/${c.id}`} title={t('clients.viewDetail')}
                  className="p-1.5 rounded text-slate-500 hover:text-sky-400 hover:bg-sky-500/10 transition">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </Link>
                <button onClick={() => openEdit(c)} title={t('common.edit')} className="p-1.5 rounded text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 transition">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-1.414.586H9v-1.414a2 2 0 01.586-1.414z" /></svg>
                </button>
                <button onClick={() => handleToggleActive(c)} disabled={busyId === c.id} title={c.is_active ? t('clients.suspend') : t('clients.reactivate')}
                  className={`p-1.5 rounded transition ${c.is_active ? 'text-slate-500 hover:text-orange-400 hover:bg-orange-500/10' : 'text-green-500 hover:text-green-400 hover:bg-green-500/10'}`}>
                  {c.is_active ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  )}
                </button>
                <button onClick={() => handleDelete(c)} disabled={busyId === c.id} title={t('common.delete')} className="p-1.5 rounded text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
