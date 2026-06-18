import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, CreditCard as Edit, Trash2, Search, FileText, Eye, X, AlertCircle, CreditCard } from 'lucide-react';
import { showConfirm } from '../ConfirmDialog';
import { Modal } from '../Modal';
import { SearchableSelect } from '../SearchableSelect';
import { FileUpload } from '../FileUpload';
import { showToast } from '../ToastNotification';
import { formatDate } from '../../utils/dateFormat';

interface Supplier {
  id: string;
  company_name: string;
  npwp: string | null;
  pkp_status: boolean;
  address: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
}

interface Product {
  id: string;
  product_name: string;
  unit: string;
  current_stock: number;
}

interface ChartOfAccount {
  id: string;
  code: string;
  name: string;
  account_type: string;
}

interface PurchaseInvoiceItem {
  id?: string;
  item_type: 'inventory' | 'fixed_asset' | 'expense' | 'freight' | 'duty' | 'insurance' | 'clearing' | 'other';
  product_id: string | null;
  product_name?: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  line_total: number;
  expense_account_id: string | null;
  asset_account_id: string | null;
  tax_percent: number;
  tax_amount: number;
}

interface PurchaseInvoice {
  id: string;
  invoice_number: string;
  supplier_id: string;
  invoice_date: string;
  due_date: string | null;
  currency: string;
  exchange_rate: number;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  balance_amount: number;
  status: string;
  faktur_pajak_number: string | null;
  notes: string | null;
  document_urls: string[] | null;
  purchase_type: string;
  requires_faktur_pajak: boolean;
  suppliers?: { company_name: string; pkp_status: boolean };
  journal_entry_id?: string | null;
}

interface PurchaseInvoiceManagerProps {
  canManage: boolean;
  onPayInvoice?: (invoice: { id: string; invoice_number: string; supplier_id: string; balance_amount: number }) => void;
}

export function PurchaseInvoiceManager({ canManage, onPayInvoice }: PurchaseInvoiceManagerProps) {
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [viewModal, setViewModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<PurchaseInvoice | null>(null);
  const [viewLineItems, setViewLineItems] = useState<PurchaseInvoiceItem[]>([]);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewBlobUrl, setViewBlobUrl] = useState<string | null>(null);
  const [viewBlobLoading, setViewBlobLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [uploading, setUploading] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<PurchaseInvoice | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [formData, setFormData] = useState({
    invoice_number: '',
    supplier_id: '',
    invoice_date: new Date().toISOString().split('T')[0],
    due_date: '',
    currency: 'IDR',
    exchange_rate: 1,
    faktur_pajak_number: '',
    notes: '',
    document_urls: [] as string[],
  });

  const [lineItems, setLineItems] = useState<PurchaseInvoiceItem[]>([
    {
      item_type: 'inventory',
      product_id: null,
      description: '',
      quantity: 1,
      unit: 'pcs',
      unit_price: 0,
      line_total: 0,
      expense_account_id: null,
      asset_account_id: null,
      tax_percent: 0,
      tax_amount: 0,
    },
  ]);

  useEffect(() => {
    loadInvoices();
    loadSuppliers();
    loadProducts();
    loadAccounts();
  }, []);

  const loadInvoices = async () => {
    try {
      const { data, error } = await supabase
        .from('purchase_invoices')
        .select('*, suppliers(company_name, pkp_status)')
        .order('invoice_date', { ascending: false });

      if (error) throw error;
      setInvoices(data || []);
    } catch (error) {
      console.error('Error loading invoices:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSuppliers = async () => {
    const { data } = await supabase
      .from('suppliers')
      .select('id, company_name, npwp, pkp_status, address, contact_person, phone, email')
      .order('company_name');
    setSuppliers(data || []);
  };

  const loadProducts = async () => {
    const { data } = await supabase
      .from('products')
      .select('id, product_name, unit, current_stock')
      .order('product_name');
    setProducts(data || []);
  };

  const loadAccounts = async () => {
    const { data } = await supabase
      .from('chart_of_accounts')
      .select('id, code, name, account_type')
      .in('account_type', ['Expense', 'Asset', 'Cost of Goods Sold', 'expense', 'asset', 'cost_of_goods_sold'])
      .order('code');
    setAccounts(data || []);
  };

  const loadViewLineItems = async (invoiceId: string) => {
    setViewLoading(true);
    try {
      const { data, error } = await supabase
        .from('purchase_invoice_items')
        .select('*, products(product_name, unit)')
        .eq('purchase_invoice_id', invoiceId)
        .order('created_at');
      if (error) throw error;
      const items = (data || []).map((item: any) => ({
        ...item,
        product_name: item.products?.product_name || null,
      }));
      setViewLineItems(items);
    } catch (err) {
      console.error('Error loading line items:', err);
      setViewLineItems([]);
    } finally {
      setViewLoading(false);
    }
  };

  const handleOpenView = async (invoice: PurchaseInvoice) => {
    setSelectedInvoice(invoice);
    setViewModal(true);
    setViewBlobUrl(null);
    await loadViewLineItems(invoice.id);
    if (invoice.document_urls && invoice.document_urls.length > 0) {
      setViewBlobLoading(true);
      try {
        const url = invoice.document_urls[0];

        // For Supabase Storage URLs, use them directly
        if (url.includes('supabase.co/storage/v1/object/public/')) {
          // Just set the URL directly - the PDF viewer will handle it
          setViewBlobUrl(url);
        } else {
          // For other URLs, try to fetch as blob
          const res = await fetch(url);
          if (res.ok) {
            const blob = await res.blob();
            setViewBlobUrl(URL.createObjectURL(blob));
          } else {
            console.error('Failed to fetch PDF:', res.status, res.statusText);
            setViewBlobUrl(null);
          }
        }
      } catch (err) {
        console.error('Error loading PDF:', err);
        setViewBlobUrl(null);
      } finally {
        setViewBlobLoading(false);
      }
    }
  };

  const selectedSupplier = suppliers.find(s => s.id === formData.supplier_id);

  const handleAddLine = () => {
    setLineItems([
      ...lineItems,
      {
        item_type: 'inventory',
        product_id: null,
        description: '',
        quantity: 1,
        unit: 'pcs',
        unit_price: 0,
        line_total: 0,
        expense_account_id: null,
        asset_account_id: null,
        tax_percent: 0,
        tax_amount: 0,
      },
    ]);
  };

  const handleRemoveLine = (index: number) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((_, i) => i !== index));
    }
  };

  const handleLineChange = (index: number, field: keyof PurchaseInvoiceItem, value: any) => {
    const newLines = [...lineItems];
    newLines[index] = { ...newLines[index], [field]: value };

    // Auto-calculate line total and tax amount
    if (field === 'quantity' || field === 'unit_price' || field === 'tax_percent') {
      const subtotal = newLines[index].quantity * newLines[index].unit_price;
      newLines[index].line_total = subtotal;
      newLines[index].tax_amount = subtotal * (newLines[index].tax_percent / 100);
    }

    // If item_type changes, clear product/account selections
    if (field === 'item_type') {
      newLines[index].product_id = null;
      newLines[index].expense_account_id = null;
      newLines[index].asset_account_id = null;
      newLines[index].description = '';
    }

    // If product changes, auto-fill details
    if (field === 'product_id' && value) {
      const product = products.find(p => p.id === value);
      if (product) {
        newLines[index].description = product.product_name;
        newLines[index].unit = product.unit;
        newLines[index].product_name = product.product_name;
      }
    }

    setLineItems(newLines);
  };

  const calculateTotals = () => {
    const subtotal = lineItems.reduce((sum, item) => sum + item.line_total, 0);
    const taxTotal = lineItems.reduce((sum, item) => sum + item.tax_amount, 0);
    const total = subtotal + taxTotal;

    return { subtotal, taxTotal, total };
  };

  const handleOpenEdit = async (invoice: PurchaseInvoice) => {
    setEditingInvoice(invoice);
    setFormData({
      invoice_number: invoice.invoice_number,
      supplier_id: invoice.supplier_id,
      invoice_date: invoice.invoice_date,
      due_date: invoice.due_date || '',
      currency: invoice.currency,
      exchange_rate: invoice.exchange_rate,
      faktur_pajak_number: invoice.faktur_pajak_number || '',
      notes: invoice.notes || '',
      document_urls: invoice.document_urls || [],
    });

    const { data } = await supabase
      .from('purchase_invoice_items')
      .select('*')
      .eq('purchase_invoice_id', invoice.id)
      .order('created_at');

    const items = (data || []).map((item: any) => ({
      id: item.id,
      item_type: item.item_type,
      product_id: item.product_id,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unit_price: item.unit_price,
      line_total: item.line_total,
      expense_account_id: item.expense_account_id,
      asset_account_id: item.asset_account_id,
      tax_percent: item.line_total > 0 ? Math.round((item.tax_amount / item.line_total) * 1000) / 10 : 0,
      tax_amount: item.tax_amount,
    }));

    setLineItems(items.length > 0 ? items : [{
      item_type: 'inventory' as const,
      product_id: null,
      description: '',
      quantity: 1,
      unit: 'pcs',
      unit_price: 0,
      line_total: 0,
      expense_account_id: null,
      asset_account_id: null,
      tax_percent: 0,
      tax_amount: 0,
    }]);
    setModalOpen(true);
  };

  const handleDelete = async (invoice: PurchaseInvoice) => {
    const confirmed = await showConfirm({
      title: 'Delete Purchase Invoice',
      message: `Are you sure you want to delete invoice "${invoice.invoice_number}"? This action cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;

    setDeleting(true);
    try {
      const { error: itemsErr } = await supabase
        .from('purchase_invoice_items')
        .delete()
        .eq('purchase_invoice_id', invoice.id);
      if (itemsErr) throw itemsErr;

      const { error } = await supabase
        .from('purchase_invoices')
        .delete()
        .eq('id', invoice.id);
      if (error) throw error;

      showToast({ type: 'success', title: 'Deleted', message: 'Purchase invoice deleted successfully.' });
      loadInvoices();
    } catch (error: any) {
      showToast({ type: 'error', title: 'Error', message: `Error: ${error.message}` });
    } finally {
      setDeleting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canManage) {
      showToast({ type: 'error', title: 'Error', message: 'You do not have permission to manage purchase invoices' });
      return;
    }

    if (!formData.supplier_id) {
      showToast({ type: 'error', title: 'Error', message: 'Please select a supplier' });
      return;
    }

    if (lineItems.length === 0 || lineItems.every(item => item.line_total === 0)) {
      showToast({ type: 'error', title: 'Error', message: 'Please add at least one line item' });
      return;
    }

    // Validate exchange rate for USD
    if (formData.currency === 'USD' && formData.exchange_rate <= 1) {
      showToast({ type: 'error', title: 'Error', message: 'Please enter a valid exchange rate for USD' });
      return;
    }

    // Validate required fields per item type
    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i];
      if (item.item_type === 'inventory' && !item.product_id) {
        showToast({ type: 'error', title: 'Error', message: `Line ${i + 1}: Please select a product for inventory items` });
        return;
      }
      if (item.item_type === 'expense' && !item.expense_account_id) {
        showToast({ type: 'error', title: 'Error', message: `Line ${i + 1}: Please select an expense account` });
        return;
      }
      if (item.item_type === 'fixed_asset' && !item.asset_account_id) {
        showToast({ type: 'error', title: 'Error', message: `Line ${i + 1}: Please select an asset account` });
        return;
      }
      if (!item.description.trim()) {
        showToast({ type: 'error', title: 'Error', message: `Line ${i + 1}: Please enter a description` });
        return;
      }
    }

    const totals = calculateTotals();

    try {
      const { data: userData } = await supabase.auth.getUser();

      const invoiceData = {
        invoice_number: formData.invoice_number.trim(),
        supplier_id: formData.supplier_id,
        invoice_date: formData.invoice_date,
        due_date: formData.due_date || null,
        currency: formData.currency,
        exchange_rate: formData.exchange_rate,
        subtotal: totals.subtotal,
        tax_amount: totals.taxTotal,
        total_amount: totals.total,
        faktur_pajak_number: formData.faktur_pajak_number.trim() || null,
        notes: formData.notes.trim() || null,
        document_urls: formData.document_urls,
        requires_faktur_pajak: selectedSupplier?.pkp_status || false,
      };

      const itemsData = lineItems.map(item => ({
        item_type: item.item_type,
        product_id: item.product_id,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unit_price,
        line_total: item.line_total,
        tax_amount: item.tax_amount,
        expense_account_id: item.expense_account_id,
        asset_account_id: item.asset_account_id,
      }));

      if (editingInvoice) {
        const { error: updateError } = await supabase
          .from('purchase_invoices')
          .update(invoiceData)
          .eq('id', editingInvoice.id);
        if (updateError) throw updateError;

        await supabase.from('purchase_invoice_items').delete().eq('purchase_invoice_id', editingInvoice.id);
        const { error: itemsError } = await supabase
          .from('purchase_invoice_items')
          .insert(itemsData.map(item => ({ ...item, purchase_invoice_id: editingInvoice.id })));
        if (itemsError) throw itemsError;

        showToast({ type: 'success', title: 'Updated', message: 'Purchase invoice updated successfully!' });
      } else {
        const { data: invoice, error: invoiceError } = await supabase
          .from('purchase_invoices')
          .insert([{ ...invoiceData, paid_amount: 0, status: 'unpaid', created_by: userData.user?.id }])
          .select()
          .single();
        if (invoiceError) throw invoiceError;

        const { error: itemsError } = await supabase
          .from('purchase_invoice_items')
          .insert(itemsData.map(item => ({ ...item, purchase_invoice_id: invoice.id })));
        if (itemsError) throw itemsError;

        showToast({ type: 'success', title: 'Success', message: 'Purchase invoice created successfully!' });
      }

      resetForm();
      setEditingInvoice(null);
      setModalOpen(false);
      loadInvoices();
    } catch (error: any) {
      console.error('Error saving purchase invoice:', error);
      showToast({ type: 'error', title: 'Error', message: `Error: ${error.message}` });
    }
  };

  const handleFileUpload = async (files: File[]) => {
    setUploading(true);
    try {
      const uploadedUrls: string[] = [];

      for (const file of files) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `purchase-invoices/${fileName}`;

        const { error: uploadError, data } = await supabase.storage
          .from('documents')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('documents')
          .getPublicUrl(filePath);

        uploadedUrls.push(publicUrl);
      }

      setFormData(prev => ({
        ...prev,
        document_urls: [...prev.document_urls, ...uploadedUrls],
      }));
    } catch (error: any) {
      console.error('Error uploading files:', error);
      showToast({ type: 'error', title: 'Error', message: `Error uploading files: ${error.message}` });
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveDocument = (index: number) => {
    setFormData(prev => ({
      ...prev,
      document_urls: prev.document_urls.filter((_, i) => i !== index),
    }));
  };

  const resetForm = () => {
    setFormData({
      invoice_number: '',
      supplier_id: '',
      invoice_date: new Date().toISOString().split('T')[0],
      due_date: '',
      currency: 'IDR',
      exchange_rate: 1,
      faktur_pajak_number: '',
      notes: '',
      document_urls: [],
    });
    setLineItems([
      {
        item_type: 'inventory',
        product_id: null,
        description: '',
        quantity: 1,
        unit: 'pcs',
        unit_price: 0,
        line_total: 0,
        expense_account_id: null,
        asset_account_id: null,
        tax_percent: 0,
        tax_amount: 0,
      },
    ]);
  };

  const filteredInvoices = invoices.filter(inv =>
    inv.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    inv.suppliers?.company_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totals = calculateTotals();

  if (loading) {
    return <div className="p-8 text-center">Loading...</div>;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Purchase Invoices</h2>
        {canManage && (
          <button
            onClick={() => {
              resetForm();
              setModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm sm:text-base whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Purchase Invoice</span>
            <span className="sm:hidden">New Invoice</span>
          </button>
        )}
      </div>

      <div className="flex items-center gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search by invoice number or supplier..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                Invoice #
              </th>
              <th className="hidden md:table-cell px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Supplier
              </th>
              <th className="hidden lg:table-cell px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date
              </th>
              <th className="hidden sm:table-cell px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                Currency
              </th>
              <th className="px-3 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Total
              </th>
              <th className="hidden xl:table-cell px-3 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Balance
              </th>
              <th className="hidden lg:table-cell px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-3 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider sticky right-0 bg-gray-50">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredInvoices.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                  No purchase invoices found. Create your first one!
                </td>
              </tr>
            ) : (
              filteredInvoices.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-gray-50">
                  <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    <div className="flex flex-col">
                      <span>{invoice.invoice_number}</span>
                      <span className="md:hidden text-xs text-gray-500">{invoice.suppliers?.company_name}</span>
                    </div>
                  </td>
                  <td className="hidden md:table-cell px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {invoice.suppliers?.company_name}
                  </td>
                  <td className="hidden lg:table-cell px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(invoice.invoice_date)}
                  </td>
                  <td className="hidden sm:table-cell px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="flex flex-col">
                      <span>{invoice.currency}</span>
                      {invoice.currency === 'USD' && (
                        <span className="text-xs text-gray-400">
                          @ {invoice.exchange_rate.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 font-medium">
                    <div className="flex flex-col items-end">
                      <span>{invoice.currency} {invoice.total_amount.toLocaleString()}</span>
                      <span className="lg:hidden text-xs">
                        <span className={invoice.balance_amount > 0 ? 'text-red-600' : 'text-green-600'}>
                          Bal: {invoice.balance_amount.toLocaleString()}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td className="hidden xl:table-cell px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-right font-medium">
                    <span className={invoice.balance_amount > 0 ? 'text-red-600' : 'text-green-600'}>
                      {invoice.currency} {invoice.balance_amount.toLocaleString()}
                    </span>
                  </td>
                  <td className="hidden lg:table-cell px-3 sm:px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                      invoice.status === 'paid'
                        ? 'bg-green-100 text-green-800'
                        : invoice.status === 'partial'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {invoice.status}
                    </span>
                  </td>
                  <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-right text-sm font-medium sticky right-0 bg-white">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleOpenView(invoice)}
                        className="text-blue-600 hover:text-blue-900"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {canManage && onPayInvoice && invoice.status !== 'paid' && invoice.balance_amount > 0 && (
                        <button
                          onClick={() => onPayInvoice({ id: invoice.id, invoice_number: invoice.invoice_number, supplier_id: invoice.supplier_id, balance_amount: invoice.balance_amount })}
                          className="text-green-600 hover:text-green-800"
                          title="Record Payment"
                        >
                          <CreditCard className="w-4 h-4" />
                        </button>
                      )}
                      {canManage && (
                        <>
                          <button
                            onClick={() => handleOpenEdit(invoice)}
                            className="text-gray-500 hover:text-gray-800"
                            title="Edit"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(invoice)}
                            disabled={deleting}
                            className="text-red-500 hover:text-red-700 disabled:opacity-50"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingInvoice(null);
          resetForm();
        }}
        title={editingInvoice ? `Edit Invoice: ${editingInvoice.invoice_number}` : 'New Purchase Invoice'}
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Header Section */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Supplier *
              </label>
              <SearchableSelect
                value={formData.supplier_id}
                onChange={(val) => setFormData({ ...formData, supplier_id: val })}
                options={suppliers.map(s => ({ value: s.id, label: `${s.company_name}${s.pkp_status ? ' (PKP)' : ''}` }))}
                placeholder="Select Supplier"
              />
              {selectedSupplier && selectedSupplier.npwp && (
                <p className="text-xs text-gray-500 mt-1">NPWP: {selectedSupplier.npwp}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Invoice Number *
              </label>
              <input
                type="text"
                value={formData.invoice_number}
                onChange={(e) => setFormData({ ...formData, invoice_number: e.target.value })}
                required
                placeholder="INV-001"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Invoice Date *
              </label>
              <input
                type="date"
                value={formData.invoice_date}
                onChange={(e) => setFormData({ ...formData, invoice_date: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Due Date
              </label>
              <input
                type="date"
                value={formData.due_date}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Currency *
              </label>
              <select
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value, exchange_rate: e.target.value === 'IDR' ? 1 : formData.exchange_rate })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="IDR">IDR</option>
                <option value="USD">USD</option>
              </select>
            </div>

            {formData.currency === 'USD' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Exchange Rate * (1 USD = ? IDR)
                </label>
                <input
                  type="number"
                  value={formData.exchange_rate}
                  onChange={(e) => setFormData({ ...formData, exchange_rate: parseFloat(e.target.value) || 1 })}
                  min="1"
                  step="0.01"
                  required
                  placeholder="15750"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            {selectedSupplier?.pkp_status && (
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Faktur Pajak Number
                </label>
                <input
                  type="text"
                  value={formData.faktur_pajak_number}
                  onChange={(e) => setFormData({ ...formData, faktur_pajak_number: e.target.value })}
                  placeholder="010.000-00.00000000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Attachments (Supplier Invoice)
              </label>
              <FileUpload
                onUpload={handleFileUpload}
                accept=".pdf,.jpg,.jpeg,.png"
                multiple
                disabled={uploading}
              />
              {formData.document_urls.length > 0 && (
                <div className="mt-2 space-y-1">
                  {formData.document_urls.map((url, index) => (
                    <div key={index} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded">
                      <span className="text-sm text-gray-600 truncate">{url.split('/').pop()}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveDocument(index)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Line Items Section */}
          <div className="border-t pt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Line Items</h3>
              <button
                type="button"
                onClick={handleAddLine}
                className="inline-flex items-center gap-1 px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                <Plus className="w-4 h-4" />
                Add Line
              </button>
            </div>

            <div className="space-y-4 max-h-96 overflow-y-auto">
              {lineItems.map((item, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <span className="text-sm font-medium text-gray-700">Line {index + 1}</span>
                    {lineItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveLine(index)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Type *
                      </label>
                      <select
                        value={item.item_type}
                        onChange={(e) => handleLineChange(index, 'item_type', e.target.value)}
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="inventory">Inventory (Stock)</option>
                        <option value="fixed_asset">Fixed Asset</option>
                        <option value="expense">Expense</option>
                        <option value="freight">Freight</option>
                        <option value="duty">Import Duty</option>
                        <option value="insurance">Insurance</option>
                        <option value="clearing">Clearing & Forwarding</option>
                        <option value="other">Other Cost</option>
                      </select>
                    </div>

                    {item.item_type === 'inventory' ? (
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Product *
                        </label>
                        <select
                          value={item.product_id || ''}
                          onChange={(e) => handleLineChange(index, 'product_id', e.target.value)}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Select Product</option>
                          {products.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.product_name} (Stock: {product.current_stock})
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : item.item_type === 'expense' ? (
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Expense Account *
                        </label>
                        <select
                          value={item.expense_account_id || ''}
                          onChange={(e) => handleLineChange(index, 'expense_account_id', e.target.value)}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Select Account</option>
                          {accounts.filter(a => a.account_type === 'Expense' || a.account_type === 'expense' || a.account_type === 'Cost of Goods Sold' || a.account_type === 'cost_of_goods_sold').map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.code} - {account.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : item.item_type === 'fixed_asset' ? (
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Asset Account *
                        </label>
                        <select
                          value={item.asset_account_id || ''}
                          onChange={(e) => handleLineChange(index, 'asset_account_id', e.target.value)}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Select Account</option>
                          {accounts.filter(a => a.account_type === 'Asset' || a.account_type === 'asset').map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.code} - {account.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Ledger (Optional - defaults to Inventory)
                        </label>
                        <select
                          value={item.expense_account_id || ''}
                          onChange={(e) => handleLineChange(index, 'expense_account_id', e.target.value)}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Capitalize to Inventory (Default)</option>
                          {accounts.filter(a => a.account_type === 'Expense' || a.account_type === 'expense' || a.account_type === 'Cost of Goods Sold' || a.account_type === 'cost_of_goods_sold').map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.code} - {account.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Description *
                    </label>
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => handleLineChange(index, 'description', e.target.value)}
                      placeholder="Item description"
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="grid grid-cols-5 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Qty *
                      </label>
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => handleLineChange(index, 'quantity', parseFloat(e.target.value) || 0)}
                        min="0"
                        step="0.01"
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Unit
                      </label>
                      <input
                        type="text"
                        value={item.unit}
                        onChange={(e) => handleLineChange(index, 'unit', e.target.value)}
                        placeholder="pcs"
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Rate *
                      </label>
                      <input
                        type="number"
                        step="0.0001"
                        min="0"
                        value={item.unit_price === 0 ? '' : item.unit_price}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          handleLineChange(index, 'unit_price', Number.isFinite(val) ? val : 0);
                        }}
                        placeholder="0.00"
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Tax %
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          value={item.tax_percent}
                          onChange={(e) => handleLineChange(index, 'tax_percent', parseFloat(e.target.value) || 0)}
                          min="0"
                          max="100"
                          step="0.1"
                          placeholder="0"
                          className="w-full px-2 py-1.5 pr-6 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">%</span>
                      </div>
                      {item.tax_amount > 0 && (
                        <p className="text-xs text-gray-400 mt-0.5">{item.tax_amount.toLocaleString()}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Total (inc. tax)
                      </label>
                      <input
                        type="text"
                        value={(item.line_total + item.tax_amount).toLocaleString()}
                        readOnly
                        className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded bg-gray-50 font-medium"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Totals Summary */}
            <div className="mt-6 border-t pt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal:</span>
                <span className="font-medium">{formData.currency} {totals.subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Tax:</span>
                <span className="font-medium">{formData.currency} {totals.taxTotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-lg font-bold border-t pt-2">
                <span>Total:</span>
                <span className="text-blue-600">{formData.currency} {totals.total.toLocaleString()}</span>
              </div>
              {formData.currency === 'USD' && formData.exchange_rate > 1 && (
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Equivalent (IDR):</span>
                  <span>IDR {(totals.total * formData.exchange_rate).toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-6 border-t">
            <button
              type="button"
              onClick={() => {
                setModalOpen(false);
                setEditingInvoice(null);
                resetForm();
              }}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {uploading ? 'Uploading...' : editingInvoice ? 'Save Changes' : 'Create Invoice'}
            </button>
          </div>
        </form>
      </Modal>

      {/* View Modal */}
      {selectedInvoice && (
        <Modal
          isOpen={viewModal}
          onClose={() => {
            setViewModal(false);
            setSelectedInvoice(null);
            setViewLineItems([]);
            if (viewBlobUrl) { URL.revokeObjectURL(viewBlobUrl); setViewBlobUrl(null); }
          }}
          title={`Purchase Invoice: ${selectedInvoice.invoice_number}`}
          size="xl"
        >
          <div className="space-y-5">
            {/* Header Info */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-gray-50 rounded-lg p-4">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Supplier</p>
                <p className="font-semibold text-gray-900">{selectedInvoice.suppliers?.company_name || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Invoice Date</p>
                <p className="font-semibold text-gray-900">{formatDate(selectedInvoice.invoice_date)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Due Date</p>
                <p className="font-semibold text-gray-900">{selectedInvoice.due_date ? formatDate(selectedInvoice.due_date) : '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Status</p>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  selectedInvoice.status === 'paid' ? 'bg-green-100 text-green-800'
                  : selectedInvoice.status === 'partial' ? 'bg-yellow-100 text-yellow-800'
                  : 'bg-red-100 text-red-800'
                }`}>{selectedInvoice.status}</span>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Currency</p>
                <p className="font-semibold text-gray-900">{selectedInvoice.currency}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Subtotal</p>
                <p className="font-semibold text-gray-900">{selectedInvoice.currency} {Number(selectedInvoice.subtotal).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Paid Amount</p>
                <p className="font-semibold text-green-700">{selectedInvoice.currency} {Number(selectedInvoice.paid_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Balance Due</p>
                <p className="font-bold text-lg text-blue-700">{selectedInvoice.currency} {Number(selectedInvoice.balance_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
              </div>
            </div>

            {/* Line Items */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Line Items</h3>
              {viewLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : viewLineItems.length === 0 ? (
                <p className="text-sm text-gray-400 italic py-4 text-center">No line items found</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Rate</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {viewLineItems.map((item, idx) => (
                        <tr key={item.id || idx} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                          <td className="px-3 py-2 font-medium text-gray-900">{item.product_name || <span className="text-gray-400 italic">—</span>}</td>
                          <td className="px-3 py-2 text-gray-600 max-w-xs">
                            <p className="truncate" title={item.description}>{item.description || '—'}</p>
                          </td>
                          <td className="px-3 py-2 text-right text-gray-900">{Number(item.quantity).toLocaleString()}</td>
                          <td className="px-3 py-2 text-gray-500">{item.unit}</td>
                          <td className="px-3 py-2 text-right text-gray-900">{selectedInvoice.currency} {Number(item.unit_price).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                          <td className="px-3 py-2 text-right font-medium text-gray-900">{selectedInvoice.currency} {Number(item.line_total).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50">
                      <tr>
                        <td colSpan={6} className="px-3 py-2 text-right text-sm font-semibold text-gray-700">Total</td>
                        <td className="px-3 py-2 text-right text-sm font-bold text-gray-900">
                          {selectedInvoice.currency} {Number(selectedInvoice.total_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* Notes */}
            {selectedInvoice.notes && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs font-medium text-amber-700 mb-1">Notes / Shipment Details</p>
                <p className="text-sm text-amber-900">{selectedInvoice.notes}</p>
              </div>
            )}

            {/* Attachment */}
            {selectedInvoice.document_urls && selectedInvoice.document_urls.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Attachments</h3>
                <div className="space-y-2">
                  {selectedInvoice.document_urls.map((url, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 bg-gray-50 rounded border border-gray-200">
                      <FileText className="w-4 h-4 text-red-500 flex-shrink-0" />
                      <span className="text-sm text-gray-700 flex-1 truncate">{url.split('/').pop()}</span>
                      <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex-shrink-0">Open</a>
                    </div>
                  ))}
                </div>
                {viewBlobLoading && (
                  <div className="mt-3 flex items-center gap-2 text-sm text-gray-500">
                    <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    Loading preview...
                  </div>
                )}
                {!viewBlobLoading && viewBlobUrl && (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between bg-blue-50 px-3 py-2 rounded">
                      <span className="text-sm text-gray-700">Preview</span>
                      <a
                        href={viewBlobUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline font-medium"
                      >
                        Open in New Tab
                      </a>
                    </div>
                    <object
                      data={viewBlobUrl}
                      type="application/pdf"
                      className="w-full rounded border border-gray-200"
                      style={{ height: '500px' }}
                    >
                      <div className="flex flex-col items-center justify-center h-full bg-gray-50 p-6 text-center">
                        <FileText className="w-12 h-12 text-gray-400 mb-3" />
                        <p className="text-sm text-gray-600 mb-3">
                          Your browser cannot display PDFs inline.
                        </p>
                        <a
                          href={viewBlobUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                          <FileText className="w-4 h-4" />
                          Open PDF in New Tab
                        </a>
                      </div>
                    </object>
                  </div>
                )}
                {!viewBlobLoading && !viewBlobUrl && selectedInvoice.document_urls && selectedInvoice.document_urls.length > 0 && (
                  <div className="mt-3 p-4 bg-amber-50 border border-amber-200 rounded">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-amber-900 mb-1">
                          PDF Preview Unavailable
                        </p>
                        <p className="text-xs text-amber-700 mb-3">
                          The file may not have been uploaded to storage yet, or the storage bucket may not be accessible. Please use the "Open" button above to download or view the file.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <a
                            href={selectedInvoice.document_urls[0]}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-amber-300 text-amber-800 rounded hover:bg-amber-50 text-xs font-medium"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            Try Opening File
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}

    </div>
  );
}
