const LEGAL_PREFIXES = ['PT', 'CV', 'TBK', 'LTD', 'CO', 'PT.', 'CV.'];

export function normalizeForKeyboardNav(text: string): string {
  if (!text) return '';

  let normalized = text.trim();

  for (const prefix of LEGAL_PREFIXES) {
    const pattern = new RegExp(`^${prefix}\\.?\\s+`, 'i');
    normalized = normalized.replace(pattern, '');
  }

  return normalized.toLowerCase().trim();
}

export function createSearchKey(text: string): string {
  return normalizeForKeyboardNav(text);
}
