import { useState, useEffect, useCallback } from 'react';
import { Layout } from '../components/Layout';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { formatDate } from '../utils/dateFormat';
import { ArrowLeft, Plus, Save, Clock, CheckCircle2, FileText, MessageSquare } from 'lucide-react';

interface PriceRequest {
  id: string;
  pr_number: string;
  inquiry_id: string | null;
  customer_name: string | null;
  overall_status: string;
  total_products: number;
  source_pending: number;
  source_received: number;
  final_pending: number;
  final_ready: number;
  notes: string | null;
  last_activity_at: string;
  created_at: string;
  inquiry?: { inquiry_number: string } | null;
}

interface PRItem {
  id: string;
  price_request_id: string;
  product_name: string;
  specification: string | null;
  quantity: number | null;
  unit: string | null;
  source_type: string;
  source_contact: string | null;
  price_status: string;
  doc_status: string;
  source_price: number | null;
  source_currency: string;
  final_quote_price: number | null;
  final_quote_currency: string;
  target_price: number | null;
  competitor_price: number | null;
  remarks: string | null;
  pending_reason: string | null;
  created_at: string;
}

interface TimelineEvent {
  id: string;
  event_type: string;
  actor_name: string | null;
  description: string;
  created_at: string;
}

const SOURCE_COLORS: Record<string, string> = {
  india: 'bg-orange-100 text-orange-700',
  china: 'bg-red-100 text-red-700',
  local: 'bg-green-100 text-green-700',
  unknown: 'bg-gray-100 text-gray-500',
};

const EVENT_ICONS: Record<string, React.ElementType> = {
  sourcing_request_sent: FileText,
  reply_received: MessageSquare,
  price_updated: CheckCircle2,
  final_price_entered: CheckCircle2,
  customer_quote_sent: FileText,
  status_changed: Clock,
  note_added: MessageSquare,
};

const STATUS_OPTIONS = ['draft', 'sourcing', 'pricing', 'quoted', 'won', 'lost'];

function ItemRow({ item, onSave }: { item: PRItem; onSave: (updated: Partial<PRItem>) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ ...item });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await onSave({
      product_name: form.product_name,
      specification: form.specification,
      quantity: form.quantity,
      unit: form.unit,
      source_type: form.source_type,
      source_contact: form.source_contact,
      price_status: form.price_status,
      doc_status: form.doc_status,
      source_price: form.source_price,
      source_currency: form.source_currency,
      target_price: form.target_price,
      competitor_price: form.competitor_price,
      remarks: form.remarks,
      pending_reason: form.pending_reason,
    });
    setSaving(false);
    setEditing(false);
  };

  if (!editing) {
    return (
      <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => setEditing(true)}>
        <td className="px-3 py-2 text-xs font-medium text-gray-800">{item.product_name}</td>
        <td className="px-3 py-2 text-xs text-gray-500">{item.specification || '-'}</td>
        <td className="px-3 py-2 text-xs text-gray-600">{item.quantity ? `${item.quantity} ${item.unit || ''}` : '-'}</td>
        <td className="px-3 py-2"><span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${SOURCE_COLORS[item.source_type]}`}>{item.source_type}</span></td>
        <td className="px-3 py-2 text-xs text-gray-500">{item.source_contact || '-'}</td>
        <td className="px-3 py-2"><span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${item.price_status === 'received' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{item.price_status}</span></td>
        <td className="px-3 py-2"><span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${item.doc_status === 'received' ? 'bg-green-100 text-green-700' : item.doc_status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>{item.doc_status}</span></td>
        <td className="px-3 py-2 text-xs text-gray-600">{item.source_price ? `${item.source_currency} ${item.source_price.toLocaleString()}` : '-'}</td>
        <td className="px-3 py-2 text-xs font-medium text-blue-700">{item.final_quote_price ? `${item.final_quote_currency} ${item.final_quote_price.toLocaleString()}` : '-'}</td>
        <td className="px-3 py-2 text-xs text-gray-400 max-w-[120px] truncate">{item.remarks || '-'}</td>
      </tr>
    );
  }

  return (
    <tr className="bg-blue-50">
      <td colSpan={10} className="px-3 py-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mb-3">
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Product</label>
            <input value={form.product_name} onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))} className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Specification</label>
            <input value={form.specification || ''} onChange={e => setForm(f => ({ ...f, specification: e.target.value }))} className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Quantity</label>
            <input type="number" value={form.quantity || ''} onChange={e => setForm(f => ({ ...f, quantity: e.target.value ? +e.target.value : null }))} className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Unit</label>
            <input value={form.unit || ''} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Source Type</label>
            <select value={form.source_type} onChange={e => setForm(f => ({ ...f, source_type: e.target.value }))} className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500">
              {['india', 'china', 'local', 'unknown'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Source Contact</label>
            <input value={form.source_contact || ''} onChange={e => setForm(f => ({ ...f, source_contact: e.target.value }))} className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Price Status</label>
            <select value={form.price_status} onChange={e => setForm(f => ({ ...f, price_status: e.target.value }))} className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500">
              <option value="pending">pending</option>
              <option value="received">received</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Doc Status</label>
            <select value={form.doc_status} onChange={e => setForm(f => ({ ...f, doc_status: e.target.value }))} className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500">
              <option value="not_required">not required</option>
              <option value="pending">pending</option>
              <option value="received">received</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Source Price</label>
            <div className="flex gap-1">
              <select value={form.source_currency} onChange={e => setForm(f => ({ ...f, source_currency: e.target.value }))} className="border border-gray-300 rounded px-1.5 py-1 text-xs w-16 focus:outline-none focus:ring-1 focus:ring-blue-500">
                {['USD', 'INR', 'CNY', 'IDR'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input type="number" value={form.source_price || ''} onChange={e => setForm(f => ({ ...f, source_price: e.target.value ? +e.target.value : null }))} placeholder="0.00" className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Target Price</label>
            <input type="number" value={form.target_price || ''} onChange={e => setForm(f => ({ ...f, target_price: e.target.value ? +e.target.value : null }))} className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" placeholder="USD" />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Competitor Price</label>
            <input type="number" value={form.competitor_price || ''} onChange={e => setForm(f => ({ ...f, competitor_price: e.target.value ? +e.target.value : null }))} className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" placeholder="USD" />
          </div>
          <div className="col-span-2">
            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Remarks</label>
            <input value={form.remarks || ''} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div className="col-span-2">
            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Pending Reason</label>
            <input value={form.pending_reason || ''} onChange={e => setForm(f => ({ ...f, pending_reason: e.target.value }))} className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={() => setEditing(false)} className="px-3 py-1 text-xs text-gray-600 hover:text-gray-800">Cancel</button>
          <button onClick={save} disabled={saving} className="flex items-center gap-1 px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
            <Save className="w-3 h-3" /> {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </td>
    </tr>
  );
}

interface Props { prId: string; onBack: () => void; }

export function PriceRequestDetail({ prId, onBack }: Props) {
  const { profile } = useAuth();
  const [pr, setPr] = useState<PriceRequest | null>(null);
  const [items, setItems] = useState<PRItem[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState('');
  const [addingItem, setAddingItem] = useState(false);
  const [newItemName, setNewItemName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [prRes, itemsRes, timelineRes] = await Promise.all([
      supabase.from('price_requests').select('*, inquiry:crm_inquiries(inquiry_number)').eq('id', prId).maybeSingle(),
      supabase.from('price_request_items').select('*').eq('price_request_id', prId).order('created_at'),
      supabase.from('communication_timeline').select('*').eq('price_request_id', prId).order('created_at', { ascending: false }),
    ]);
    setPr(prRes.data as PriceRequest);
    setItems(itemsRes.data || []);
    setTimeline(timelineRes.data || []);
    setLoading(false);
  }, [prId]);

  useEffect(() => { load(); }, [load]);

  const updatePR = async (patch: Record<string, unknown>) => {
    await supabase.from('price_requests').update({ ...patch, updated_at: new Date().toISOString(), last_activity_at: new Date().toISOString() }).eq('id', prId);
    load();
  };

  const recalcCounters = async () => {
    const { data: allItems } = await supabase.from('price_request_items').select('price_status, final_quote_price').eq('price_request_id', prId);
    if (allItems) {
      await supabase.from('price_requests').update({
        total_products: allItems.length,
        source_pending: allItems.filter(i => i.price_status === 'pending').length,
        source_received: allItems.filter(i => i.price_status === 'received').length,
        final_pending: allItems.filter(i => !i.final_quote_price).length,
        final_ready: allItems.filter(i => !!i.final_quote_price).length,
        updated_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
      }).eq('id', prId);
    }
  };

  const updateItem = async (itemId: string, patch: Partial<PRItem>) => {
    await supabase.from('price_request_items').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', itemId);
    await recalcCounters();
    load();
  };

  const addItem = async () => {
    if (!newItemName.trim()) return;
    await supabase.from('price_request_items').insert({ price_request_id: prId, product_name: newItemName.trim() });
    await recalcCounters();
    setNewItemName('');
    setAddingItem(false);
    load();
  };

  const addNote = async () => {
    if (!newNote.trim()) return;
    await supabase.from('communication_timeline').insert({
      price_request_id: prId,
      event_type: 'note_added',
      actor_id: profile?.id || null,
      actor_name: profile?.full_name || profile?.username || null,
      description: newNote.trim(),
    });
    setNewNote('');
    load();
  };

  if (loading) return <Layout><div className="flex items-center justify-center h-64 text-sm text-gray-400">Loading...</div></Layout>;
  if (!pr) return <Layout><div className="p-6 text-sm text-gray-500">Not found.</div></Layout>;

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-6xl">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-1 rounded hover:bg-gray-100 text-gray-500"><ArrowLeft className="w-4 h-4" /></button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold text-gray-900">{pr.pr_number}</h1>
                {pr.inquiry?.inquiry_number && <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{pr.inquiry.inquiry_number}</span>}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{pr.customer_name || 'No customer'}</p>
            </div>
          </div>
          <select value={pr.overall_status} onChange={e => updatePR({ overall_status: e.target.value })}
            className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500">
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Total Products', value: pr.total_products },
            { label: 'Source Pending', value: pr.source_pending },
            { label: 'Source Received', value: pr.source_received },
            { label: 'Final Ready', value: pr.final_ready },
          ].map(s => (
            <div key={s.label} className="bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-center">
              <p className="text-xl font-semibold text-gray-900">{s.value}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200">
                <h2 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Products</h2>
                <button onClick={() => setAddingItem(true)} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
                  <Plus className="w-3 h-3" /> Add product
                </button>
              </div>
              {addingItem && (
                <div className="px-4 py-2 border-b border-gray-200 bg-blue-50 flex gap-2">
                  <input autoFocus value={newItemName} onChange={e => setNewItemName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addItem(); if (e.key === 'Escape') setAddingItem(false); }}
                    placeholder="Product name..." className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  <button onClick={addItem} className="px-2.5 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">Add</button>
                  <button onClick={() => setAddingItem(false)} className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                </div>
              )}
              {items.length === 0 ? (
                <div className="py-10 text-center text-xs text-gray-400">No products yet. Add one above.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        {['Product', 'Spec', 'Qty', 'Source', 'Contact', 'Price', 'Doc', 'Source Price', 'Final Quote', 'Remarks'].map(h => (
                          <th key={h} className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {items.map(item => <ItemRow key={item.id} item={item} onSave={patch => updateItem(item.id, patch)} />)}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-200">
                <h2 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Timeline</h2>
              </div>
              <div className="px-3 py-2 border-b border-gray-200">
                <div className="flex gap-2">
                  <input value={newNote} onChange={e => setNewNote(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addNote(); }}
                    placeholder="Add a note..." className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  <button onClick={addNote} className="px-2.5 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">Add</button>
                </div>
              </div>
              <div className="overflow-y-auto max-h-[400px]">
                {timeline.length === 0 ? (
                  <p className="py-8 text-center text-xs text-gray-400">No activity yet.</p>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {timeline.map(ev => {
                      const Icon = EVENT_ICONS[ev.event_type] || Clock;
                      return (
                        <div key={ev.id} className="px-4 py-2.5 flex gap-2.5">
                          <div className="mt-0.5 shrink-0"><Icon className="w-3.5 h-3.5 text-gray-400" /></div>
                          <div className="min-w-0">
                            <p className="text-xs text-gray-700 leading-relaxed">{ev.description}</p>
                            <p className="text-[10px] text-gray-400 mt-0.5">
                              {ev.actor_name && <span className="font-medium">{ev.actor_name} - </span>}
                              {formatDate(ev.created_at)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            {pr.notes && (
              <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                <p className="text-[10px] font-semibold text-amber-700 uppercase mb-1">Notes</p>
                <p className="text-xs text-amber-800">{pr.notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
