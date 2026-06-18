import { supabase } from '../lib/supabase';

export type DeliveryAlertLevel = 'due_soon' | 'overdue';

export interface SalesOrderDeliveryAlert {
  soId: string;
  soNumber: string;
  customerName: string;
  expectedDeliveryDate: string;
  level: DeliveryAlertLevel;
  daysUntilDue: number;
}

interface SalesOrderRow {
  id: string;
  so_number: string;
  expected_delivery_date: string | null;
  status: string;
  is_archived: boolean | null;
  customers?: { company_name?: string | null } | null;
}

interface DeliveryChallanRow {
  id?: string;
  sales_order_id: string | null;
}

interface SalesInvoiceRow {
  id: string;
  sales_order_id: string | null;
}

interface SalesInvoiceItemRow {
  invoice_id: string;
  delivery_challan_item_id: string | null;
}

interface DeliveryChallanItemRow {
  id: string;
  challan_id: string;
}

export function getDeliveryAlertForOrder(
  order: Pick<SalesOrderRow, 'id' | 'so_number' | 'expected_delivery_date' | 'status'> & {
    customers?: { company_name?: string | null } | null;
  },
  hasApprovedDc: boolean,
  today = new Date()
): SalesOrderDeliveryAlert | null {
  if (hasApprovedDc || !order.expected_delivery_date) return null;
  if (['closed', 'cancelled', 'rejected'].includes(order.status)) return null;

  const startOfToday = new Date(today);
  startOfToday.setHours(0, 0, 0, 0);

  const dueDate = new Date(`${order.expected_delivery_date}T00:00:00`);
  const daysUntilDue = Math.ceil((dueDate.getTime() - startOfToday.getTime()) / 86400000);

  if (daysUntilDue < 0) {
    return {
      soId: order.id,
      soNumber: order.so_number,
      customerName: order.customers?.company_name || 'Customer',
      expectedDeliveryDate: order.expected_delivery_date,
      level: 'overdue',
      daysUntilDue,
    };
  }

  if (daysUntilDue <= 3) {
    return {
      soId: order.id,
      soNumber: order.so_number,
      customerName: order.customers?.company_name || 'Customer',
      expectedDeliveryDate: order.expected_delivery_date,
      level: 'due_soon',
      daysUntilDue,
    };
  }

  return null;
}

export async function fetchApprovedDeliverySalesOrderIds(orderIds: string[]): Promise<Set<string>> {
  if (orderIds.length === 0) return new Set();

  const { data: approvedDcs, error: dcError } = await supabase
    .from('delivery_challans')
    .select('id, sales_order_id')
    .or(`sales_order_id.in.(${orderIds.join(',')}),sales_order_id.is.null`)
    .eq('approval_status', 'approved');

  if (dcError) throw dcError;

  const deliveredSoIds = new Set((approvedDcs || [])
    .map((dc: DeliveryChallanRow) => dc.sales_order_id)
    .filter(Boolean) as string[]);

  const approvedDcIds = (approvedDcs || [])
    .map((dc: DeliveryChallanRow) => dc.id)
    .filter(Boolean) as string[];

  if (approvedDcIds.length === 0) return deliveredSoIds;

  const { data: invoices, error: invoicesError } = await supabase
    .from('sales_invoices')
    .select('id, sales_order_id')
    .in('sales_order_id', orderIds);

  if (invoicesError) throw invoicesError;

  const invoiceToSo = new Map((invoices || [])
    .filter((invoice: SalesInvoiceRow) => Boolean(invoice.sales_order_id))
    .map((invoice: SalesInvoiceRow) => [invoice.id, invoice.sales_order_id!]));

  if (invoiceToSo.size === 0) return deliveredSoIds;

  const { data: invoiceItems, error: invoiceItemsError } = await supabase
    .from('sales_invoice_items')
    .select('invoice_id, delivery_challan_item_id')
    .in('invoice_id', Array.from(invoiceToSo.keys()))
    .not('delivery_challan_item_id', 'is', null);

  if (invoiceItemsError) throw invoiceItemsError;

  const dcItemIds = Array.from(new Set((invoiceItems || [])
    .map((item: SalesInvoiceItemRow) => item.delivery_challan_item_id)
    .filter(Boolean) as string[]));

  if (dcItemIds.length === 0) return deliveredSoIds;

  const { data: dcItems, error: dcItemsError } = await supabase
    .from('delivery_challan_items')
    .select('id, challan_id')
    .in('id', dcItemIds)
    .in('challan_id', approvedDcIds);

  if (dcItemsError) throw dcItemsError;

  const approvedDcItemIds = new Set((dcItems || []).map((item: DeliveryChallanItemRow) => item.id));
  (invoiceItems || []).forEach((item: SalesInvoiceItemRow) => {
    if (!item.delivery_challan_item_id || !approvedDcItemIds.has(item.delivery_challan_item_id)) return;
    const soId = invoiceToSo.get(item.invoice_id);
    if (soId) deliveredSoIds.add(soId);
  });

  return deliveredSoIds;
}

export async function fetchSalesOrderDeliveryAlerts(): Promise<SalesOrderDeliveryAlert[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueSoonCutoff = new Date(today);
  dueSoonCutoff.setDate(dueSoonCutoff.getDate() + 3);

  const { data: orders, error: ordersError } = await supabase
    .from('sales_orders')
    .select('id, so_number, expected_delivery_date, status, is_archived, customers(company_name)')
    .eq('is_archived', false)
    .not('expected_delivery_date', 'is', null)
    .lte('expected_delivery_date', dueSoonCutoff.toISOString().split('T')[0])
    .not('status', 'in', '("closed","cancelled","rejected")');

  if (ordersError) throw ordersError;
  if (!orders || orders.length === 0) return [];

  const orderIds = orders.map((order) => order.id);
  const deliveredSoIds = await fetchApprovedDeliverySalesOrderIds(orderIds);

  return (orders as SalesOrderRow[])
    .map((order) => getDeliveryAlertForOrder(order, deliveredSoIds.has(order.id), today))
    .filter((alert): alert is SalesOrderDeliveryAlert => Boolean(alert));
}

export function summarizeDeliveryAlerts(alerts: SalesOrderDeliveryAlert[]) {
  return {
    dueSoon: alerts.filter((alert) => alert.level === 'due_soon'),
    overdue: alerts.filter((alert) => alert.level === 'overdue'),
  };
}
