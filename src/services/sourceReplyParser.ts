import { supabase } from '../lib/supabase';

/**
 * Client wrapper around the parse-source-reply-email Edge Function.
 *
 * Review-first: the response is ONLY the AI's suggested rows. The frontend
 * shows them in an editable modal and writes to the database only after
 * user confirmation. No tokens are ever fetched in the browser.
 */

export type SourceType = 'india' | 'china' | 'local';

export interface ParsedSourceRow {
  product_name: string;
  inquiry_number: string | null;
  aceerp_no: string | null;
  offered_make: string | null;
  source_price: number | null;
  source_currency: string;
  quantity: string | null;
  availability: 'available' | 'partial' | 'na';
  document_status: 'pending' | 'received' | 'not_required' | 'partial';
  lead_time: string | null;
  remark: string | null;
  confidence: number;
  raw_excerpt: string;
}

export interface ParseSourceReplyResult {
  success: boolean;
  source_type: SourceType;
  rows: ParsedSourceRow[];
  fromEmail?: string;
  fromName?: string;
  gmailMessageId?: string | null;
  gmailThreadId?: string | null;
  error?: string;
  code?: string;
}

export interface ParseSourceReplyRequest {
  emailSubject: string;
  emailBody: string;
  fromEmail?: string;
  fromName?: string;
  receivedAt?: string;
  gmailMessageId?: string | null;
  gmailThreadId?: string | null;
  sourceTypeHint?: SourceType;
}

export async function parseSourceReplyEmail(req: ParseSourceReplyRequest): Promise<ParseSourceReplyResult> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    return { success: false, source_type: req.sourceTypeHint || 'india', rows: [], error: 'Not signed in', code: 'NO_SESSION' };
  }
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-source-reply-email`;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.session.access_token}`,
      },
      body: JSON.stringify(req),
    });
    const data = await resp.json();
    return data as ParseSourceReplyResult;
  } catch (err) {
    return {
      success: false,
      source_type: req.sourceTypeHint || 'india',
      rows: [],
      error: err instanceof Error ? err.message : 'Network error',
      code: 'NETWORK',
    };
  }
}

/**
 * Save accepted rows: writes crm_inquiry_pricing_options + updates parent
 * crm_inquiries status + logs email_inquiry_links. Best-effort link rows.
 */
export interface SaveSourceReplyArgs {
  inquiryId: string;
  sourceType: SourceType;
  row: ParsedSourceRow;
  gmailMessageId?: string | null;
  gmailThreadId?: string | null;
  parserConfidence?: number | null;
  actorId?: string | null;
}

export async function saveSourceReplyRow(args: SaveSourceReplyArgs): Promise<{ ok: boolean; error?: string }> {
  const { inquiryId, sourceType, row, gmailMessageId, gmailThreadId, parserConfidence, actorId } = args;

  // 1. Insert pricing option (NOT marked selected — Kunal picks one later)
  const { error: optErr } = await supabase
    .from('crm_inquiry_pricing_options')
    .insert({
      inquiry_id:      inquiryId,
      source_type:     sourceType,
      offered_make:    row.offered_make,
      source_price:    row.source_price,
      source_currency: row.source_currency,
      availability:    row.availability,
      document_status: row.document_status,
      remark:          [row.remark, row.lead_time ? `Lead time: ${row.lead_time}` : null].filter(Boolean).join(' · ') || null,
      is_selected:     false,
      confidence:      row.confidence,
      created_by:      actorId || null,
    });
  if (optErr) return { ok: false, error: optErr.message };

  // 2. Sync parent inquiry status (do NOT change purchase/offered prices)
  // Bump source_status to 'partial_received' if any row is NA or partial,
  // otherwise to 'received' (the caller can override after all rows save).
  const nextStatus: 'partial_received' | 'received' | 'unavailable' =
    row.availability === 'na' ? 'unavailable'
    : row.availability === 'partial' ? 'partial_received'
    : 'received';

  const docMap: Record<string, string> = {
    'received': 'received',
    'pending': 'pending',
    'partial': 'partial',
    'not_required': 'not_required',
  };

  await supabase.from('crm_inquiries').update({
    source_status: nextStatus,
    document_status: docMap[row.document_status] || 'pending',
    kunal_price_status: 'pending',           // explicitly stay pending
    updated_at: new Date().toISOString(),
  }).eq('id', inquiryId);

  // 3. Best-effort email_inquiry_links row
  if (gmailMessageId || gmailThreadId) {
    await Promise.resolve(supabase.from('email_inquiry_links').insert({
      gmail_message_id: gmailMessageId || null,
      gmail_thread_id:  gmailThreadId  || null,
      inquiry_id:       inquiryId,
      link_type:        'source_reply',
      source_reply_parser_run_at: new Date().toISOString(),
      parser_confidence: typeof parserConfidence === 'number' ? parserConfidence : row.confidence,
      created_by: actorId || null,
    })).catch(() => { /* non-critical */ });
  }

  return { ok: true };
}

/**
 * Find candidate CRM inquiries that might match a parsed row — by inquiry
 * number, AC ERP#, or product name fuzzy. Used by the review modal to
 * suggest the inquiry the user should bind the row to.
 */
export interface InquiryCandidate {
  id: string;
  inquiry_number: string;
  aceerp_no: string | null;
  product_name: string;
  specification: string | null;
  company_name: string;
  source_status: string;
}

export async function findInquiryCandidates(hint: { inquiry_number?: string | null; aceerp_no?: string | null; product_name?: string }): Promise<InquiryCandidate[]> {
  // 1. Exact inquiry_number wins
  if (hint.inquiry_number) {
    const { data } = await supabase
      .from('crm_inquiries')
      .select('id,inquiry_number,aceerp_no,product_name,specification,company_name,source_status')
      .eq('inquiry_number', hint.inquiry_number)
      .limit(5);
    if (data && data.length > 0) return data as InquiryCandidate[];
  }
  // 2. Exact AC ERP#
  if (hint.aceerp_no) {
    const { data } = await supabase
      .from('crm_inquiries')
      .select('id,inquiry_number,aceerp_no,product_name,specification,company_name,source_status')
      .eq('aceerp_no', hint.aceerp_no)
      .limit(5);
    if (data && data.length > 0) return data as InquiryCandidate[];
  }
  // 3. Fuzzy product name (open inquiries first)
  if (hint.product_name) {
    const term = hint.product_name.split(/\s+/).slice(0, 3).join(' ');
    const { data } = await supabase
      .from('crm_inquiries')
      .select('id,inquiry_number,aceerp_no,product_name,specification,company_name,source_status')
      .ilike('product_name', `%${term}%`)
      .in('source_status', ['not_sent','sent','waiting_reply','partial_received'])
      .order('created_at', { ascending: false })
      .limit(10);
    if (data) return data as InquiryCandidate[];
  }
  return [];
}
