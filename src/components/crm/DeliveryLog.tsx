import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Mail, CheckCircle, XCircle, Clock, ChevronDown, ChevronRight,
  AlertTriangle, Paperclip, RefreshCw, PauseCircle, PlayCircle
} from 'lucide-react';
import { openGmailReconnectPopup } from './gmailReconnect';

interface Campaign {
  id: string;
  subject: string;
  template_id: string | null;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  status: 'in_progress' | 'completed' | 'partial' | 'failed' | 'paused' | 'cancelled';
  has_attachments: boolean;
  started_at: string;
  completed_at: string | null;
  created_by: string;
  worker_lock_until: string | null;
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

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function getJwtExpiryMs(accessToken: string): number | null {
  try {
    const payload = JSON.parse(atob(accessToken.split('.')[1] || ''));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

async function getFreshAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  let session = data.session;
  if (!session?.access_token) throw new Error('Not authenticated');

  const expiryMs = getJwtExpiryMs(session.access_token);
  const refreshBufferMs = 2 * 60 * 1000;
  if (!expiryMs || expiryMs - Date.now() <= refreshBufferMs) {
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.error || !refreshed.data.session?.access_token) {
      throw new Error(refreshed.error?.message || 'Session refresh failed');
    }
    session = refreshed.data.session;
  }

  return session.access_token;
}

// A campaign shows as stale when: status is in_progress but the worker lock has expired
// AND next_run_at is in the past (with 90s grace to allow for scheduling jitter).
function isStaleInProgress(c: Campaign): boolean {
  if (c.status !== 'in_progress') return false;
  const now = Date.now();
  const lockExpired = !c.worker_lock_until || new Date(c.worker_lock_until).getTime() < now;
  const nextRunPast = !c.next_run_at || new Date(c.next_run_at).getTime() < now - 90_000;
  return lockExpired && nextRunPast;
}

export function DeliveryLog() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<Record<string, Recipient[]>>({});
  const [recipientsLoading, setRecipientsLoading] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'partial' | 'failed'>('all');
  const [retryingRecipients, setRetryingRecipients] = useState<Record<string, boolean>>({});
  const [retryingCampaigns, setRetryingCampaigns] = useState<Record<string, boolean>>({});
  const [retryResult, setRetryResult] = useState<Record<string, { type: 'success' | 'error'; message: string }>>({});
  const [stoppingCampaigns, setStoppingCampaigns] = useState<Record<string, boolean>>({});
  const [resumingCampaigns, setResumingCampaigns] = useState<Record<string, boolean>>({});
  const [queueStats, setQueueStats] = useState({ pending: 0, sent: 0, failed: 0 });

  useEffect(() => {
    loadCampaigns();
  }, []);

  useEffect(() => {
    const id = window.setInterval(async () => {
      await loadCampaigns();
      if (!expandedId) return;
      const { data } = await supabase
        .from('bulk_email_recipients')
        .select('id, contact_id, company_name, email, status, error_message, sent_at')
        .eq('campaign_id', expandedId)
        .order('status', { ascending: true });
      setRecipients(prev => ({ ...prev, [expandedId]: data || [] }));
    }, 10000);
    return () => window.clearInterval(id);
  }, [expandedId]);

  const loadCampaigns = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('bulk_email_campaigns')
      .select('*, user_profiles(full_name)')
      .order('started_at', { ascending: false })
      .limit(100);
    setCampaigns(data || []);
    setLastRefreshed(new Date());

    const { data: recipientsSummary } = await supabase
      .from('bulk_email_recipients')
      .select('status')
      .order('created_at', { ascending: false })
      .limit(500);

    const rows = recipientsSummary || [];
    setQueueStats({
      pending: rows.filter(r => r.status === 'pending').length,
      sent: rows.filter(r => r.status === 'sent').length,
      failed: rows.filter(r => r.status === 'failed').length,
    });
    setLoading(false);
  };

  const handleRefresh = async () => {
    await loadCampaigns();
    if (!expandedId) return;
    const { data } = await supabase
      .from('bulk_email_recipients')
      .select('id, contact_id, company_name, email, status, error_message, sent_at')
      .eq('campaign_id', expandedId)
      .order('status', { ascending: true });
    setRecipients(prev => ({ ...prev, [expandedId]: data || [] }));
  };

  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (recipients[id]) return;

    setRecipientsLoading(id);
    const { data } = await supabase
      .from('bulk_email_recipients')
      .select('id, contact_id, company_name, email, status, error_message, sent_at')
      .eq('campaign_id', id)
      .order('status', { ascending: true });
    setRecipients(prev => ({ ...prev, [id]: data || [] }));
    setRecipientsLoading(null);
  };

  const handlePauseCampaign = async (campaignId: string) => {
    if (!window.confirm('Pause this campaign? Pending emails will not be sent until resumed.')) return;

    setStoppingCampaigns(prev => ({ ...prev, [campaignId]: true }));
    try {
      const { error } = await supabase
        .from('bulk_email_campaigns')
        .update({
          status: 'paused',
          worker_lock_until: null,
          worker_lock_id: null,
        })
        .eq('id', campaignId);
      if (error) throw error;

      setCampaigns(prev => prev.map(c => c.id === campaignId
        ? { ...c, status: 'paused', worker_lock_until: null }
        : c
      ));
    } catch (err: any) {
      alert(`Failed to pause campaign: ${err.message}`);
    } finally {
      setStoppingCampaigns(prev => ({ ...prev, [campaignId]: false }));
    }
  };

  const handleResumeCampaign = async (campaignId: string) => {
    setResumingCampaigns(prev => ({ ...prev, [campaignId]: true }));
    try {
      // Reset stuck 'sending' and 'failed' recipients back to pending.
      // Never touch 'sent' rows.
      await supabase
        .from('bulk_email_recipients')
        .update({ status: 'pending', error_message: null, error_code: null, completed_at: null })
        .eq('campaign_id', campaignId)
        .in('status', ['sending', 'failed']);

      const { error: campaignErr } = await supabase
        .from('bulk_email_campaigns')
        .update({
          status: 'in_progress',
          completed_at: null,
          next_run_at: new Date().toISOString(),
          worker_lock_until: null,
          worker_lock_id: null,
        })
        .eq('id', campaignId);
      if (campaignErr) throw campaignErr;

      // Wake the worker. With verify_jwt=false on this function, a JWT is still
      // accepted and is the correct auth path for browser-initiated calls.
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const accessToken = await getFreshAccessToken();
      const response = await fetch(`${supabaseUrl}/functions/v1/process-bulk-email-campaign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ campaignId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.error || `Worker start failed: HTTP ${response.status}`);
      }

      await loadCampaigns();
      if (expandedId === campaignId) {
        const { data } = await supabase
          .from('bulk_email_recipients')
          .select('id, contact_id, company_name, email, status, error_message, sent_at')
          .eq('campaign_id', campaignId)
          .order('status', { ascending: true });
        setRecipients(prev => ({ ...prev, [campaignId]: data || [] }));
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Failed to resume campaign.';
      const needsReauth = errMsg.includes('TOKEN_REAUTH_REQUIRED')
        || errMsg.includes('Failed to refresh access token')
        || errMsg.includes('invalid_grant')
        || errMsg.includes('GMAIL_TOKEN_INVALID');
      if (needsReauth) {
        const shouldReconnect = window.confirm('Your Gmail login has expired. Reconnect Gmail now?');
        if (shouldReconnect) openGmailReconnectPopup();
      } else {
        alert(`Failed to resume campaign: ${errMsg}`);
      }
    } finally {
      setResumingCampaigns(prev => ({ ...prev, [campaignId]: false }));
    }
  };

  const filteredCampaigns = campaigns.filter(c => {
    if (filter === 'all') return true;
    if (filter === 'partial') return c.status === 'partial';
    if (filter === 'failed') return c.status === 'failed' || c.failed_count > 0;
    return true;
  });

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
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
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
          <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /> Sending…
        </span>
      );
    }
    if (c.status === 'failed') return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
        <XCircle className="w-3 h-3" /> All failed
      </span>
    );
    // partial
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
        <AlertTriangle className="w-3 h-3" /> {c.failed_count} failed
      </span>
    );
  };

  const recipientStatusIcon = (status: Recipient['status']) => {
    if (status === 'sent') return <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />;
    if (status === 'failed') return <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />;
    if (status === 'cancelled') return <XCircle className="w-4 h-4 text-gray-400 flex-shrink-0" />;
    return <Clock className="w-4 h-4 text-gray-300 flex-shrink-0" />;
  };

  const retryFailedRecipients = async (campaignId: string, recipientIds?: string[]) => {
    const targetRecipients = (recipients[campaignId] || []).filter(r =>
      r.status === 'failed' && (!recipientIds || recipientIds.includes(r.id))
    );

    if (targetRecipients.length === 0) return;

    if (recipientIds) {
      const next = { ...retryingRecipients };
      targetRecipients.forEach(r => { next[r.id] = true; });
      setRetryingRecipients(next);
    } else {
      setRetryingCampaigns(prev => ({ ...prev, [campaignId]: true }));
    }
    setRetryResult(prev => ({ ...prev, [campaignId]: { type: 'success', message: 'Retry in progress…' } }));

    try {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) throw new Error('Not authenticated');

      const { data: campaign, error: campaignErr } = await supabase
        .from('bulk_email_campaigns')
        .select('id, email_body, template_id')
        .eq('id', campaignId)
        .single();

      if (campaignErr || !campaign) throw new Error('Campaign metadata not found');

      if (!campaign.email_body && campaign.template_id) {
        const { data: tpl } = await supabase
          .from('crm_email_templates')
          .select('body')
          .eq('id', campaign.template_id)
          .single();
        if (tpl?.body) {
          await supabase
            .from('bulk_email_campaigns')
            .update({ email_body: tpl.body })
            .eq('id', campaignId);
          campaign.email_body = tpl.body;
        }
      }

      if (!campaign.email_body) throw new Error('Campaign body is missing — the original email body was not saved and no template is linked. Please create a new campaign.');

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const retryIds = targetRecipients.map(r => r.id);
      const { error: resetErr } = await supabase
        .from('bulk_email_recipients')
        .update({
          status: 'pending',
          error_message: null,
          error_code: null,
          completed_at: null,
          http_status: null,
          provider_response: null,
        })
        .in('id', retryIds);
      if (resetErr) throw resetErr;

      await supabase
        .from('bulk_email_campaigns')
        .update({
          status: 'in_progress',
          completed_at: null,
          next_run_at: new Date().toISOString(),
        })
        .eq('id', campaignId);

      const accessToken = await getFreshAccessToken();
      const response = await fetch(`${supabaseUrl}/functions/v1/process-bulk-email-campaign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ campaignId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.error || `Worker start failed: HTTP ${response.status}`);
      }

      const { data: refreshedRows } = await supabase
        .from('bulk_email_recipients')
        .select('id, contact_id, company_name, email, status, error_message, sent_at')
        .eq('campaign_id', campaignId);

      const totalSent = (refreshedRows || []).filter(r => r.status === 'sent').length;
      const totalFailed = (refreshedRows || []).filter(r => r.status === 'failed').length;

      setRecipients(prev => ({ ...prev, [campaignId]: refreshedRows || [] }));
      setCampaigns(prev => prev.map(c => c.id === campaignId
        ? { ...c, sent_count: totalSent, failed_count: totalFailed, status: 'in_progress' }
        : c
      ));
      setRetryResult(prev => ({
        ...prev,
        [campaignId]: {
          type: 'success',
          message: `Retry queued for ${targetRecipients.length} failed recipient${targetRecipients.length === 1 ? '' : 's'}.`,
        },
      }));
    } catch (err: any) {
      const errMsg = err?.message || 'Failed to retry recipients.';
      const needsReauth = errMsg.includes('TOKEN_REAUTH_REQUIRED')
        || errMsg.includes('Failed to refresh access token')
        || errMsg.includes('invalid_grant')
        || errMsg.includes('GMAIL_TOKEN_INVALID');

      if (needsReauth) {
        const shouldReconnect = window.confirm('Your Gmail login has expired. Reconnect Gmail now?');
        if (shouldReconnect) openGmailReconnectPopup();
      }

      setRetryResult(prev => ({
        ...prev,
        [campaignId]: { type: 'error', message: errMsg },
      }));
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

  const canPause = (c: Campaign) => c.status === 'in_progress' && !isStaleInProgress(c);
  const canResume = (c: Campaign) => c.status === 'paused' || isStaleInProgress(c);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Email Delivery Log</h2>
          <p className="text-sm text-gray-500 mt-0.5">Full history of all bulk email campaigns and per-recipient outcomes</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            {(['all', 'partial', 'failed'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 transition ${filter === f ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                {f === 'all' ? 'All' : f === 'partial' ? 'Partial' : 'Failed'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            {lastRefreshed && (
              <span className="text-xs text-gray-400 hidden sm:inline">
                {lastRefreshed.toLocaleTimeString('id-ID')}
              </span>
            )}
            <button
              onClick={handleRefresh}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
          <p className="text-xs text-amber-700">Pending Queue</p>
          <p className="text-lg font-semibold text-amber-800">{queueStats.pending}</p>
        </div>
        <div className="bg-green-50 border border-green-100 rounded-lg p-3">
          <p className="text-xs text-green-700">Sent</p>
          <p className="text-lg font-semibold text-green-800">{queueStats.sent}</p>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-lg p-3">
          <p className="text-xs text-red-700">Failed</p>
          <p className="text-lg font-semibold text-red-800">{queueStats.failed}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mr-2" />
          Loading campaigns…
        </div>
      ) : filteredCampaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <Mail className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm">No campaigns found</p>
          {filter !== 'all' && <p className="text-xs mt-1">Try switching to "All"</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredCampaigns.map(c => (
            <div key={c.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              {/* Campaign row — split into clickable expand area + action buttons */}
              <div className="flex items-stretch">
                <div
                  className="flex-1 flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition cursor-pointer text-left"
                  onClick={() => toggleExpand(c.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && toggleExpand(c.id)}
                >
                  <div className="flex-shrink-0 text-gray-400">
                    {expandedId === c.id
                      ? <ChevronDown className="w-4 h-4" />
                      : <ChevronRight className="w-4 h-4" />
                    }
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900 truncate">{c.subject}</span>
                      {c.has_attachments && (
                        <span className="flex items-center gap-0.5 text-xs text-gray-400">
                          <Paperclip className="w-3 h-3" /> attachment
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                      <span>{formatDateTime(c.started_at)}</span>
                      {c.user_profiles?.full_name && <span>by {c.user_profiles.full_name}</span>}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-4 flex-shrink-0">
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

                {/* Pause / Resume action buttons — outside the expand div to avoid nesting issues */}
                {(canPause(c) || canResume(c)) && (
                  <div className="flex items-center px-3 border-l border-gray-100 gap-1.5 flex-shrink-0">
                    {canPause(c) && (
                      <button
                        onClick={() => handlePauseCampaign(c.id)}
                        disabled={stoppingCampaigns[c.id]}
                        title="Pause campaign"
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium border border-yellow-300 text-yellow-700 hover:bg-yellow-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                      >
                        {stoppingCampaigns[c.id]
                          ? <div className="w-3 h-3 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
                          : <PauseCircle className="w-3.5 h-3.5" />
                        }
                        <span className="hidden sm:inline">Pause</span>
                      </button>
                    )}
                    {canResume(c) && (
                      <button
                        onClick={() => handleResumeCampaign(c.id)}
                        disabled={resumingCampaigns[c.id]}
                        title="Resume campaign"
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                      >
                        {resumingCampaigns[c.id]
                          ? <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                          : <PlayCircle className="w-3.5 h-3.5" />
                        }
                        <span className="hidden sm:inline">Resume</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Recipients list */}
              {expandedId === c.id && (
                <div className="border-t border-gray-100">
                  {recipientsLoading === c.id ? (
                    <div className="flex items-center justify-center py-6 text-gray-400 text-sm">
                      <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mr-2" />
                      Loading recipients…
                    </div>
                  ) : (
                    <>
                      {/* Failed recipients at top, highlighted */}
                      {(recipients[c.id] || []).filter(r => r.status === 'failed').length > 0 && (
                        <div className="bg-red-50 border-b border-red-100 px-5 py-3">
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">
                              Failed — action needed
                            </p>
                            <button
                              onClick={() => retryFailedRecipients(c.id)}
                              disabled={retryingCampaigns[c.id]}
                              className="text-xs px-2.5 py-1 rounded-md border border-red-300 text-red-700 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {retryingCampaigns[c.id] ? 'Retrying…' : 'Retry all failed'}
                            </button>
                          </div>
                          {retryResult[c.id] && (
                            <p className={`text-xs mb-2 ${retryResult[c.id].type === 'error' ? 'text-red-700' : 'text-emerald-700'}`}>
                              {retryResult[c.id].message}
                            </p>
                          )}
                          <div className="space-y-2">
                            {(recipients[c.id] || []).filter(r => r.status === 'failed').map(r => (
                              <div key={r.id} className="flex items-start gap-3 bg-white rounded-lg px-3 py-2.5 border border-red-200">
                                <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-gray-800">{r.company_name}</p>
                                  <p className="text-xs text-gray-500">{r.email}</p>
                                  {r.error_message && (
                                    <p className="text-xs text-red-600 mt-0.5 font-mono bg-red-50 px-1.5 py-0.5 rounded">
                                      {r.error_message}
                                    </p>
                                  )}
                                </div>
                                <button
                                  onClick={() => retryFailedRecipients(c.id, [r.id])}
                                  disabled={Boolean(retryingRecipients[r.id] || retryingCampaigns[c.id])}
                                  className="text-xs px-2.5 py-1 rounded-md border border-red-300 text-red-700 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {retryingRecipients[r.id] ? 'Retrying…' : 'Retry'}
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* All recipients table */}
                      <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
                        {(recipients[c.id] || []).map(r => (
                          <div key={r.id} className={`flex items-center gap-3 px-5 py-2.5 ${r.status === 'failed' ? 'bg-red-50/50' : ''}`}>
                            {recipientStatusIcon(r.status)}
                            <div className="flex-1 min-w-0">
                              <span className="text-sm text-gray-800 font-medium">{r.company_name}</span>
                              <span className="text-xs text-gray-400 ml-2">{r.email}</span>
                            </div>
                            <div className="text-xs text-gray-400 flex-shrink-0">
                              {r.sent_at ? formatDateTime(r.sent_at) : r.status === 'pending' ? 'Pending' : r.status === 'cancelled' ? 'Cancelled' : ''}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
