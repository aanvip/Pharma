import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useFinance } from '../contexts/FinanceContext';
import { Layout } from '../components/Layout';
import { FileText, Plus, Search, Filter, Eye, CreditCard as Edit, Trash2, XCircle, FileCheck, CheckCircle, Paperclip, Download, ExternalLink } from 'lucide-react';
import { Modal } from '../components/Modal';
import SalesOrderForm from '../components/SalesOrderForm';
import { ProformaInvoiceView } from '../components/ProformaInvoiceView';
import { DeliveryChallanView } from '../components/DeliveryChallanView';
import { InvoiceView } from '../components/InvoiceView';
import { showToast } from '../components/ToastNotification';
import { showConfirm } from '../components/ConfirmDialog';
import { formatDate } from '../utils/dateFormat';
import { fetchLinkedDocumentsBundle, LinkedDocRef } from '../utils/linkedDocuments';
import { LinkedDocsCell } from '../components/LinkedDocsCell';

interface Customer {
  id: string;
  company_name: string;
}

interface Product {
  id: string;
  product_name: string;
  product_code: string;
}

interface SalesOrderItem {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  discount_amount: number;
  tax_percent: number;
  tax_amount: number;
  line_total: number;
  item_delivery_date?: string;
  notes?: string;
  delivered_quantity: number;
  products?: Product;
}

interface SODeliveryInvoiceStatus {
  so_id: string;
  delivery_status: 'pending' | 'partial' | 'completed';
  invoice_status: 'pending' | 'partial' | 'completed';
  special_status: string | null;
  approved_dc_count: number;
  invoice_count: number;
}

interface SalesOrder {
  id: string;
  so_number: string;
  customer_id: string;
  customer_po_number: string;
  customer_po_date: string;
  customer_po_file_url?: string;
  so_date: string;
  currency: string;
  expected_delivery_date?: string;
  notes?: string;
  status: string;
  subtotal_amount: number;
  tax_amount: number;
  total_amount: number;
  created_by: string;
  created_at: string;
  approved_by?: string;
  approved_at?: string;
  rejected_by?: string;
  rejected_at?: string;
  rejection_reason?: string;
  customers?: Customer;
  sales_order_items?: SalesOrderItem[];
}
interface LinkedDeliveryChallan { id: string; challan_number: string; challan_date: string; status: string; total_amount: number; }
interface LinkedSalesInvoice { id: string; invoice_number: string; invoice_date: string; payment_status: string; total_amount: number; }

export default function SalesOrders() {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const { dateRange } = useFinance();
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<SalesOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingOrder, setEditingOrder] = useState<SalesOrder | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [orderToReject, setOrderToReject] = useState<string | null>(null);
  const [showPOModal, setShowPOModal] = useState(false);
  const [selectedPOUrl, setSelectedPOUrl] = useState<string | null>(null);
  const [poBlobUrl, setPoBlobUrl] = useState<string | null>(null);
  const [poLoading, setPoLoading] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archiveReason, setArchiveReason] = useState('');
  const [orderToArchive, setOrderToArchive] = useState<string | null>(null);
  const [showProformaModal, setShowProformaModal] = useState(false);
  const [proformaOrder, setProformaOrder] = useState<SalesOrder | null>(null);
  const [soStatuses, setSoStatuses] = useState<Map<string, SODeliveryInvoiceStatus>>(new Map());
  const [soLinkedChallans, setSoLinkedChallans] = useState<Map<string, LinkedDeliveryChallan[]>>(new Map());
  const [soLinkedInvoices, setSoLinkedInvoices] = useState<Map<string, LinkedSalesInvoice[]>>(new Map());
  const [linkedChallanPreview, setLinkedChallanPreview] = useState<any | null>(null);
  const [linkedChallanItems, setLinkedChallanItems] = useState<any[]>([]);
  const [linkedInvoicePreview, setLinkedInvoicePreview] = useState<any | null>(null);
  const [linkedInvoiceItems, setLinkedInvoiceItems] = useState<any[]>([]);

  useEffect(() => {
    fetchSalesOrders();
    fetchCustomers();
  }, [activeTab, dateRange.startDate, dateRange.endDate]);

  useEffect(() => {
    filterOrders();
  }, [searchTerm, statusFilter, salesOrders, activeTab]);

  const fetchSOStatuses = async (orderIds: string[]) => {
    if (orderIds.length === 0) return;
    try {
      const { data, error } = await supabase
        .from('so_delivery_invoice_status')
        .select('*')
        .in('so_id', orderIds);
      if (error) throw error;
      const map = new Map<string, SODeliveryInvoiceStatus>();
      (data || []).forEach((row: SODeliveryInvoiceStatus) => map.set(row.so_id, row));
      setSoStatuses(map);
    } catch (err) {
      console.error('Error fetching SO statuses:', err);
    }
  };

  const fetchSalesOrders = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('sales_orders')
        .select(`
          *,
          customers (
            id,
            company_name,
            address,
            city,
            phone,
            npwp,
            pharmacy_license,
            gst_vat_type
          ),
          sales_order_items (
            id,
            product_id,
            quantity,
            unit_price,
            discount_percent,
            discount_amount,
            tax_percent,
            tax_amount,
            line_total,
            item_delivery_date,
            notes,
            delivered_quantity,
            products (
              id,
              product_name,
              product_code,
              unit
            )
          )
        `);

      if (activeTab === 'active') {
        query = query.eq('is_archived', false);
      } else {
        query = query.eq('is_archived', true);
      }

      query = query
        .gte('so_date', dateRange.startDate)
        .lte('so_date', dateRange.endDate);

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      setSalesOrders(data || []);
      fetchSOStatuses((data || []).map((o: SalesOrder) => o.id));
      fetchLinkedDocuments((data || []).map((o: SalesOrder) => o.id));
    } catch (error: any) {
      console.error('Error fetching sales orders:', error.message);
      showToast({ type: 'error', title: 'Error', message: t('errors.failedToLoadSalesOrders') });
    } finally {
      setLoading(false);
    }
  };
  const fetchLinkedDocuments = async (orderIds: string[]) => {
    if (orderIds.length === 0) return;
    try {
      const { soMap } = await fetchLinkedDocumentsBundle();
      const dcMap = new Map<string, LinkedDeliveryChallan[]>();
      const invMap = new Map<string, LinkedSalesInvoice[]>();
      orderIds.forEach((id) => {
        const linked = soMap.get(id);
        dcMap.set(id, (linked?.dcs || []).map((dc) => ({ id: dc.id, challan_number: dc.number, challan_date: '', status: '', total_amount: 0 })));
        invMap.set(id, (linked?.invs || []).map((inv) => ({ id: inv.id, invoice_number: inv.number, invoice_date: '', payment_status: '', total_amount: 0 })));
      });
      setSoLinkedChallans(dcMap);
      setSoLinkedInvoices(invMap);
    } catch (err) {
      console.error('Error fetching linked SO docs:', err);
    }
  };


  const openLinkedChallanView = async (challanId: string) => {
    const [{ data: challan }, { data: items }] = await Promise.all([
      supabase.from('delivery_challans').select('*, customers(company_name, address, city, phone, pbf_license)').eq('id', challanId).maybeSingle(),
      supabase.from('delivery_challan_items').select('*, products(product_name, product_code, unit), batches(batch_number, expiry_date, packaging_details)').eq('challan_id', challanId)
    ]);
    if (!challan) return;
    setLinkedChallanPreview(challan);
    setLinkedChallanItems(items || []);
  };

  const openLinkedInvoiceView = async (invoiceId: string) => {
    const { data: invoice } = await supabase
      .from('sales_invoices')
      .select('*, customers(company_name, address, city, phone, npwp, pharmacy_license, gst_vat_type)')
      .eq('id', invoiceId)
      .maybeSingle();
    if (!invoice) return;
    const { data: items } = await supabase
      .from('sales_invoice_items')
      .select('*, products(product_name, product_code, unit), batches(batch_number, expiry_date, packaging_details), delivery_challan_items(id, challan_id)')
      .eq('invoice_id', invoice.id);
    setLinkedInvoicePreview(invoice);
    setLinkedInvoiceItems(items || []);
  };

  const fetchCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('id, company_name')
        .eq('is_active', true)
        .order('company_name');

      if (error) throw error;
      setCustomers(data || []);
    } catch (error: any) {
      console.error('Error fetching customers:', error.message);
    }
  };

  const formatCurrency = (amount: number, currency: string) => {
    if (currency === 'USD') {
      return `$ ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `Rp ${amount.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const filterOrders = () => {
    let filtered = salesOrders;

    if (searchTerm) {
      filtered = filtered.filter(order =>
        order.so_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.customer_po_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.customers?.company_name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(order => order.status === statusFilter);
    }

    setFilteredOrders(filtered);
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { color: string; label: string }> = {
      draft: { color: 'bg-gray-100 text-gray-800', label: t('common.draft') },
      pending_approval: { color: 'bg-yellow-100 text-yellow-800', label: t('common.pending') },
      approved: { color: 'bg-green-100 text-green-800', label: t('common.approved') },
      rejected: { color: 'bg-red-100 text-red-800', label: t('common.rejected') },
      stock_reserved: { color: 'bg-blue-100 text-blue-800', label: t('stock.reserved') },
      shortage: { color: 'bg-orange-100 text-orange-800', label: 'Shortage' },
      pending_delivery: { color: 'bg-blue-100 text-blue-800', label: 'Pending Delivery' },
      partially_delivered: { color: 'bg-blue-100 text-blue-800', label: 'Partially Delivered' },
      delivered: { color: 'bg-teal-100 text-teal-800', label: 'Delivered' },
      closed: { color: 'bg-gray-100 text-gray-800', label: 'Closed' },
      cancelled: { color: 'bg-red-100 text-red-800', label: t('common.cancelled') },
    };

    const config = statusConfig[status] || { color: 'bg-gray-100 text-gray-800', label: status };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${config.color}`}>
        {config.label}
      </span>
    );
  };

  const getOrderStatusBadge = (order: SalesOrder) => {
    // Cancelled always wins
    if (order.status === 'cancelled') {
      return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">Cancelled</span>;
    }

    const s = soStatuses.get(order.id);

    if (s) {
      const hasDC = s.approved_dc_count > 0;
      const hasInvoice = s.invoice_count > 0;
      const deliveryDone = s.delivery_status === 'completed';
      const invoiceDone = s.invoice_status === 'completed';

      if (deliveryDone && invoiceDone) {
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">Completed</span>;
      }
      if (hasInvoice && !hasDC) {
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">Invoiced</span>;
      }
      if (deliveryDone && !invoiceDone) {
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-800">Delivered</span>;
      }
      if (hasDC || hasInvoice) {
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-700">Processing</span>;
      }
    }

    // No DC, no Invoice — fall back to internal SO status
    if (['delivered', 'partially_delivered'].includes(order.status)) {
      return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-800">Delivered</span>;
    }
    if (['stock_reserved', 'pending_delivery', 'approved', 'shortage'].includes(order.status)) {
      return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-700">Processing</span>;
    }
    if (['pending_approval', 'draft'].includes(order.status)) {
      return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">Pending</span>;
    }

    return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">Pending</span>;
  };

  const getDeliveryStatusBadge = (soId: string) => {
    const s = soStatuses.get(soId);
    if (!s) return <span className="text-gray-400 text-xs">—</span>;
    if (s.special_status === 'invoice_done_delivery_pending') {
      return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-800">Invoice Done, Delivery Pending</span>;
    }
    const cfg: Record<string, { color: string; label: string }> = {
      pending: { color: 'bg-gray-100 text-gray-700', label: 'Pending' },
      partial: { color: 'bg-blue-100 text-blue-700', label: 'Partial' },
      completed: { color: 'bg-teal-100 text-teal-700', label: 'Completed' },
    };
    const c = cfg[s.delivery_status] || { color: 'bg-gray-100 text-gray-700', label: s.delivery_status };
    return <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${c.color}`}>{c.label}</span>;
  };

  const getInvoiceStatusBadge = (soId: string) => {
    const s = soStatuses.get(soId);
    if (!s) return <span className="text-gray-400 text-xs">—</span>;
    const cfg: Record<string, { color: string; label: string }> = {
      pending: { color: 'bg-gray-100 text-gray-700', label: 'Pending' },
      partial: { color: 'bg-yellow-100 text-yellow-700', label: 'Partial' },
      completed: { color: 'bg-green-100 text-green-700', label: 'Completed' },
    };
    const c = cfg[s.invoice_status] || { color: 'bg-gray-100 text-gray-700', label: s.invoice_status };
    return <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${c.color}`}>{c.label}</span>;
  };

  const handleSubmitForApproval = async (orderId: string) => {
    if (!await showConfirm({ title: 'Confirm', message: t('salesOrders.submitForApproval') + '?', variant: 'warning' })) return;

    try {
      const { error } = await supabase
        .from('sales_orders')
        .update({ status: 'pending_approval', updated_at: new Date().toISOString() })
        .eq('id', orderId);

      if (error) throw error;

      showToast({ type: 'success', title: 'Success', message: t('success.salesOrderSubmitted') });
      fetchSalesOrders();
    } catch (error: any) {
      console.error('Error submitting for approval:', error.message);
      showToast({ type: 'error', title: 'Error', message: t('errors.failedToUpdate') });
    }
  };

  const handleArchiveOrder = async () => {
    if (!orderToArchive || !archiveReason.trim()) {
      showToast({ type: 'error', title: 'Error', message: t('validation.enterArchiveReason') });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('sales_orders')
        .update({
          is_archived: true,
          archived_at: new Date().toISOString(),
          archived_by: user.id,
          archive_reason: archiveReason,
          updated_at: new Date().toISOString()
        })
        .eq('id', orderToArchive);

      if (error) throw error;

      showToast({ type: 'success', title: 'Success', message: t('success.salesOrderArchived') });
      setShowArchiveModal(false);
      setArchiveReason('');
      setOrderToArchive(null);
      fetchSalesOrders();
    } catch (error: any) {
      console.error('Error archiving order:', error.message);
      showToast({ type: 'error', title: 'Error', message: t('errors.failedToUpdate') });
    }
  };

  const handleUnarchiveOrder = async (orderId: string) => {
    if (!await showConfirm({ title: 'Confirm', message: t('common.unarchive') + '?', variant: 'warning' })) return;

    try {
      const { error } = await supabase
        .from('sales_orders')
        .update({
          is_archived: false,
          archived_at: null,
          archived_by: null,
          archive_reason: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);

      if (error) throw error;

      showToast({ type: 'success', title: 'Success', message: t('success.salesOrderUnarchived') });
      fetchSalesOrders();
    } catch (error: any) {
      console.error('Error unarchiving order:', error.message);
      showToast({ type: 'error', title: 'Error', message: t('errors.failedToUpdate') });
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    const reason = prompt('Enter cancellation reason:');
    if (!reason) return;

    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) throw new Error('Not authenticated');

      const { error } = await supabase.rpc('fn_cancel_sales_order', {
        p_so_id: orderId,
        p_canceller_id: currentUser.id,
        p_reason: reason
      });

      if (error) throw error;

      showToast({ type: 'success', title: 'Success', message: t('success.salesOrderCancelled') });
      fetchSalesOrders();
    } catch (error: any) {
      console.error('Error cancelling order:', error.message);
      showToast({ type: 'error', title: 'Error', message: 'Failed to cancel order' });
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (!await showConfirm({ title: 'Confirm', message: 'Are you sure you want to delete this sales order?', variant: 'danger', confirmLabel: 'Delete' })) return;

    try {
      const { error } = await supabase
        .from('sales_orders')
        .delete()
        .eq('id', orderId);

      if (error) throw error;

      showToast({ type: 'success', title: 'Success', message: 'Sales order deleted successfully!' });
      fetchSalesOrders();
    } catch (error: any) {
      console.error('Error deleting order:', error.message);
      showToast({ type: 'error', title: 'Error', message: 'Failed to delete order' });
    }
  };

  const handleViewOrder = (order: SalesOrder) => {
    setProformaOrder(order);
    setShowProformaModal(true);
  };

  const handleEditOrder = (order: SalesOrder) => {
    setEditingOrder(order);
    setShowCreateModal(true);
  };

  const handleApproveOrder = async (orderId: string) => {
    if (!await showConfirm({ title: 'Confirm', message: 'Approve this sales order? Stock will be reserved automatically.', variant: 'warning' })) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Update order status to approved
      const { error: updateError } = await supabase
        .from('sales_orders')
        .update({
          status: 'approved',
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);

      if (updateError) throw updateError;

      // Call NEW stock reservation function (v2 - only reserves, doesn't deduct)
      const { data: reserveResult, error: reserveError } = await supabase
        .rpc('fn_reserve_stock_for_so_v2', { p_so_id: orderId });

      if (reserveError) {
        console.error('Error reserving stock:', reserveError);
        console.error('Supabase request failed', reserveError);
        showToast({ type: 'warning', title: 'Warning', message: 'Order approved but stock reservation failed: ' + reserveError.message });
      } else if (reserveResult && reserveResult.length > 0) {
        const result = reserveResult[0];
        if (result.success) {
          showToast({ type: 'success', title: 'Success', message: 'Sales order approved and stock fully reserved!' });
        } else {
          showToast({ type: 'warning', title: 'Warning', message: 'Order approved with stock shortage.\n\n' + result.message + '\n\nImport requirements have been created automatically.' });
        }
      } else {
        showToast({ type: 'success', title: 'Success', message: 'Sales order approved!' });
      }

      fetchSalesOrders();

      // Fire email notification (non-blocking — don't fail if it errors)
      supabase.functions.invoke('send-app-notifications', {
        body: { type: 'so_approved', data: { so_id: orderId } }
      }).catch(() => {});

    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error approving order:', msg);
      showToast({ type: 'error', title: 'Error', message: 'Failed to approve order' });
    }
  };

  const handleRejectOrder = async () => {
    if (!orderToReject || !rejectionReason.trim()) {
      showToast({ type: 'error', title: 'Error', message: 'Please enter a rejection reason' });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('sales_orders')
        .update({
          status: 'rejected',
          rejected_by: user.id,
          rejected_at: new Date().toISOString(),
          rejection_reason: rejectionReason,
          updated_at: new Date().toISOString()
        })
        .eq('id', orderToReject);

      if (error) throw error;

      showToast({ type: 'success', title: 'Success', message: 'Sales order rejected' });
      setShowRejectModal(false);
      setRejectionReason('');
      setOrderToReject(null);
      fetchSalesOrders();
    } catch (error: any) {
      console.error('Error rejecting order:', error.message);
      showToast({ type: 'error', title: 'Error', message: 'Failed to reject order' });
    }
  };

  const handleViewPO = async (poUrl: string) => {
    setSelectedPOUrl(poUrl);
    setShowPOModal(true);
    setPoLoading(true);
    setPoBlobUrl(null);
    try {
      const res = await fetch(poUrl);
      if (!res.ok) {
        // Bucket missing or file deleted — show fallback, don't render error JSON
        setPoBlobUrl(null);
        return;
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      setPoBlobUrl(blobUrl);
    } catch {
      setPoBlobUrl(null);
    } finally {
      setPoLoading(false);
    }
  };

  const handleDownloadPO = async (poUrl: string, filename?: string) => {
    try {
      const res = await fetch(poUrl);
      if (!res.ok) {
        showToast({ type: 'error', title: 'Download Failed', message: 'File not found. The storage bucket may not be set up yet.' });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Try to get filename from URL, fallback to provided name or generic name
      const urlFilename = poUrl.split('/').pop()?.split('?')[0] || 'customer-po';
      a.download = filename || urlFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      showToast({ type: 'error', title: 'Download Failed', message: 'Could not download the file.' });
    }
  };

  const stats = {
    total: salesOrders.length,
    pending_approval: salesOrders.filter(o => o.status === 'pending_approval').length,
    stock_reserved: salesOrders.filter(o => o.status === 'stock_reserved').length,
    shortage: salesOrders.filter(o => o.status === 'shortage').length,
    delivered: salesOrders.filter(o => o.status === 'delivered').length,
  };

  return (
    <Layout>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Sales Orders</h1>
          <p className="text-gray-600 mt-1">Manage customer purchase orders and track delivery</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-5 h-5" />
          New Sales Order
        </button>
      </div>

      <div className="mb-6 border-b border-gray-200">
        <nav className="flex gap-4">
          <button
            onClick={() => setActiveTab('active')}
            className={`px-4 py-2 font-medium border-b-2 transition ${
              activeTab === 'active'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Active Orders
          </button>
          <button
            onClick={() => setActiveTab('archived')}
            className={`px-4 py-2 font-medium border-b-2 transition ${
              activeTab === 'archived'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Archived Orders
          </button>
        </nav>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4 mb-6">
        <div className="bg-white p-3 md:p-4 rounded-lg shadow">
          <div className="text-xs md:text-sm text-gray-600 truncate">Total Orders</div>
          <div className="text-xl md:text-2xl font-bold text-gray-900">{stats.total}</div>
        </div>
        <div className="bg-white p-3 md:p-4 rounded-lg shadow">
          <div className="text-xs md:text-sm text-gray-600 truncate">Pending Approval</div>
          <div className="text-xl md:text-2xl font-bold text-yellow-600">{stats.pending_approval}</div>
        </div>
        <div className="bg-white p-3 md:p-4 rounded-lg shadow">
          <div className="text-xs md:text-sm text-gray-600 truncate">Stock Reserved</div>
          <div className="text-xl md:text-2xl font-bold text-blue-600">{stats.stock_reserved}</div>
        </div>
        <div className="bg-white p-3 md:p-4 rounded-lg shadow">
          <div className="text-xs md:text-sm text-gray-600 truncate">Shortage</div>
          <div className="text-xl md:text-2xl font-bold text-orange-600">{stats.shortage}</div>
        </div>
        <div className="bg-white p-3 md:p-4 rounded-lg shadow">
          <div className="text-xs md:text-sm text-gray-600 truncate">Delivered</div>
          <div className="text-xl md:text-2xl font-bold text-green-600">{stats.delivered}</div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow mb-6">
        <div className="p-4 border-b flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search by SO number, PO number, or customer..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border rounded-lg px-4 py-2"
          >
            <option value="all">All Status</option>
            <option value="draft">Draft</option>
            <option value="pending_approval">Pending Approval</option>
            <option value="approved">Approved</option>
            <option value="stock_reserved">Stock Reserved</option>
            <option value="shortage">Shortage</option>
            <option value="pending_delivery">Pending Delivery</option>
            <option value="partially_delivered">Partially Delivered</option>
            <option value="delivered">Delivered</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">SO Number</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">PO Number</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">SO Date</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Delivery Date</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase min-w-[150px]">Linked Docs</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Order Status</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-3 py-2 text-center text-gray-500">
                    Loading...
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-2 text-center text-gray-500">
                    No sales orders found
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{order.so_number}</div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{order.customers?.company_name}</div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <div className="text-sm text-gray-900">{order.customer_po_number}</div>
                        {order.customer_po_file_url && (
                          <>
                            <button
                              onClick={() => handleViewPO(order.customer_po_file_url!)}
                              className="text-blue-600 hover:text-blue-800"
                              title="View uploaded PO"
                              type="button"
                            >
                              <Paperclip className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDownloadPO(order.customer_po_file_url!, order.customer_po_number || 'customer-po')}
                              className="text-gray-500 hover:text-gray-700"
                              title="Download uploaded PO"
                              type="button"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">{formatDate(order.customer_po_date)}</div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(order.so_date)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">
                      {order.expected_delivery_date ? formatDate(order.expected_delivery_date) : '-'}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-xs font-medium text-gray-900">{formatCurrency(order.total_amount, order.currency || 'IDR')}</td>
                    <td className="px-3 py-2 min-w-[150px]">
                      <LinkedDocsCell
                        sos={[]}
                        dcs={(soLinkedChallans.get(order.id) || []).map((dc) => ({ id: dc.id, number: dc.challan_number, type: 'dc' as const }))}
                        invs={(soLinkedInvoices.get(order.id) || []).map((inv) => ({ id: inv.id, number: inv.invoice_number, type: 'inv' as const }))}
                        onClick={(doc: LinkedDocRef) => { if (doc.type === 'dc') openLinkedChallanView(doc.id); if (doc.type === 'inv') openLinkedInvoiceView(doc.id); }}
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex flex-col items-center gap-1">
                        {getOrderStatusBadge(order)}
                        {order.status === 'pending_approval' && profile?.role === 'admin' && (
                          <div className="flex items-center gap-1 mt-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleApproveOrder(order.id);
                              }}
                              className="p-1.5 bg-green-100 hover:bg-green-200 rounded-lg transition-colors"
                              title="Approve Order"
                            >
                              <CheckCircle className="w-4 h-4 text-green-600" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOrderToReject(order.id);
                                setShowRejectModal(true);
                              }}
                              className="p-1.5 bg-red-100 hover:bg-red-200 rounded-lg transition-colors"
                              title="Reject Order"
                            >
                              <XCircle className="w-4 h-4 text-red-600" />
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleViewOrder(order)}
                          className="text-blue-600 hover:text-blue-800"
                          title="View Proforma Invoice"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {!['delivered', 'closed', 'cancelled', 'partially_delivered', 'pending_delivery'].includes(order.status) &&
                          (!['approved', 'stock_reserved', 'shortage'].includes(order.status) || profile?.role === 'admin') && (
                          <button
                            onClick={() => handleEditOrder(order)}
                            className="text-indigo-600 hover:text-indigo-800"
                            title={['approved', 'stock_reserved', 'shortage'].includes(order.status) ? 'Edit (Admin Only)' : 'Edit'}
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                        )}
                        {order.status === 'draft' && (
                          <>
                            <button
                              onClick={() => handleSubmitForApproval(order.id)}
                              className="text-green-600 hover:text-green-800"
                              title="Submit for Approval"
                            >
                              <FileCheck className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteOrder(order.id)}
                              className="text-red-600 hover:text-red-800"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {!['cancelled', 'closed', 'delivered', 'rejected'].includes(order.status) &&
                          activeTab === 'active' &&
                          (!['approved', 'stock_reserved', 'shortage', 'pending_delivery'].includes(order.status) || profile?.role === 'admin') && (
                          <button
                            onClick={() => handleCancelOrder(order.id)}
                            className="text-orange-600 hover:text-orange-800"
                            title="Cancel"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        )}
                        {activeTab === 'active' && ['admin', 'sales'].includes(profile?.role || '') && ['delivered', 'cancelled'].includes(order.status) && (
                          <button
                            onClick={() => {
                              setOrderToArchive(order.id);
                              setShowArchiveModal(true);
                            }}
                            className="text-gray-600 hover:text-gray-800"
                            title="Archive Order"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                        )}
                        {activeTab === 'archived' && ['admin', 'sales'].includes(profile?.role || '') && (
                          <button
                            onClick={() => handleUnarchiveOrder(order.id)}
                            className="text-green-600 hover:text-green-800"
                            title="Unarchive Order"
                          >
                            <FileCheck className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showCreateModal && (
        <Modal
          isOpen={showCreateModal}
          onClose={() => {
            setShowCreateModal(false);
            setEditingOrder(null);
          }}
          title={editingOrder ? "Edit Sales Order" : "Create Sales Order"}
          maxWidth="max-w-6xl"
        >
          <SalesOrderForm
            existingOrder={editingOrder || undefined}
            onSuccess={() => {
              setShowCreateModal(false);
              setEditingOrder(null);
              fetchSalesOrders();
            }}
            onCancel={() => {
              setShowCreateModal(false);
              setEditingOrder(null);
            }}
          />
        </Modal>
      )}

      {showRejectModal && (
        <Modal
          isOpen={showRejectModal}
          onClose={() => {
            setShowRejectModal(false);
            setRejectionReason('');
            setOrderToReject(null);
          }}
          title="Reject Sales Order"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Rejection Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={4}
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="Enter reason for rejecting this sales order..."
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectionReason('');
                  setOrderToReject(null);
                }}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectOrder}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                disabled={!rejectionReason.trim()}
              >
                Reject Order
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showArchiveModal && (
        <Modal
          isOpen={showArchiveModal}
          onClose={() => {
            setShowArchiveModal(false);
            setArchiveReason('');
            setOrderToArchive(null);
          }}
          title="Archive Sales Order"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Archive Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                value={archiveReason}
                onChange={(e) => setArchiveReason(e.target.value)}
                rows={4}
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter reason for archiving this sales order (e.g., Completed and delivered, Cancelled by customer)..."
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowArchiveModal(false);
                  setArchiveReason('');
                  setOrderToArchive(null);
                }}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleArchiveOrder}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                disabled={!archiveReason.trim()}
              >
                Archive Order
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showPOModal && selectedPOUrl && (
        <Modal
          isOpen={showPOModal}
          onClose={() => {
            setShowPOModal(false);
            setSelectedPOUrl(null);
            if (poBlobUrl) { URL.revokeObjectURL(poBlobUrl); setPoBlobUrl(null); }
          }}
          title="Customer Purchase Order"
          size="xl"
        >
          <div className="flex flex-col gap-2" style={{ height: '75vh' }}>
            {/* Action bar — always visible */}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => handleDownloadPO(selectedPOUrl!)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-green-700 border border-green-200 rounded-lg hover:bg-green-50 transition"
              >
                <Download className="w-3.5 h-3.5" />
                Download
              </button>
              <a
                href={selectedPOUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open in new tab
              </a>
            </div>

            {poLoading && (
              <div className="flex-1 flex items-center justify-center bg-gray-50 rounded-lg border border-gray-200">
                <div className="text-center text-gray-500">
                  <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-sm">Loading document...</p>
                </div>
              </div>
            )}
            {!poLoading && poBlobUrl && (
              <iframe
                src={poBlobUrl}
                className="flex-1 w-full rounded-lg border border-gray-200"
                title="Customer Purchase Order"
              />
            )}
            {!poLoading && !poBlobUrl && (
              <div className="flex-1 flex items-center justify-center bg-gray-50 rounded-lg border border-gray-200">
                <div className="text-center text-gray-500 px-6">
                  <FileText className="w-10 h-10 mx-auto mb-3 text-gray-400" />
                  <p className="text-sm font-medium mb-2">Document cannot be previewed</p>
                  <p className="text-xs text-gray-400 mb-1">This usually means the storage bucket is not set up in Supabase.</p>
                  <p className="text-xs text-gray-400 mb-5">Please run the storage setup migration, then re-upload the file.</p>
                  <div className="flex justify-center gap-3">
                    <button
                      onClick={() => handleDownloadPO(selectedPOUrl!)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition"
                    >
                      <Download className="w-4 h-4" />
                      Try Download
                    </button>
                    <a
                      href={selectedPOUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Open in new tab
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {showProformaModal && proformaOrder && (
        <ProformaInvoiceView
          salesOrder={proformaOrder}
          items={proformaOrder.sales_order_items || []}
          onClose={() => {
            setShowProformaModal(false);
            setProformaOrder(null);
          }}
        />
      )}
      {linkedChallanPreview && (
        <DeliveryChallanView
          challan={linkedChallanPreview}
          items={linkedChallanItems}
          onClose={() => {
            setLinkedChallanPreview(null);
            setLinkedChallanItems([]);
          }}
        />
      )}

      {linkedInvoicePreview && (
        <InvoiceView
          invoice={linkedInvoicePreview}
          items={linkedInvoiceItems}
          onClose={() => {
            setLinkedInvoicePreview(null);
            setLinkedInvoiceItems([]);
          }}
        />
      )}

      </div>
    </Layout>
  );
}
