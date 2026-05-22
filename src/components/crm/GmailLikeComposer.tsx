import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Send, Paperclip, X, ChevronDown, Loader, Minimize2, Maximize2, AlertCircle } from 'lucide-react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { openGmailReconnectPopup } from './gmailReconnect';
import { applyEmailTemplateVariables, getDisplayContactName, getSalutation } from '../../utils/crmEmailPersonalization';
import { buildNormalizedBaseKey, buildUniqueDocumentNames } from '../../utils/documentNaming';

interface Inquiry {
  id: string;
  inquiry_number: string;
  company_name: string;
  contact_person: string | null;
  contact_email: string | null;
  product_name: string;
  specification?: string | null;
  quantity: string;
  supplier_name?: string | null;
  supplier_country?: string | null;
  email_subject?: string | null;
  mail_subject?: string | null;
  offered_price?: number | null;
  offered_price_currency?: string;
  purchase_price?: number | null;
  purchase_price_currency?: string;
}

interface EmailTemplate {
  id: string;
  template_name: string;
  subject: string;
  body: string;
  category: string;
  variables: string[];
}

interface GmailLikeComposerProps {
  isOpen: boolean;
  onClose: () => void;
  inquiry: Inquiry;
  mode?: 'price' | 'coa' | 'general';
  replyTo?: {
    email_id: string;
    subject: string;
    from_email: string;
    body: string;
  };
}

interface AttachedFile {
  file: File;
  name: string;
  size: number;
}

function inferDocumentType(fileName: string, mode: 'price' | 'coa' | 'general'): 'COA' | 'MSDS' | 'MHD' | 'TDS' | 'SPEC' | 'OTHER' {
  const normalized = fileName.toLowerCase();
  if (normalized.includes('coa')) return 'COA';
  if (normalized.includes('msds') || normalized.includes('sds')) return 'MSDS';
  if (normalized.includes('mhd') || normalized.includes('expiry')) return 'MHD';
  if (normalized.includes('tds')) return 'TDS';
  if (normalized.includes('spec')) return 'SPEC';
  if (mode === 'coa') return 'COA';
  return 'OTHER';
}

function buildNormalizedKey(inquiry: Inquiry, fileName: string, docType: string): string {
  const base = `${inquiry.product_name || ''}|${inquiry.supplier_name || ''}|${docType}|${fileName || ''}`;
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const quillModules = {
  toolbar: [
    ['bold', 'italic', 'underline'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['link'],
    ['clean'],
  ],
};

const quillFormats = ['bold', 'italic', 'underline', 'list', 'bullet', 'link'];

function buildSubject(inquiry: Inquiry, _mode: 'price' | 'coa' | 'general', replyTo?: GmailLikeComposerProps['replyTo']): string {
  if (replyTo?.subject) {
    return replyTo.subject.startsWith('Re:') ? replyTo.subject : `Re: ${replyTo.subject}`;
  }
  // Use the original email thread subject for proper conversation threading
  const baseSubject = inquiry.mail_subject || inquiry.email_subject || `${inquiry.product_name} - ${inquiry.inquiry_number}`;
  return `Re: ${baseSubject}`;
}

export function GmailLikeComposer({ isOpen, onClose, inquiry, mode = 'general', replyTo }: GmailLikeComposerProps) {
  const [toEmail, setToEmail] = useState(inquiry.contact_email || '');
  const [ccEmail, setCcEmail] = useState('');
  const [bccEmail, setBccEmail] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  const [sending, setSending] = useState(false);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [currentUserName, setCurrentUserName] = useState('');
  const [gmailConnected, setGmailConnected] = useState<boolean | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    loadTemplates();
    loadUserInfo();
    setSubject(buildSubject(inquiry, mode, replyTo));

    if (replyTo) {
      const quotedBody = `<br><br><div style="border-left:3px solid #e2e8f0;padding-left:12px;margin-left:8px;color:#64748b"><p><strong>${replyTo.from_email} wrote:</strong></p>${replyTo.body}</div>`;
      setBody(quotedBody);
    } else {
      generateBody(mode);
    }
  }, [isOpen, inquiry.id, mode]);

  const loadUserInfo = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [profileRes, gmailRes] = await Promise.all([
        supabase.from('user_profiles').select('full_name').eq('id', user.id).maybeSingle(),
        supabase.from('gmail_connections').select('id').eq('user_id', user.id).eq('is_connected', true).maybeSingle(),
      ]);

      setCurrentUserName(profileRes.data?.full_name || '');
      setGmailConnected(!!gmailRes.data);
    } catch (err) {
      console.error('Error loading user info:', err);
    }
  };

  const loadTemplates = async () => {
    try {
      const { data } = await supabase
        .from('crm_email_templates')
        .select('*')
        .eq('is_active', true)
        .order('template_name');
      setTemplates(data || []);
    } catch (err) {
      console.error('Error loading templates:', err);
    }
  };

  const generateBody = (emailMode: 'price' | 'coa' | 'general') => {
    const salutation = `<p>${getSalutation(inquiry.contact_person)}</p>`;
    const closing = `<p>Should you have any questions, please feel free to contact us.</p><p>Best regards,<br><strong>SA Pharma Jaya</strong></p>`;

    if (emailMode === 'price') {
      let html = salutation;
      html += `<p>Thank you for your inquiry. Please find our price quotation for <strong>${inquiry.product_name}</strong> below:</p>`;
      if (inquiry.specification) html += `<p><strong>Specification:</strong> ${inquiry.specification}</p>`;
      html += `<p><strong>Quantity Required:</strong> ${inquiry.quantity}</p>`;
      if (inquiry.offered_price && inquiry.offered_price > 0) {
        const cur = inquiry.offered_price_currency || 'USD';
        html += `<p><strong>Our Offered Price:</strong> ${cur} ${inquiry.offered_price.toLocaleString()} / kg</p>`;
      } else {
        html += `<p><strong>Our Price:</strong> To be confirmed — please contact us for pricing details.</p>`;
      }
      if (inquiry.supplier_name) {
        html += `<p><strong>Origin:</strong> ${inquiry.supplier_name}${inquiry.supplier_country ? `, ${inquiry.supplier_country}` : ''}</p>`;
      }
      html += `<p>Please note that prices are subject to change based on availability and market conditions.</p>`;
      html += closing;
      setBody(html);
    } else if (emailMode === 'coa') {
      let html = salutation;
      html += `<p>Further to your inquiry for <strong>${inquiry.product_name}</strong>, please find attached the requested documents (COA / MSDS).</p>`;
      if (inquiry.specification) html += `<p><strong>Specification:</strong> ${inquiry.specification}</p>`;
      html += `<p>Kindly review the documents and let us know if you require any further information or alternative grades.</p>`;
      html += closing;
      setBody(html);
    } else {
      let html = salutation;
      html += `<p>Thank you for your inquiry regarding <strong>${inquiry.product_name}</strong>.</p>`;
      if (inquiry.specification) html += `<p><strong>Specification:</strong> ${inquiry.specification}</p>`;
      html += `<p><strong>Quantity:</strong> ${inquiry.quantity}</p>`;
      html += `<p>Please find the attached documents for your reference.</p>`;
      html += closing;
      setBody(html);
    }
  };

  const applyTemplate = (template: EmailTemplate) => {
    const offeredPriceText = inquiry.offered_price
      ? `${inquiry.offered_price_currency || 'USD'} ${inquiry.offered_price.toLocaleString()}`
      : 'To be confirmed';

    setSubject(applyEmailTemplateVariables(template.subject, {
      ...inquiry,
      contact_person: getDisplayContactName(inquiry.contact_person),
      user_name: currentUserName,
      offered_price: offeredPriceText,
    }));
    setBody(applyEmailTemplateVariables(template.body, {
      ...inquiry,
      contact_person: getDisplayContactName(inquiry.contact_person),
      user_name: currentUserName,
      offered_price: offeredPriceText,
    }));
    setShowTemplates(false);

    supabase.from('crm_email_templates')
      .update({ use_count: (template as any).use_count + 1, last_used: new Date().toISOString() })
      .eq('id', template.id).then(() => {});
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newFiles: AttachedFile[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f.size > 25 * 1024 * 1024) { alert(`${f.name} exceeds 25MB limit.`); continue; }
      newFiles.push({ file: f, name: f.name, size: f.size });
    }
    setAttachments(prev => [...prev, ...newFiles]);
  };

  const formatSize = (b: number) => {
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    return (b / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const sendEmail = async () => {
    if (!toEmail.trim() || !subject.trim() || !body.trim()) {
      alert('Please fill in To, Subject, and Body.');
      return;
    }
    if (!gmailConnected) {
      alert('Gmail is not connected. Please connect your Gmail account in Settings > Gmail Settings.');
      return;
    }

    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Upload attachments with normalized CRM document naming
      const uploadedUrls: string[] = [];
      const attachmentFolder = `email-attachments/${user.id}`;

      const { data: existingObjects, error: listError } = await supabase.storage
        .from('crm-documents')
        .list(attachmentFolder, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });

      if (listError) {
        throw new Error(`Unable to inspect existing attachments: ${listError.message}`);
      }

      const existingStoragePaths = (existingObjects || []).map((obj) => `${attachmentFolder}/${obj.name}`);
      const normalizedDocType = mode === 'coa' ? 'coa' : mode === 'price' ? 'quotation' : 'attachment';
      const normalizedBaseKey = buildNormalizedBaseKey(inquiry.product_name || 'product', inquiry.supplier_name || inquiry.company_name || 'supplier', normalizedDocType);

      for (const att of attachments) {
        const fileNaming = buildUniqueDocumentNames({
          product: inquiry.product_name || 'product',
          supplier: inquiry.supplier_name || inquiry.company_name || 'supplier',
          docType: normalizedDocType,
          originalFilename: att.name,
          existingStoragePaths: existingStoragePaths.filter((path) => path.split('/').pop()?.startsWith(normalizedBaseKey)),
        });

        const filePath = `${attachmentFolder}/${fileNaming.fileName}`;
        const { error: upErr } = await supabase.storage.from('crm-documents').upload(filePath, att.file);
        if (!upErr) {
          uploadedUrls.push(filePath);
          existingStoragePaths.push(filePath);
        }
      }

      const toList = [toEmail.trim(), ...(ccEmail ? ccEmail.split(',').map(e => e.trim()).filter(Boolean) : [])];

      // Send via Gmail API
      const { data: fnData, error: fnErr } = await supabase.functions.invoke('send-bulk-email', {
        body: {
          userId: user.id,
          toEmails: toList,
          subject,
          body,
          isHtml: true,
          senderName: currentUserName,
          workflowType: 'crm_bulk_email',
        },
      });

      if (fnErr || !fnData?.success) {
        const composedError = fnData?.code
          ? `${fnData.code}: ${fnData?.error || fnErr?.message || 'Failed to send email'}`
          : (fnData?.error || fnErr?.message || 'Failed to send email');
        throw new Error(composedError);
      }

      // Log to DB
      const { data: activityData, error: activityError } = await supabase.from('crm_email_activities').insert([{
        inquiry_id: inquiry.id,
        email_type: 'sent',
        from_email: user.email,
        to_email: toList,
        cc_email: ccEmail ? ccEmail.split(',').map(e => e.trim()).filter(Boolean) : null,
        bcc_email: bccEmail ? bccEmail.split(',').map(e => e.trim()).filter(Boolean) : null,
        subject,
        body,
        attachment_urls: uploadedFiles.length > 0 ? uploadedFiles.map((item) => item.storagePath) : null,
        sent_date: new Date().toISOString(),
        created_by: user.id,
      }]).select('id').single();

      if (activityError) throw activityError;

      if (uploadedFiles.length > 0) {
        const rows = uploadedFiles.map(({ storagePath, fileName }) => {
          const docType = inferDocumentType(fileName, mode);
          return {
            inquiry_id: inquiry.id,
            email_activity_id: activityData.id,
            product_name: inquiry.product_name,
            supplier_name: inquiry.supplier_name || null,
            document_type: docType,
            storage_path: storagePath,
            display_name: fileName,
            normalized_key: buildNormalizedKey(inquiry, fileName, docType),
            version_no: 0,
            uploaded_by: user.id,
          };
        });

        const { error: docInsertError } = await supabase
          .from('crm_product_documents')
          .insert(rows);

        if (docInsertError) {
          console.error('Error inserting crm product documents:', docInsertError);
        }
      }

      // Auto-update inquiry status
      const updateData: Record<string, unknown> = {};
      if (mode === 'price') {
        updateData.price_quoted = true;
        updateData.price_quoted_date = new Date().toISOString().split('T')[0];
        updateData.status = 'price_quoted';
      } else if (mode === 'coa') {
        updateData.coa_sent = true;
        updateData.coa_sent_date = new Date().toISOString().split('T')[0];
      }
      if (Object.keys(updateData).length > 0) {
        await supabase.from('crm_inquiries').update(updateData).eq('id', inquiry.id);
      }

      onClose();
    } catch (err: any) {
      console.error('Email send error:', err);
      const errorMessage = err.message || 'Failed to send email. Please try again.';
      const needsReauth = errorMessage.includes('TOKEN_REAUTH_REQUIRED')
        || errorMessage.includes('Failed to refresh access token');

      if (needsReauth) {
        const shouldReconnect = window.confirm(
          'Your Gmail connection has expired. Reconnect Gmail now?'
        );
        if (shouldReconnect) {
          openGmailReconnectPopup();
        }
      } else {
        alert(errorMessage);
      }
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  const modeLabel = mode === 'price' ? 'Send Price Quotation' : mode === 'coa' ? 'Send COA / MSDS' : 'New Message';

  const windowCls = fullscreen
    ? 'fixed inset-4 z-50 flex flex-col bg-white rounded-xl shadow-2xl border border-gray-200'
    : 'fixed bottom-0 right-6 z-50 flex flex-col bg-white rounded-t-xl shadow-2xl border border-gray-200 w-[580px]';

  return (
    <>
      {fullscreen && <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />}

      <div className={windowCls} style={!fullscreen ? { maxHeight: minimized ? 'auto' : '88vh' } : {}}>
        {/* Gmail-style dark header */}
        <div
          className="flex items-center justify-between px-4 py-2.5 bg-gray-800 rounded-t-xl cursor-pointer select-none"
          onClick={() => !fullscreen && setMinimized(m => !m)}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-medium text-white truncate">
              {minimized ? (subject || modeLabel) : modeLabel}
            </span>
            {!minimized && mode !== 'general' && (
              <span className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-gray-600 text-gray-200">
                {inquiry.company_name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
            {templates.length > 0 && !minimized && (
              <button
                onClick={() => setShowTemplates(s => !s)}
                className="p-1 text-gray-300 hover:text-white hover:bg-gray-700 rounded transition"
                title="Templates"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => { setMinimized(m => !m); setFullscreen(false); }}
              className="p-1 text-gray-300 hover:text-white hover:bg-gray-700 rounded transition"
              title={minimized ? 'Expand' : 'Minimize'}
            >
              <Minimize2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => { setFullscreen(f => !f); setMinimized(false); }}
              className="p-1 text-gray-300 hover:text-white hover:bg-gray-700 rounded transition"
              title={fullscreen ? 'Restore' : 'Full Screen'}
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1 text-gray-300 hover:text-white hover:bg-gray-700 rounded transition"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {!minimized && (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Gmail not connected warning */}
            {gmailConnected === false && (
              <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-xs">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                Gmail not connected — go to Settings &gt; Gmail Settings to connect before sending.
              </div>
            )}

            {/* Templates dropdown */}
            {showTemplates && templates.length > 0 && (
              <div className="border-b border-gray-200 bg-gray-50 p-3">
                <p className="text-xs font-medium text-gray-600 mb-2">Choose template:</p>
                <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto">
                  {templates.map(t => (
                    <button key={t.id} onClick={() => applyTemplate(t)}
                      className="text-left px-2.5 py-1.5 text-xs bg-white border border-gray-200 rounded hover:bg-blue-50 hover:border-blue-300 transition">
                      <div className="font-medium text-gray-900 truncate">{t.template_name}</div>
                      <div className="text-gray-400 truncate">{t.category}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Fields */}
            <div className="border-b border-gray-100">
              {/* To */}
              <div className="flex items-center px-4 py-1.5 border-b border-gray-100">
                <span className="text-xs text-gray-500 w-8 shrink-0">To</span>
                <input
                  type="email"
                  value={toEmail}
                  onChange={e => setToEmail(e.target.value)}
                  className="flex-1 text-sm outline-none py-1 text-gray-900 placeholder-gray-400"
                  placeholder="Recipients"
                />
                <div className="flex gap-2 ml-2 shrink-0">
                  <button onClick={() => setShowCc(s => !s)} className="text-xs text-gray-500 hover:text-gray-700">Cc</button>
                  <button onClick={() => setShowBcc(s => !s)} className="text-xs text-gray-500 hover:text-gray-700">Bcc</button>
                </div>
              </div>

              {showCc && (
                <div className="flex items-center px-4 py-1.5 border-b border-gray-100">
                  <span className="text-xs text-gray-500 w-8 shrink-0">Cc</span>
                  <input
                    type="text"
                    value={ccEmail}
                    onChange={e => setCcEmail(e.target.value)}
                    className="flex-1 text-sm outline-none py-1 text-gray-900 placeholder-gray-400"
                    placeholder="Cc (comma-separated)"
                  />
                </div>
              )}

              {showBcc && (
                <div className="flex items-center px-4 py-1.5 border-b border-gray-100">
                  <span className="text-xs text-gray-500 w-8 shrink-0">Bcc</span>
                  <input
                    type="text"
                    value={bccEmail}
                    onChange={e => setBccEmail(e.target.value)}
                    className="flex-1 text-sm outline-none py-1 text-gray-900 placeholder-gray-400"
                    placeholder="Bcc (comma-separated)"
                  />
                </div>
              )}

              {/* Subject — editable but pre-filled with Re: {mail_subject} */}
              <div className="flex items-center px-4 py-1.5">
                <input
                  type="text"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  className="flex-1 text-sm outline-none py-1 text-gray-900 placeholder-gray-400 font-medium"
                  placeholder="Subject"
                />
              </div>
            </div>

            {/* Rich text body */}
            <div className="flex-1 overflow-y-auto" style={{ minHeight: fullscreen ? 300 : 240 }}>
              <ReactQuill
                theme="snow"
                value={body}
                onChange={setBody}
                modules={quillModules}
                formats={quillFormats}
                style={{ height: fullscreen ? '100%' : 240, border: 'none' }}
                className="crm-quill-composer"
              />
            </div>

            {/* Attachments */}
            {attachments.length > 0 && (
              <div className="px-4 py-2 border-t border-gray-100 flex flex-wrap gap-2">
                {attachments.map((a, i) => (
                  <div key={i} className="flex items-center gap-1.5 bg-gray-100 rounded-full px-3 py-1 text-xs text-gray-700">
                    <span className="truncate max-w-[120px]">{a.name}</span>
                    <span className="text-gray-400">({formatSize(a.size)})</span>
                    <button onClick={() => setAttachments(p => p.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500 ml-1">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center gap-3 px-4 py-3 border-t border-gray-100">
              <button
                onClick={sendEmail}
                disabled={sending || !toEmail.trim() || !subject.trim()}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-full hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending
                  ? <><Loader className="w-4 h-4 animate-spin" />Sending...</>
                  : <><Send className="w-4 h-4" />Send</>}
              </button>

              <input ref={fileInputRef} type="file" multiple onChange={handleFileSelect} className="hidden" />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition"
                title="Attach files"
              >
                <Paperclip className="w-4 h-4" />
              </button>

              <div className="ml-auto text-xs text-gray-400 truncate">
                {inquiry.inquiry_number} · {inquiry.product_name}
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .crm-quill-composer .ql-container { border: none !important; font-size: 14px; }
        .crm-quill-composer .ql-toolbar { border: none !important; border-bottom: 1px solid #f1f5f9 !important; padding: 6px 12px; }
        .crm-quill-composer .ql-editor { padding: 12px 16px; min-height: 200px; }
        .crm-quill-composer .ql-editor p { margin-bottom: 6px; }
      `}</style>
    </>
  );
}
