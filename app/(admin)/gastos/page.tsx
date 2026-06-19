'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

interface Summary {
  purchasesInventory: number;
  purchasesOneOff: number;
  totalPurchases: number;
  partsCharged: number;
  partsCost: number;
  partsProfit: number;
}
interface InvoiceRow {
  invoice_id: string;
  document_number: string | null;
  issue_date: string | null;
  client_name: string;
  charged: number;
  cost: number;
  profit: number;
}

const money = (n: any) => `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const inputCls = 'bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-amber-400/50 transition text-sm';

function monthStart() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; }
function today() { return new Date().toISOString().slice(0, 10); }

export default function GastosPage() {
  const { t } = useLanguage();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [summary, setSummary] = useState<Summary | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/gastos?from=${from}&to=${to}`);
      const j = await r.json();
      setSummary(j.summary ?? null);
      setInvoices((j.invoices ?? []) as InvoiceRow[]);
    } catch { setSummary(null); setInvoices([]); }
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  return (
    <div>
      <div className="mb-6">
        <h1 className="display-font text-3xl font-bold text-slate-100 tracking-wide">{t('expenses.title')}</h1>
        <p className="text-slate-400 mt-1">{t('expenses.subtitle')}</p>
      </div>

      <div className="flex items-end gap-3 mb-6 flex-wrap" data-tour="gas-period">
        <div>
          <label className="block text-slate-500 text-xs mb-1">{t('common.from')}</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-slate-500 text-xs mb-1">{t('common.to')}</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls} />
        </div>
        <button onClick={load} className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2 px-5 rounded-lg transition display-font tracking-wide text-sm">{t('common.filter')}</button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-500">{t('common.loading')}</div>
      ) : !summary ? (
        <div className="bg-slate-900/60 border border-white/5 rounded-xl p-12 text-center"><p className="text-slate-500">{t('expenses.empty')}</p></div>
      ) : (
        <>
          {/* Tarjetas resumen */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
            <div className="bg-slate-900/60 border border-white/5 rounded-xl p-4">
              <p className="text-slate-500 text-xs mb-1">{t('expenses.purchasesInventory')}</p>
              <p className="display-font text-xl font-bold text-slate-100">{money(summary.purchasesInventory)}</p>
            </div>
            <div className="bg-slate-900/60 border border-white/5 rounded-xl p-4">
              <p className="text-slate-500 text-xs mb-1">{t('expenses.purchasesOneOff')}</p>
              <p className="display-font text-xl font-bold text-slate-100">{money(summary.purchasesOneOff)}</p>
            </div>
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
              <p className="text-slate-500 text-xs mb-1">{t('expenses.totalPurchases')}</p>
              <p className="display-font text-xl font-bold text-red-300">{money(summary.totalPurchases)}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-slate-900/60 border border-white/5 rounded-xl p-4">
              <p className="text-slate-500 text-xs mb-1">{t('expenses.partsCharged')}</p>
              <p className="display-font text-lg font-bold text-slate-100">{money(summary.partsCharged)}</p>
            </div>
            <div className="bg-slate-900/60 border border-white/5 rounded-xl p-4">
              <p className="text-slate-500 text-xs mb-1">{t('expenses.partsCost')}</p>
              <p className="display-font text-lg font-bold text-slate-100">{money(summary.partsCost)}</p>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
              <p className="text-slate-500 text-xs mb-1">{t('expenses.partsProfit')}</p>
              <p className="display-font text-lg font-bold text-emerald-300">{money(summary.partsProfit)}</p>
            </div>
          </div>

          {/* Por factura */}
          <h2 className="display-font text-slate-300 font-semibold mb-3 tracking-wide">{t('expenses.byInvoice')}</h2>
          {invoices.length === 0 ? (
            <div className="bg-slate-900/60 border border-white/5 rounded-xl p-8 text-center"><p className="text-slate-500">{t('expenses.noParts')}</p></div>
          ) : (
            <div className="bg-slate-900/60 border border-white/5 rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-500 text-xs">
                    <th className="text-left font-medium px-5 py-2.5">{t('receivables.invoice')}</th>
                    <th className="text-left font-medium px-3 py-2.5">{t('common.date')}</th>
                    <th className="text-left font-medium px-3 py-2.5">{t('invoices.client')}</th>
                    <th className="text-right font-medium px-3 py-2.5">{t('expenses.charged')}</th>
                    <th className="text-right font-medium px-3 py-2.5">{t('expenses.cost')}</th>
                    <th className="text-right font-medium px-5 py-2.5">{t('expenses.profit')}</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(r => (
                    <tr key={r.invoice_id} className="border-t border-white/5">
                      <td className="px-5 py-2.5 text-slate-300">{r.document_number}</td>
                      <td className="px-3 py-2.5 text-slate-400">{r.issue_date}</td>
                      <td className="px-3 py-2.5 text-slate-400">{r.client_name}</td>
                      <td className="px-3 py-2.5 text-right text-slate-300">{money(r.charged)}</td>
                      <td className="px-3 py-2.5 text-right text-slate-400">{money(r.cost)}</td>
                      <td className={`px-5 py-2.5 text-right font-semibold ${r.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{money(r.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
