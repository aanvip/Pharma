import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { showToast } from '../ToastNotification';
import { applyEmailTemplateVariables } from '../../utils/crmEmailPersonalization';

interface Props { onClose: () => void; onComplete: () => void; }
interface StockRow {
  id: string; batch_number: string; current_stock: number; reserved_stock: number;
  packaging_details: string | null; expiry_date: string | null;
  products?: { product_name: string; product_code: string; };
}
interface Recipient { id: string; sourceId: string; label: string; company_name: string; email: string; contact_person: string | null; source: 'crm_contact' | 'customer'; }

export function StockUpdateEmailComposer({ onClose, onComplete }: Props) {
  const [stocks, setStocks] = useState<StockRow[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [selectedStock, setSelectedStock] = useState<Set<string>>(new Set());
  const [selectedRecipients, setSelectedRecipients] = useState<Set<string>>(new Set());
  const [subject, setSubject] = useState('Weekly Stock Update');
  const [body, setBody] = useState('Dear {{salutation}},<br/><br/>Please find our latest stock availability below:<br/>{{stock_table}}<br/>Please reply if you would like to reserve any items.<br/><br/>Best regards');
  const [followUpDays, setFollowUpDays] = useState<number | ''>('');
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<Record<string, 'pending' | 'sent' | 'failed'>>({});

  useEffect(() => { (async () => {
    const [b, cc, cu] = await Promise.all([
      supabase.from('batches').select('id,batch_number,current_stock,reserved_stock,packaging_details,expiry_date,products(product_name,product_code)').eq('is_active', true).order('expiry_date', { ascending: true }),
      supabase.from('crm_contacts').select('id,company_name,email,contact_person').not('email', 'is', null).neq('email', ''),
      supabase.from('customers').select('id,company_name,email,contact_person').not('email', 'is', null).neq('email', '').eq('is_active', true),
    ]);
    const stockRows = ((b.data || []) as StockRow[]).filter(s => (s.current_stock - (s.reserved_stock || 0)) > 0);
    setStocks(stockRows);
    const all: Recipient[] = [
      ...((cc.data || []).map((r: any) => ({ id: `crm-${r.id}`, sourceId: r.id, label: `[CRM] ${r.company_name}`, company_name: r.company_name, email: r.email, contact_person: r.contact_person, source: 'crm_contact' as const }))),
      ...((cu.data || []).map((r: any) => ({ id: `cust-${r.id}`, sourceId: r.id, label: `[Customer] ${r.company_name}`, company_name: r.company_name, email: r.email, contact_person: r.contact_person, source: 'customer' as const }))),
    ];
    setRecipients(all);
  })(); }, []);

  const stockTableHtml = useMemo(() => {
    const items = stocks.filter(s => selectedStock.has(s.id));
    const rows = items.map(s => `<tr><td>${s.products?.product_name || '-'}</td><td>${s.batch_number}</td><td>${s.current_stock - (s.reserved_stock || 0)}</td><td>${s.packaging_details || '-'}</td><td>${s.expiry_date || '-'}</td><td></td></tr>`).join('');
    return `<table border="1" cellspacing="0" cellpadding="6"><thead><tr><th>Product</th><th>Batch</th><th>Available</th><th>Pack Type</th><th>Expiry</th><th>Price</th></tr></thead><tbody>${rows}</tbody></table>`;
  }, [selectedStock, stocks]);

  const resolveContactId = async (r: Recipient): Promise<string | null> => {
    if (r.source === 'crm_contact') return r.sourceId;
    const { data } = await supabase.from('crm_contacts').select('id').eq('email', r.email).maybeSingle();
    return data?.id || null;
  };

  const send = async () => {
    const selected = recipients.filter(r => selectedRecipients.has(r.id));
    if (!selected.length || !selectedStock.size) return showToast({ type: 'error', title: 'Error', message: 'Select stock and recipients' });
    setSending(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: session } = await supabase.auth.getSession();
    if (!user || !session.session) { setSending(false); return; }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const newResults: Record<string, 'pending' | 'sent' | 'failed'> = {};

    for (const r of selected) {
      newResults[r.id] = 'pending'; setResults({ ...newResults });
      const contactId = await resolveContactId(r);
      if (!contactId) { newResults[r.id] = 'failed'; setResults({ ...newResults }); continue; }

      const personalizedSubject = applyEmailTemplateVariables(subject, r as any);
      const personalizedBody = applyEmailTemplateVariables(body.replace('{{stock_table}}', stockTableHtml), r as any);
      const toEmails = r.email.split(';').map(e => e.trim()).filter(Boolean);

      const resp = await fetch(`${supabaseUrl}/functions/v1/send-bulk-email`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.session.access_token}` },
        body: JSON.stringify({ userId: user.id, toEmails, subject: personalizedSubject, body: personalizedBody, contactId, senderName: '', isHtml: true }),
      });
      const data = await resp.json();
      if (data.success) {
        await supabase.from('crm_email_activities').insert({
          contact_id: contactId, email_type: 'sent', from_email: user.email, to_email: toEmails,
          subject: personalizedSubject, body: personalizedBody, sent_date: new Date().toISOString(), created_by: user.id,
        });
        newResults[r.id] = 'sent';
      } else newResults[r.id] = 'failed';
      setResults({ ...newResults });
    }

    if (followUpDays) {
      const dueDate = new Date(Date.now() + Number(followUpDays) * 86400000).toISOString();
      const reminders = await Promise.all(selected.map(async r => {
        const contactId = await resolveContactId(r);
        return contactId ? { contact_id: contactId, reminder_type: 'follow_up', due_date: dueDate, assigned_to: user.id, created_by: user.id, inquiry_id: null, title: `Stock update follow-up: ${r.company_name}` } : null;
      }));
      const valid = reminders.filter(Boolean);
      if (valid.length) await supabase.from('crm_reminders').insert(valid as any);
    }

    setSending(false);
    onComplete();
    showToast({ type: 'success', title: 'Done', message: 'Stock update emails processed' });
  };

  return <div className='space-y-3 p-3'>
    <h3 className='font-semibold'>Stock Update Email</h3>
    <div className='grid grid-cols-2 gap-3'>
      <div className='border rounded p-2 max-h-56 overflow-auto'>{stocks.map(s => <label key={s.id} className='block text-xs'><input type='checkbox' checked={selectedStock.has(s.id)} onChange={() => { const n = new Set(selectedStock); n.has(s.id) ? n.delete(s.id) : n.add(s.id); setSelectedStock(n); }} /> {s.products?.product_name} • {s.batch_number} • {s.current_stock - (s.reserved_stock || 0)}</label>)}</div>
      <div className='border rounded p-2 max-h-56 overflow-auto'>{recipients.map(r => <label key={r.id} className='block text-xs'><input type='checkbox' checked={selectedRecipients.has(r.id)} onChange={() => { const n = new Set(selectedRecipients); n.has(r.id) ? n.delete(r.id) : n.add(r.id); setSelectedRecipients(n); }} /> {r.label} ({r.email})</label>)}</div>
    </div>
    <input className='w-full border rounded p-2 text-sm' value={subject} onChange={e => setSubject(e.target.value)} />
    <textarea className='w-full border rounded p-2 text-sm h-40' value={body} onChange={e => setBody(e.target.value)} />
    <select className='border rounded p-2 text-sm' value={followUpDays} onChange={e => setFollowUpDays(e.target.value ? Number(e.target.value) : '')}><option value=''>No follow-up reminder</option><option value='3'>Remind in 3 days</option><option value='7'>Remind in 7 days</option></select>
    <div className='text-xs'>Delivery: sent {Object.values(results).filter(v => v === 'sent').length}, failed {Object.values(results).filter(v => v === 'failed').length}, pending {Object.values(results).filter(v => v === 'pending').length}</div>
    <div className='flex gap-2 justify-end'><button onClick={onClose} className='px-3 py-1 border rounded'>Close</button><button disabled={sending} onClick={send} className='px-3 py-1 bg-blue-600 text-white rounded'>Send</button></div>
  </div>;
}
