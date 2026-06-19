'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

interface Shop {
  id: string;
  name: string;
  legal_name: string | null;
  ein: string | null;
  sales_tax_certificate: string | null;
  county: string | null;
  billing_address_line: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
  tax_rate: number;
  invoice_prefix: string | null;
  business_code: string | null;
  next_invoice_number: number;
  logo_url: string | null;
  notes: string | null;
  is_active: boolean;
}

interface ShopFormState {
  name: string;
  legalName: string;
  ein: string;
  salesTaxCert: string;
  county: string;
  billingAddress: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  taxRate: string;
  invoicePrefix: string;
  businessCode: string;
  nextInvoiceNumber: string;
  notes: string;
}

const BLANK_FORM: ShopFormState = {
  name: '', legalName: '', ein: '', salesTaxCert: '', county: 'Orange',
  billingAddress: '', city: '', state: 'FL', zip: '', phone: '', email: '',
  taxRate: '6.5', invoicePrefix: '', businessCode: '', nextInvoiceNumber: '1', notes: '',
};

const inputCls =
  'w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/50 transition';
const sectionCls = 'md:col-span-2 text-amber-400/80 text-xs font-semibold tracking-wider uppercase mt-2 display-font';

function ShopFormBody({
  form, onChange, saving, error, onSubmit, onCancel, isEdit, t,
}: {
  form: ShopFormState;
  onChange: (patch: Partial<ShopFormState>) => void;
  saving: boolean;
  error: string;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  isEdit: boolean;
  t: (key: string) => string;
}) {
  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Identidad */}
      <p className={sectionCls}>{t('settings.section.identity')}</p>
      <div className="md:col-span-2">
        <label className="block text-slate-400 text-sm mb-1.5">{t('settings.name')} *</label>
        <input required value={form.name} onChange={e => onChange({ name: e.target.value })}
          placeholder={t('settings.namePlaceholder')} className={inputCls} />
        <p className="text-slate-600 text-xs mt-1">{t('settings.nameHint')}</p>
      </div>
      <div className="md:col-span-2">
        <label className="block text-slate-400 text-sm mb-1.5">{t('settings.legalName')}</label>
        <input value={form.legalName} onChange={e => onChange({ legalName: e.target.value })}
          placeholder={t('settings.legalNamePlaceholder')} className={inputCls} />
      </div>

      {/* Datos fiscales */}
      <p className={sectionCls}>{t('settings.section.fiscal')}</p>
      <div>
        <label className="block text-slate-400 text-sm mb-1.5">{t('settings.ein')}</label>
        <input value={form.ein} onChange={e => onChange({ ein: e.target.value })}
          placeholder="12-3456789" className={inputCls} />
        <p className="text-slate-600 text-xs mt-1">{t('settings.einHint')}</p>
      </div>
      <div>
        <label className="block text-slate-400 text-sm mb-1.5">{t('settings.salesTaxCert')}</label>
        <input value={form.salesTaxCert} onChange={e => onChange({ salesTaxCert: e.target.value })}
          placeholder={t('settings.optional')} className={inputCls} />
        <p className="text-slate-600 text-xs mt-1">{t('settings.salesTaxCertHint')}</p>
      </div>
      <div>
        <label className="block text-slate-400 text-sm mb-1.5">{t('settings.county')}</label>
        <input value={form.county} onChange={e => onChange({ county: e.target.value })}
          placeholder="Ej: Miami-Dade, Broward" className={inputCls} />
        <p className="text-slate-600 text-xs mt-1">{t('settings.countyHint')}</p>
      </div>
      <div>
        <label className="block text-slate-400 text-sm mb-1.5">{t('settings.taxRate')}</label>
        <div className="relative">
          <input type="number" min="0" max="100" step="0.001" value={form.taxRate}
            onChange={e => onChange({ taxRate: e.target.value })} className={inputCls + ' pr-9'} />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">%</span>
        </div>
        <p className="text-slate-600 text-xs mt-1">{t('settings.taxRateHint')}</p>
      </div>

      {/* Ubicación */}
      <p className={sectionCls}>{t('settings.section.location')}</p>
      <div className="md:col-span-2">
        <label className="block text-slate-400 text-sm mb-1.5">{t('settings.billingAddress')}</label>
        <input value={form.billingAddress} onChange={e => onChange({ billingAddress: e.target.value })} className={inputCls} />
      </div>
      <div>
        <label className="block text-slate-400 text-sm mb-1.5">{t('settings.city')}</label>
        <input value={form.city} onChange={e => onChange({ city: e.target.value })} className={inputCls} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-slate-400 text-sm mb-1.5">{t('settings.state')}</label>
          <input value={form.state} onChange={e => onChange({ state: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className="block text-slate-400 text-sm mb-1.5">{t('settings.zip')}</label>
          <input value={form.zip} onChange={e => onChange({ zip: e.target.value })} className={inputCls} />
        </div>
      </div>

      {/* Contacto */}
      <p className={sectionCls}>{t('settings.section.contact')}</p>
      <div>
        <label className="block text-slate-400 text-sm mb-1.5">{t('common.phone')}</label>
        <input value={form.phone} onChange={e => onChange({ phone: e.target.value })} className={inputCls} />
      </div>
      <div>
        <label className="block text-slate-400 text-sm mb-1.5">{t('common.email')}</label>
        <input type="email" value={form.email} onChange={e => onChange({ email: e.target.value })} className={inputCls} />
      </div>

      {/* Facturación */}
      <p className={sectionCls}>{t('settings.section.invoicing')}</p>
      <div>
        <label className="block text-slate-400 text-sm mb-1.5">{t('settings.invoicePrefix')}</label>
        <input value={form.invoicePrefix} onChange={e => onChange({ invoicePrefix: e.target.value })}
          placeholder="ATR-" className={inputCls} />
        <p className="text-slate-600 text-xs mt-1">{t('settings.invoicePrefixHint')}</p>
      </div>
      <div>
        <label className="block text-slate-400 text-sm mb-1.5">{t('settings.businessCode')}</label>
        <input value={form.businessCode} onChange={e => onChange({ businessCode: e.target.value })}
          placeholder="01" className={inputCls} />
        <p className="text-slate-600 text-xs mt-1">{t('settings.businessCodeHint')}</p>
      </div>
      <div>
        <label className="block text-slate-400 text-sm mb-1.5">{t('settings.nextInvoiceNumber')}</label>
        <input type="number" min="1" step="1" value={form.nextInvoiceNumber}
          onChange={e => onChange({ nextInvoiceNumber: e.target.value })} className={inputCls} />
        <p className="text-slate-600 text-xs mt-1">{t('settings.nextInvoiceNumberHint')}</p>
      </div>

      <div className="md:col-span-2">
        <label className="block text-slate-400 text-sm mb-1.5">{t('settings.notes')}</label>
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
          {saving ? t('common.saving') : t('common.save')}
        </button>
        <button type="button" onClick={onCancel}
          className="bg-slate-700 hover:bg-slate-600 text-slate-300 py-2.5 px-5 rounded-lg transition text-sm">
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}

export default function ConfiguracionPage() {
  const { t } = useLanguage();

  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [addForm, setAddForm] = useState<ShopFormState>(BLANK_FORM);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState('');

  const [editing, setEditing] = useState<Shop | null>(null);
  const [editForm, setEditForm] = useState<ShopFormState>(BLANK_FORM);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [logoUploading, setLogoUploading] = useState(false);

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !editing) return;
    setLogoUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`/api/shops/${editing.id}/logo`, { method: 'POST', body: fd });
    const j = await res.json();
    setLogoUploading(false);
    if (!res.ok) { alert(j.error ?? 'Error'); return; }
    setEditing({ ...editing, logo_url: j.logo_url });
    load();
  }

  async function load() {
    try {
      const res = await fetch('/api/shops');
      const j = await res.json();
      setShops((j.shops ?? []) as Shop[]);
    } catch {
      setShops([]);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function shopToForm(s: Shop): ShopFormState {
    return {
      name: s.name,
      legalName: s.legal_name ?? '',
      ein: s.ein ?? '',
      salesTaxCert: s.sales_tax_certificate ?? '',
      county: s.county ?? '',
      billingAddress: s.billing_address_line ?? '',
      city: s.city ?? '',
      state: s.state ?? '',
      zip: s.zip ?? '',
      phone: s.phone ?? '',
      email: s.email ?? '',
      taxRate: String(s.tax_rate ?? 0),
      invoicePrefix: s.invoice_prefix ?? '',
      businessCode: s.business_code ?? '',
      nextInvoiceNumber: String(s.next_invoice_number ?? 1),
      notes: s.notes ?? '',
    };
  }

  function buildPayload(f: ShopFormState) {
    return {
      name: f.name.trim(),
      legal_name: f.legalName.trim() || null,
      ein: f.ein.trim() || null,
      sales_tax_certificate: f.salesTaxCert.trim() || null,
      county: f.county.trim() || null,
      billing_address_line: f.billingAddress.trim() || null,
      city: f.city.trim() || null,
      state: f.state.trim() || null,
      zip: f.zip.trim() || null,
      phone: f.phone.trim() || null,
      email: f.email.trim() || null,
      tax_rate: parseFloat(f.taxRate) || 0,
      invoice_prefix: f.invoicePrefix.trim() || null,
      business_code: f.businessCode.trim() || null,
      next_invoice_number: parseInt(f.nextInvoiceNumber, 10) || 1,
      notes: f.notes.trim() || null,
    };
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddSaving(true); setAddError('');
    const res = await fetch('/api/shops', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload(addForm)),
    });
    const j = await res.json();
    if (!res.ok) { setAddError(j.error ?? 'Error'); setAddSaving(false); return; }
    setAddForm(BLANK_FORM); setShowForm(false); setAddSaving(false); load();
  }

  function openEdit(s: Shop) { setEditing(s); setEditForm(shopToForm(s)); setEditError(''); }
  function closeEdit() { setEditing(null); setEditError(''); }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setEditSaving(true); setEditError('');
    const res = await fetch(`/api/shops/${editing.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload(editForm)),
    });
    const j = await res.json();
    if (!res.ok) { setEditError(j.error ?? 'Error'); setEditSaving(false); return; }
    setEditSaving(false); closeEdit(); load();
  }

  async function handleToggleActive(s: Shop) {
    setBusyId(s.id);
    await fetch(`/api/shops/${s.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !s.is_active }),
    });
    setBusyId(null); load();
  }

  async function handleDelete(s: Shop) {
    if (!confirm(t('settings.deleteConfirm').replace('{name}', s.name))) return;
    setBusyId(s.id);
    const res = await fetch(`/api/shops/${s.id}`, { method: 'DELETE' });
    if (!res.ok) { const j = await res.json().catch(() => ({})); alert((j as any).error ?? t('settings.deleteError')); }
    setBusyId(null); load();
  }

  function fmtRate(r: number) {
    return `${Number(r).toFixed(Number.isInteger(Number(r)) ? 0 : 3)}%`;
  }

  return (
    <div>
      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-amber-500/20 rounded-2xl p-6 w-full max-w-2xl my-8 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="display-font text-slate-100 font-bold text-lg tracking-wide">{t('settings.editShop')} — {editing.name}</h2>
              <button onClick={closeEdit} className="text-slate-500 hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-700 transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="mb-5 flex items-center gap-4">
              <div className="w-20 h-20 rounded-lg bg-slate-800 border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                {editing.logo_url
                  ? <img src={editing.logo_url} alt="logo" className="object-contain w-full h-full" />
                  : <span className="text-slate-600 text-xs text-center px-1">{t('settings.noLogo')}</span>}
              </div>
              <div>
                <label className="block text-slate-400 text-sm mb-1.5">{t('settings.logo')}</label>
                <label className="inline-block cursor-pointer bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm py-2 px-4 rounded-lg transition">
                  {logoUploading ? t('common.saving') : t('settings.uploadLogo')}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleLogoUpload} disabled={logoUploading} />
                </label>
                <p className="text-slate-600 text-xs mt-1">{t('settings.logoHint')}</p>
              </div>
            </div>
            <ShopFormBody form={editForm} onChange={p => setEditForm(prev => ({ ...prev, ...p }))}
              saving={editSaving} error={editError} onSubmit={handleEditSave} onCancel={closeEdit} isEdit={true} t={t} />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-3 gap-4 flex-wrap">
        <div>
          <h1 className="display-font text-3xl font-bold text-slate-100 tracking-wide">{t('settings.title')}</h1>
          <p className="text-slate-400 mt-1">{t('settings.subtitle')}</p>
        </div>
        <button onClick={() => { setShowForm(!showForm); setAddForm(BLANK_FORM); setAddError(''); }}
          className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 px-5 rounded-lg transition display-font tracking-wide flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          {t('settings.addShop')}
        </button>
      </div>

      {/* Nota legal sobre los números de la factura */}
      <div className="bg-sky-500/5 border border-sky-500/20 rounded-xl px-4 py-3 mb-6 text-sm text-slate-400">
        {t('settings.legalNote')}
      </div>

      {showForm && (
        <div className="bg-slate-900/80 border border-amber-500/20 rounded-xl p-6 mb-6">
          <h2 className="display-font text-slate-200 font-semibold mb-4 tracking-wide">{t('settings.newShop')}</h2>
          <ShopFormBody form={addForm} onChange={p => setAddForm(prev => ({ ...prev, ...p }))}
            saving={addSaving} error={addError} onSubmit={handleAdd} onCancel={() => { setShowForm(false); setAddForm(BLANK_FORM); }} isEdit={false} t={t} />
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-slate-500">{t('common.loading')}</div>
      ) : shops.length === 0 ? (
        <div className="bg-slate-900/60 border border-white/5 rounded-xl p-12 text-center">
          <p className="text-slate-500">{t('settings.empty')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {shops.map(s => (
            <div key={s.id} className={`bg-slate-900/60 border border-white/5 rounded-xl px-5 py-4 ${!s.is_active ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`display-font font-semibold tracking-wide ${s.is_active ? 'text-slate-200' : 'text-slate-500 line-through'}`}>{s.name}</span>
                    {!s.is_active && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-400">{t('settings.suspended')}</span>
                    )}
                  </div>
                  {s.legal_name && <p className="text-slate-500 text-xs mt-0.5">{s.legal_name}</p>}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 mt-3 text-xs">
                    <div><span className="text-slate-600">{t('settings.ein')}: </span><span className="text-slate-300">{s.ein || '—'}</span></div>
                    <div><span className="text-slate-600">{t('settings.salesTaxCert')}: </span><span className="text-slate-300">{s.sales_tax_certificate || '—'}</span></div>
                    <div><span className="text-slate-600">{t('settings.county')}: </span><span className="text-slate-300">{s.county || '—'}</span></div>
                    <div><span className="text-slate-600">{t('settings.taxRate')}: </span><span className="text-slate-300">{fmtRate(s.tax_rate)}</span></div>
                    <div><span className="text-slate-600">{t('settings.invoiceNext')}: </span><span className="text-slate-300">{(s.invoice_prefix ?? '')}{s.next_invoice_number}</span></div>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => openEdit(s)} title={t('common.edit')} className="p-1.5 rounded text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 transition">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-1.414.586H9v-1.414a2 2 0 01.586-1.414z" /></svg>
                  </button>
                  <button onClick={() => handleToggleActive(s)} disabled={busyId === s.id} title={s.is_active ? t('settings.suspend') : t('settings.reactivate')}
                    className={`p-1.5 rounded transition ${s.is_active ? 'text-slate-500 hover:text-orange-400 hover:bg-orange-500/10' : 'text-green-500 hover:text-green-400 hover:bg-green-500/10'}`}>
                    {s.is_active ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    )}
                  </button>
                  <button onClick={() => handleDelete(s)} disabled={busyId === s.id} title={t('common.delete')} className="p-1.5 rounded text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
