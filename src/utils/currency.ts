/**
 * Centralized currency formatting utilities
 * Ensures consistent decimal place display across the application
 */

export const formatCurrency = (amount: number | string | null | undefined, currency: string = 'IDR'): string => {
  const numAmount = Number(amount) || 0;

  if (currency === 'USD' || currency === 'usd') {
    return `$ ${numAmount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  }

  // Default to IDR
  return `Rp ${numAmount.toLocaleString('id-ID', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};

export const formatNumber = (amount: number | string | null | undefined, decimals: number = 2): string => {
  const numAmount = Number(amount) || 0;
  return numAmount.toLocaleString('id-ID', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
};

export const formatPercentage = (value: number | string | null | undefined, decimals: number = 2): string => {
  const numValue = Number(value) || 0;
  return `${numValue.toLocaleString('id-ID', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })}%`;
};

/**
 * Parse Indonesian number format to JavaScript number
 * Indonesian format: 1.000.000,50 (dot for thousands, comma for decimal)
 * Handles multiple formats:
 * - 20.000.000 or 20000000 or 20,000,000 (all treated as 20 million)
 * - 20.000.000,50 or 20000000.50 (20 million with decimals)
 */
export const parseIndonesianNumber = (value: string | number | null | undefined): number => {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return value;

  const str = String(value).trim();
  if (str === '') return 0;

  // Remove all spaces
  let cleaned = str.replace(/\s/g, '');

  // Count dots and commas to determine format
  const dotCount = (cleaned.match(/\./g) || []).length;
  const commaCount = (cleaned.match(/,/g) || []).length;

  // Indonesian format: 1.000.000,50 (multiple dots, one comma at end)
  if (dotCount > 1 || (dotCount >= 1 && commaCount === 1)) {
    // Remove thousand separators (dots)
    cleaned = cleaned.replace(/\./g, '');
    // Convert comma to decimal point
    cleaned = cleaned.replace(/,/g, '.');
  }
  // English with commas as thousands: 1,000,000.50
  else if (commaCount > 1 || (commaCount >= 1 && dotCount === 1)) {
    // Remove thousand separators (commas)
    cleaned = cleaned.replace(/,/g, '');
    // Dot is already decimal point
  }
  // Single separator - need to determine if it's thousands or decimal
  else if (dotCount === 1 && commaCount === 0) {
    const parts = cleaned.split('.');
    // If no decimal part or decimal part is exactly 3 digits, it's likely thousands
    // e.g., "20.000" or "20.000" - treat as 20000
    if (parts[1].length === 3) {
      cleaned = cleaned.replace(/\./g, '');
    }
    // Otherwise it's a decimal: "20.5" stays as 20.5
  }
  else if (commaCount === 1 && dotCount === 0) {
    // Single comma - likely decimal separator in Indonesian format
    cleaned = cleaned.replace(/,/g, '.');
  }

  const result = parseFloat(cleaned);
  return isNaN(result) ? 0 : result;
};
