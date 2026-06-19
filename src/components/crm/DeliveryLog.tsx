/**
 * DEPLOY GUARD — process-bulk-email-campaign must be deployed with:
 *   supabase functions deploy process-bulk-email-campaign --no-verify-jwt
 * Reason: self-invocation sends only X-Bulk-Email-Worker-Secret (no browser JWT).
 * The Supabase gateway blocks unauthenticated requests unless verify_jwt=false.
 * Browser-initiated calls (pause/resume/retry) still use a valid JWT. Both paths
 * are handled inside the function's own auth check.
 */

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Mail, CheckCircle, XCircle, Clock, ChevronDown, ChevronRight,
  AlertTriangle, Paperclip, RefreshCw, PauseCircle, PlayCircle,
  Zap, Download, Trash2, StopCircle, Pencil, X as XIcon, Check as CheckIcon,
} from 'lucide-react';
import { openGmailReconnectPopup } from './gmailReconnect';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Campaign {
  id: string;
  subject: string;
  template_id: string | null;
  email_body: string | null;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  status: 'in_progress' | 'completed' | 'partial' | 'failed' | 'paused' | 'cancelled';
  has_attachments: boolean;
  started_at: string;
  completed_at: string | null;
  created_by: string;
  worker_lock_until: string | null;
  worker_lock_id: string | null;
  worker_started_at: string | null;
  worker_finished_at: string | null;
  last_worker_error: string | null;
  next_run_at: string | null;
  user_profiles?: { full_name: string | null };
}

interface Recipient {
  id: string;
  contact_id: string | null;
  company_name: string;
  email: string;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled';
  error_message: string | null;
  sent_at: string | null;
}

type CampaignFilter = 'all' | 'active' | 'partial_failed' | 'completed' | 'cancelled';
type RecipientTab = 'all' | 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled';

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function formatTime(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

async function getFreshAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  let session = data.session;
  if (!session?.access_token) throw new Error('Not authenticated');
  try {
    const payload = JSON.parse(atob(session.access_token.split('.')[1] || ''));
    const expiryMs = typeof payload.exp === 'number' ? payload.exp * 1000 : null;
    if (!expiryMs || expiryMs - Date.now() <= 2 * 60 * 1000) {
      const refreshed = await supabase.auth.refreshSession();
      if (refreshed.error || !refreshed.data.session?.access_token) {
        throw new Error(refreshed.error?.message || 'Session refresh failed');
      }
      session = refreshed.data.session;
    }
  } catch { /* use current token */ }
  return session.access_token;
}

// Stale = status in_progress, but worker lock expired AND next_run_at >90s in the past.
function isStaleInProgress(c: Campaign): boolean {
  if (c.status !== 'in_progress') return false;
  const now = Date.now();
  const lockExpired = !c.worker_lock_until || new Date(c.worker_lock_until).getTime() < now;
  const nextRunPast = !c.next_run_at || new Date(c.next_run_at).getTime() < now - 90_000;
  return lockExpired && nextRunPast;
}

function exportFailedCSV(subject: string, rows: Recipient[]) {
  const header = ['Company Name', 'Email', 'Error'];
  const data = rows.map(r => [r.company_name, r.email, r.error_message || '']);
  const csv = [header, ...data]
    .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `failed-${subject.replace(/[^a-z0-9]/gi, '-').slice(0, 30)}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DeliveryLog() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;

  // Campaign list
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [campaignFilter, setCampaignFilter] = useState<CampaignFilter>('all');
  const [hideCancelled, setHideCancelled] = useState(false);
  // Summary card click sets a recipient tab filter for all campaigns
  const [summaryFilter, setSummaryFilter] = useState<RecipientTab | null>(null);

  // Expanded campaign
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<Record<string, Recipient[]>>({});
  const [recipientsLoading, setRecipientsLoading] = useState<string | null>(null);
  // Per-campaign recipient tab. Falls back to summaryFilter, then 'all'.
  const [recipientTabs, setRecipientTabs] = useState<Record<string, RecipientTab>>({});

  // Action loading states
  const [stoppingCampaigns, setStoppingCampaigns] = useState<Record<string, boolean>>({});
  const [resumingCampaigns, setResumingCampaigns] = useState<Record<string, boolean>>({});
  const [wakingWorker, setWakingWorker] = useState<Record<string, boolean>>({});
  const [cancellingPending, setCancellingPending] = useState<Record<string, boolean>>({});
  const [clearingFailed, setClearingFailed] = useState<Record<string, boolean>>({});
  const [retryingRecipients, setRetryingRecipients] = useState<Record<string, boolean>>({});
  const [retryingCampaigns, setRetryingCampaigns] = useState<Record<string, boolean>>({});
  const [retryResult, setRetryResult] = useState<Record<string, { type: 'success' | 'error'; message: string }>>({});
  const [archiving, setArchiving] = useState(false);

  // Inline email editing
  const [editingEmailId, setEditingEmailId] = useState<string | null>(null);
  const [editEmailValue, setEditEmailValue] = useState('');
  const [savingEmailId, setSavingEmailId] = useState<string | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  // Summary stats (across recent 500 recipients)
  const [queueStats, setQueueStats] = useState({ pending: 0, sent: 0, failed: 0 });

  useEffect(() => { loadCampaigns(); }, []);

  useEffect(() => {
    const id = window.setInterval(async () => {
      await loadCampaigns();
      if (!expandedId) return;
      const { data } = await supabase
        .from('bulk_email_recipients')
        .select('id, contact_id, company_name, email, status, error_message, sent_at')
        .eq('campaign_id', expandedId)
        .order('status');
      if (data) setRecipients(prev => ({ ...prev, [expandedId]: data }));
    }, 10_000);
    return () => window.clearInterval(id);
  }, [expandedId]);

  useEffect(() => {
    if (editingEmailId && editInputRef.current) editInputRef.current.focus();
  }, [editingEmailId]);

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadCampaigns = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('bulk_email_campaigns')
      .select('*, user_profiles(full_name)')
      .order('started_at', { ascending: false })
      .limit(100);
    setCampaigns(data || []);
    setLastRefreshed(new Date());

    const { data: recipSummary } = await supabase
      .from('bulk_email_recipients')
      .select('status')
      .order('created_at', { ascending: false })
      .limit(500);
    const rows = recipSummary || [];
    setQueueStats({
      pending: rows.filter(r => r.status === 'pending').length,
      sent: rows.filter(r => r.status === 'sent').length,
      failed: rows.filter(r => r.status === 'failed').length,
    });
    setLoading(false);
  };

  const loadRecipients = async (campaignId: string) => {
    const { data } = await supabase
      .from('bulk_email_recipients')
      .select('id, contact_id, company_name, email, status, error_message, sent_at')
      .eq('campaign_id', campaignId)
      .order('status');
    if (data) setRecipients(prev => ({ ...prev, [campaignId]: data }));
  };

  const handleRefresh = async () => {
    await loadCampaigns();
    if (expandedId) await loadRecipients(expandedId);
  };

  // ── Campaign expand ─────────────────────────────────────────────────────────

  const toggleExpand = async (id: string) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!recipients[id]) {
      setRecipientsLoading(id);
      await loadRecipients(id);
      setRecipientsLoading(null);
    }
  };

  const getRecipientTab = (campaignId: string): RecipientTab =>
    recipientTabs[campaignId] ?? summaryFilter ?? 'all';

  const setRecipientTab = (campaignId: string, tab: RecipientTab) => {
    setSummaryFilter(null); // clear global filter when user picks a specific tab
    setRecipientTabs(prev => ({ ...prev, [campaignId]: tab }));
  };

  // ── Campaign actions ────────────────────────────────────────────────────────

  const handlePauseCampaign = async (campaignId: string) => {
    if (!window.confirm('Pause this campaign? Pending emails will not be sent until resumed.')) return;
    setStoppingCampaigns(prev => ({ ...prev, [campaignId]: true }));
    try {
      const { error } = await supabase.from('bulk_email_campaigns').update({
        status: 'paused', worker_lock_until: null, worker_lock_id: null,
      }).eq('id', campaignId);
      if (error) throw error;
      setCampaigns(prev => prev.map(c =>
        c.id === campaignId ? { ...c, status: 'paused', worker_lock_until: null } : c
      ));
    } catch (err: any) {
      alert(`Failed to pause: ${err.message}`);
    } finally {
      setStoppingCampaigns(prev => ({ ...prev, [campaignId]: false }));
    }
  };

  const handleResumeCampaign = async (campaignId: string) => {
    setResumingCampaigns(prev => ({ ...prev, [campaignId]: true }));
    try {
      // Reset stuck 'sending' and 'failed' recipients to pending. NEVER touch 'sent'.
      await supabase.from('bulk_email_recipients')
        .update({ status: 'pending', error_message: null, error_code: null, completed_at: null })
        .eq('campaign_id', campaignId)
        .in('status', ['sending', 'failed']);

      const { error } = await supabase.from('bulk_email_campaigns').update({
        status: 'in_progress',
        completed_at: null,
        next_run_at: new Date().toISOString(),
        worker_lock_until: null,
        worker_lock_id: null,
      }).eq('id', campaignId);
      if (error) throw error;

      await wakeWorkerFetch(campaignId);
      await loadCampaigns();
      await loadRecipients(campaignId);
    } catch (err: any) {
      handleGmailError(err, 'Failed to resume campaign');
    } finally {
      setResumingCampaigns(prev => ({ ...prev, [campaignId]: false }));
    }
  };

  const handleWakeWorker = async (campaignId: string) => {
    setWakingWorker(prev => ({ ...prev, [campaignId]: true }));
    try {
      await supabase.from('bulk_email_campaigns')
        .update({ next_run_at: new Date().toISOString() })
        .eq('id', campaignId);
      await wakeWorkerFetch(campaignId);
      await loadCampaigns();
    } catch (err: any) {
      alert(`Failed to wake worker: ${err.message}`);
    } finally {
      setWakingWorker(prev => ({ ...prev, [campaignId]: false }));
    }
  };

  const handleCancelPending = async (campaignId: string) => {
    if (!window.confirm('Cancel all pending recipients? They will be marked cancelled and will not be sent.')) return;
    setCancellingPending(prev => ({ ...prev, [campaignId]: true }));
    try {
      // NEVER touch status='sent'
      await supabase.from('bulk_email_recipients')
        .update({ status: 'cancelled' })
        .eq('campaign_id', campaignId)
        .in('status', ['pending', 'sending']);

      const { data: counts } = await supabase.rpc('refresh_bulk_email_campaign_counts', { p_campaign_id: campaignId });
      const c = Array.isArray(counts) ? counts[0] : counts;
      const pending = Number(c?.pending_count || 0);
      const sending = Number(c?.sending_count || 0);
      const sent = Number(c?.sent_count || 0);
      const failed = Number(c?.failed_count || 0);

      if (pending === 0 && sending === 0) {
        const newStatus: Campaign['status'] = failed === 0
          ? (sent === 0 ? 'cancelled' : 'completed')
          : (sent === 0 ? 'failed' : 'partial');
        await supabase.from('bulk_email_campaigns').update({
          status: newStatus,
          worker_lock_until: null,
          worker_lock_id: null,
          completed_at: new Date().toISOString(),
        }).eq('id', campaignId);
      }

      await loadCampaigns();
      await loadRecipients(campaignId);
    } catch (err: any) {
      alert(`Failed to cancel pending: ${err.message}`);
    } finally {
      setCancellingPending(prev => ({ ...prev, [campaignId]: false }));
    }
  };

  const handleClearFailed = async (campaignId: string) => {
    const failedRows = (recipients[campaignId] || []).filter(r => r.status === 'failed');
    if (failedRows.length === 0) return;
    if (!window.confirm(
      `Mark ${failedRows.length} failed recipient${failedRows.length === 1 ? '' : 's'} as cancelled? ` +
      'Sent emails are not affected. This action removes the failure logs.'
    )) return;

    setClearingFailed(prev => ({ ...prev, [campaignId]: true }));
    try {
      const failedIds = failedRows.map(r => r.id);
      // Update only the specific failed IDs — NEVER touches sent rows
      await supabase.from('bulk_email_recipients')
        .update({ status: 'cancelled' })
        .in('id', failedIds);

      const { data: counts } = await supabase.rpc('refresh_bulk_email_campaign_counts', { p_campaign_id: campaignId });
      const c = Array.isArray(counts) ? counts[0] : counts;
      const pending = Number(c?.pending_count || 0);
      const sending = Number(c?.sending_count || 0);
      const sent = Number(c?.sent_count || 0);
      const failed = Number(c?.failed_count || 0);

      if (pending === 0 && sending === 0 && failed === 0) {
        await supabase.from('bulk_email_campaigns').update({
          status: sent > 0 ? 'completed' : 'cancelled',
          completed_at: new Date().toISOString(),
        }).eq('id', campaignId);
      }

      await loadCampaigns();
      await loadRecipients(campaignId);
    } catch (err: any) {
      alert(`Failed to clear failed logs: ${err.message}`);
    } finally {
      setClearingFailed(prev => ({ ...prev, [campaignId]: false }));
    }
  };

  // ── Recipient actions ────────────────────────────────────────────────────────

  const retryFailedRecipients = async (campaignId: string, recipientIds?: string[]) => {
    const targetRecipients = (recipients[campaignId] || []).filter(r =>
      r.status === 'failed' && (!recipientIds || recipientIds.includes(r.id))
    );
    if (targetRecipients.length === 0) return;

    if (recipientIds) {
      setRetryingRecipients(prev => {
        const next = { ...prev };
        targetRecipients.forEach(r => { next[r.id] = true; });
        return next;
      });
    } else {
      setRetryingCampaigns(prev => ({ ...prev, [campaignId]: true }));
    }
    setRetryResult(prev => ({ ...prev, [campaignId]: { type: 'success', message: 'Retry in progress…' } }));

    try {
      const { data: campaign, error: campaignErr } = await supabase
        .from('bulk_email_campaigns')
        .select('id, email_body, template_id')
        .eq('id', campaignId)
        .single();
      if (campaignErr || !campaign) throw new Error('Campaign metadata not found');

      if (!campaign.email_body && campaign.template_id) {
        const { data: tpl } = await supabase
          .from('crm_email_templates').select('body').eq('id', campaign.template_id).single();
        if (tpl?.body) {
          await supabase.from('bulk_email_campaigns').update({ email_body: tpl.body }).eq('id', campaignId);
          campaign.email_body = tpl.body;
        }
      }
      if (!campaign.email_body) throw new Error(
        'Campaign body is missing — the original email body was not saved and no template is linked. Create a new campaign.'
      );

      const retryIds = targetRecipients.map(r => r.id);
      // Reset only the targeted failed rows — NEVER touches sent rows
      const { error: resetErr } = await supabase.from('bulk_email_recipients').update({
        status: 'pending',
        error_message: null,
        error_code: null,
        completed_at: null,
        http_status: null,
        provider_response: null,
      }).in('id', retryIds);
      if (resetErr) throw resetErr;

      await supabase.from('bulk_email_campaigns').update({
        status: 'in_progress',
        completed_at: null,
        next_run_at: new Date().toISOString(),
      }).eq('id', campaignId);

      await wakeWorkerFetch(campaignId);

      await loadCampaigns();
      await loadRecipients(campaignId);

      setRetryResult(prev => ({
        ...prev,
        [campaignId]: {
          type: 'success',
          message: `Retry queued for ${targetRecipients.length} recipient${targetRecipients.length === 1 ? '' : 's'}.`,
        },
      }));
    } catch (err: any) {
      const errMsg = err?.message || 'Failed to retry recipients.';
      if (isGmailError(errMsg)) {
        if (window.confirm('Your Gmail login has expired. Reconnect Gmail now?')) openGmailReconnectPopup();
      }
      setRetryResult(prev => ({ ...prev, [campaignId]: { type: 'error', message: errMsg } }));
    } finally {
      if (recipientIds) {
        setRetryingRecipients(prev => {
          const next = { ...prev };
          targetRecipients.forEach(r => { delete next[r.id]; });
          return next;
        });
      } else {
        setRetryingCampaigns(prev => ({ ...prev, [campaignId]: false }));
      }
    }
  };

  const handleEditEmailStart = (r: Recipient) => {
    setEditingEmailId(r.id);
    setEditEmailValue(r.email);
  };

  const handleSaveEmail = async (recipientId: string, campaignId: string) => {
    const newEmail = editEmailValue.trim();
    if (!newEmail || !newEmail.includes('@')) { alert('Please enter a valid email address.'); return; }
    setSavingEmailId(recipientId);
    try {
      // Update email field only. Status stays 'failed' — only update if still failed.
      const { error } = await supabase.from('bulk_email_recipients')
        .update({ email: newEmail })
        .eq('id', recipientId)
        .eq('status', 'failed');
      if (error) throw error;

      // Update local state email so the retry below uses the correct address
      setRecipients(prev => ({
        ...prev,
        [campaignId]: (prev[campaignId] || []).map(r =>
          r.id === recipientId ? { ...r, email: newEmail } : r
        ),
      }));
      setEditingEmailId(null);

      // Auto-retry this single recipient now that email is corrected
      await retryFailedRecipients(campaignId, [recipientId]);
    } catch (err: any) {
      alert(`Failed to save email: ${err.message}`);
    } finally {
      setSavingEmailId(null);
    }
  };

  const handleCancelSinglePending = async (recipientId: string, campaignId: string) => {
    await supabase.from('bulk_email_recipients')
      .update({ status: 'cancelled' })
      .eq('id', recipientId)
      .eq('status', 'pending'); // guard: only cancel if still pending
    setRecipients(prev => ({
      ...prev,
      [campaignId]: (prev[campaignId] || []).map(r =>
        r.id === recipientId ? { ...r, status: 'cancelled' as const } : r
      ),
    }));
  };

  // ── Archive old campaigns ────────────────────────────────────────────────────

  const handleArchiveOld = async () => {
    if (!window.confirm('Archive all failed/partial campaigns older than 30 days? They will be set to cancelled.')) return;
    setArchiving(true);
    try {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      await supabase.from('bulk_email_campaigns')
        .update({ status: 'cancelled' })
        .in('status', ['failed', 'partial'])
        .lt('started_at', cutoff);
      await loadCampaigns();
    } catch (err: any) {
      alert(`Archive failed: ${err.message}`);
    } finally {
      setArchiving(false);
    }
  };

  // ── Internal helpers ─────────────────────────────────────────────────────────

  const wakeWorkerFetch = async (campaignId: string) => {
    const token = await getFreshAccessToken();
    const res = await fetch(`${supabaseUrl}/functions/v1/process-bulk-email-campaign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ campaignId }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) throw new Error(json.error || `Worker HTTP ${res.status}`);
  };

  const isGmailError = (msg: string) =>
    msg.includes('TOKEN_REAUTH_REQUIRED') || msg.includes('Failed to refresh access token') ||
    msg.includes('invalid_grant') || msg.includes('GMAIL_TOKEN_INVALID');

  const handleGmailError = (err: any, fallback: string) => {
    const msg = err?.message || fallback;
    if (isGmailError(msg)) {
      if (window.confirm('Your Gmail login has expired. Reconnect Gmail now?')) openGmailReconnectPopup();
    } else {
      alert(`${fallback}: ${msg}`);
    }
  };

  // ── Filtered campaign list ───────────────────────────────────────────────────

  const filteredCampaigns = campaigns.filter(c => {
    if (hideCancelled && c.status === 'cancelled') return false;
    if (campaignFilter === 'active') return c.status === 'in_progress' || c.status === 'paused';
    if (campaignFilter === 'partial_failed') return c.status === 'partial' || c.status === 'failed';
    if (campaignFilter === 'completed') return c.status === 'completed';
    if (campaignFilter === 'cancelled') return c.status === 'cancelled';
    return true;
  });

  // ── Render helpers ───────────────────────────────────────────────────────────

  const statusBadge = (c: Campaign) => {
    if (c.status === 'completed') return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        <CheckCircle className="w-3 h-3" /> All sent
      </span>
    );
    if (c.status === 'paused') return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
        <PauseCircle className="w-3 h-3" /> Paused
      </span>
    );
    if (c.status === 'cancelled') return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
        <XCircle className="w-3 h-3" /> Cancelled
      </span>
    );
    if (c.status === 'in_progress') {
      if (isStaleInProgress(c)) return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
          <AlertTriangle className="w-3 h-3" /> Resume needed
        </span>
      );
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
          <span className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin inline-block" /> Sending…
        </span>
      );
    }
    if (c.status === 'failed') return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
        <XCircle className="w-3 h-3" /> All failed
      </span>
    );
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
        <AlertTriangle className="w-3 h-3" /> {c.failed_count} failed
      </span>
    );
  };

  const recipientStatusIcon = (status: Recipient['status']) => {
    if (status === 'sent') return <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />;
    if (status === 'failed') return <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />;
    if (status === 'cancelled') return <XCircle className="w-4 h-4 text-gray-300 flex-shrink-0" />;
    if (status === 'sending') return <span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0 inline-block" />;
    return <Clock className="w-4 h-4 text-gray-300 flex-shrink-0" />;
  };

  const canPause = (c: Campaign) => c.status === 'in_progress' && !isStaleInProgress(c);
  const canResume = (c: Campaign) => c.status === 'paused' || isStaleInProgress(c);
  const canWake = (c: Campaign) => c.status === 'in_progress' && isStaleInProgress(c);
  const canCancelPending = (c: Campaign) => c.status === 'in_progress' || c.status === 'paused';

  const pendingCount = (campaignId: string) =>
    (recipients[campaignId] || []).filter(r => r.status === 'pending').length;
  const failedCount = (campaignId: string) =>
    (recipients[campaignId] || []).filter(r => r.status === 'failed').length;
  const cancelledCount = (campaignId: string) =>
    (recipients[campaignId] || []).filter(r => r.status === 'cancelled').length;

  // ── Main render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Campaign Control Center</h2>
          <p className="text-sm text-gray-500 mt-0.5">Manage bulk email campaigns — pause, resume, retry, and inspect delivery status</p>
        </div>
        <div className="flex items-center gap-2">
          {lastRefreshed && (
            <span className="text-xs text-gray-400 hidden sm:inline">
              {lastRefreshed.toLocaleTimeString('id-ID')}
            </span>
          )}
          <button
            onClick={handleRefresh}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"
            title="Refresh campaigns and recipients"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Summary cards — clickable to filter recipient view */}
      {summaryFilter && (
        <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
          <span>Viewing <strong>{summaryFilter}</strong> recipients across all campaigns.</span>
          <button onClick={() => setSummaryFilter(null)} className="underline hover:no-underline ml-1">Clear</button>
        </div>
      )}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Pending Queue', value: queueStats.pending, color: 'amber', filter: 'pending' as RecipientTab },
          { label: 'Sent', value: queueStats.sent, color: 'green', filter: 'sent' as RecipientTab },
          { label: 'Failed', value: queueStats.failed, color: 'red', filter: 'failed' as RecipientTab },
        ].map(({ label, value, color, filter }) => (
          <button
            key={label}
            onClick={() => {
              setSummaryFilter(prev => prev === filter ? null : filter);
              setRecipientTabs({});
            }}
            className={`text-left rounded-lg p-3 border transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-1
              ${summaryFilter === filter
                ? `bg-${color}-100 border-${color}-400 ring-2 ring-${color}-400`
                : `bg-${color}-50 border-${color}-100 hover:border-${color}-300`
              }`}
          >
            <p className={`text-xs text-${color}-700 font-medium`}>{label}</p>
            <p className={`text-lg font-semibold text-${color}-800`}>{value}</p>
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
          {([
            ['all', 'All'],
            ['active', 'Active'],
            ['partial_failed', 'Partial / Failed'],
            ['completed', 'Completed'],
            ['cancelled', 'Cancelled'],
          ] as [CampaignFilter, string][]).map(([f, label]) => (
            <button
              key={f}
              onClick={() => setCampaignFilter(f)}
              className={`px-3 py-1.5 transition whitespace-nowrap ${campaignFilter === f ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={hideCancelled}
            onChange={e => setHideCancelled(e.target.checked)}
            className="rounded border-gray-300"
          />
          Hide cancelled
        </label>
        <button
          onClick={handleArchiveOld}
          disabled={archiving}
          className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50 transition ml-auto"
        >
          {archiving ? 'Archiving…' : 'Archive old (30d+)'}
        </button>
      </div>

      {/* Campaign list */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <span className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mr-2 inline-block" />
          Loading campaigns…
        </div>
      ) : filteredCampaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <Mail className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm">No campaigns found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredCampaigns.map(c => {
            const rTab = getRecipientTab(c.id);
            const rRows = recipients[c.id] || [];
            const filteredRows = rTab === 'all' ? rRows : rRows.filter(r => r.status === rTab);
            const failedRows = rRows.filter(r => r.status === 'failed');
            const isExpanded = expandedId === c.id;

            return (
              <div key={c.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                {/* Campaign header row */}
                <div className="flex items-stretch">
                  {/* Clickable expand area */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleExpand(c.id)}
                    onKeyDown={e => e.key === 'Enter' && toggleExpand(c.id)}
                    className="flex-1 flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition cursor-pointer min-w-0"
                  >
                    <div className="flex-shrink-0 text-gray-400">
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900 truncate text-sm">{c.subject}</span>
                        {c.has_attachments && (
                          <span className="flex items-center gap-0.5 text-xs text-gray-400">
                            <Paperclip className="w-3 h-3" /> attachment
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400 flex-wrap">
                        <span>{formatDateTime(c.started_at)}</span>
                        {c.user_profiles?.full_name && <span>by {c.user_profiles.full_name}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-center hidden sm:block">
                        <div className="text-sm font-semibold text-gray-900">{c.total_recipients}</div>
                        <div className="text-xs text-gray-400">total</div>
                      </div>
                      <div className="text-center">
                        <div className="text-sm font-semibold text-green-600">{c.sent_count}</div>
                        <div className="text-xs text-gray-400">sent</div>
                      </div>
                      {c.failed_count > 0 && (
                        <div className="text-center">
                          <div className="text-sm font-semibold text-red-600">{c.failed_count}</div>
                          <div className="text-xs text-gray-400">failed</div>
                        </div>
                      )}
                      {statusBadge(c)}
                    </div>
                  </div>

                  {/* Action buttons (outside the expand div to prevent nesting) */}
                  <div className="flex items-center px-3 border-l border-gray-100 gap-1 flex-shrink-0">
                    {canPause(c) && (
                      <button
                        onClick={() => handlePauseCampaign(c.id)}
                        disabled={stoppingCampaigns[c.id]}
                        title="Pause"
                        className="p-1.5 rounded-md text-yellow-600 hover:bg-yellow-50 disabled:opacity-50 transition"
                      >
                        {stoppingCampaigns[c.id]
                          ? <span className="w-3.5 h-3.5 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin inline-block" />
                          : <PauseCircle className="w-4 h-4" />}
                      </button>
                    )}
                    {canResume(c) && (
                      <button
                        onClick={() => handleResumeCampaign(c.id)}
                        disabled={resumingCampaigns[c.id]}
                        title="Resume"
                        className="p-1.5 rounded-md text-blue-600 hover:bg-blue-50 disabled:opacity-50 transition"
                      >
                        {resumingCampaigns[c.id]
                          ? <span className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin inline-block" />
                          : <PlayCircle className="w-4 h-4" />}
                      </button>
                    )}
                    {canWake(c) && (
                      <button
                        onClick={() => handleWakeWorker(c.id)}
                        disabled={wakingWorker[c.id]}
                        title="Wake worker"
                        className="p-1.5 rounded-md text-orange-500 hover:bg-orange-50 disabled:opacity-50 transition"
                      >
                        {wakingWorker[c.id]
                          ? <span className="w-3.5 h-3.5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin inline-block" />
                          : <Zap className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded view */}
                {isExpanded && (
                  <div className="border-t border-gray-100">
                    {recipientsLoading === c.id ? (
                      <div className="flex items-center justify-center py-6 text-gray-400 text-sm">
                        <span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mr-2 inline-block" />
                        Loading recipients…
                      </div>
                    ) : (
                      <>
                        {/* Worker status panel */}
                        <div className="bg-gray-50 border-b border-gray-100 px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                          <div>
                            <p className="text-gray-400 uppercase tracking-wide font-medium mb-1">Counts</p>
                            <div className="space-y-0.5">
                              <span className="text-green-600 font-semibold">{c.sent_count} sent</span>
                              {c.failed_count > 0 && <> · <span className="text-red-500 font-semibold">{c.failed_count} failed</span></>}
                              {' · '}
                              <span className="text-amber-600">{pendingCount(c.id)} pending</span>
                              {cancelledCount(c.id) > 0 && <> · <span className="text-gray-400">{cancelledCount(c.id)} cancelled</span></>}
                            </div>
                          </div>
                          <div>
                            <p className="text-gray-400 uppercase tracking-wide font-medium mb-1">Worker</p>
                            <p className="text-gray-700">Started: {formatTime(c.worker_started_at)}</p>
                            <p className="text-gray-700">Finished: {formatTime(c.worker_finished_at)}</p>
                          </div>
                          <div>
                            <p className="text-gray-400 uppercase tracking-wide font-medium mb-1">Scheduling</p>
                            <p className="text-gray-700">Next run: {c.next_run_at ? formatTime(c.next_run_at) : '—'}</p>
                            <p className="text-gray-700">Lock until: {c.worker_lock_until ? formatTime(c.worker_lock_until) : '—'}</p>
                          </div>
                          {c.last_worker_error && (
                            <div className="col-span-2 sm:col-span-1">
                              <p className="text-gray-400 uppercase tracking-wide font-medium mb-1">Last error</p>
                              <p className="text-red-600 font-mono break-all">{c.last_worker_error}</p>
                            </div>
                          )}
                        </div>

                        {/* Bulk action bar */}
                        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 flex-wrap">
                          {canCancelPending(c) && (
                            <button
                              onClick={() => handleCancelPending(c.id)}
                              disabled={cancellingPending[c.id]}
                              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition"
                            >
                              <StopCircle className="w-3.5 h-3.5" />
                              {cancellingPending[c.id] ? 'Cancelling…' : 'Cancel Pending'}
                            </button>
                          )}
                          {failedRows.length > 0 && (
                            <>
                              <button
                                onClick={() => retryFailedRecipients(c.id)}
                                disabled={retryingCampaigns[c.id]}
                                className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50 transition"
                              >
                                {retryingCampaigns[c.id] ? 'Retrying…' : `Retry All Failed (${failedRows.length})`}
                              </button>
                              <button
                                onClick={() => exportFailedCSV(c.subject, failedRows)}
                                className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 transition"
                              >
                                <Download className="w-3.5 h-3.5" /> Export CSV
                              </button>
                              <button
                                onClick={() => handleClearFailed(c.id)}
                                disabled={clearingFailed[c.id]}
                                className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                {clearingFailed[c.id] ? 'Clearing…' : 'Clear Failed Logs'}
                              </button>
                            </>
                          )}
                          {retryResult[c.id] && (
                            <span className={`text-xs ml-auto ${retryResult[c.id].type === 'error' ? 'text-red-600' : 'text-green-600'}`}>
                              {retryResult[c.id].message}
                            </span>
                          )}
                        </div>

                        {/* Recipient filter tabs */}
                        <div className="flex border-b border-gray-100 px-4 gap-1 overflow-x-auto">
                          {(['all', 'pending', 'sending', 'sent', 'failed', 'cancelled'] as RecipientTab[]).map(tab => {
                            const count = tab === 'all' ? rRows.length : rRows.filter(r => r.status === tab).length;
                            if (count === 0 && tab !== 'all') return null;
                            return (
                              <button
                                key={tab}
                                onClick={() => setRecipientTab(c.id, tab)}
                                className={`text-xs py-2 px-3 border-b-2 transition whitespace-nowrap capitalize ${
                                  rTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'
                                }`}
                              >
                                {tab} ({count})
                              </button>
                            );
                          })}
                        </div>

                        {/* Recipient rows */}
                        <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
                          {filteredRows.length === 0 ? (
                            <p className="text-xs text-gray-400 text-center py-6">No recipients with status "{rTab}"</p>
                          ) : filteredRows.map(r => (
                            <div
                              key={r.id}
                              className={`flex items-start gap-3 px-4 py-2.5 ${r.status === 'failed' ? 'bg-red-50/40' : r.status === 'cancelled' ? 'opacity-50' : ''}`}
                            >
                              <div className="flex-shrink-0 mt-0.5">{recipientStatusIcon(r.status)}</div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-sm font-medium text-gray-800">{r.company_name}</span>
                                  {r.status === 'failed' && editingEmailId !== r.id && (
                                    <button
                                      onClick={() => handleEditEmailStart(r)}
                                      className="text-gray-400 hover:text-blue-600 transition"
                                      title="Edit email address"
                                    >
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>

                                {/* Inline email edit */}
                                {editingEmailId === r.id ? (
                                  <div className="flex items-center gap-1.5 mt-1">
                                    <input
                                      ref={editInputRef}
                                      type="email"
                                      value={editEmailValue}
                                      onChange={e => setEditEmailValue(e.target.value)}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') handleSaveEmail(r.id, c.id);
                                        if (e.key === 'Escape') setEditingEmailId(null);
                                      }}
                                      className="text-xs border border-blue-400 rounded px-2 py-0.5 w-48 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                    />
                                    <button
                                      onClick={() => handleSaveEmail(r.id, c.id)}
                                      disabled={savingEmailId === r.id}
                                      className="p-1 rounded text-green-600 hover:bg-green-50 disabled:opacity-50"
                                      title="Save and retry"
                                    >
                                      {savingEmailId === r.id
                                        ? <span className="w-3 h-3 border-2 border-green-500 border-t-transparent rounded-full animate-spin inline-block" />
                                        : <CheckIcon className="w-3.5 h-3.5" />}
                                    </button>
                                    <button
                                      onClick={() => setEditingEmailId(null)}
                                      className="p-1 rounded text-gray-400 hover:bg-gray-100"
                                      title="Cancel edit"
                                    >
                                      <XIcon className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-xs text-gray-400">{r.email}</span>
                                )}

                                {r.error_message && (
                                  <p className="text-xs text-red-600 mt-0.5 font-mono bg-red-50 px-1.5 py-0.5 rounded break-all">
                                    {r.error_message}
                                  </p>
                                )}
                              </div>

                              {/* Per-row actions */}
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {r.status === 'failed' && editingEmailId !== r.id && (
                                  <button
                                    onClick={() => retryFailedRecipients(c.id, [r.id])}
                                    disabled={Boolean(retryingRecipients[r.id] || retryingCampaigns[c.id])}
                                    className="text-xs px-2 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50 transition"
                                  >
                                    {retryingRecipients[r.id] ? '…' : 'Retry'}
                                  </button>
                                )}
                                {r.status === 'pending' && (
                                  <button
                                    onClick={() => handleCancelSinglePending(r.id, c.id)}
                                    className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-500 hover:bg-gray-50 transition"
                                    title="Remove from queue"
                                  >
                                    Remove
                                  </button>
                                )}
                                <div className="text-xs text-gray-400 w-20 text-right flex-shrink-0">
                                  {r.sent_at
                                    ? formatTime(r.sent_at)
                                    : r.status === 'pending' ? 'Queued'
                                    : r.status === 'cancelled' ? 'Cancelled'
                                    : r.status === 'sending' ? 'Sending…'
                                    : ''}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
