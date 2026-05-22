import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Layout } from '../components/Layout';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useNavigation } from '../contexts/NavigationContext';
import { formatDate } from '../utils/dateFormat';
import {
  Calculator,
  CheckCircle2,
  FileText,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from 'lucide-react';
import { showToast } from '../components/ToastNotification';
import { TableColumn, useColumnPreferences } from '../hooks/useColumnPreferences';

interface Inquiry {
  id: string;
  inquiry_number: string;
  aceerp_no: string | null;
  company_name: string;
  product_name: string;
  specification: string | null;
  quantity: string;
  supplier_name: string | null;
  source_status: string;
  document_status: string;
  kunal_price_status: string;
  quote_status: string;
  quote_sent_at: string | null;
  pipeline_status: string | null;
  price_ready: boolean | null;
  purchase_price: number | null;
  offered_price: number | null;
  purchase_price_currency: string | null;
  offered_price_currency: string | null;
  kunal_pricing_requested_at: string | null;
  kunal_pricing_note: string | null;
  created_at: string;
}

interface PricingOption {
  id: string;
  inquiry_id: string;
  source_type: string;
  offered_make: string | null;
  source_price: number | null;
  source_currency: string;
  availability: string;
  document_status: string;
  remark: string | null;
  is_selected: boolean;
  confidence: number | null;
}

interface RowDraft {
  purchase_price: string;
  offered_price: string;
  purchase_currency: string;
  offered_currency: string;
  kunal_remark: string;
  import_data_reference: string;
  selected_option_id: string | null;
}

type TabKey = 'need' | 'source' | 'manual' | 'completed';

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'need', label: 'Need My Price' },
  { key: 'source', label: 'Source Price Received' },
  { key: 'manual', label: 'Manual / Waiting Source' },
  { key: 'completed', label: 'Completed' },
];

const KUNAL_COLUMNS: TableColumn[] = [
  { key: 'inquiry', label: 'INQ #', width: 130, minWidth: 110, required: true },
  { key: 'aceerp', label: 'AC ERP#', width: 110, minWidth: 90 },
  { key: 'customer', label: 'Customer', width: 150, minWidth: 120 },
  { key: 'product', label: 'Product', width: 180, minWidth: 130, required: true },
  { key: 'spec', label: 'Spec', width: 140, minWidth: 100 },
  { key: 'qty', label: 'Qty', width: 70, minWidth: 60 },
  { key: 'preferred', label: 'Preferred', width: 120, minWidth: 100 },
  { key: 'source', label: 'Source', width: 110, minWidth: 90 },
  { key: 'options', label: 'Options', width: 100, minWidth: 85 },
  { key: 'inr', label: 'INR Price', width: 165, minWidth: 145, required: true },
  { key: 'landed', label: 'USD Landed Cost', width: 190, minWidth: 170, required: true },
  { key: 'quote', label: 'Quote Price', width: 180, minWidth: 155, required: true },
  { key: 'reference', label: 'Reference / Remark', width: 170, minWidth: 140 },
  { key: 'actions', label: '', width: 105, minWidth: 95, required: true },
];

const SOURCE_COLOR: Record<string, string> = {
  india: 'bg-orange-100 text-orange-700',
  china: 'bg-red-100 text-red-700',
  local: 'bg-green-100 text-green-700',
};

const AVAIL_COLOR: Record<string, string> = {
  available: 'bg-green-100 text-green-700',
  partial: 'bg-amber-100 text-amber-700',
  na: 'bg-gray-200 text-gray-600',
};

function hasSourceReply(row: Inquiry): boolean {
  return row.source_status === 'received' || row.source_status === 'partial_received';
}

function isAlreadyQuoted(row: Inquiry): boolean {
  return row.quote_status === 'sent'
    || !!row.quote_sent_at
    || row.offered_price !== null;
}

function isCompleted(row: Inquiry): boolean {
  return isAlreadyQuoted(row)
    || row.price_ready === true
    || row.kunal_price_status === 'entered'
    || row.offered_price !== null;
}

function isActivePipeline(row: Inquiry): boolean {
  return row.pipeline_status !== 'won'
    && row.pipeline_status !== 'lost'
    && row.pipeline_status !== 'closed';
}

function needsPrice(row: Inquiry): boolean {
  return !isCompleted(row)
    && isActivePipeline(row)
    && row.offered_price === null
    && !!row.product_name?.trim();
}

export function PricingWorksheet() {
  const { profile } = useAuth();
  const { setCurrentPage, setNavigationData } = useNavigation();
  const isManager = profile?.role === 'admin' || profile?.role === 'manager';

  const [tab, setTab] = useState<TabKey>('need');
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [options, setOptions] = useState<Record<string, PricingOption[]>>({});
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Toolbar filters
  const [search, setSearch] = useState('');
  const [customerFilter, setCustomerFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'received' | 'no_source' | 'manual'>('all');
  const [priceFilter, setPriceFilter] = useState<'all' | 'landed_missing' | 'quote_missing' | 'completed'>('all');
  const [columnsOpen, setColumnsOpen] = useState(false);
  const table = useColumnPreferences('kunal_pricing_table', KUNAL_COLUMNS);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: inqs, error } = await supabase
      .from('crm_inquiries')
      .select('id,inquiry_number,aceerp_no,company_name,product_name,specification,quantity,supplier_name,source_status,document_status,kunal_price_status,quote_status,quote_sent_at,pipeline_status,price_ready,purchase_price,offered_price,purchase_price_currency,offered_price_currency,kunal_pricing_requested_at,kunal_pricing_note,created_at')
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      showToast({ type: 'error', title: 'Could not load pricing worksheet', message: error.message });
      setInquiries([]);
      setOptions({});
      setLoading(false);
      return;
    }

    const rows = ((inqs as Inquiry[]) || []).filter(row => {
      if (tab === 'completed') return isCompleted(row);
      if (!needsPrice(row)) return false;
      if (tab === 'source') return hasSourceReply(row);
      if (tab === 'manual') return !hasSourceReply(row);
      return true;
    });
    setInquiries(rows);

    if (rows.length > 0) {
      const { data: opts } = await supabase
        .from('crm_inquiry_pricing_options')
        .select('*')
        .in('inquiry_id', rows.map(row => row.id));
      const grouped: Record<string, PricingOption[]> = {};
      for (const opt of (opts as PricingOption[]) || []) {
        if (!grouped[opt.inquiry_id]) grouped[opt.inquiry_id] = [];
        grouped[opt.inquiry_id].push(opt);
      }
      setOptions(grouped);
    } else {
      setOptions({});
    }
    setLoading(false);
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const customerOptions = useMemo(() => {
    return Array.from(new Set(inquiries.map(i => i.company_name).filter(Boolean))).sort();
  }, [inquiries]);

  const filteredInquiries = useMemo(() => {
    const term = search.trim().toLowerCase();
    return inquiries.filter(row => {
      if (customerFilter !== 'all' && row.company_name !== customerFilter) return false;
      if (sourceFilter === 'received' && !hasSourceReply(row)) return false;
      if (sourceFilter === 'no_source' && hasSourceReply(row)) return false;
      if (sourceFilter === 'manual' && hasSourceReply(row)) return false;
      if (priceFilter === 'landed_missing' && row.purchase_price) return false;
      if (priceFilter === 'quote_missing' && row.offered_price) return false;
      if (priceFilter === 'completed' && !isCompleted(row)) return false;
      if (!term) return true;
      const hay = [
        row.inquiry_number, row.aceerp_no, row.company_name, row.product_name,
        row.specification, row.supplier_name, row.kunal_pricing_note,
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(term);
    });
  }, [inquiries, search, customerFilter, sourceFilter, priceFilter]);

  const clearFilters = () => {
    setSearch(''); setCustomerFilter('all'); setSourceFilter('all'); setPriceFilter('all');
  };

  const tabCounts = useMemo(() => {
    const counts: Record<TabKey, number> = { need: 0, source: 0, manual: 0, completed: 0 };
    for (const row of inquiries) {
      if (isCompleted(row)) counts.completed += 1;
      if (needsPrice(row)) counts.need += 1;
      if (needsPrice(row) && hasSourceReply(row)) counts.source += 1;
      if (needsPrice(row) && !hasSourceReply(row)) counts.manual += 1;
    }
    return counts;
  }, [inquiries]);

  const ensureDraft = (inq: Inquiry): RowDraft => {
    if (drafts[inq.id]) return drafts[inq.id];
    const selectedOption = (options[inq.id] || []).find(opt => opt.is_selected) || null;
    const init: RowDraft = {
      purchase_price: inq.purchase_price ? String(inq.purchase_price) : '',
      offered_price: inq.offered_price ? String(inq.offered_price) : '',
      purchase_currency: inq.purchase_price_currency || 'USD',
      offered_currency: inq.offered_price_currency || 'USD',
      kunal_remark: inq.kunal_pricing_note || '',
      import_data_reference: '',
      selected_option_id: selectedOption?.id || null,
    };
    setDrafts(current => ({ ...current, [inq.id]: init }));
    return init;
  };

  const setDraft = (id: string, patch: Partial<RowDraft>) => {
    setDrafts(current => ({ ...current, [id]: { ...(current[id] || {} as RowDraft), ...patch } }));
  };

  const openInquiry = (id: string) => {
    setNavigationData({ crmInquiryId: id, returnTo: 'pricing-worksheet' });
    setCurrentPage('crm');
  };

  const addOption = async (inq: Inquiry) => {
    if (!isManager) return;
    const { data, error } = await supabase
      .from('crm_inquiry_pricing_options')
      .insert({
        inquiry_id: inq.id,
        source_type: 'india',
        availability: 'available',
        document_status: 'pending',
        source_currency: 'INR',
        is_selected: false,
        created_by: profile?.id || null,
      })
      .select('*')
      .maybeSingle();
    if (error) {
      showToast({ type: 'error', title: 'Error', message: error.message });
      return;
    }
    setOptions(current => ({ ...current, [inq.id]: [...(current[inq.id] || []), data as PricingOption] }));
    setExpanded(inq.id);
  };

  const updateOption = async (opt: PricingOption, patch: Partial<PricingOption>) => {
    setOptions(current => ({
      ...current,
      [opt.inquiry_id]: (current[opt.inquiry_id] || []).map(item => item.id === opt.id ? { ...item, ...patch } as PricingOption : item),
    }));
    await supabase.from('crm_inquiry_pricing_options').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', opt.id);
  };

  const removeOption = async (opt: PricingOption) => {
    if (!isManager) return;
    setOptions(current => ({
      ...current,
      [opt.inquiry_id]: (current[opt.inquiry_id] || []).filter(item => item.id !== opt.id),
    }));
    await supabase.from('crm_inquiry_pricing_options').delete().eq('id', opt.id);
  };

  const selectOption = async (inquiryId: string, optionId: string) => {
    const currentOptions = options[inquiryId] || [];
    const selectedOption = currentOptions.find(opt => opt.id === optionId);
    setOptions(current => ({
      ...current,
      [inquiryId]: currentOptions.map(opt => ({ ...opt, is_selected: opt.id === optionId })),
    }));
    setDraft(inquiryId, { selected_option_id: optionId, purchase_currency: selectedOption?.source_currency || 'USD' });
    await supabase.from('crm_inquiry_pricing_options').update({ is_selected: false }).eq('inquiry_id', inquiryId);
    await supabase.from('crm_inquiry_pricing_options').update({ is_selected: true, updated_at: new Date().toISOString() }).eq('id', optionId);
  };

  const openCalculator = (inq: Inquiry) => {
    showToast({
      type: 'info',
      title: 'Price Calculator',
      message: `Opening calculator. Copy result back into Purchase/Selling for ${inq.inquiry_number}.`,
    });
    setCurrentPage('price-calculator');
  };

  const submit = async (inq: Inquiry) => {
    if (!isManager) {
      showToast({ type: 'error', title: 'Not allowed', message: 'Only admin/manager can submit a Kunal price.' });
      return;
    }
    const draft = drafts[inq.id];
    if (!draft || !draft.purchase_price || !draft.offered_price) {
      showToast({ type: 'error', title: 'Missing prices', message: 'Enter both Purchase and Selling price.' });
      return;
    }
    const purchasePrice = parseFloat(draft.purchase_price);
    const sellingPrice = parseFloat(draft.offered_price);
    if (!Number.isFinite(purchasePrice) || !Number.isFinite(sellingPrice)) {
      showToast({ type: 'error', title: 'Invalid price', message: 'Enter valid numeric prices.' });
      return;
    }

    setSavingId(inq.id);
    const selectedOption = (options[inq.id] || []).find(opt => opt.id === draft.selected_option_id)
      || (options[inq.id] || []).find(opt => opt.source_price !== null)
      || null;
    const now = new Date().toISOString();

    const { error: inquiryError } = await supabase.from('crm_inquiries').update({
      purchase_price: purchasePrice,
      offered_price: sellingPrice,
      purchase_price_currency: draft.purchase_currency || 'USD',
      offered_price_currency: draft.offered_currency || 'USD',
      kunal_price_status: 'entered',
      price_ready: true,
      quote_status: 'not_sent',
      updated_at: now,
    }).eq('id', inq.id);

    if (inquiryError) {
      showToast({ type: 'error', title: 'Save failed', message: inquiryError.message });
      setSavingId(null);
      return;
    }

    await Promise.resolve(supabase.from('pricing_ledger').insert({
      inquiry_id: inq.id,
      aceerp_no: inq.aceerp_no,
      customer_name: inq.company_name,
      product_name: inq.product_name,
      preferred_make: inq.supplier_name,
      offered_make: selectedOption?.offered_make || null,
      source_price: selectedOption?.source_price ?? null,
      source_currency: selectedOption?.source_currency || draft.purchase_currency || 'USD',
      purchase_price: purchasePrice,
      selling_price: sellingPrice,
      final_quoted_price: sellingPrice,
      final_quote_currency: draft.offered_currency || 'USD',
      kunal_remark: draft.kunal_remark || null,
      import_data_reference: draft.import_data_reference || null,
      final_selected_option_id: selectedOption?.id || null,
      quoted_by: profile?.id || null,
      created_by: profile?.id || null,
      quote_date: now,
      updated_at: now,
    })).catch(() => {});

    await Promise.resolve(supabase.from('crm_inquiry_timeline').insert({
      inquiry_id: inq.id,
      event_type: 'kunal_price_submitted',
      actor_id: profile?.id || null,
      actor_name: profile?.full_name || profile?.username || null,
      description: 'Kunal price submitted; CRM purchase and selling prices updated.',
      metadata: {
        purchase_price: purchasePrice,
        selling_price: sellingPrice,
        selected_option_id: selectedOption?.id || null,
      },
    })).catch(() => {});

    showToast({ type: 'success', title: 'Saved', message: `Kunal price submitted for ${inq.inquiry_number}.` });
    setSavingId(null);
    await load();
  };

  return (
    <Layout>
      <div className="p-4 md:p-6">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Kunal Pricing</h1>
            <p className="text-xs text-gray-500 mt-0.5">Enter final purchase and selling prices on CRM inquiry rows. Quote status stays not sent until customer quote email is sent.</p>
          </div>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        <div className="flex flex-wrap gap-2 items-center mb-2 bg-white border border-gray-200 rounded px-2.5 py-1.5">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search inquiry, product, customer, spec, preferred make…"
            className="flex-1 min-w-[200px] border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
          <select value={customerFilter} onChange={e => setCustomerFilter(e.target.value)}
            className="border border-gray-200 rounded px-1.5 py-1 text-xs">
            <option value="all">All customers</option>
            {customerOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value as typeof sourceFilter)}
            className="border border-gray-200 rounded px-1.5 py-1 text-xs">
            <option value="all">All source status</option>
            <option value="received">Source price received</option>
            <option value="no_source">No source price</option>
            <option value="manual">Manual / waiting source</option>
          </select>
          <select value={priceFilter} onChange={e => setPriceFilter(e.target.value as typeof priceFilter)}
            className="border border-gray-200 rounded px-1.5 py-1 text-xs">
            <option value="all">All price</option>
            <option value="landed_missing">USD landed cost missing</option>
            <option value="quote_missing">Quote price missing</option>
            <option value="completed">Completed</option>
          </select>
          <button onClick={clearFilters} className="text-[11px] text-gray-600 hover:text-gray-800">Clear</button>
          <span className="text-[11px] text-gray-500 ml-auto">{filteredInquiries.length} shown</span>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-200 bg-gray-50 flex flex-wrap gap-1.5">
            {tabs.map(item => (
              <button
                key={item.key}
                onClick={() => setTab(item.key)}
                className={`px-2.5 py-1 text-xs rounded font-medium ${tab === item.key ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-white border border-transparent hover:border-gray-200'}`}
              >
                {item.label}
                <span className="ml-1 opacity-75">{tabCounts[item.key] || ''}</span>
              </button>
            ))}
            <div className="relative ml-auto">
              <button onClick={() => setColumnsOpen(open => !open)}
                className="px-3 py-1 text-xs border border-gray-200 rounded bg-white hover:bg-gray-50">
                Columns
              </button>
              {columnsOpen && (
                <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-gray-200 rounded shadow-lg z-30 p-2">
                  <button onClick={table.reset} className="text-[11px] text-blue-600 hover:underline mb-1">Reset widths</button>
                  {table.columns.map(column => (
                    <label key={column.key} className="flex items-center gap-2 px-1.5 py-1 text-xs text-gray-700">
                      <input type="checkbox" checked={table.isVisible(column.key)} disabled={column.required} onChange={() => table.toggleColumn(column.key)} />
                      <span>{column.label || 'Actions'}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          {loading ? (
            <div className="py-12 text-center text-sm text-gray-400">Loading...</div>
          ) : filteredInquiries.length === 0 ? (
            <div className="py-12 text-center">
              <CheckCircle2 className="w-7 h-7 text-green-400 mx-auto mb-2" />
              <p className="text-sm text-gray-700">No inquiry rows in this tab.</p>
              <p className="text-[11px] text-gray-500 mt-1">Rows enter here from source replies, Send to Kunal Pricing, or missing CRM price fields.</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[calc(100vh-260px)] overflow-y-auto">
              <table className="w-full table-fixed text-xs">
                <thead className="bg-gray-100 border-b border-gray-300 sticky top-0 z-10">
                  <tr>
                    {table.visibleColumns.map(column => (
                      <th key={column.key} style={table.getCellStyle(column.key)} className="relative px-2 py-1.5 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider whitespace-nowrap border-r border-gray-300">
                        {column.label}
                        <div className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-400" onMouseDown={event => table.startResize(column.key, event)} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredInquiries.map(inq => {
                    const draft = ensureDraft(inq);
                    const rowOptions = options[inq.id] || [];
                    const sourceOption = rowOptions.find(opt => opt.id === draft.selected_option_id)
                      || rowOptions.find(opt => opt.source_price !== null)
                      || null;
                    const isOpen = expanded === inq.id;
                    return (
                      <Fragment key={inq.id}>
                        <tr className="hover:bg-gray-50 align-top">
                          {table.isVisible('inquiry') && <td style={table.getCellStyle('inquiry')} className="px-2 py-1 text-xs font-medium whitespace-nowrap border-r border-gray-200">
                            <button onClick={() => openInquiry(inq.id)} className="text-blue-700 hover:underline">{inq.inquiry_number}</button>
                            {inq.kunal_pricing_requested_at && (
                              <div className="text-[10px] text-gray-400">Sent {formatDate(inq.kunal_pricing_requested_at)}</div>
                            )}
                          </td>}
                          {table.isVisible('aceerp') && <td style={table.getCellStyle('aceerp')} className="px-2 py-1 text-xs text-gray-700 whitespace-nowrap border-r border-gray-200 truncate">{inq.aceerp_no || '-'}</td>}
                          {table.isVisible('customer') && <td style={table.getCellStyle('customer')} className="px-2 py-1 text-xs text-gray-700 truncate border-r border-gray-200" title={inq.company_name}>{inq.company_name}</td>}
                          {table.isVisible('product') && <td style={table.getCellStyle('product')} className="px-2 py-1 text-xs font-medium text-gray-800 truncate border-r border-gray-200" title={inq.product_name}>{inq.product_name}</td>}
                          {table.isVisible('spec') && <td style={table.getCellStyle('spec')} className="px-2 py-1 text-xs text-gray-500 truncate border-r border-gray-200" title={inq.specification || ''}>{inq.specification || '-'}</td>}
                          {table.isVisible('qty') && <td style={table.getCellStyle('qty')} className="px-2 py-1 text-xs text-gray-600 whitespace-nowrap border-r border-gray-200">{inq.quantity || '-'}</td>}
                          {table.isVisible('preferred') && <td style={table.getCellStyle('preferred')} className="px-2 py-1 text-xs text-gray-700 truncate border-r border-gray-200" title={inq.supplier_name || ''}>{inq.supplier_name || '-'}</td>}
                          {table.isVisible('source') && <td style={table.getCellStyle('source')} className="px-2 py-1 text-xs text-gray-600 whitespace-nowrap border-r border-gray-200">
                            <span className="block">{inq.source_status}</span>
                            <span className="text-[10px] text-gray-400">{inq.document_status}</span>
                          </td>}
                          {table.isVisible('options') && <td style={table.getCellStyle('options')} className="px-2 py-1 border-r border-gray-200">
                            <button onClick={() => setExpanded(isOpen ? null : inq.id)}
                              className="text-[11px] text-blue-600 hover:underline">
                              {rowOptions.length === 0 ? 'Add option' : `${rowOptions.length} option${rowOptions.length !== 1 ? 's' : ''}`}
                            </button>
                          </td>}
                          {table.isVisible('inr') && <td style={table.getCellStyle('inr')} className="px-2 py-1 text-xs text-gray-700 whitespace-nowrap border-r border-gray-200">
                            {sourceOption?.source_price != null ? (
                              <div>
                                <span className="font-medium">{sourceOption.source_currency || 'INR'} {sourceOption.source_price}</span>
                                {sourceOption.offered_make && <div className="text-[10px] text-gray-500">{sourceOption.offered_make}</div>}
                              </div>
                            ) : (
                              <span className="text-[11px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                                No source price yet — manual pricing allowed
                              </span>
                            )}
                          </td>}
                          {table.isVisible('landed') && <td style={table.getCellStyle('landed')} className="px-2 py-1 border-r border-gray-200">
                            <div className="flex gap-1">
                              <select value={draft.purchase_currency} onChange={e => setDraft(inq.id, { purchase_currency: e.target.value })}
                                className="border border-gray-300 rounded px-1 py-0.5 text-xs w-14">
                                {['USD', 'INR', 'CNY', 'IDR'].map(currency => <option key={currency}>{currency}</option>)}
                              </select>
                              <input type="number" value={draft.purchase_price}
                                onChange={e => setDraft(inq.id, { purchase_price: e.target.value })}
                                placeholder="0.00" className="w-24 border border-gray-300 rounded px-2 py-0.5 text-xs focus:bg-yellow-50" />
                            </div>
                          </td>}
                          {table.isVisible('quote') && <td style={table.getCellStyle('quote')} className="px-2 py-1 border-r border-gray-200">
                            <div className="flex gap-1">
                              <select value={draft.offered_currency} onChange={e => setDraft(inq.id, { offered_currency: e.target.value })}
                                className="border border-gray-300 rounded px-1 py-0.5 text-xs w-14">
                                {['USD', 'IDR', 'INR', 'CNY'].map(currency => <option key={currency}>{currency}</option>)}
                              </select>
                              <input type="number" value={draft.offered_price}
                                onChange={e => setDraft(inq.id, { offered_price: e.target.value })}
                                placeholder="0.00" className="w-24 border border-blue-300 rounded px-2 py-0.5 text-xs focus:bg-yellow-50" />
                            </div>
                          </td>}
                          {table.isVisible('reference') && <td style={table.getCellStyle('reference')} className="px-2 py-1 border-r border-gray-200">
                            <input value={draft.import_data_reference} onChange={e => setDraft(inq.id, { import_data_reference: e.target.value })}
                              placeholder="Import ref" className="w-28 border border-gray-300 rounded px-2 py-0.5 text-xs mb-1 focus:bg-yellow-50" />
                            <input value={draft.kunal_remark} onChange={e => setDraft(inq.id, { kunal_remark: e.target.value })}
                              placeholder="Remark" className="w-32 border border-gray-300 rounded px-2 py-0.5 text-xs focus:bg-yellow-50" />
                          </td>}
                          {table.isVisible('actions') && <td style={table.getCellStyle('actions')} className="px-2 py-1 whitespace-nowrap">
                            <div className="flex gap-1.5">
                              <button onClick={() => openCalculator(inq)}
                                title="Open Price Calculator"
                                className="p-1 border border-gray-200 rounded hover:bg-gray-50 text-gray-500">
                                <Calculator className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => submit(inq)} disabled={savingId === inq.id || !isManager || tab === 'completed'}
                                className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                                <Save className="w-3 h-3" /> {savingId === inq.id ? '...' : 'Submit'}
                              </button>
                            </div>
                          </td>}
                        </tr>
                        {isOpen && (
                          <tr className="bg-blue-50/40">
                            <td colSpan={table.visibleColumns.length} className="px-4 py-3">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2 text-xs text-gray-600">
                                  <FileText className="w-3.5 h-3.5 text-gray-400" />
                                  Source options for <span className="font-medium text-gray-800">{inq.inquiry_number}</span>
                                  <span className="text-gray-400">·</span>
                                  <span className="text-gray-500">{formatDate(inq.created_at)}</span>
                                </div>
                                {isManager && (
                                  <button onClick={() => addOption(inq)}
                                    className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                                    <Plus className="w-3 h-3" /> Add option
                                  </button>
                                )}
                              </div>
                              {rowOptions.length === 0 ? (
                                <p className="text-[11px] text-gray-500">No source options recorded yet. Add manual India/China/local source reply data here.</p>
                              ) : (
                                <div className="space-y-1.5">
                                  {rowOptions.map(opt => (
                                    <div key={opt.id} className={`grid grid-cols-12 gap-2 items-center text-xs px-2 py-1.5 rounded border ${opt.is_selected ? 'border-blue-300 bg-white' : 'border-gray-200 bg-white/70'}`}>
                                      <label className="col-span-1 flex items-center gap-1.5 cursor-pointer">
                                        <input type="radio" name={`opt-${inq.id}`} checked={opt.is_selected}
                                          onChange={() => selectOption(inq.id, opt.id)} disabled={!isManager}
                                          className="text-blue-600 focus:ring-blue-500" />
                                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${SOURCE_COLOR[opt.source_type] || 'bg-gray-100 text-gray-600'}`}>{opt.source_type}</span>
                                      </label>
                                      <select value={opt.source_type} onChange={e => updateOption(opt, { source_type: e.target.value })} disabled={!isManager}
                                        className="col-span-1 border border-gray-200 rounded px-1 py-0.5 text-xs">
                                        {['india', 'china', 'local'].map(source => <option key={source}>{source}</option>)}
                                      </select>
                                      <input value={opt.offered_make || ''} onChange={e => updateOption(opt, { offered_make: e.target.value })} disabled={!isManager}
                                        placeholder="Make" className="col-span-2 border border-gray-200 rounded px-2 py-0.5 text-xs" />
                                      <div className="col-span-2 flex gap-1">
                                        <select value={opt.source_currency} onChange={e => updateOption(opt, { source_currency: e.target.value })} disabled={!isManager}
                                          className="border border-gray-200 rounded px-1 py-0.5 text-xs w-14">
                                          {['USD','INR','CNY','IDR'].map(currency => <option key={currency}>{currency}</option>)}
                                        </select>
                                        <input type="number" value={opt.source_price ?? ''} onChange={e => updateOption(opt, { source_price: e.target.value ? parseFloat(e.target.value) : null })} disabled={!isManager}
                                          placeholder="Price" className="flex-1 border border-gray-200 rounded px-2 py-0.5 text-xs" />
                                      </div>
                                      <select value={opt.availability} onChange={e => updateOption(opt, { availability: e.target.value })} disabled={!isManager}
                                        className={`col-span-1 border rounded px-1 py-0.5 text-xs ${AVAIL_COLOR[opt.availability] || ''}`}>
                                        {['available','partial','na'].map(value => <option key={value}>{value}</option>)}
                                      </select>
                                      <select value={opt.document_status} onChange={e => updateOption(opt, { document_status: e.target.value })} disabled={!isManager}
                                        className="col-span-2 border border-gray-200 rounded px-1 py-0.5 text-xs">
                                        {['not_required','pending','partial','received'].map(value => <option key={value}>{value}</option>)}
                                      </select>
                                      <input value={opt.remark || ''} onChange={e => updateOption(opt, { remark: e.target.value })} disabled={!isManager}
                                        placeholder="Remark" className="col-span-2 border border-gray-200 rounded px-2 py-0.5 text-xs" />
                                      <button onClick={() => removeOption(opt)} disabled={!isManager}
                                        className="col-span-1 p-1 text-gray-400 hover:text-red-600 disabled:opacity-30 justify-self-end">
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="mt-3 text-[11px] text-gray-500">
          Submit updates CRM Purchase + Selling, turns Kunal/price ready green, writes Pricing Ledger history, and keeps Quote status as not sent.
        </p>
      </div>
    </Layout>
  );
}
