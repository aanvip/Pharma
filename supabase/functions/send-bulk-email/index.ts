import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface OAuthClientCredentials {
  clientId?: string;
  clientSecret?: string;
}

interface GmailConnection {
  id: string;
  user_id: string;
  email_address: string;
  access_token: string;
  refresh_token: string;
  access_token_expires_at: string | null;
}

async function getValidAccessToken(
  supabase: any,
  connection: GmailConnection,
  oauthClientCredentials: OAuthClientCredentials
): Promise<string> {
  const tokenExpiry = new Date(connection.access_token_expires_at || 0);
  const bufferMs = 5 * 60 * 1000;

  if (!Number.isNaN(tokenExpiry.getTime()) && tokenExpiry.getTime() - bufferMs > Date.now()) {
    return connection.access_token;
  }

  const clientId = oauthClientCredentials.clientId
    || Deno.env.get("GOOGLE_CLIENT_ID")
    || Deno.env.get("GMAIL_CLIENT_ID")
    || "";
  const clientSecret = oauthClientCredentials.clientSecret
    || Deno.env.get("GOOGLE_CLIENT_SECRET")
    || Deno.env.get("GMAIL_CLIENT_SECRET")
    || "";

  if (!clientId || !clientSecret) {
    throw new Error("Missing Google OAuth client credentials for token refresh");
  }

  const refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: connection.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!refreshResponse.ok) {
    const errText = await refreshResponse.text();
    const refreshError = new Error(`Failed to refresh access token: ${errText}`);
    (refreshError as any).code = "TOKEN_REFRESH_FAILED";
    throw refreshError;
  }

  const refreshData = await refreshResponse.json();
  const newExpiry = new Date(Date.now() + refreshData.expires_in * 1000).toISOString();

  await supabase
    .from("gmail_connections")
    .update({
      access_token: refreshData.access_token,
      access_token_expires_at: newExpiry,
    })
    .eq("id", connection.id);

  return refreshData.access_token;
}

function encodeBase64Url(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function encodeMimeWord(str: string): string {
  return `=?utf-8?B?${btoa(unescape(encodeURIComponent(str)))}?=`;
}

interface Attachment {
  filename: string;
  mimeType: string;
  data: string; // base64
}

function joinEmails(list: string[] | undefined | null): string {
  if (!list || list.length === 0) return "";
  return list.filter(e => typeof e === "string" && e.trim().length > 0).join(", ");
}

function buildEmailRaw(opts: {
  fromEmail: string;
  fromName: string;
  toEmail: string;
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  subject: string;
  htmlBody: string;
  attachments: Attachment[];
}): string {
  const { fromEmail, fromName, toEmail, cc, bcc, replyTo, subject, htmlBody, attachments } = opts;
  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const fromField = fromName ? `${encodeMimeWord(fromName)} <${fromEmail}>` : fromEmail;
  const encodedSubject = encodeMimeWord(subject);

  const ccHeader = joinEmails(cc);
  const bccHeader = joinEmails(bcc);

  const baseHeaders = [
    `From: ${fromField}`,
    `To: ${toEmail}`,
    ccHeader ? `Cc: ${ccHeader}` : "",
    bccHeader ? `Bcc: ${bccHeader}` : "",
    replyTo ? `Reply-To: ${replyTo}` : "",
    `Subject: ${encodedSubject}`,
    `MIME-Version: 1.0`,
  ].filter(Boolean);

  if (attachments.length === 0) {
    const lines = [
      ...baseHeaders,
      `Content-Type: text/html; charset=utf-8`,
      `Content-Transfer-Encoding: base64`,
      ``,
      btoa(unescape(encodeURIComponent(htmlBody))),
    ];
    return encodeBase64Url(lines.join("\r\n"));
  }

  const parts: string[] = [];
  parts.push([
    `--${boundary}`,
    `Content-Type: text/html; charset=utf-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    btoa(unescape(encodeURIComponent(htmlBody))),
  ].join("\r\n"));

  for (const att of attachments) {
    const encodedFilename = encodeMimeWord(att.filename);
    parts.push([
      `--${boundary}`,
      `Content-Type: ${att.mimeType}; name="${encodedFilename}"`,
      `Content-Transfer-Encoding: base64`,
      `Content-Disposition: attachment; filename="${encodedFilename}"`,
      ``,
      att.data,
    ].join("\r\n"));
  }

  const headerBlock = [
    ...baseHeaders,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ``,
  ].join("\r\n");

  const body = parts.join("\r\n") + `\r\n--${boundary}--`;
  return encodeBase64Url(headerBlock + body);
}

async function findFallbackConnection(supabase: any): Promise<GmailConnection | null> {
  // Server-side fallback: prefer a connection identified by a configured env var,
  // otherwise fall back to any active admin user with a connected Gmail.
  const fallbackUserId = Deno.env.get("PRICING_FALLBACK_USER_ID") || "";
  const fallbackEmail = Deno.env.get("PRICING_FALLBACK_EMAIL") || "";

  if (fallbackUserId) {
    const { data } = await supabase
      .from("gmail_connections")
      .select("*")
      .eq("user_id", fallbackUserId)
      .eq("is_connected", true)
      .maybeSingle();
    if (data) return data as GmailConnection;
  }
  if (fallbackEmail) {
    const { data } = await supabase
      .from("gmail_connections")
      .select("*")
      .eq("email_address", fallbackEmail)
      .eq("is_connected", true)
      .maybeSingle();
    if (data) return data as GmailConnection;
  }
  // Last-resort fallback: any admin user's active connection
  const { data: admins } = await supabase
    .from("user_profiles")
    .select("id")
    .eq("role", "admin")
    .eq("is_active", true);
  const adminIds = (admins || []).map((a: { id: string }) => a.id);
  if (adminIds.length > 0) {
    const { data } = await supabase
      .from("gmail_connections")
      .select("*")
      .in("user_id", adminIds)
      .eq("is_connected", true)
      .limit(1)
      .maybeSingle();
    if (data) return data as GmailConnection;
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ── 1. Verify caller JWT ──────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!jwt) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData?.user) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid or expired session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const authUserId = authData.user.id;

    // ── 2. Parse body ─────────────────────────────────────────────────────
    const body = await req.json();
    const {
      userId,                 // optional — must equal authUserId if present
      allowFallback,          // boolean — true means fall through to fallback sender
      workflowType,           // required when allowFallback=true; categorises the send
      toEmails,
      cc,
      bcc,
      replyTo,
      subject,
      body: emailBody,
      contactId,              // unused server-side, accepted for compat
      senderName,
      isHtml,
      attachments,
    } = body as Record<string, any>;

    void contactId;

    if (!toEmails || !subject || !emailBody) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields (toEmails, subject, body)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 2b. Workflow / role gating ───────────────────────────────────────
    // workflowType is required for fallback usage and gates the whole call.
    // The allowlist below matches actual product flows. Unknown types are
    // rejected outright.
    const APPROVED_WORKFLOWS: Record<string, { roles: string[]; fallback: boolean }> = {
      pricing_sourcing : { roles: ["admin", "manager", "sales"], fallback: true },
      pricing_reminder : { roles: ["admin", "manager", "sales"], fallback: true },
      customer_quote   : { roles: ["admin", "manager", "sales"], fallback: true },
      crm_bulk_email   : { roles: ["admin", "manager", "sales"], fallback: true },
      stock_update     : { roles: ["admin", "manager", "sales"], fallback: true },
      delivery_log     : { roles: ["admin", "manager", "sales"], fallback: true },
    };

    if (workflowType !== undefined && workflowType !== null) {
      if (typeof workflowType !== "string" || !APPROVED_WORKFLOWS[workflowType]) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Unknown workflowType: ${workflowType}`,
            code: "UNKNOWN_WORKFLOW_TYPE",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (allowFallback) {
      if (!workflowType) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "workflowType is required when allowFallback=true",
            code: "WORKFLOW_TYPE_REQUIRED",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const wf = APPROVED_WORKFLOWS[workflowType];
      if (!wf.fallback) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `workflowType ${workflowType} does not allow fallback sender`,
            code: "FALLBACK_NOT_ALLOWED",
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // Verify the caller has one of the approved roles for this workflow.
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("role,is_active")
        .eq("id", authUserId)
        .maybeSingle();
      if (!profile || profile.is_active === false || !wf.roles.includes(profile.role)) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Your role is not allowed to use fallback sender for this workflow",
            code: "ROLE_NOT_ALLOWED",
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Authorization rule:
    //  - userId omitted → sender = auth user
    //  - userId === authUserId → allowed
    //  - userId !== authUserId → reject (unless caller explicitly opts into fallback,
    //    in which case the userId is ignored and we resolve the fallback)
    let intendedSenderUserId: string | null = authUserId;
    if (userId && userId !== authUserId) {
      if (!allowFallback) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Cannot send from another user's Gmail. Omit userId or set allowFallback=true with an approved workflowType.",
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      intendedSenderUserId = null; // skip self lookup, go straight to fallback
    }

    // ── 3. Resolve sender connection (self → fallback if allowed) ─────────
    let senderMode: "connected_gmail" | "fallback" = "connected_gmail";
    let connection: GmailConnection | null = null;

    if (intendedSenderUserId) {
      const { data } = await supabase
        .from("gmail_connections")
        .select("*")
        .eq("user_id", intendedSenderUserId)
        .eq("is_connected", true)
        .maybeSingle();
      if (data) connection = data as GmailConnection;
    }

    if (!connection && allowFallback) {
      connection = await findFallbackConnection(supabase);
      if (connection) senderMode = "fallback";
    }

    if (!connection) {
      return new Response(
        JSON.stringify({
          success: false,
          error: allowFallback
            ? "No connected Gmail available for sender or fallback. Connect Gmail in Settings."
            : "Gmail not connected. Please connect Gmail in Settings.",
          code: "NO_CONNECTION",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 4. Build & send via Gmail API ─────────────────────────────────────
    // Token refresh credentials come from the Edge Function environment only.
    const accessToken = await getValidAccessToken(supabase, connection, {});

    const recipientEmails: string[] = Array.isArray(toEmails) ? toEmails : [toEmails];
    const toField = recipientEmails[0];

    const htmlContent = isHtml
      ? emailBody
      : `<html><body><pre style="font-family:sans-serif;white-space:pre-wrap">${emailBody}</pre></body></html>`;

    const fileAttachments: Attachment[] = Array.isArray(attachments) ? attachments : [];

    const encodedEmail = buildEmailRaw({
      fromEmail: connection.email_address,
      fromName: senderName || "",
      toEmail: toField,
      cc: Array.isArray(cc) ? cc : [],
      bcc: Array.isArray(bcc) ? bcc : [],
      replyTo: typeof replyTo === "string" ? replyTo : undefined,
      subject,
      htmlBody: htmlContent,
      attachments: fileAttachments,
    });

    const sendResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: encodedEmail }),
    });

    if (!sendResponse.ok) {
      const errorData = await sendResponse.text();
      console.error("Gmail API error:", errorData);
      throw new Error(`Gmail API error: ${errorData}`);
    }

    const result = await sendResponse.json();

    return new Response(
      JSON.stringify({
        success: true,
        messageId: result.id || null,
        threadId: result.threadId || null,
        senderMode,
        senderEmail: connection.email_address,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error sending email:", error);
    const isRefreshError = error?.code === "TOKEN_REFRESH_FAILED"
      || String(error?.message || "").includes("Failed to refresh access token");

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Failed to send email",
        code: isRefreshError ? "TOKEN_REAUTH_REQUIRED" : "SEND_FAILED",
        reauthRequired: isRefreshError,
      }),
      {
        status: isRefreshError ? 401 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
