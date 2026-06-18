'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';

interface Client {
  id: string;
  name: string;
  client_type: 'corporate' | 'individual';
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  billing_address_line: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  tax_id: string | null;
  default_payment_method: string;
  payment_terms_days: number;
  notes: string | null;
  is_active: boolean;
}
interface Location {
  id: string; client_id: string; name: string;
  billing_address_line: string | null; city: string | null; state: string | null; zip: string | null;
  contact_name: string | null; phone: string | null; is_active: boolean;
}
interface Truck {
  id: string; client_id: string; location_id: string | null;
  unit_number: string | null; plate: string | null; make: string | null; model: string | null;
  year: number | null; vin: string | null; notes: string | null; is_active: boolean;
}

const inputCls =
  'w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/50 transition text-sm';

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-amber-500/20 rounded-2xl p-6 w-full max-w-xl my-8 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="display-font text-slate-100 font-bold text-lg tracking-wide">{title}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-700 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function ClienteDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = use(params);
  const { t } = useLanguage();

  const [client, setClient] = useState<Client | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Location modal
  const [locModal, setLocModal] = useState<{ mode: 'add' | 'edit'; data: Partial<Location> } | null>(null);
  const [locSaving, setLocSaving] = useState(false);
  const [locError, setLocError] = useState('');

  // Truck modal
  const [truckModal, setTruckModal] = useState<{ mode: 'add' | 'edit'; data: Partial<Truck> } | null>(null);
  const [truckSaving, setTruckSaving] = useState(false);
  const [truckError, setTruckError] = useState('');

  async function load() {
    const res = await fetch(`/api/clientes/${clientId}`);
    if (res.status === 404) { setNotFound(true); setLoading(false); return; }
    const j = await res.json();
    setClient(j.client ?? null);
    setLocations((j.locations ?? []) as Location[]);
    setTrucks((j.trucks ?? []) as Truck[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, [clientId]);

  // ── Locations ──
  async function saveLocation(e: React.FormEvent) {
    e.preventDefault();
    if (!locModal) return;
    setLocSaving(true); setLocError('');
    const d = locModal.data;
    const payload = {
      client_id: clientId,
      name: (d.name ?? '').trim(),
      billing_address_line: (d.billing_address_line ?? '')?.trim() || null,
      city: (d.city ?? '')?.trim() || null,
      state: (d.state ?? '')?.trim() || null,
      zip: (d.zip ?? '')?.trim() || null,
      contact_name: (d.contact_name ?? '')?.trim() || null,
      phone: (d.phone ?? '')?.trim() || null,
    };
    const url = locModal.mode === 'add' ? '/api/clientes/locations' : `/api/clientes/locations/${d.id}`;
    const res = await fetch(url, {
      method: locModal.mode === 'add' ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const j = await res.json();
    if (!res.ok) { setLocError(j.error ?? 'Error'); setLocSaving(false); return; }
    setLocSaving(false); setLocModal(null); load();
  }
  async function deleteLocation(loc: Location) {
    if (!confirm(t('clients.locations.deleteConfirm').replace('{name}', loc.name))) return;
    await fetch(`/api/clientes/locations/${loc.id}`, { method: 'DELETE' });
    load();
  }

  // ── Trucks ──
  async function saveTruck(e: React.FormEvent) {
    e.preventDefault();
    if (!truckModal) return;
    setTruckSaving(true); setTruckError('');
    const d = truckModal.data;
    const payload = {
      client_id: clientId,
      location_id: d.location_id || null,
      unit_number: (d.unit_number ?? '')?.trim() || null,
      plate: (d.plate ?? '')?.trim() || null,
      make: (d.make ?? '')?.trim() || null,
      model: (d.model ?? '')?.trim() || null,
      year: d.year ?? null,
      vin: (d.vin ?? '')?.trim() || null,
      notes: (d.notes ?? '')?.trim() || null,
    };
    const url = truckModal.mode === 'add' ? '/api/clientes/trucks' : `/api/clientes/trucks/${d.id}`;
    const res = await fetch(url, {
      method: truckModal.mode === 'add' ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const j = await res.json();
    if (!res.ok) { setTruckError(j.error ?? 'Error'); setTruckSaving(false); return; }
    setTruckSaving(false); setTruckModal(null); load();
  }
  async function deleteTruck(tr: Truck) {
    const label = tr.unit_number || tr.plate || '—';
    if (!confirm(t('clients.trucks.deleteConfirm').replace('{name}', label))) return;
    await fetch(`/api/clientes/trucks/${tr.id}`, { method: 'DELETE' });
    load();
  }

  function locName(locId: string | null) {
    if (!locId) return t('clients.trucks.noLocation');
    return locations.find(l => l.id === locId)?.name ?? t('clients.trucks.noLocation');
  }

  if (loading) return <div className="text-center py-12 text-slate-500">{t('common.loading')}</div>;
  if (notFound || !client) {
    return (
      <div className="max-w-2xl mx-auto bg-slate-900/60 border border-white/10 rounded-xl p-8 text-center">
        <p className="text-slate-400">{t('clients.detail.notFound')}</p>
        <Link href="/clientes" className="inline-block mt-4 text-amber-400 hover:text-amber-300 text-sm">{t('clients.backToClients')}</Link>
      </div>
    );
  }

  const termsLabel = client.payment_terms_days > 0 ? `Net-${client.payment_terms_days}` : t('clients.terms.cash');

  return (
    <div>
      <Link href="/clientes" className="text-slate-500 hover:text-slate-300 text-sm flex items-center gap-1 mb-3">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        {t('clients.backToClients')}
      </Link>

      {/* ─── Info del cliente ─── */}
      <div className="bg-slate-900/60 border border-white/5 rounded-xl p-6 mb-6">
        <div className="flex items-center gap-3 flex-wrap mb-3">
          <h1 className="display-font text-2xl font-bold text-slate-100 tracking-wide">{client.name}</h1>
          <span className={`text-xs px-2 py-0.5 rounded-full border ${client.client_type === 'corporate' ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-sky-500/10 border-sky-500/30 text-sky-300'}`}>
            {t(`clients.type.${client.client_type}`)}
          </span>
          {!client.is_active && <span className="text-xs px-1.5 py-0.5 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-400">{t('clients.suspended')}</span>}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-sm">
          {client.contact_name && <Field label={t('clients.contactName')} value={client.contact_name} />}
          {client.phone && <Field label={t('common.phone')} value={client.phone} />}
          {client.email && <Field label={t('common.email')} value={client.email} />}
          {client.tax_id && <Field label={t('clients.taxId')} value={client.tax_id} />}
          <Field label={t('clients.paymentMethod')} value={`${t(`clients.pm.${client.default_payment_method}`)} · ${termsLabel}`} />
          {(client.billing_address_line || client.city) && (
            <Field label={t('clients.billingAddress')} value={[client.billing_address_line, client.city, client.state, client.zip].filter(Boolean).join(', ')} />
          )}
          {client.notes && <Field label={t('clients.notes')} value={client.notes} />}
        </div>
      </div>

      {/* ─── Distritos ─── */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="display-font text-amber-400 font-semibold tracking-wider text-sm uppercase">{t('clients.locations.title')} <span className="text-slate-500 normal-case">({locations.length})</span></h2>
          <button onClick={() => { setLocModal({ mode: 'add', data: {} }); setLocError(''); }}
            className="text-amber-400 hover:text-amber-300 text-sm flex items-center gap-1.5 border border-amber-500/30 hover:border-amber-400/50 rounded-lg px-3 py-1.5 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            {t('clients.locations.add')}
          </button>
        </div>
        {locations.length === 0 ? (
          <div className="bg-slate-900/40 border border-white/5 rounded-xl p-6 text-center text-slate-500 text-sm">{t('clients.locations.empty')}</div>
        ) : (
          <div className="space-y-2">
            {locations.map(loc => (
              <div key={loc.id} className="bg-slate-900/60 border border-white/5 rounded-xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-slate-200 font-medium">{loc.name}</p>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap text-xs text-slate-500">
                    {loc.contact_name && <span>{loc.contact_name}</span>}
                    {loc.phone && <span>{loc.phone}</span>}
                    {(loc.city || loc.billing_address_line) && <span>{[loc.billing_address_line, loc.city, loc.state, loc.zip].filter(Boolean).join(', ')}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => { setLocModal({ mode: 'edit', data: loc }); setLocError(''); }} title={t('common.edit')} className="p-1.5 rounded text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 transition">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-1.414.586H9v-1.414a2 2 0 01.586-1.414z" /></svg>
                  </button>
                  <button onClick={() => deleteLocation(loc)} title={t('common.delete')} className="p-1.5 rounded text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ─── Camiones ─── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="display-font text-sky-400 font-semibold tracking-wider text-sm uppercase">{t('clients.trucks.title')} <span className="text-slate-500 normal-case">({trucks.length})</span></h2>
          <button onClick={() => { setTruckModal({ mode: 'add', data: {} }); setTruckError(''); }}
            className="text-sky-400 hover:text-sky-300 text-sm flex items-center gap-1.5 border border-sky-500/30 hover:border-sky-400/50 rounded-lg px-3 py-1.5 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            {t('clients.trucks.add')}
          </button>
        </div>
        {trucks.length === 0 ? (
          <div className="bg-slate-900/40 border border-white/5 rounded-xl p-6 text-center text-slate-500 text-sm">{t('clients.trucks.empty')}</div>
        ) : (
          <div className="space-y-2">
            {trucks.map(tr => (
              <div key={tr.id} className="bg-slate-900/60 border border-white/5 rounded-xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-slate-200 font-medium">{tr.unit_number || tr.plate || '—'}</p>
                    {tr.plate && tr.unit_number && <span className="text-xs text-slate-500">{tr.plate}</span>}
                    <span className="text-xs px-2 py-0.5 rounded-full border bg-slate-700/40 border-white/10 text-slate-400">{locName(tr.location_id)}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap text-xs text-slate-500">
                    {(tr.make || tr.model || tr.year) && <span>{[tr.year, tr.make, tr.model].filter(Boolean).join(' ')}</span>}
                    {tr.vin && <span>VIN: {tr.vin}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => { setTruckModal({ mode: 'edit', data: tr }); setTruckError(''); }} title={t('common.edit')} className="p-1.5 rounded text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 transition">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-1.414.586H9v-1.414a2 2 0 01.586-1.414z" /></svg>
                  </button>
                  <button onClick={() => deleteTruck(tr)} title={t('common.delete')} className="p-1.5 rounded text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ─── Location modal ─── */}
      {locModal && (
        <Modal title={locModal.mode === 'add' ? t('clients.locations.new') : t('clients.locations.edit')} onClose={() => setLocModal(null)}>
          <form onSubmit={saveLocation} className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="block text-slate-400 text-xs mb-1">{t('clients.locations.name')} *</label>
              <input required value={locModal.data.name ?? ''} onChange={e => setLocModal({ ...locModal, data: { ...locModal.data, name: e.target.value } })} className={inputCls} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-slate-400 text-xs mb-1">{t('clients.billingAddress')}</label>
              <input value={locModal.data.billing_address_line ?? ''} onChange={e => setLocModal({ ...locModal, data: { ...locModal.data, billing_address_line: e.target.value } })} className={inputCls} />
            </div>
            <div><label className="block text-slate-400 text-xs mb-1">{t('clients.city')}</label>
              <input value={locModal.data.city ?? ''} onChange={e => setLocModal({ ...locModal, data: { ...locModal.data, city: e.target.value } })} className={inputCls} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-slate-400 text-xs mb-1">{t('clients.state')}</label>
                <input value={locModal.data.state ?? ''} onChange={e => setLocModal({ ...locModal, data: { ...locModal.data, state: e.target.value } })} className={inputCls} /></div>
              <div><label className="block text-slate-400 text-xs mb-1">{t('clients.zip')}</label>
                <input value={locModal.data.zip ?? ''} onChange={e => setLocModal({ ...locModal, data: { ...locModal.data, zip: e.target.value } })} className={inputCls} /></div>
            </div>
            <div><label className="block text-slate-400 text-xs mb-1">{t('clients.contactName')}</label>
              <input value={locModal.data.contact_name ?? ''} onChange={e => setLocModal({ ...locModal, data: { ...locModal.data, contact_name: e.target.value } })} className={inputCls} /></div>
            <div><label className="block text-slate-400 text-xs mb-1">{t('common.phone')}</label>
              <input value={locModal.data.phone ?? ''} onChange={e => setLocModal({ ...locModal, data: { ...locModal.data, phone: e.target.value } })} className={inputCls} /></div>
            {locError && <div className="md:col-span-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-red-400 text-sm">{locError}</div>}
            <div className="md:col-span-2 flex gap-3 mt-1">
              <button type="submit" disabled={locSaving} className="bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/50 text-slate-950 font-bold py-2 px-5 rounded-lg transition display-font tracking-wide text-sm">{locSaving ? t('common.saving') : t('common.save')}</button>
              <button type="button" onClick={() => setLocModal(null)} className="bg-slate-700 hover:bg-slate-600 text-slate-300 py-2 px-4 rounded-lg transition text-sm">{t('common.cancel')}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ─── Truck modal ─── */}
      {truckModal && (
        <Modal title={truckModal.mode === 'add' ? t('clients.trucks.new') : t('clients.trucks.edit')} onClose={() => setTruckModal(null)}>
          <form onSubmit={saveTruck} className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><label className="block text-slate-400 text-xs mb-1">{t('clients.trucks.unitNumber')}</label>
              <input value={truckModal.data.unit_number ?? ''} onChange={e => setTruckModal({ ...truckModal, data: { ...truckModal.data, unit_number: e.target.value } })} className={inputCls} /></div>
            <div><label className="block text-slate-400 text-xs mb-1">{t('clients.trucks.plate')}</label>
              <input value={truckModal.data.plate ?? ''} onChange={e => setTruckModal({ ...truckModal, data: { ...truckModal.data, plate: e.target.value } })} className={inputCls} /></div>
            <div className="md:col-span-2">
              <label className="block text-slate-400 text-xs mb-1">{t('clients.trucks.location')}</label>
              <select value={truckModal.data.location_id ?? ''} onChange={e => setTruckModal({ ...truckModal, data: { ...truckModal.data, location_id: e.target.value || null } })} className={inputCls}>
                <option value="">{t('clients.trucks.noLocation')}</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div><label className="block text-slate-400 text-xs mb-1">{t('clients.trucks.make')}</label>
              <input value={truckModal.data.make ?? ''} onChange={e => setTruckModal({ ...truckModal, data: { ...truckModal.data, make: e.target.value } })} className={inputCls} /></div>
            <div><label className="block text-slate-400 text-xs mb-1">{t('clients.trucks.model')}</label>
              <input value={truckModal.data.model ?? ''} onChange={e => setTruckModal({ ...truckModal, data: { ...truckModal.data, model: e.target.value } })} className={inputCls} /></div>
            <div><label className="block text-slate-400 text-xs mb-1">{t('clients.trucks.year')}</label>
              <input type="number" min="1900" max="2200" value={truckModal.data.year ?? ''} onChange={e => setTruckModal({ ...truckModal, data: { ...truckModal.data, year: e.target.value ? parseInt(e.target.value, 10) : null } })} className={inputCls} /></div>
            <div><label className="block text-slate-400 text-xs mb-1">{t('clients.trucks.vin')}</label>
              <input value={truckModal.data.vin ?? ''} onChange={e => setTruckModal({ ...truckModal, data: { ...truckModal.data, vin: e.target.value } })} className={inputCls} /></div>
            <div className="md:col-span-2"><label className="block text-slate-400 text-xs mb-1">{t('clients.notes')}</label>
              <input value={truckModal.data.notes ?? ''} onChange={e => setTruckModal({ ...truckModal, data: { ...truckModal.data, notes: e.target.value } })} className={inputCls} /></div>
            {truckError && <div className="md:col-span-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-red-400 text-sm">{truckError}</div>}
            <div className="md:col-span-2 flex gap-3 mt-1">
              <button type="submit" disabled={truckSaving} className="bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/50 text-slate-950 font-bold py-2 px-5 rounded-lg transition display-font tracking-wide text-sm">{truckSaving ? t('common.saving') : t('common.save')}</button>
              <button type="button" onClick={() => setTruckModal(null)} className="bg-slate-700 hover:bg-slate-600 text-slate-300 py-2 px-4 rounded-lg transition text-sm">{t('common.cancel')}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-slate-600 text-xs">{label}</p>
      <p className="text-slate-300">{value}</p>
    </div>
  );
}
