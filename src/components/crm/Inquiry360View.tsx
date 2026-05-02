import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';

type Inquiry = {
  id: string;
  inquiry_number: string;
  company_name: string;
  product_name: string;
  specification?: string | null;
  quantity?: string | null;
  status: string;
  pipeline_status?: string | null;
  inquiry_date: string;
  contact_person?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  supplier_name?: string | null;
  offered_price?: number | null;
  offered_price_currency?: string | null;
  assigned_to?: string | null;
  customer_id?: string | null;
};

type TimelineItem = { id: string; type: 'activity' | 'email' | 'document' | 'reminder' | 'order'; title: string; detail?: string | null; at: string; };

type Reminder = { id: string; title: string; due_date: string; is_completed: boolean; };
type Email = { id: string; subject: string | null; from_email: string | null; to_email: string[] | string | null; sent_date: string | null; created_at: string; };

type StatusKey = 'new' | 'in_progress' | 'quoted' | 'follow_up_due' | 'won' | 'lost' | 'no_reply';

const statusChipMap: Record<StatusKey, string> = {
  new: 'bg-slate-100 text-slate-700',
  in_progress: 'bg-blue-100 text-blue-700',
  quoted: 'bg-indigo-100 text-indigo-700',
  follow_up_due: 'bg-amber-100 text-amber-700',
  won: 'bg-green-100 text-green-700',
  lost: 'bg-red-100 text-red-700',
  no_reply: 'bg-zinc-200 text-zinc-700',
};

const normalizeStatus = (status: string | null | undefined): StatusKey => {
  const s = (status || '').toLowerCase();
  if (['new'].includes(s)) return 'new';
  if (['won', 'po_received'].includes(s)) return 'won';
  if (['lost'].includes(s)) return 'lost';
  if (['price_quoted', 'quoted'].includes(s)) return 'quoted';
  if (['follow_up', 'negotiation'].includes(s)) return 'follow_up_due';
  if (['no_reply'].includes(s)) return 'no_reply';
  return 'in_progress';
};

const prettyStatus = (s: StatusKey) => s.replaceAll('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase());

export function Inquiry360View({ inquiries }: { inquiries: Inquiry[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [nextFollowUp, setNextFollowUp] = useState<string | null>(null);
  const [lastContactAt, setLastContactAt] = useState<string | null>(null);
  const [emails, setEmails] = useState<Email[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [requirements, setRequirements] = useState<any[]>([]);
  const [assigneeName, setAssigneeName] = useState<string>('Unassigned');

  const [filters, setFilters] = useState({ customer: '', product: '', status: 'all', assigned: '', nextDate: '' });

  const filteredInquiries = useMemo(() => inquiries.filter((i) => {
    const status = normalizeStatus(i.pipeline_status || i.status);
    if (filters.customer && !i.company_name.toLowerCase().includes(filters.customer.toLowerCase())) return false;
    if (filters.product && !i.product_name.toLowerCase().includes(filters.product.toLowerCase())) return false;
    if (filters.status !== 'all' && status !== filters.status) return false;
    if (filters.assigned && !(i.assigned_to || '').toLowerCase().includes(filters.assigned.toLowerCase())) return false;
    return true;
  }), [inquiries, filters]);

  const selected = useMemo(() => filteredInquiries.find(i => i.id === selectedId) || filteredInquiries[0], [filteredInquiries, selectedId]);

  useEffect(() => { if (filteredInquiries.length && !selectedId) setSelectedId(filteredInquiries[0].id); }, [filteredInquiries, selectedId]);

  useEffect(() => {
    const run = async () => {
      if (!selected?.id) return;
      const [activitiesRes, emailsRes, remindersRes, docsRes, ordersRes, invoicesRes, requirementsRes, assigneeRes] = await Promise.all([
        supabase.from('crm_activities').select('id,subject,description,follow_up_date,created_at,activity_type').eq('inquiry_id', selected.id).order('created_at', { ascending: false }).limit(80),
        supabase.from('crm_email_activities').select('id,subject,from_email,to_email,sent_date,created_at').eq('inquiry_id', selected.id).order('created_at', { ascending: false }).limit(80),
        supabase.from('crm_reminders').select('id,title,due_date,is_completed').eq('inquiry_id', selected.id).order('due_date', { ascending: true }),
        supabase.from('crm_product_documents').select('id,document_type,display_name,uploaded_at').eq('inquiry_id', selected.id).order('uploaded_at', { ascending: false }).limit(80),
        supabase.from('sales_orders').select('id,order_number,created_at,status').eq('inquiry_id', selected.id).limit(20),
        supabase.from('sales_invoices').select('id,invoice_number,created_at,status').eq('inquiry_id', selected.id).limit(20),
        supabase.from('import_requirements').select('id,requirement_number,status,created_at').eq('inquiry_id', selected.id).limit(20),
        selected.assigned_to ? supabase.from('user_profiles').select('full_name').eq('id', selected.assigned_to).maybeSingle() : Promise.resolve({ data: null, error: null }),
      ]);

      const activityRows = activitiesRes.data || [];
      const emailRows = emailsRes.data || [];
      const reminderRows = remindersRes.data || [];
      const docRows = docsRes.data || [];
      setEmails(emailRows as Email[]);
      setReminders(reminderRows as Reminder[]);
      setOrders(ordersRes.data || []);
      setInvoices(invoicesRes.data || []);
      setDocuments(docRows || []);
      setRequirements(requirementsRes.data || []);
      setAssigneeName((assigneeRes as any)?.data?.full_name || 'Unassigned');

      const timelineItems: TimelineItem[] = [
        ...activityRows.map((a: any) => ({ id: a.id, type: 'activity' as const, title: a.subject || a.activity_type || 'Activity', detail: a.description, at: a.created_at })),
        ...emailRows.map((e: any) => ({ id: e.id, type: 'email' as const, title: e.subject || 'Email', detail: `${e.from_email || ''}`, at: e.sent_date || e.created_at })),
        ...docRows.map((d: any) => ({ id: d.id, type: 'document' as const, title: `${d.document_type}: ${d.display_name}`, at: d.uploaded_at })),
        ...reminderRows.map((r: any) => ({ id: r.id, type: 'reminder' as const, title: r.title, detail: r.is_completed ? 'Completed' : 'Pending', at: r.due_date })),
        ...(ordersRes.data || []).map((o: any) => ({ id: o.id, type: 'order' as const, title: `SO ${o.order_number}`, detail: o.status, at: o.created_at })),
        ...(invoicesRes.data || []).map((o: any) => ({ id: o.id, type: 'order' as const, title: `Invoice ${o.invoice_number}`, detail: o.status, at: o.created_at })),
      ].sort((a, b) => +new Date(b.at) - +new Date(a.at));

      setTimeline(timelineItems);
      const upcoming = reminderRows.filter((r: any) => !r.is_completed).map((r: any) => r.due_date).sort()[0] || null;
      setNextFollowUp(upcoming);
      const lastTouch = [...activityRows.map((a: any) => a.created_at), ...emailRows.map((e: any) => e.sent_date || e.created_at)].sort().reverse()[0] || null;
      setLastContactAt(lastTouch);
    };
    run();

    const channel = supabase.channel(`inquiry-360-${selected?.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_email_activities', filter: `inquiry_id=eq.${selected?.id}` }, run)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_reminders', filter: `inquiry_id=eq.${selected?.id}` }, run)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_inquiries', filter: `id=eq.${selected?.id}` }, run)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selected?.id]);

  const overdue = nextFollowUp ? new Date(nextFollowUp) < new Date() : false;

  return <div className="space-y-3">
    <div className="grid grid-cols-1 md:grid-cols-5 gap-2 bg-white border rounded-lg p-2">
      <input className="border rounded px-2 py-1 text-sm" placeholder="Customer" value={filters.customer} onChange={(e) => setFilters({ ...filters, customer: e.target.value })} />
      <input className="border rounded px-2 py-1 text-sm" placeholder="Product" value={filters.product} onChange={(e) => setFilters({ ...filters, product: e.target.value })} />
      <select className="border rounded px-2 py-1 text-sm" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
        <option value="all">All Status</option><option value="new">New</option><option value="in_progress">In Progress</option><option value="quoted">Quoted</option><option value="follow_up_due">Follow-up Due</option><option value="won">Won</option><option value="lost">Lost</option><option value="no_reply">No Reply</option>
      </select>
      <input className="border rounded px-2 py-1 text-sm" placeholder="Assigned user id" value={filters.assigned} onChange={(e) => setFilters({ ...filters, assigned: e.target.value })} />
      <input type="date" className="border rounded px-2 py-1 text-sm" value={filters.nextDate} onChange={(e) => setFilters({ ...filters, nextDate: e.target.value })} />
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      <div className="bg-white border rounded-xl p-3 max-h-[72vh] overflow-auto">
        <h3 className="font-semibold mb-2">Inquiries</h3>
        <div className="space-y-2">{filteredInquiries.map(i => {
          const s = normalizeStatus(i.pipeline_status || i.status);
          return <button key={i.id} onClick={() => setSelectedId(i.id)} className={`w-full text-left p-2 rounded border ${selected?.id === i.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
            <div className="text-xs text-gray-500">#{i.inquiry_number}</div><div className="font-medium text-sm">{i.company_name}</div>
            <div className="text-xs text-gray-600">{i.product_name}</div>
            <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] mt-1 ${statusChipMap[s]}`}>{prettyStatus(s)}</span>
          </button>;
        })}</div>
      </div>
      <div className="bg-white border rounded-xl p-3 lg:col-span-2 max-h-[72vh] overflow-auto">
        {!selected ? <div className="text-gray-500">No inquiry selected.</div> : <>
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-semibold">Inquiry 360 • #{selected.inquiry_number}</h3>
              <p className="text-sm text-gray-600">{selected.company_name} • {selected.contact_person || '-'} • {selected.contact_email || '-'}</p>
              <p className="text-xs text-gray-500">Product: {selected.product_name} {selected.specification ? `(${selected.specification})` : ''} | Qty: {selected.quantity || '-'}</p>
              <p className="text-xs text-gray-500">Assigned: {assigneeName}</p>
            </div>
            <div className={`text-xs px-2 py-1 rounded-full ${overdue ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{nextFollowUp ? `Next: ${new Date(nextFollowUp).toLocaleDateString()}` : 'No follow-up'}</div>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <button className="px-2 py-1 border rounded">Send Email</button><button className="px-2 py-1 border rounded">Create Reminder</button><button className="px-2 py-1 border rounded">Mark Follow-up Done</button><button className="px-2 py-1 border rounded">Create Quotation/SO</button><button className="px-2 py-1 border rounded">Link Document</button>
          </div>

          <div className="grid md:grid-cols-2 gap-3 mt-3 text-sm">
            <div className="border rounded p-2"><div className="font-medium">Communication</div><div className="text-xs text-gray-600">Last contact: {lastContactAt ? new Date(lastContactAt).toLocaleString() : '-'}</div><div className="text-xs text-gray-600">Emails linked: {emails.length}</div></div>
            <div className="border rounded p-2"><div className="font-medium">Documents</div><div className="text-xs text-gray-600">Sent/pending COA, MSDS, Specs tracked in timeline.</div><div className="text-xs text-gray-600">Linked docs: {documents.length}</div></div>
            <div className="border rounded p-2"><div className="font-medium">Sales Links</div><div className="text-xs text-gray-600">SO: {orders.length} | Invoices: {invoices.length}</div></div>
            <div className="border rounded p-2"><div className="font-medium">Import Requirement</div><div className="text-xs text-gray-600">Linked requirements: {requirements.length}</div></div>
          </div>

          <div className="mt-3">
            <h4 className="font-medium text-sm">Reminders / Follow-ups ({reminders.length})</h4>
            <div className="space-y-1 mt-1">{reminders.slice(0, 5).map((r) => <div key={r.id} className={`text-xs border rounded p-1 ${!r.is_completed && new Date(r.due_date) < new Date() ? 'bg-red-50 border-red-200' : ''}`}>{r.title} • {new Date(r.due_date).toLocaleDateString()} • {r.is_completed ? 'Done' : 'Open'}</div>)}</div>
          </div>

          <div className="mt-3">
            <h4 className="font-medium text-sm">Timeline</h4>
            <div className="space-y-1 mt-1">{timeline.map((item) => <div key={`${item.type}-${item.id}`} className="border rounded p-1 text-xs"><span className="font-medium">{item.title}</span> <span className="text-gray-500">{new Date(item.at).toLocaleString()}</span></div>)}</div>
          </div>
        </>}
      </div>
    </div>
  </div>;
}
