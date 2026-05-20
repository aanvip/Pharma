import { useState, useEffect, useCallback } from 'react';
import { Layout } from '../components/Layout';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Save, CheckCircle2 } from 'lucide-react';

interface DeskItem {
  id: string;
  product_name: string;
  specification: string | null;
  quantity: number | null;
  unit: string | null;
  source_type: string;
  source_price: number | null;
  source_currency: string;
  target_price: number | null;
  competitor_price: number | null;
  final_quote_price: number | null;
  final_quote_currency: string;
  remarks: string | null;
  price_request_id: string;
  pr?: { pr_number: string; customer_name: string | null } | null;
}

const SOURCE_COLORS: Record<string, string> = {
  india: 'bg-orange-100 text-orange-700',
  china: 'bg-red-100 text-red-700',
  local: 'bg-green-100 text-green-700',
  unknown: 'bg-gray-100 text-gray-500',
};

async function recalcPriceRequestCounters(priceRequestId: string) {
  const { data: prItems } = await supabase
    .from('price_request_items')
    .select('price_status, final_quote_price')
    .eq('price_request_id', priceRequestId);

  if (!prItems) return;

  await supabase.from('price_requests').update({
    total_products: prItems.length,
    source_pending: prItems.filter(i => i.price_status === 'pending').length,
    source_received: prItems.filter(i => i.price_status === 'received').length,
    final_ready: prItems.filter(i => !!i.final_quote_price).length,
    final_pending: prItems.filter(i => !i.final_quote_price).length,
    last_activity_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', priceRequestId);
}

export function PricingDesk() {
  const { profile } = useAuth();
  const [items, setItems] = useState<DeskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Record<string, { price: string; currency: string; remarks: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('price_request_items')
      .select('*, pr:price_requests(pr_number, customer_name)')
      .eq('price_status', 'received')
      .is('final_quote_price', null)
      .order('created_at');
    setItems((data as DeskItem[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const startEdit = (item: DeskItem) => {
    setEditing(e => ({ ...e, [item.id]: { price: '', currency: item.final_quote_currency || 'USD', remarks: item.remarks || '' } }));
  };

  const saveItem = async (item: DeskItem) => {
    const e = editing[item.id];
    if (!e || !e.price) return;
    setSaving(item.id);
    const price = parseFloat(e.price);

    await supabase.from('price_request_items').update({
      final_quote_price: price,
      final_quote_currency: e.currency,
      remarks: e.remarks || null,
      final_entered_by: profile?.id || null,
      final_entered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', item.id);

    await supabase.from('pricing_ledger').upsert({
      price_request_id: item.price_request_id,
      price_request_item_id: item.id,
      customer_name: item.pr?.customer_name || null,
      product_name: item.product_name,
      source_price: item.source_price,
      source_currency: item.source_currency,
      final_quoted_price: price,
      final_quote_currency: e.currency,
      target_price: item.target_price,
      competitor_price: item.competitor_price,
      remarks: e.remarks || null,
      created_by: profile?.id || null,
      quote_date: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'price_request_item_id' });

    await supabase.from('communication_timeline').insert({
      price_request_id: item.price_request_id,
      event_type: 'final_price_entered',
      item_id: item.id,
      actor_id: profile?.id || null,
      actor_name: profile?.full_name || profile?.username || null,
      description: `Final quote entered for ${item.product_name}: ${e.currency} ${price.toLocaleString()}`,
    });

    await recalcPriceRequestCounters(item.price_request_id);

    setDone(d => new Set([...d, item.id]));
    setEditing(e => { const n = { ...e }; delete n[item.id]; return n; });
    setSaving(null);
    setTimeout(() => { setDone(d => { const n = new Set(d); n.delete(item.id); return n; }); load(); }, 1200);
  };

  return (
    <Layout>
      <div className="p-4 md:p-6">
        <div className="mb-4">
          <h1 className="text-lg font-semibold text-gray-900">Pricing Desk</h1>
          <p className="text-xs text-gray-500 mt-0.5">Products with source price received - enter final USD quote</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          {loading ? (
            <div className="py-16 text-center text-sm text-gray-400">Loading...</div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center">
              <CheckCircle2 className="w-8 h-8 text-green-400 mx-auto mb-2" />
              <p className="text-sm text-gray-500">All caught up! No items waiting for final quote.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['PR #', 'Customer', 'Product', 'Spec', 'Qty', 'Source', 'Source Price', 'Target', 'Competitor', 'Final Quote', 'Remarks', ''].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map(item => {
                    const e = editing[item.id];
                    const isDone = done.has(item.id);
                    return (
                      <tr key={item.id} className={isDone ? 'bg-green-50' : 'hover:bg-gray-50'}>
                        <td className="px-3 py-2 text-xs font-medium text-blue-700 whitespace-nowrap">{item.pr?.pr_number || '-'}</td>
                        <td className="px-3 py-2 text-xs text-gray-700 max-w-[120px] truncate">{item.pr?.customer_name || '-'}</td>
                        <td className="px-3 py-2 text-xs font-medium text-gray-800 whitespace-nowrap">{item.product_name}</td>
                        <td className="px-3 py-2 text-xs text-gray-500 max-w-[100px] truncate">{item.specification || '-'}</td>
                        <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">{item.quantity ? `${item.quantity} ${item.unit || ''}` : '-'}</td>
                        <td className="px-3 py-2"><span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${SOURCE_COLORS[item.source_type]}`}>{item.source_type}</span></td>
                        <td className="px-3 py-2 text-xs text-gray-700 whitespace-nowrap">{item.source_price ? `${item.source_currency} ${item.source_price.toLocaleString()}` : '-'}</td>
                        <td className="px-3 py-2 text-xs text-gray-500">{item.target_price ? `$${item.target_price}` : '-'}</td>
                        <td className="px-3 py-2 text-xs text-gray-500">{item.competitor_price ? `$${item.competitor_price}` : '-'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {isDone ? (
                            <span className="text-xs text-green-600 font-medium flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Saved</span>
                          ) : e ? (
                            <div className="flex gap-1">
                              <select value={e.currency} onChange={ev => setEditing(ed => ({ ...ed, [item.id]: { ...ed[item.id], currency: ev.target.value } }))} className="border border-gray-300 rounded px-1 py-0.5 text-xs w-14">
                                {['USD', 'IDR', 'INR', 'CNY'].map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                              <input autoFocus type="number" value={e.price} onChange={ev => setEditing(ed => ({ ...ed, [item.id]: { ...ed[item.id], price: ev.target.value } }))}
                                onKeyDown={ev => { if (ev.key === 'Enter') saveItem(item); if (ev.key === 'Escape') setEditing(ed => { const n = { ...ed }; delete n[item.id]; return n; }); }}
                                placeholder="Price" className="w-24 border border-blue-400 rounded px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                            </div>
                          ) : (
                            <button onClick={() => startEdit(item)} className="text-xs text-blue-600 hover:text-blue-700 font-medium">Enter price</button>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {e && <input value={e.remarks} onChange={ev => setEditing(ed => ({ ...ed, [item.id]: { ...ed[item.id], remarks: ev.target.value } }))} placeholder="Remarks" className="w-28 border border-gray-300 rounded px-2 py-0.5 text-xs focus:outline-none" />}
                        </td>
                        <td className="px-3 py-2">
                          {e && !isDone && (
                            <button onClick={() => saveItem(item)} disabled={saving === item.id || !e.price} className="flex items-center gap-1 px-2.5 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                              <Save className="w-3 h-3" /> {saving === item.id ? '...' : 'Save'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
