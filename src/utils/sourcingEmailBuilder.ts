/**
 * HTML email builders for India/China sourcing reminder emails sent from SourcingOutbox.
 * Matches the branding and table style of buildIndiaTable in GmailLikeComposer.
 * The reminder variant adds two extra columns: Days Pending, Last Sent Date.
 */

const HEADER = 'padding:10px 12px;border:1px solid #b7c9df;background:#073763;color:#ffffff;text-align:left;font-weight:700;font-size:13px;';
const CELL = 'padding:9px 12px;border:1px solid #d1d5db;color:#1f2937;font-size:13px;vertical-align:top;';
const TABLE = 'border-collapse:collapse;width:100%;max-width:960px;font-family:Arial,Helvetica,sans-serif;font-size:13px;mso-table-lspace:0pt;mso-table-rspace:0pt;';

export interface SourcingReminderRow {
  inquiry_number: string;
  aceerp_no?: string | null;
  company_name: string;
  product_name: string;
  specification?: string | null;
  supplier_name?: string | null;
  quantity: string;
  coa_required?: boolean | null;
  sample_required?: boolean | null;
  agency_letter_required?: boolean | null;
  others_required?: boolean | null;
  remarks?: string | null;
  last_sourcing_sent_at?: string | null;
  last_reminder_sent_at?: string | null;
}

function esc(s: string | null | undefined): string {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function docsText(row: SourcingReminderRow): string {
  const docs: string[] = [];
  if (row.coa_required) docs.push('COA');
  if (row.sample_required) docs.push('Sample');
  if (row.agency_letter_required) docs.push('Agency Letter');
  if (row.others_required) docs.push('Others');
  return docs.length > 0 ? docs.join(', ') : 'COA, MSDS';
}

function ageDays(iso: string | null | undefined): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function buildRow(row: SourcingReminderRow, index: number, includeReminder: boolean): string {
  const bg = index % 2 === 0 ? '#ffffff' : '#f8fafc';
  const lastIso = row.last_reminder_sent_at || row.last_sourcing_sent_at;
  const cells = [
    `<td style="${CELL}font-weight:600;white-space:nowrap;">${esc(row.aceerp_no || row.inquiry_number)}</td>`,
    `<td style="${CELL}">${esc(row.company_name)}</td>`,
    `<td style="${CELL}font-weight:600;">${esc(row.product_name)}</td>`,
    `<td style="${CELL}">${esc(row.specification || '—')}</td>`,
    `<td style="${CELL}">${esc(row.supplier_name || '—')}</td>`,
    `<td style="${CELL}white-space:nowrap;">${esc(row.quantity)}</td>`,
    `<td style="${CELL}">${esc(docsText(row))}</td>`,
    `<td style="${CELL}">${esc(row.remarks || '—')}</td>`,
  ];
  if (includeReminder) {
    cells.push(`<td style="${CELL}white-space:nowrap;font-weight:600;">${ageDays(lastIso)}d</td>`);
    cells.push(`<td style="${CELL}white-space:nowrap;">${fmtDate(lastIso)}</td>`);
  }
  return `<tr style="background:${bg};">${cells.join('')}</tr>`;
}

const BASE_HEADERS = ['ACE ERP Ref', 'Customer', 'Product', 'Specification', 'Make', 'Qty', 'Documents', 'Remarks'];

function buildTable(headers: string[], rows: SourcingReminderRow[], includeReminder: boolean): string {
  const ths = headers.map(h => `<th style="${HEADER}">${h}</th>`).join('');
  const trs = rows.map((row, i) => buildRow(row, i, includeReminder)).join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="${TABLE}"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
}

/** Consolidated HTML reminder email for SourcingOutbox. Same branding as buildIndiaTable + Days Pending + Last Sent Date. */
export function buildSourcingReminderHtml(rows: SourcingReminderRow[]): string {
  const headers = [...BASE_HEADERS, 'Days Pending', 'Last Sent Date'];
  const table = buildTable(headers, rows, true);
  return [
    '<p>Dear Team,</p>',
    '<p>This is a reminder for our pending pricing requests listed below. Please share your best prices, availability, and lead times at the earliest.</p>',
    table,
    '<p style="margin-top:16px">Please revert at the earliest with COA/MSDS if available.</p>',
    '<p>Best regards,<br><strong>SA Pharma Jaya</strong></p>',
  ].join('');
}
