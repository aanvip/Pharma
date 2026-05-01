import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';

type Inquiry = {
  id: string;
  inquiry_number: string;
  company_name: string;
  product_name: string;
  status: string;
  inquiry_date: string;
  supplier_name?: string | null;
  offered_price?: number | null;
  offered_price_currency?: string | null;
  assigned_to?: string | null;
  lead_id?: string | null;
  customer_id?: string | null;
  product_id?: string | null;
};

type TimelineItem = { id: string; type: 'activity'|'email'|'document'; title: string; detail?: string | null; at: string; };
type MinimalRow = Record<string, unknown> & { id: string };

const isIgnorableSupabaseError = (error: { code?: string; message?: string } | null) => {
  if (!error) return false;
  return [
    '42P01', // undefined table/relation
    '42703', // undefined column
    'PGRST116', // relation not found in schema cache
  ].includes(error.code || '');
};

const isDevelopment = import.meta.env.DEV;

const logSupabaseError = (scope: string, error: { code?: string; message?: string } | null) => {
  if (!error) return;
  if (isIgnorableSupabaseError(error)) {
    if (isDevelopment) {
      console.info(`[Inquiry360View] Optional ${scope} source unavailable: ${error.code ?? 'unknown'}`);
    }
    return;
  }
  console.error(`[Inquiry360View] Failed to load ${scope}:`, error);
};

export function Inquiry360View({ inquiries }: { inquiries: Inquiry[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusedCompany, setFocusedCompany] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [nextFollowUp, setNextFollowUp] = useState<string | null>(null);

  const selected = useMemo(() => inquiries.find(i => i.id === selectedId) || inquiries[0], [inquiries, selectedId]);
  const selectedCompany = focusedCompany || selected?.company_name || null;

  const customerSummaryRows = useMemo(
    () => inquiries
      .filter((inquiry) => (selectedCompany ? inquiry.company_name === selectedCompany : true))
      .sort((a, b) => +new Date(b.inquiry_date) - +new Date(a.inquiry_date)),
    [inquiries, selectedCompany],
  );

  useEffect(() => { if (inquiries.length && !selectedId) setSelectedId(inquiries[0].id); }, [inquiries, selectedId]);

  useEffect(() => {
    const run = async () => {
      if (!selected?.id) return;
      const activityQuery = supabase
        .from('crm_activities')
        .select('id,subject,description,follow_up_date,created_at')
        .order('created_at', { ascending: false })
        .limit(50);

      if (selected.lead_id) {
        activityQuery.eq('lead_id', selected.lead_id);
      } else if (selected.customer_id) {
        activityQuery.eq('customer_id', selected.customer_id);
      } else {
        activityQuery.limit(0);
      }

      const emailQuery = supabase
        .from('crm_email_activities')
        .select('id,subject,email_type,sent_date,created_at,to_email')
        .eq('inquiry_id', selected.id)
        .order('created_at', { ascending: false })
        .limit(50);

      const documentQuery = selected.product_id
        ? supabase
            .from('product_documents')
            .select('id,document_type,file_name,uploaded_at')
            .eq('product_id', selected.product_id)
            .order('uploaded_at', { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [], error: null });

      const [activities, emails, docs] = await Promise.all([activityQuery, emailQuery, documentQuery]);

      logSupabaseError('activities', activities.error);
      logSupabaseError('emails', emails.error);
      logSupabaseError('documents', docs.error);

      const activityRows = (activities.error ? [] : (activities.data || [])) as MinimalRow[];
      const emailRows = (emails.error ? [] : (emails.data || [])) as MinimalRow[];
      const documentRows = (docs.error ? [] : (docs.data || [])) as MinimalRow[];

      const items: TimelineItem[] = [
        ...(activityRows.map((a: any) => ({ id: a.id, type: 'activity' as const, title: a.subject || 'Activity', detail: a.description, at: a.created_at }))),
        ...(emailRows.map((e: any) => ({ id: e.id, type: 'email' as const, title: e.subject || 'Email', detail: `${e.email_type}${e.to_email ? ` → ${Array.isArray(e.to_email) ? e.to_email.join(', ') : e.to_email}` : ''}`, at: e.sent_date || e.created_at }))),
        ...(documentRows.map((d: any) => ({ id: d.id, type: 'document' as const, title: `${d.document_type}: ${d.file_name}`, at: d.uploaded_at }))),
      ].sort((a,b) => +new Date(b.at) - +new Date(a.at));

      setTimeline(items);
      const upcoming = activityRows.map((a: any) => a.follow_up_date).filter(Boolean).sort()[0] || null;
      setNextFollowUp(upcoming);
    };
    run();
  }, [selected?.customer_id, selected?.id, selected?.lead_id, selected?.product_id]);

  const overdue = nextFollowUp ? new Date(nextFollowUp) < new Date() : false;

  return <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
    <div className="bg-white border rounded-xl p-3 lg:col-span-1 max-h-[70vh] overflow-auto">
      <h3 className="font-semibold mb-2">Inquiries</h3>
      <div className="space-y-2">
        {inquiries.map(i => <div
          key={i.id}
          role="button"
          tabIndex={0}
          onClick={() => setSelectedId(i.id)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setSelectedId(i.id);
            }
          }}
          className={`w-full text-left p-2 rounded border cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-400 ${selected?.id===i.id ? 'border-blue-500 bg-blue-50':'border-gray-200'}`}
        >
          <div className="text-xs text-gray-500">#{i.inquiry_number}</div>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setFocusedCompany(i.company_name);
              setSelectedId(i.id);
            }}
            className="font-medium text-sm text-left hover:text-blue-700 hover:underline"
          >
            {i.company_name}
          </button>
          <div className="text-xs text-gray-600">{i.product_name}</div>
        </div>)}
      </div>
    </div>

    <div className="bg-white border rounded-xl p-4 lg:col-span-2 max-h-[70vh] overflow-auto">
      {!selected ? <div className="text-gray-500">No inquiry selected.</div> : <>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold">Inquiry 360 • #{selected.inquiry_number}</h3>
            <p className="text-sm text-gray-600">{selected.company_name} • {selected.product_name}</p>
            <p className="text-xs text-gray-500 mt-1">Stage: {selected.status}</p>
            <p className="text-xs text-gray-500">Owner: {selected.assigned_to || 'Unassigned'}</p>
            <button
              type="button"
              onClick={() => setFocusedCompany(selected.company_name)}
              className="mt-1 text-xs text-blue-700 hover:underline"
            >
              View all inquiries for {selected.company_name}
            </button>
          </div>
          <div className={`text-xs px-2 py-1 rounded-full flex items-center gap-1 ${overdue ? 'bg-red-100 text-red-700':'bg-amber-100 text-amber-700'}`}>
            {overdue ? <AlertTriangle className="w-3 h-3"/> : <Clock className="w-3 h-3"/>}
            {nextFollowUp ? `Next follow-up: ${new Date(nextFollowUp).toLocaleString()}` : 'No follow-up scheduled'}
          </div>
        </div>
        <div className="mt-4 border-t pt-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium">Customer inquiry summary</h4>
            {focusedCompany && (
              <button type="button" onClick={() => setFocusedCompany(null)} className="text-xs text-gray-500 hover:text-gray-700 hover:underline">
                Show all customers
              </button>
            )}
          </div>
          <div className="overflow-auto border rounded-lg">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Date</th>
                  <th className="px-3 py-2 text-left font-medium">Product</th>
                  <th className="px-3 py-2 text-left font-medium">Supplier</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">Price</th>
                </tr>
              </thead>
              <tbody>
                {customerSummaryRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-center text-gray-500">No inquiries found.</td>
                  </tr>
                ) : customerSummaryRows.map((row) => (
                  <tr key={row.id} className={`border-t ${row.id === selected.id ? 'bg-blue-50' : 'bg-white'}`}>
                    <td className="px-3 py-2 whitespace-nowrap">{row.inquiry_date ? new Date(row.inquiry_date).toLocaleDateString() : '-'}</td>
                    <td className="px-3 py-2">{row.product_name || '-'}</td>
                    <td className="px-3 py-2">{row.supplier_name || '-'}</td>
                    <td className="px-3 py-2 capitalize">{row.status || '-'}</td>
                    <td className="px-3 py-2">{row.offered_price != null ? `${row.offered_price_currency || ''} ${row.offered_price}`.trim() : 'Pending'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 border-t pt-3">
          <h4 className="font-medium mb-2">Unified Timeline (Activity + Email + Documents)</h4>
          <div className="space-y-2">
            {timeline.length === 0 ? <div className="text-sm text-gray-500">No activities, emails, or documents yet.</div> : timeline.map(item => <div key={`${item.type}-${item.id}`} className="border rounded-lg p-2">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span className={`uppercase px-2 py-0.5 rounded ${item.type==='activity'?'bg-indigo-100 text-indigo-700':item.type==='email'?'bg-cyan-100 text-cyan-700':'bg-emerald-100 text-emerald-700'}`}>{item.type}</span><span>{new Date(item.at).toLocaleString()}</span>
              </div>
              <div className="font-medium text-sm">{item.title}</div>
              {item.detail && <div className="text-xs text-gray-600">{item.detail}</div>}
            </div>)}
          </div>
        </div>
        <div className="mt-4 text-xs text-gray-600 flex items-center gap-2"><CheckCircle2 className="w-3 h-3"/> Workflow: Inquiry → Qualified → Quotation → Won/Lost</div>
      </>}
    </div>
  </div>;
}
