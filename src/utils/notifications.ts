import { supabase } from '../lib/supabase';

interface NotificationParams {
  userId: string;
  type: 'low_stock' | 'near_expiry' | 'pending_invoice' | 'follow_up';
  title: string;
  message: string;
  referenceId?: string;
  referenceType?: string;
}

// Insert notification using ON CONFLICT DO NOTHING — the DB unique index on
// (user_id, type, message) WHERE is_read=false prevents duplicates even from
// parallel browser tabs hitting the same interval simultaneously.
export async function createNotification(params: NotificationParams) {
  try {
    const { error } = await supabase
      .from('notifications')
      .insert([{
        user_id: params.userId,
        type: params.type,
        title: params.title,
        message: params.message,
        reference_id: params.referenceId || null,
        reference_type: params.referenceType || null,
        is_read: false,
      }], { onConflict: 'user_id,type,message' } as any);

    // 23505 = unique_violation — expected when dedup index blocks a duplicate; not an error
    if (error && (error as any).code !== '23505') throw error;
  } catch (error) {
    console.error('Error creating notification:', error);
  }
}

// Check if a daily notification has already been sent today (read or unread).
// The daily dedup index covers this at DB level, but we skip the insert entirely
// to avoid unnecessary round-trips.
async function dailyNotifExistsToday(userId: string, type: string): Promise<boolean> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data } = await supabase
    .from('notifications')
    .select('id')
    .eq('user_id', userId)
    .eq('type', type)
    .gte('created_at', todayStart.toISOString())
    .limit(1);

  return !!(data && data.length > 0);
}

export async function checkAndCreateLowStockNotifications() {
  try {
    const { data: products } = await supabase
      .from('products')
      .select('id, product_name, min_stock_level, current_stock')
      .gt('min_stock_level', 0);

    if (!products || products.length === 0) return;

    const lowStockProducts: { product_name: string; current_stock: number; min_stock_level: number }[] = [];

    for (const product of products) {
      const stock = product.current_stock ?? 0;
      if (stock < product.min_stock_level) {
        lowStockProducts.push({
          product_name: product.product_name,
          current_stock: stock,
          min_stock_level: product.min_stock_level,
        });
      }
    }

    if (lowStockProducts.length === 0) return;

    const { data: users } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('is_active', true)
      .in('role', ['admin', 'warehouse']);

    if (!users) return;

    // Build a descriptive message listing the product names
    const productList = lowStockProducts.map(p => p.product_name).join(', ');
    const message = lowStockProducts.length === 1
      ? `${productList} is running low on stock.`
      : `${lowStockProducts.length} products low on stock: ${productList}.`;

    for (const user of users) {
      if (await dailyNotifExistsToday(user.id, 'low_stock')) continue;

      await createNotification({
        userId: user.id,
        type: 'low_stock',
        title: 'Low Stock Alert',
        message,
      });
    }
  } catch (error) {
    console.error('Error checking low stock:', error);
  }
}

export async function checkAndCreateExpiryNotifications() {
  try {
    const { data: settings } = await supabase
      .from('app_settings')
      .select('expiry_alert_days')
      .limit(1)
      .maybeSingle();

    const alertDays = settings?.expiry_alert_days || 30;
    const alertDate = new Date();
    alertDate.setDate(alertDate.getDate() + alertDays);

    const { data: nearExpiryBatches } = await supabase
      .from('batches')
      .select('id, batch_number, expiry_date, products(product_name)')
      .eq('is_active', true)
      .not('expiry_date', 'is', null)
      .lte('expiry_date', alertDate.toISOString())
      .gte('expiry_date', new Date().toISOString());

    if (!nearExpiryBatches || nearExpiryBatches.length === 0) return;

    const { data: users } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('is_active', true)
      .in('role', ['admin', 'warehouse', 'sales']);

    if (!users) return;

    const message = `${nearExpiryBatches.length} batch(es) will expire within ${alertDays} days.`;

    for (const user of users) {
      if (await dailyNotifExistsToday(user.id, 'near_expiry')) continue;

      await createNotification({
        userId: user.id,
        type: 'near_expiry',
        title: 'Products Near Expiry',
        message,
      });
    }
  } catch (error) {
    console.error('Error checking expiry dates:', error);
  }
}

export async function checkAndCreateFollowUpNotifications() {
  try {
    const today = new Date().toISOString().split('T')[0];

    const { data: dueActivities } = await supabase
      .from('crm_activities')
      .select('id, customer_id, activity_type, crm_contacts(company_name)')
      .eq('is_completed', false)
      .not('follow_up_date', 'is', null)
      .lte('follow_up_date', today);

    if (!dueActivities || dueActivities.length === 0) return;

    const { data: users } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('is_active', true)
      .in('role', ['admin', 'sales']);

    if (!users) return;

    const message = `You have ${dueActivities.length} follow-up(s) due today.`;

    for (const user of users) {
      // Skip if already sent any follow_up notification today (read or unread)
      if (await dailyNotifExistsToday(user.id, 'follow_up')) continue;

      await createNotification({
        userId: user.id,
        type: 'follow_up',
        title: 'Follow-ups Due',
        message,
      });
    }
  } catch (error) {
    console.error('Error checking follow-ups:', error);
  }
}

let notificationInterval: ReturnType<typeof setInterval> | null = null;

export async function initializeNotificationChecks() {
  if (notificationInterval) {
    clearInterval(notificationInterval);
  }

  await checkAndCreateLowStockNotifications();
  await checkAndCreateExpiryNotifications();
  await checkAndCreateFollowUpNotifications();

  notificationInterval = setInterval(async () => {
    await checkAndCreateLowStockNotifications();
    await checkAndCreateExpiryNotifications();
    await checkAndCreateFollowUpNotifications();
  }, 600000);
}
