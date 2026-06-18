/**
 * Shared email formatting utilities reused across CRM email composers
 * and internal workflow emails (Kunal Pricing replies, etc.).
 */

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildCompanySignature(userName: string): string {
  const safeUserName = escapeHtml(userName || '');
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;line-height:1.45;font-size:14px;margin-top:18px;">
    <p style="margin:0 0 6px 0;">Warm regards,</p>
    <p style="margin:0 0 6px 0;">${safeUserName}</p>
    <p style="margin:0 0 4px 0;color:#073763;font-size:20px;font-weight:700;">PT Shubham Anzen Pharma Jaya</p>
    <p style="margin:0;">Ruko Sunter Terrace Blok C No.12, Jalan Danau Sunter Utara Kav. No.60</p>
    <p style="margin:0 0 6px 0;">Sunter Agung, Tanjung Priok, Jakarta Utara 14350, Indonesia</p>
    <p style="margin:0 0 2px 0;">
      <span style="color:#0b66c3;">📧</span> <a href="mailto:sales@sapharmajaya.co.id" style="color:#0b66c3;text-decoration:underline;">sales@sapharmajaya.co.id</a>
      <span style="display:inline-block;width:18px;">&nbsp;</span>
      <span style="color:#0b66c3;">🌐</span> <a href="http://www.sapharmajaya.co.id" style="color:#0b66c3;text-decoration:underline;">www.sapharmajaya.co.id</a>
    </p>
    <p style="margin:0 0 18px 0;color:#274e13;">📱 WhatsApp: +62 85 888 600 999</p>
    <p style="margin:0;color:#073763;font-weight:700;font-style:italic;">APIs | Excipients | Formulations | Nutraceuticals | Herbal Extracts | Pharma Packaging Solutions | Technology Transfers</p>
  </div>`;
}

export interface InternalPriceRow {
  inquiryNumber: string;
  aceerpNo: string | null;
  product: string;
  requiredMake: string | null;
  offeredMake: string | null;
  qty: string;
  inrSourcePrice: string;
  usdLandedCost: string;
  quotePrice: string;
  remarks: string | null;
}

/**
 * Build a Gmail/Outlook-compatible HTML table for internal pricing replies.
 * Same styling as the CRM customer quote table (blue header, alternating rows).
 */
export function buildInternalPriceTable(items: InternalPriceRow[]): string {
  const headerStyle =
    'padding:10px 12px;border:1px solid #b7c9df;background:#073763;color:#ffffff;text-align:left;font-weight:700;font-size:13px;';
  const cellBase =
    'padding:9px 12px;border:1px solid #d1d5db;color:#1f2937;font-size:13px;vertical-align:top;';

  const rows = items
    .map((row, idx) => {
      const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
      return `<tr style="background:${bg};">
      <td style="${cellBase}font-weight:600;">${escapeHtml(row.inquiryNumber)}</td>
      <td style="${cellBase}">${escapeHtml(row.aceerpNo || '-')}</td>
      <td style="${cellBase}font-weight:600;">${escapeHtml(row.product)}</td>
      <td style="${cellBase}">${escapeHtml(row.requiredMake || '-')}</td>
      <td style="${cellBase}">${escapeHtml(row.offeredMake || '-')}</td>
      <td style="${cellBase}">${escapeHtml(row.qty)}</td>
      <td style="${cellBase}white-space:nowrap;">${escapeHtml(row.inrSourcePrice)}</td>
      <td style="${cellBase}white-space:nowrap;">${escapeHtml(row.usdLandedCost)}</td>
      <td style="${cellBase}font-weight:600;white-space:nowrap;">${escapeHtml(row.quotePrice)}</td>
      <td style="${cellBase}">${escapeHtml(row.remarks || '-')}</td>
    </tr>`;
    })
    .join('');

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;max-width:760px;font-family:Arial,Helvetica,sans-serif;font-size:13px;mso-table-lspace:0pt;mso-table-rspace:0pt;">
    <thead><tr>
      <th style="${headerStyle}">Inquiry No</th>
      <th style="${headerStyle}">AC ERP#</th>
      <th style="${headerStyle}">Product</th>
      <th style="${headerStyle}">Required Make</th>
      <th style="${headerStyle}">Offered Make</th>
      <th style="${headerStyle}">Qty</th>
      <th style="${headerStyle}">INR Source Price</th>
      <th style="${headerStyle}">USD Landed Cost</th>
      <th style="${headerStyle}">Quote Price</th>
      <th style="${headerStyle}">Remarks</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}
