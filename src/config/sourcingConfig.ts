/**
 * Sourcing contact configuration for the pricing workflow.
 * These can be moved to a DB settings table later by replacing
 * direct imports with a supabase.from('app_settings').select() call.
 */

export interface SourceContact {
  name: string;
  email: string;
  cc?: string[];
  bcc?: string[];
}

export const SOURCING_CONTACTS: Record<'india' | 'china', SourceContact> = {
  india: {
    name: 'Sonal',
    email: 'sonal@anzen.co.id',
    cc: [],
    bcc: [],
  },
  china: {
    name: 'Import Team',
    email: 'import@anzen.co.id',
    cc: [],
    bcc: [],
  },
};

export function getSourcingContact(sourceType: string): SourceContact | null {
  if (sourceType === 'india') return SOURCING_CONTACTS.india;
  if (sourceType === 'china') return SOURCING_CONTACTS.china;
  return null;
}
