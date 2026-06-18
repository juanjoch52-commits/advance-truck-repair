'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

interface Item {
  id: string;
  part_number: string | null;
  name: string;
  description: string | null;
  unit_cost: number;
  sale_price: number;
  quantity_on_hand: number;
  reorder_level: number;
  location: string | null;
  is_active: boolean;
}

const BLANK = { part_number: '', name: '', description: '', unit_cost: '', sale_price: '', quantity_on_hand: '', reorder_level: '', location: '' };

const inputCls = 'w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/50 transition';
const money = (n: any) => `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function InventarioPage() {
  const { t } = useLanguage();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...BLANK });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [restockFor, setRestockFor] = useState<Item | null>(null);
  const [restockForm, setRestockForm] = useState({ movement_type: 'purchase', quantity: '', unit_cost: '', reference: '' });
  const [restockSaving, setRestockSaving] = useState(false);
  const [restockError, setRestockError] = useState('');

  async function load() {
    try { const r = await fetch('/api/inventario'); const j = await r.json(); setItems((j.items ?? []) as Item[]); }
    catch { setItems([]); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function openNew() { setEditingId(null); setForm({ ...BLANK }); setFormError(''); setShowForm(true); }
  function openEdit(it: Item) {
    setEditingId(it.id);
    setForm({
      part_number: it.part_number ?? '', name: it.name, description: it.description ?? '',
      unit_cost: String(it.unit_cost), sale_price: String(it.sale_price),
      quantity_on_hand: String(it.quantity_on_hand), reorder_level: String(it.reorder_level), location: it.location ?? '',
    });
    setFormError(''); setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setFormError(t('inventory.errName')); return; }
    setSaving(true); setFormError('');
    const payload: any = {
      part_number: form.part_number, name: form.name, description: form.description,
      unit_cost: parseFloat(form.unit_cost) || 0, sale_price: parseFloat(form.sale_price) || 0,
      reorder_level: parseFloat(form.reorder_level) || 0, location: form.location,
    };
    let res;
    if (editingId) {
      res = await fetch(`/api/inventario/${editingId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    } else {
      payload.quantity_on_hand = parseFloat(form.quantity_on_hand) || 0;
      res = await fetch('/api/inventario', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    }
    const j = await res.json();
    if (!res.ok) { setFormError(j.error ?? 'Error'); setSaving(false); return; }
    setSaving(false); setShowForm(false); load();
  }

  function openRestock(it: Item) { setRestockFor(it); setRestockForm({ movement_type: 'purchase', quantity: '', unit_cost: String(it.unit_cost), reference: '' }); setRestockError(''); }
  async function handleRestock(e: React.FormEvent) {
    e.preventDefault();
    if (!restockFor) return;
    setRestockSaving(true); setRestockError('');
    const res = await fetch(`/api/inventario/${restockFor.id}/movimientos`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ movement_type: restockForm.movement_type, quantity: parseFloat(restockForm.quantity) || 0, unit_cost: parseFloat(restockForm.unit_cost) || 0, reference: restockForm.reference }),
    });
    const j = await res.json();
    if (!res.ok) { setRestockError(j.error ?? 'Error'); setRestockSaving(false); return; }
    setRestockSaving(false); setRestockFor(null); load();
  }

  async function handleDelete(it: Item) {
    if (!confirm(t('inventory.deleteConfirm').replace('{name}', it.name))) return;
    setBusyId(it.id);
    const res = await fetch(`/api/inventario/${it.id}`, { method: 'DELETE' });
    if (!res.ok) { const j = await res.json().catch(() => ({})); alert((j as any).error ?? t('inventory.deleteError')); }
    setBusyId(null); load();
  }

  const filtered = items.filter(it => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [it.name, it.part_number, it.location].some(v => (v ?? '').toLowerCase().includes(q));
  });
  const isLow = (it: Item) => it.reorder_level > 0 && it.quantity_on_hand <= it.reorder_level;
  const lowCount = items.filter(isLow).length;

  return (
    <div>
      {/* Modal alta/edición */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-amber-500/20 rounded-2xl p-6 w-full max-w-2xl my-8 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="display-font text-slate-100 font-bold text-lg tracking-wide">{editingId ? t('inventory.editItem') : t('inventory.newItem')}</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-500 hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-700 transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-slate-400 text-sm mb-1.5">{t('inventory.name')} *</label>
                <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t('inventory.namePlaceholder')} className={inputCls} />
              </div>
              <div>
                <label className="block text-slate-400 text-sm mb-1.5">{t('inventory.partNumber')}</label>
                <input value={form.part_number} onChange={e => setForm(f => ({ ...f, part_number: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className="block text-slate-400 text-sm mb-1.5">{t('inventory.location')}</label>
                <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder={t('inventory.locationPlaceholder')} className={inputCls} />
              </div>
              <div>
                <label className="block text-slate-400 text-sm mb-1.5">{t('inventory.unitCost')} ($)</label>
                <input type="number" min="0" step="0.01" value={form.unit_cost} onChange={e => setForm(f => ({ ...f, unit_cost: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className="block text-slate-400 text-sm mb-1.5">{t('inventory.salePrice')} ($)</label>
                <input type="number" min="0" step="0.01" value={form.sale_price} onChange={e => setForm(f => ({ ...f, sale_price: e.target.value }))} className={inputCls} />
              </div>
              {!editingId && (
                <div>
                  <label className="block text-slate-400 text-sm mb-1.5">{t('inventory.initialStock')}</label>
                  <input type="number" min="0" step="0.01" value={form.quantity_on_hand} onChange={e => setForm(f => ({ ...f, quantity_on_hand: e.target.value }))} className={inputCls} />
                </div>
              )}
              <div>
                <label className="block text-slate-400 text-sm mb-1.5">{t('inventory.reorderLevel')}</label>
                <input type="number" min="0" step="0.01" value={form.reorder_level} onChange={e => setForm(f => ({ ...f, reorder_level: e.target.value }))} className={inputCls} />
                <p className="text-slate-600 text-xs mt-1">{t('inventory.reorderHint')}</p>
              </div>
              <div className="md:col-span-2">
                <label className="block text-slate-400 text-sm mb-1.5">{t('inventory.description')}</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className={inputCls} />
              </div>
              {formError && <div className="md:col-span-2 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2.5 text-red-400 text-sm">{formError}</div>}
              <div className="md:col-span-2 flex gap-3">
                <button type="submit" disabled={saving} className="bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/50 text-slate-950 font-bold py-2.5 px-6 rounded-lg transition display-font tracking-wide">{saving ? t('common.saving') : t('common.save')}</button>
                <button type="button" onClick={() => setShowForm(false)} className="bg-slate-700 hover:bg-slate-600 text-slate-300 py-2.5 px-5 rounded-lg transition text-sm">{t('common.cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal reabastecer / ajustar */}
      {restockFor && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-emerald-500/20 rounded-2xl p-6 w-full max-w-md my-8 shadow-2xl">
            <div className="flex items-center justify-between mb-1">
              <h2 className="display-font text-slate-100 font-bold text-lg tracking-wide">{t('inventory.stockMove')}</h2>
              <button onClick={() => setRestockFor(null)} className="text-slate-500 hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-700 transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <p className="text-slate-400 text-sm mb-4">{restockFor.name} · {t('inventory.stock')}: <span className="text-slate-200 font-semibold">{restockFor.quantity_on_hand}</span></p>
            <form onSubmit={handleRestock} className="space-y-4">
              <div>
                <label className="block text-slate-400 text-sm mb-1.5">{t('inventory.moveType')}</label>
                <select value={restockForm.movement_type} onChange={e => setRestockForm(f => ({ ...f, movement_type: e.target.value }))} className={inputCls}>
                  <option value="purchase">{t('inventory.mv.purchase')}</option>
                  <option value="adjustment">{t('inventory.mv.adjustment')}</option>
                  <option value="return">{t('inventory.mv.return')}</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 text-sm mb-1.5">{t('inventory.quantity')}</label>
                  <input type="number" step="0.01" value={restockForm.quantity} onChange={e => setRestockForm(f => ({ ...f, quantity: e.target.value }))} className={inputCls} />
                  {restockForm.movement_type === 'adjustment' && <p className="text-slate-600 text-xs mt-1">{t('inventory.adjustHint')}</p>}
                </div>
                <div>
                  <label className="block text-slate-400 text-sm mb-1.5">{t('inventory.unitCost')} ($)</label>
                  <input type="number" min="0" step="0.01" value={restockForm.unit_cost} onChange={e => setRestockForm(f => ({ ...f, unit_cost: e.target.value }))} className={inputCls} />
                </div>
              </div>
              <div>
                <label className="block text-slate-400 text-sm mb-1.5">{t('inventory.reference')}</label>
                <input value={restockForm.reference} onChange={e => setRestockForm(f => ({ ...f, reference: e.target.value }))} placeholder={t('inventory.referenceHint')} className={inputCls} />
              </div>
              {restockError && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2.5 text-red-400 text-sm">{restockError}</div>}
              <div className="flex gap-3">
                <button type="submit" disabled={restockSaving} className="bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-500/50 text-slate-950 font-bold py-2.5 px-6 rounded-lg transition display-font tracking-wide">{restockSaving ? t('common.saving') : t('common.save')}</button>
                <button type="button" onClick={() => setRestockFor(null)} className="bg-slate-700 hover:bg-slate-600 text-slate-300 py-2.5 px-5 rounded-lg transition text-sm">{t('common.cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-3 gap-4 flex-wrap">
        <div>
          <h1 className="display-font text-3xl font-bold text-slate-100 tracking-wide">{t('inventory.title')}</h1>
          <p className="text-slate-400 mt-1">{items.length} {t('inventory.registered')}{lowCount > 0 && <span className="text-orange-400"> · {lowCount} {t('inventory.lowStock')}</span>}</p>
        </div>
        <button onClick={openNew} className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 px-5 rounded-lg transition display-font tracking-wide flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          {t('inventory.addItem')}
        </button>
      </div>

      {items.length > 0 && (
        <div className="mb-5">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('inventory.searchPlaceholder')}
            className="w-full max-w-md bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400/50 transition" />
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-slate-500">{t('common.loading')}</div>
      ) : items.length === 0 ? (
        <div className="bg-slate-900/60 border border-white/5 rounded-xl p-12 text-center"><p className="text-slate-500">{t('inventory.empty')}</p></div>
      ) : (
        <div className="space-y-3">
          {filtered.map(it => (
            <div key={it.id} className={`bg-slate-900/60 border rounded-xl px-5 py-4 flex items-center justify-between gap-4 flex-wrap ${isLow(it) ? 'border-orange-500/30' : 'border-white/5'} ${!it.is_active ? 'opacity-60' : ''}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="display-font font-semibold tracking-wide text-slate-200">{it.name}</span>
                  {it.part_number && <span className="text-xs text-slate-500">#{it.part_number}</span>}
                  {isLow(it) && <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-400">{t('inventory.lowStock')}</span>}
                </div>
                <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs text-slate-500">
                  {it.location && <span>{t('inventory.location')}: {it.location}</span>}
                  <span>{t('inventory.cost')}: {money(it.unit_cost)}</span>
                  <span>{t('inventory.price')}: {money(it.sale_price)}</span>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-slate-600 text-xs">{t('inventory.stock')}</p>
                <p className={`display-font font-bold ${isLow(it) ? 'text-orange-400' : 'text-slate-100'}`}>{it.quantity_on_hand}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => openRestock(it)} title={t('inventory.stockMove')} className="p-1.5 rounded text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                </button>
                <button onClick={() => openEdit(it)} title={t('common.edit')} className="p-1.5 rounded text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 transition">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-1.414.586H9v-1.414a2 2 0 01.586-1.414z" /></svg>
                </button>
                <button onClick={() => handleDelete(it)} disabled={busyId === it.id} title={t('common.delete')} className="p-1.5 rounded text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition">
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
