import { supabase } from '../lib/supabase';
import { SOURCING_CONTACTS } from '../config/sourcingConfig';

/**
 * Sourcing recipient defaults. The DB row in sourcing_email_recipients is the
 * source of truth for admin/manager users. Sales never reads/writes this
 * table (gated by RLS). If the table is empty / unreachable, we fall back to
 * the hard-coded values in sourcingConfig.ts so the UI never breaks.
 */

export type SourcingRoute = 'india' | 'china' | 'local';

export interface RouteRecipients {
  route: SourcingRoute;
  to: string[];
  cc: string[];
  bcc: string[];
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

function fallbackFor(route: SourcingRoute): RouteRecipients {
  if (route === 'india' || route === 'china') {
    const c = SOURCING_CONTACTS[route];
    return { route, to: [c.email], cc: c.cc || [], bcc: c.bcc || [] };
  }
  return { route, to: [], cc: [], bcc: [] };
}

export async function loadRouteRecipients(route: SourcingRoute): Promise<RouteRecipients> {
  try {
    const { data, error } = await supabase
      .from('sourcing_email_recipients')
      .select('route,to_emails,cc_emails,bcc_emails')
      .eq('route', route)
      .maybeSingle();
    if (error || !data) return fallbackFor(route);
    return {
      route,
      to: (data.to_emails || []).filter(isValidEmail),
      cc: (data.cc_emails || []).filter(isValidEmail),
      bcc: (data.bcc_emails || []).filter(isValidEmail),
    };
  } catch {
    return fallbackFor(route);
  }
}

export async function loadAllRouteRecipients(): Promise<Record<SourcingRoute, RouteRecipients>> {
  const blank: Record<SourcingRoute, RouteRecipients> = {
    india: fallbackFor('india'),
    china: fallbackFor('china'),
    local: fallbackFor('local'),
  };
  try {
    const { data, error } = await supabase
      .from('sourcing_email_recipients')
      .select('route,to_emails,cc_emails,bcc_emails');
    if (error || !data) return blank;
    for (const r of data as Array<{ route: SourcingRoute; to_emails: string[] | null; cc_emails: string[] | null; bcc_emails: string[] | null }>) {
      if (r.route === 'india' || r.route === 'china' || r.route === 'local') {
        blank[r.route] = {
          route: r.route,
          to: (r.to_emails || []).filter(isValidEmail),
          cc: (r.cc_emails || []).filter(isValidEmail),
          bcc: (r.bcc_emails || []).filter(isValidEmail),
        };
      }
    }
    return blank;
  } catch {
    return blank;
  }
}

export async function saveRouteRecipients(rec: RouteRecipients, actorId: string | null = null): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('sourcing_email_recipients')
      .upsert({
        route: rec.route,
        to_emails: rec.to.filter(isValidEmail),
        cc_emails: rec.cc.filter(isValidEmail),
        bcc_emails: rec.bcc.filter(isValidEmail),
        updated_by: actorId,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'route' });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Save failed' };
  }
}
