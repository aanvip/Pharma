import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';

export function EmailQueuePanel() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('bulk_email_recipients')
      .select('id,campaign_id,company_name,email,status,error_message,sent_at,created_at')
      .order('created_at', { ascending: false })
      .limit(500);
    setRows(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const stats = useMemo(() => ({
    pending: rows.filter(r => r.status === 'pending').length,
    sent: rows.filter(r => r.status === 'sent').length,
    failed: rows.filter(r => r.status === 'failed').length,
  }), [rows]);

  return <div className="bg-white border rounded-xl p-4">
    <h3 className="text-lg font-semibold">Centralized Email Queue</h3>
    <p className="text-sm text-gray-500">Track pending/sent/failed emails with retry support in Delivery Log.</p>
    <div className="grid grid-cols-3 gap-3 my-3">
      <div className="p-3 rounded bg-amber-50 text-amber-700 text-sm">Pending: {stats.pending}</div>
      <div className="p-3 rounded bg-green-50 text-green-700 text-sm">Sent: {stats.sent}</div>
      <div className="p-3 rounded bg-red-50 text-red-700 text-sm">Failed: {stats.failed}</div>
    </div>
    <div className="max-h-80 overflow-auto border rounded">
      {loading ? <div className="p-4 text-sm text-gray-500">Loading…</div> : rows.map(r => <div key={r.id} className="p-2 border-b text-sm">
        <div className="flex justify-between"><span>{r.company_name || '-'}</span><span className="text-xs uppercase">{r.status}</span></div>
        <div className="text-xs text-gray-500">{r.email}</div>
        {r.error_message && <div className="text-xs text-red-600">{r.error_message}</div>}
      </div>)}
    </div>
  </div>;
}
