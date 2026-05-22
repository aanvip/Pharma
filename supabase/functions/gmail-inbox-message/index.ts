import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface GmailConnection {
  id: string;
  user_id: string;
  email_address: string;
  access_token: string;
  refresh_token: string;
  access_token_expires_at: string | null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getAuthUser(req: Request, supabaseUrl: string, anonKey: string) {
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!jwt) throw new Error("MISSING_AUTH");
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data?.user) throw new Error("INVALID_AUTH");
  return data.user;
}

async function getConnection(supabase: any, userId: string): Promise<GmailConnection | null> {
  const { data } = await supabase
    .from("gmail_connections")
    .select("id,user_id,email_address,access_token,refresh_token,access_token_expires_at")
    .eq("user_id", userId)
    .eq("is_connected", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as GmailConnection | null;
}

async function getValidAccessToken(supabase: any, connection: GmailConnection): Promise<string> {
  const expiry = new Date(connection.access_token_expires_at || 0);
  if (!Number.isNaN(expiry.getTime()) && expiry.getTime() - 5 * 60 * 1000 > Date.now()) {
    return connection.access_token;
  }
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID") || Deno.env.get("GMAIL_CLIENT_ID") || "";
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET") || Deno.env.get("GMAIL_CLIENT_SECRET") || "";
  if (!clientId || !clientSecret) throw new Error("MISSING_GOOGLE_OAUTH_CONFIG");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: connection.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) throw new Error("TOKEN_REFRESH_FAILED");
  const data = await response.json();
  await supabase
    .from("gmail_connections")
    .update({
      access_token: data.access_token,
      access_token_expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    })
    .eq("id", connection.id);
  return data.access_token;
}

function decodeBase64Url(data = ""): string {
  try {
    const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return "";
  }
}

function stripHtml(input: string): string {
  return input
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getHeader(headers: Array<{ name: string; value: string }> = [], name: string): string {
  return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || "";
}

function extractPayload(payload: any) {
  let text = "";
  let html = "";
  const attachments: Array<{ filename: string; mimeType: string; size: number; attachmentId: string }> = [];

  const visit = (part: any) => {
    if (!part) return;
    if (part.filename && part.body?.attachmentId) {
      attachments.push({
        filename: String(part.filename),
        mimeType: String(part.mimeType || "application/octet-stream"),
        size: Number(part.body?.size || 0),
        attachmentId: String(part.body.attachmentId),
      });
    }
    if (part.body?.data) {
      const decoded = decodeBase64Url(part.body.data);
      if (part.mimeType === "text/html") html ||= decoded;
      if (part.mimeType === "text/plain") text ||= decoded;
    }
    for (const child of part.parts || []) visit(child);
  };

  visit(payload);
  const sanitizedText = (text || stripHtml(html)).slice(0, 20000);
  return { body: sanitizedText, attachments };
}

function safeMessage(message: any, matchedInquiryId: string | null) {
  const headers = message.payload?.headers || [];
  const extracted = extractPayload(message.payload);
  return {
    messageId: message.id,
    threadId: message.threadId,
    from: getHeader(headers, "from"),
    to: getHeader(headers, "to"),
    subject: getHeader(headers, "subject") || "(No Subject)",
    date: getHeader(headers, "date") || (message.internalDate ? new Date(Number(message.internalDate)).toISOString() : null),
    snippet: message.snippet || "",
    body: extracted.body,
    attachments: extracted.attachments,
    hasAttachments: extracted.attachments.length > 0,
    labels: message.labelIds || [],
    matchedInquiryId,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const user = await getAuthUser(req, supabaseUrl, anonKey);
    const supabase = createClient(supabaseUrl, serviceKey);
    const connection = await getConnection(supabase, user.id);
    if (!connection) return json({ success: false, code: "NO_GMAIL_CONNECTED" }, 200);

    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const messageId = String(body.messageId || url.searchParams.get("messageId") || "");
    const threadId = String(body.threadId || url.searchParams.get("threadId") || "");
    if (!messageId && !threadId) return json({ success: false, code: "MISSING_MESSAGE_ID" }, 400);

    const accessToken = await getValidAccessToken(supabase, connection);
    const id = messageId || threadId;
    const gmailUrl = messageId
      ? `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`
      : `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(id)}?format=full`;

    const response = await fetch(gmailUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) return json({ success: false, code: "GMAIL_MESSAGE_FAILED" }, 502);
    const data = await response.json();
    const message = messageId ? data : (data.messages || [])[0];
    if (!message) return json({ success: false, code: "MESSAGE_NOT_FOUND" }, 404);

    const { data: linked } = await supabase
      .from("crm_email_inbox")
      .select("message_id,converted_to_inquiry")
      .eq("message_id", message.id)
      .maybeSingle();

    return json({
      success: true,
      emailAddress: connection.email_address,
      message: safeMessage(message, linked?.converted_to_inquiry || null),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    const status = message === "MISSING_AUTH" || message === "INVALID_AUTH" ? 401 : 500;
    return json({ success: false, code: message }, status);
  }
});
