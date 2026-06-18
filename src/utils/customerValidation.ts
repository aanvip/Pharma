import { supabase } from '../lib/supabase';

export const DUPLICATE_CUSTOMER_MESSAGE = 'A customer with this name already exists.';

export const normalizeCustomerName = (name: string) =>
  name.trim().toLowerCase();

export const isDuplicateCustomerError = (error: unknown) => {
  const err = error as { code?: string; message?: string; details?: string } | null;
  const text = `${err?.message || ''} ${err?.details || ''}`.toLowerCase();
  return err?.code === '23505' && text.includes('customers_company_name_normalized');
};

export const ensureUniqueCustomerName = async (companyName: string, excludeCustomerId?: string) => {
  const normalizedName = normalizeCustomerName(companyName);

  if (!normalizedName) {
    return;
  }

  const { data, error } = await supabase.rpc('customer_name_exists', {
    p_company_name: companyName,
    p_exclude_customer_id: excludeCustomerId || null,
  });
  if (error) {
    const missingFunction = error.code === 'PGRST202' || error.message?.includes('customer_name_exists');
    if (!missingFunction) {
      throw error;
    }

    let query = supabase
      .from('customers')
      .select('id, company_name')
      .eq('is_active', true)
      .limit(10000);

    if (excludeCustomerId) {
      query = query.neq('id', excludeCustomerId);
    }

    const fallback = await query;
    if (fallback.error) throw fallback.error;

    const duplicate = (fallback.data || []).some(customer =>
      normalizeCustomerName((customer as { company_name?: string }).company_name || '') === normalizedName
    );

    if (duplicate) {
      throw new Error(DUPLICATE_CUSTOMER_MESSAGE);
    }

    return;
  }

  if (data) {
    throw new Error(DUPLICATE_CUSTOMER_MESSAGE);
  }
};
