/**
 * One single-line status string per inquiry — never multiple stacked badges.
 * Computed purely from already-existing CRM fields so it works for any
 * inquiry without extra schema. Used by CRM table, dashboard cards, and
 * timeline summaries.
 *
 * Resolution order (first match wins):
 *   1. quote_status: won / lost           → Won / Lost
 *   2. pipeline_status: closed            → Closed
 *   3. quote_status: follow_up_due        → Follow-up Due
 *   4. quote_status: sent (or quote_sent_at present)  → Quote Sent
 *   5. price_ready=true                   → Price Ready
 *   6. source_status: received/partial    → Supplier Reply Received  (+ Kunal pending → Pricing Pending)
 *   7. source_status: waiting_reply       → Awaiting Supplier Reply
 *   8. source_status: sent                → Sourcing Sent
 *   9. source_status: unavailable         → Closed
 *  10. source_status: not_sent
 *        + source_type india/china         → Sourcing Pending
 *        + no source route                → New Inquiry
 */

export type SingleStatus =
  | 'New Inquiry'
  | 'Sourcing Pending'
  | 'Sourcing Sent'
  | 'Awaiting Supplier Reply'
  | 'Supplier Reply Received'
  | 'Pricing Pending'
  | 'Price Ready'
  | 'Quote Sent'
  | 'Follow-up Due'
  | 'Won'
  | 'Lost'
  | 'Closed';

export interface InquiryStatusInput {
  source_status?: string | null;
  document_status?: string | null;
  kunal_price_status?: string | null;
  quote_status?: string | null;
  pipeline_status?: string | null;
  price_ready?: boolean | null;
  source_type?: string | null;
  quote_sent_at?: string | null;
}

export function singleLineStatus(i: InquiryStatusInput): SingleStatus {
  const q = (i.quote_status || '').toLowerCase();
  const p = (i.pipeline_status || '').toLowerCase();
  const s = (i.source_status || '').toLowerCase();
  const k = (i.kunal_price_status || '').toLowerCase();
  const st = (i.source_type || '').toLowerCase();

  if (q === 'won' || p === 'won') return 'Won';
  if (q === 'lost' || p === 'lost') return 'Lost';
  if (p === 'closed') return 'Closed';
  if (q === 'follow_up_due') return 'Follow-up Due';
  if (q === 'sent' || i.quote_sent_at) return 'Quote Sent';
  if (i.price_ready === true) return 'Price Ready';

  if (s === 'received' || s === 'partial_received') {
    return k === 'pending' ? 'Pricing Pending' : 'Supplier Reply Received';
  }
  if (s === 'waiting_reply') return 'Awaiting Supplier Reply';
  if (s === 'sent') return 'Sourcing Sent';
  if (s === 'unavailable') return 'Closed';

  if (st === 'india' || st === 'china') return 'Sourcing Pending';
  return 'New Inquiry';
}

const COLOR: Record<SingleStatus, string> = {
  'New Inquiry':             'bg-gray-100 text-gray-700',
  'Sourcing Pending':        'bg-blue-100 text-blue-700',
  'Sourcing Sent':           'bg-sky-100 text-sky-700',
  'Awaiting Supplier Reply': 'bg-purple-100 text-purple-700',
  'Supplier Reply Received': 'bg-emerald-100 text-emerald-700',
  'Pricing Pending':         'bg-pink-100 text-pink-700',
  'Price Ready':             'bg-green-100 text-green-700',
  'Quote Sent':              'bg-indigo-100 text-indigo-700',
  'Follow-up Due':           'bg-amber-100 text-amber-700',
  'Won':                     'bg-green-200 text-green-800',
  'Lost':                    'bg-red-100 text-red-700',
  'Closed':                  'bg-gray-200 text-gray-600',
};

export function statusColor(status: SingleStatus): string {
  return COLOR[status];
}
