import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Mail, CheckCircle, XCircle, Clock, ChevronDown, ChevronRight,
  AlertTriangle, Paperclip, RefreshCw
} from 'lucide-react';
import { applyEmailTemplateVariables } from '../../utils/crmEmailPersonalization';
import { openGmailReconnectPopup } from './gmailReconnect';

interface Campaign {
  id: string;
  subject: string;
  template_id: string | null;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  status: 'in_progress' | 'completed' | 'partial' | 'failed';
  has_attachments: boolean;
  started_at: string;
  completed_at: string | null;
  created_by: string;
  user_profiles?: { full_name: string | null };
}

interface Recipient {
  id: string;
  contact_id: string | null;
  company_name: string;
  email: string;
  status: 'pending' | 'sent' | 'failed';
  error_message: string | null;
  sent_at: string | null;
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

export function DeliveryLog() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<Record<string, Recipient[]>>({});
  const [recipientsLoading, setRecipientsLoading] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'partial' | 'failed'>('all');
  const [retryingRecipients, setRetryingRecipients] = useState<Record<string, boolean>>({});
  const [retryingCampaigns, setRetryingCampaigns] = useState<Record<string, boolean>>({});
  const [retryResult, setRetryResult] = useState<Record<string, { type: 'success' | 'error'; message: string }>>({});
  const [queueStats, setQueueStats] = useState({ pending: 0, sent: 0, failed: 0 });

  useEffect(() => {
    loadCampaigns();
  }, []);

  const loadCampaigns = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('bulk_email_campaigns')
      .select('*, user_profiles(full_name)')
      .order('started_at', { ascending: false })
      .limit(100);
    setCampaigns(data || []);

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
      .order('status', { ascending: true }); // failed first
    setRecipients(prev => ({ ...prev, [id]: data || [] }));
    setRecipientsLoading(null);
  };

  const filteredCampaigns = campaigns.filter(c => {
    if (filter === 'all') return true;
    if (filter === 'partial') return c.status === 'partial';
    if (filter === 'failed') return c.status === 'failed' || c.failed_count > 0;
    return true;
  });

  const statusBadge = (status: Campaign['status'], failed: number) => {
    if (status === 'completed') return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        <CheckCircle className="w-3 h-3" /> All sent
      </span>
    );
    if (status === 'in_progress') return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
        <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /> Sending…
      </span>
    );
    if (status === 'failed') return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
        <XCircle className="w-3 h-3" /> All failed
      </span>
    );
    // partial
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
        <AlertTriangle className="w-3 h-3" /> {failed} failed
      </span>
    );
  };

  const recipientStatusIcon = (status: Recipient['status']) => {
    if (status === 'sent') return <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />;
    if (status === 'failed') return <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />;
    return <Clock className="w-4 h-4 text-gray-300 flex-shrink-0" />;
  };

  const retryFailedRecipients = async (campaignId: string, recipientIds?: string[]) => {
    const targetRecipients = (recipients[campaignId] || []).filter(r =>
      r.status === 'failed' && (!recipientIds || recipientIds.includes(r.id))
    );

    if (targetRecipients.length === 0) {
      return;
    }

    if (recipientIds) {
      const next = { ...retryingRecipients };
      targetRecipients.forEach(r => {
        next[r.id] = true;
      });
      setRetryingRecipients(next);
    } else {
      setRetryingCampaigns(prev => ({ ...prev, [campaignId]: true }));
    }
    setRetryResult(prev => ({ ...prev, [campaignId]: { type: 'success', message: 'Retry in progress…' } }));

    try {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) throw new Error('Not authenticated');
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) throw new Error('Not authenticated');

      // Read only columns that exist on bulk_email_campaigns. The email body
      // is reconstructed from the linked template.
      const { data: campaign, error: campaignErr } = await supabase
        .from('bulk_email_campaigns')
        .select('id, subject, template_id, has_attachments')
        .eq('id', campaignId)
        .single();

      if (campaignErr || !campaign) throw new Error('Campaign metadata not found');

      let campaignBody = '';
      if (campaign.template_id) {
        const { data: template } = await supabase
          .from('crm_email_templates')
          .select('body')
          .eq('id', campaign.template_id)
          .maybeSingle();
        if (template?.body) {
          campaignBody = template.body;
        }
      }

      if (!campaignBody) {
        throw new Error('Campaign body/template metadata is missing, cannot retry send');
      }

      const contactIds = targetRecipients.map(r => r.contact_id).filter((id): id is string => Boolean(id));
      const { data: contacts } = contactIds.length > 0
        ? await supabase
          .from('crm_contacts')
          .select('id, company_name, contact_person, email')
          .in('id', contactIds)
        : { data: [] as Array<{ id: string; company_name: string; contact_person: string | null; email: string }> };

      const contactMap = new Map((contacts || []).map(c => [c.id, c]));
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      let sentCount = 0;
      let failedCount = 0;

      for (const row of targetRecipients) {
        const baseContact = row.contact_id ? contactMap.get(row.contact_id) : null;
        const payloadContact = {
          company_name: baseContact?.company_name || row.company_name,
          contact_person: baseContact?.contact_person || null,
          email: baseContact?.email || row.email,
        };

        const toEmails = (row.email || payloadContact.email)
          .split(';')
          .map((e: string) => e.trim())
          .filter(Boolean);
        const personalizedSubject = applyEmailTemplateVariables(campaign.subject, payloadContact);
        const personalizedBody = applyEmailTemplateVariables(campaignBody, payloadContact);

        try {
          const response = await fetch(`${supabaseUrl}/functions/v1/send-bulk-email`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${sessionData.session.access_token}`,
            },
            body: JSON.stringify({
              userId: authData.user.id,
              toEmails,
              subject: personalizedSubject,
              body: personalizedBody,
              contactId: row.contact_id,
              senderName: '',
              isHtml: true,
              attachments: [],
              workflowType: 'delivery_log',
              // Token refresh credentials are server-side only (Edge Function env).
            }),
          });

          const result = await response.json();
          if (!result.success) {
            const errorWithCode = result.code
              ? `${result.code}: ${result.error || 'Unknown error'}`
              : (result.error || 'Unknown error');
            throw new Error(errorWithCode);
          }

          await supabase
            .from('bulk_email_recipients')
            .update({ status: 'sent', error_message: null, sent_at: new Date().toISOString() })
            .eq('id', row.id);

          sentCount++;
        } catch (err: any) {
          const errMsg = err?.message || 'Unknown error';
          await supabase
            .from('bulk_email_recipients')
            .update({ status: 'failed', error_message: errMsg })
            .eq('id', row.id);
          failedCount++;
        }
      }

      const { data: refreshedRows } = await supabase
        .from('bulk_email_recipients')
        .select('id, contact_id, company_name, email, status, error_message, sent_at')
        .eq('campaign_id', campaignId);

      const totalSent = (refreshedRows || []).filter(r => r.status === 'sent').length;
      const totalFailed = (refreshedRows || []).filter(r => r.status === 'failed').length;
      const campaignStatus = totalFailed === 0 ? 'completed' : totalSent === 0 ? 'failed' : 'partial';

      await supabase
        .from('bulk_email_campaigns')
        .update({
          sent_count: totalSent,
          failed_count: totalFailed,
          status: campaignStatus,
          completed_at: new Date().toISOString(),
        })
        .eq('id', campaignId);

      setRecipients(prev => ({ ...prev, [campaignId]: refreshedRows || [] }));
      setCampaigns(prev => prev.map(c => c.id === campaignId
        ? { ...c, sent_count: totalSent, failed_count: totalFailed, status: campaignStatus }
        : c
      ));
      setRetryResult(prev => ({
        ...prev,
        [campaignId]: {
          type: failedCount > 0 ? 'error' : 'success',
          message: `Retry finished: ${sentCount} sent, ${failedCount} failed.`,
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
        if (shouldReconnect) {
          openGmailReconnectPopup();
        }
      }

      setRetryResult(prev => ({
        ...prev,
        [campaignId]: {
          type: 'error',
          message: errMsg,
        },
      }));
    } finally {
      if (recipientIds) {
        setRetryingRecipients(prev => {
          const next = { ...prev };
          targetRecipients.forEach(r => {
            delete next[r.id];
          });
          return next;
        });
      } else {
        setRetryingCampaigns(prev => ({ ...prev, [campaignId]: false }));
      }
    }
  };

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
          <button
            onClick={loadCampaigns}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
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
              {/* Campaign row */}
              <button
                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition text-left"
                onClick={() => toggleExpand(c.id)}
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
                  {statusBadge(c.status, c.failed_count)}
                </div>
              </button>

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
                              {r.sent_at ? formatDateTime(r.sent_at) : r.status === 'pending' ? 'Pending' : ''}
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
