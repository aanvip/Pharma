import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Search, ArrowUpCircle, Pencil, Trash2, Eye, Printer } from 'lucide-react';
import { Modal } from '../Modal';
import { SearchableSelect } from '../SearchableSelect';
import { getFinancialYear } from '../../utils/dateFormat';

interface Supplier {
  id: string;
  company_name: string;
}

interface BankAccount {
  id: string;
  account_name: string;
  bank_name: string;
  alias: string | null;
  currency: string;
}

interface PurchaseInvoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  paid_amount: number;
  balance_amount: number;
  currency: string;
}

interface TaxCode {
  id: string;
  code: string;
  name: string;
  rate: number;
}

interface PaymentVoucher {
  id: string;
  voucher_number: string;
  voucher_date: string;
  supplier_id: string;
  payment_method: string;
  bank_account_id: string | null;
  reference_number: string | null;
  amount: number;
  pph_amount: number;
  pph_code_id: string | null;
  net_amount: number;
  payment_currency: string | null;
  exchange_rate: number | null;
  bank_amount: number | null;
  bank_charge: number | null;
  description: string | null;
  suppliers?: { company_name: string };
  bank_accounts?: { account_name: string; bank_name: string; alias: string | null; currency: string | null };
  // derived
  invoice_currency: string;
  invoice_numbers: { id: string; number: string }[];
}

interface PrefillInvoice {
  id: string;
  invoice_number: string;
  supplier_id: string;
  balance_amount: number;
  currency?: string;
}

interface PaymentVoucherManagerProps {
  canManage: boolean;
  prefillInvoice?: PrefillInvoice | null;
  onPrefillConsumed?: () => void;
  onViewInvoice?: (invoiceId: string) => void;
}

function fmt(amount: number, currency: string) {
  if (currency === 'USD') {
    return `US$ ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `Rp ${amount.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}


export function PaymentVoucherManager({ canManage, prefillInvoice, onPrefillConsumed, onViewInvoice }: PaymentVoucherManagerProps) {
  const [vouchers, setVouchers] = useState<PaymentVoucher[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [pendingInvoices, setPendingInvoices] = useState<PurchaseInvoice[]>([]);
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [allocations, setAllocations] = useState<{ invoiceId: string; amount: number; currency: string }[]>([]);
  const [selectedBank, setSelectedBank] = useState<BankAccount | null>(null);
  const [editingVoucher, setEditingVoucher] = useState<PaymentVoucher | null>(null);
  const [viewingVoucher, setViewingVoucher] = useState<PaymentVoucher | null>(null);
  const [viewAllocations, setViewAllocations] = useState<Array<{ invoice_id: string; invoice_number: string; invoice_date: string; allocated_amount: number; allocated_currency: string }>>([]);

  const [formData, setFormData] = useState({
    voucher_date: new Date().toISOString().split('T')[0],
    supplier_id: '',
    payment_method: 'bank_transfer',
    bank_account_id: '',
    reference_number: '',
    amount: 0,
    bank_charge: 0,
    pph_code_id: '',
    pph_amount: 0,
    description: '',
    payment_currency: 'IDR',
    exchange_rate: 1,
  });

  useEffect(() => {
    loadVouchers();
    loadSuppliers();
    loadBankAccounts();
    loadTaxCodes();
  }, []);

  useEffect(() => {
    if (prefillInvoice && !loading) {
      setFormData(prev => ({ ...prev, supplier_id: prefillInvoice.supplier_id, amount: prefillInvoice.balance_amount }));
      setModalOpen(true);
      onPrefillConsumed?.();
    }
  }, [prefillInvoice, loading]);

  useEffect(() => {
    if (formData.supplier_id) {
      const isPrefill = prefillInvoice && prefillInvoice.supplier_id === formData.supplier_id;
      loadPendingInvoices(
        formData.supplier_id,
        isPrefill ? prefillInvoice.id : undefined,
        isPrefill ? prefillInvoice.balance_amount : undefined,
        isPrefill ? (prefillInvoice.currency || 'IDR') : undefined,
      );
    } else {
      setPendingInvoices([]);
      setAllocations([]);
    }
  }, [formData.supplier_id]);

  useEffect(() => {
    if (formData.bank_account_id) {
      const bank = bankAccounts.find(b => b.id === formData.bank_account_id);
      if (bank) {
        setSelectedBank(bank);
        if (!editingVoucher) {
          setFormData(prev => ({ ...prev, payment_currency: bank.currency || 'IDR', exchange_rate: 1 }));
        }
      }
    } else {
      setSelectedBank(null);
    }
  }, [formData.bank_account_id, bankAccounts, editingVoucher]);

  useEffect(() => {
    if (formData.pph_code_id && formData.amount > 0) {
      const tax = taxCodes.find(t => t.id === formData.pph_code_id);
      if (tax) {
        setFormData(prev => ({ ...prev, pph_amount: Math.round(formData.amount * (tax.rate / 100)) }));
      }
    } else {
      setFormData(prev => ({ ...prev, pph_amount: 0 }));
    }
  }, [formData.pph_code_id, formData.amount, taxCodes]);

  const loadVouchers = async () => {
    try {
      const { data, error } = await supabase
        .from('payment_vouchers')
        .select('*, suppliers(company_name), bank_accounts(account_name, bank_name, alias, currency)')
        .order('voucher_date', { ascending: false })
        .order('voucher_number', { ascending: false });
      if (error) throw error;

      const voucherIds = (data || []).map((v: PaymentVoucher) => v.id);
      const allocCcyMap: Record<string, string> = {};
      const invoicesMap: Record<string, { id: string; number: string }[]> = {};
      if (voucherIds.length > 0) {
        const { data: allocs } = await supabase
          .from('voucher_allocations')
          .select('payment_voucher_id, allocated_currency, purchase_invoices(id, invoice_number)')
          .in('payment_voucher_id', voucherIds);
        for (const a of (allocs as any[]) || []) {
          if (!a.payment_voucher_id) continue;
          if (!allocCcyMap[a.payment_voucher_id]) {
            allocCcyMap[a.payment_voucher_id] = a.allocated_currency || '';
          }
          if (a.purchase_invoices) {
            invoicesMap[a.payment_voucher_id] = invoicesMap[a.payment_voucher_id] || [];
            invoicesMap[a.payment_voucher_id].push({
              id: a.purchase_invoices.id,
              number: a.purchase_invoices.invoice_number,
            });
          }
        }
      }

      const enriched = (data || []).map((v: PaymentVoucher) => {
        const bankCcy = v.bank_accounts?.currency || 'IDR';
        const isCross = v.bank_amount != null && v.bank_amount > 0 && Math.abs((v.exchange_rate || 1) - 1) > 0.0001;
        const invCcy = allocCcyMap[v.id] || v.payment_currency || (isCross ? 'USD' : bankCcy);
        return { ...v, invoice_currency: invCcy, invoice_numbers: invoicesMap[v.id] || [] };
      });
      setVouchers(enriched);
    } catch (error) {
      console.error('Error loading vouchers:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSuppliers = async () => {
    const { data } = await supabase.from('suppliers').select('id, company_name').order('company_name');
    setSuppliers(data || []);
  };

  const loadBankAccounts = async () => {
    const { data } = await supabase.from('bank_accounts').select('id, account_name, bank_name, alias, currency').eq('is_active', true);
    setBankAccounts(data || []);
  };

  const loadTaxCodes = async () => {
    const { data } = await supabase.from('tax_codes').select('id, code, name, rate').eq('is_withholding', true);
    setTaxCodes(data || []);
  };

  const loadPendingInvoices = async (supplierId: string, preSelectId?: string, preSelectAmount?: number, preSelectCurrency?: string) => {
    const { data } = await supabase
      .from('purchase_invoices')
      .select('id, invoice_number, invoice_date, total_amount, paid_amount, balance_amount, currency')
      .eq('supplier_id', supplierId)
      .gt('balance_amount', 0)
      .order('invoice_date');
    setPendingInvoices(data || []);
    if (preSelectId && preSelectAmount) {
      setAllocations([{ invoiceId: preSelectId, amount: preSelectAmount, currency: preSelectCurrency || 'IDR' }]);
    } else {
      setAllocations([]);
    }
  };

  /** Format: PV/YY-YY/NNN  e.g. PV/25-26/001 */
  const generateVoucherNumber = async (dateStr: string) => {
    const date = new Date(dateStr);
    const fy = getFinancialYear(date);
    const prefix = `PV/${fy}/`;
    const { count } = await supabase
      .from('payment_vouchers')
      .select('*', { count: 'exact', head: true })
      .like('voucher_number', `${prefix}%`);
    return `${prefix}${String((count || 0) + 1).padStart(3, '0')}`;
  };

  const handleAllocationChange = (invoice: PurchaseInvoice, amount: number) => {
    setAllocations(prev => {
      const existing = prev.find(a => a.invoiceId === invoice.id);
      if (existing) {
        if (amount <= 0) return prev.filter(a => a.invoiceId !== invoice.id);
        return prev.map(a => a.invoiceId === invoice.id ? { ...a, amount } : a);
      }
      if (amount > 0) return [...prev, { invoiceId: invoice.id, amount, currency: invoice.currency || 'IDR' }];
      return prev;
    });
  };

  const invoiceCurrency = pendingInvoices.length > 0 ? (pendingInvoices[0].currency || 'IDR') : 'IDR';
  const bankCurrency = formData.payment_currency;
  const isCrossCurrency = pendingInvoices.length > 0 && invoiceCurrency !== bankCurrency;
  const invoiceInIDR = isCrossCurrency ? formData.amount * formData.exchange_rate : formData.amount;
  const bankCharge = formData.bank_charge || 0;
  const totalBankDebit = invoiceInIDR + bankCharge;
  const netInvoiceAmount = formData.amount - formData.pph_amount;
  const netBankDebit = isCrossCurrency
    ? netInvoiceAmount * formData.exchange_rate + bankCharge
    : netInvoiceAmount + bankCharge;
  const totalAllocated = allocations.reduce((sum, a) => sum + a.amount, 0);

  const resetForm = () => {
    setFormData({
      voucher_date: new Date().toISOString().split('T')[0],
      supplier_id: '',
      payment_method: 'bank_transfer',
      bank_account_id: '',
      reference_number: '',
      amount: 0,
      bank_charge: 0,
      pph_code_id: '',
      pph_amount: 0,
      description: '',
      payment_currency: 'IDR',
      exchange_rate: 1,
    });
    setAllocations([]);
    setPendingInvoices([]);
    setSelectedBank(null);
    setEditingVoucher(null);
  };

  const handleEdit = async (v: PaymentVoucher) => {
    setEditingVoucher(v);
    setFormData({
      voucher_date: v.voucher_date,
      supplier_id: v.supplier_id,
      payment_method: v.payment_method,
      bank_account_id: v.bank_account_id || '',
      reference_number: v.reference_number || '',
      amount: v.amount,
      bank_charge: v.bank_charge || 0,
      pph_code_id: v.pph_code_id || '',
      pph_amount: v.pph_amount || 0,
      description: v.description || '',
      payment_currency: v.payment_currency || 'IDR',
      exchange_rate: v.exchange_rate || 1,
    });
    if (v.bank_account_id) {
      const bank = bankAccounts.find(b => b.id === v.bank_account_id);
      if (bank) setSelectedBank(bank);
    }
    // Load all invoices for this supplier (including already-paid ones for re-allocation)
    const { data } = await supabase
      .from('purchase_invoices')
      .select('id, invoice_number, invoice_date, total_amount, paid_amount, balance_amount, currency')
      .eq('supplier_id', v.supplier_id)
      .order('invoice_date');
    setPendingInvoices(data || []);
    // Load existing allocations
    const { data: allocs } = await supabase
      .from('voucher_allocations')
      .select('purchase_invoice_id, allocated_amount, allocated_currency')
      .eq('payment_voucher_id', v.id);
    setAllocations((allocs || []).map(a => ({
      invoiceId: a.purchase_invoice_id,
      amount: a.allocated_amount,
      currency: a.allocated_currency || 'IDR',
    })));
    setModalOpen(true);
  };

  const handleView = async (v: PaymentVoucher) => {
    setViewingVoucher(v);
    const { data } = await supabase
      .from('voucher_allocations')
      .select('allocated_amount, allocated_currency, purchase_invoices(id, invoice_number, invoice_date)')
      .eq('payment_voucher_id', v.id);
    setViewAllocations(
      (data || []).map((a: any) => ({
        invoice_id: a.purchase_invoices?.id || '',
        invoice_number: a.purchase_invoices?.invoice_number || '—',
        invoice_date: a.purchase_invoices?.invoice_date || '',
        allocated_amount: a.allocated_amount || 0,
        allocated_currency: a.allocated_currency || 'IDR',
      })),
    );
  };

  const handleDelete = async (v: PaymentVoucher) => {
    if (!confirm(`Delete payment ${v.voucher_number}? This will reverse all invoice allocations.`)) return;
    try {
      // Reverse paid amounts
      const { data: allocs } = await supabase
        .from('voucher_allocations')
        .select('purchase_invoice_id, allocated_amount')
        .eq('payment_voucher_id', v.id);
      for (const a of allocs || []) {
        const { data: inv } = await supabase
          .from('purchase_invoices')
          .select('paid_amount, total_amount')
          .eq('id', a.purchase_invoice_id)
          .maybeSingle();
        if (inv) {
          const newPaid = Math.max(0, (inv.paid_amount || 0) - a.allocated_amount);
          await supabase.from('purchase_invoices').update({
            paid_amount: newPaid,
            status: newPaid <= 0 ? 'pending' : newPaid >= inv.total_amount ? 'paid' : 'partial',
          }).eq('id', a.purchase_invoice_id);
        }
      }
      await supabase.from('voucher_allocations').delete().eq('payment_voucher_id', v.id);
      const { error } = await supabase.from('payment_vouchers').delete().eq('id', v.id);
      if (error) throw error;
      loadVouchers();
    } catch (err) {
      alert('Delete failed: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const payload = {
        voucher_date: formData.voucher_date,
        supplier_id: formData.supplier_id,
        payment_method: formData.payment_method,
        bank_account_id: formData.bank_account_id || null,
        reference_number: formData.reference_number || null,
        amount: formData.amount,
        pph_amount: formData.pph_amount,
        pph_code_id: formData.pph_code_id || null,
        description: formData.description || null,
        payment_currency: formData.payment_currency,
        exchange_rate: formData.exchange_rate,
        bank_amount: isCrossCurrency ? totalBankDebit : null,
        bank_charge: formData.bank_charge || 0,
      };

      let voucherId: string;

      if (editingVoucher) {
        const { error } = await supabase.from('payment_vouchers').update(payload).eq('id', editingVoucher.id);
        if (error) throw error;
        voucherId = editingVoucher.id;
        // Reverse old allocations
        const { data: oldAllocs } = await supabase
          .from('voucher_allocations')
          .select('purchase_invoice_id, allocated_amount')
          .eq('payment_voucher_id', voucherId);
        for (const a of oldAllocs || []) {
          const { data: inv } = await supabase.from('purchase_invoices').select('paid_amount, total_amount').eq('id', a.purchase_invoice_id).maybeSingle();
          if (inv) {
            const newPaid = Math.max(0, (inv.paid_amount || 0) - a.allocated_amount);
            await supabase.from('purchase_invoices').update({ paid_amount: newPaid, status: newPaid <= 0 ? 'pending' : newPaid >= inv.total_amount ? 'paid' : 'partial' }).eq('id', a.purchase_invoice_id);
          }
        }
        await supabase.from('voucher_allocations').delete().eq('payment_voucher_id', voucherId);
      } else {
        const voucherNumber = await generateVoucherNumber(formData.voucher_date);
        const { data: voucher, error } = await supabase
          .from('payment_vouchers')
          .insert([{ ...payload, voucher_number: voucherNumber, created_by: user.id }])
          .select()
          .single();
        if (error) throw error;
        voucherId = voucher!.id;
      }

      // Add allocations
      for (const alloc of allocations) {
        await supabase.from('voucher_allocations').insert({
          voucher_type: 'payment',
          payment_voucher_id: voucherId,
          purchase_invoice_id: alloc.invoiceId,
          allocated_amount: alloc.amount,
          allocated_currency: alloc.currency,
        });
        const invoice = pendingInvoices.find(i => i.id === alloc.invoiceId);
        if (invoice) {
          const newPaid = (invoice.paid_amount || 0) + alloc.amount;
          await supabase.from('purchase_invoices').update({
            paid_amount: newPaid,
            status: newPaid >= invoice.total_amount ? 'paid' : 'partial',
          }).eq('id', alloc.invoiceId);
        }
      }

      setModalOpen(false);
      resetForm();
      loadVouchers();
    } catch (error: unknown) {
      console.error('Error saving voucher:', error);
      alert('Failed to save: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const filteredVouchers = vouchers.filter(v =>
    v.voucher_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.suppliers?.company_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search payments..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg"
          />
        </div>
        {canManage && (
          <button
            onClick={() => { resetForm(); setModalOpen(true); }}
            className="flex items-center gap-1.5 bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 text-sm"
          >
            <ArrowUpCircle className="w-4 h-4" />
            New Payment
          </button>
        )}
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Voucher No</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Invoice No.</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Bank</th>
              <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Bank Debit</th>
              <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Net Paid</th>
              {canManage && <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredVouchers.map(v => {
              const bankCcy = v.bank_accounts?.currency || v.payment_currency || 'IDR';
              const invCcy = v.invoice_currency || 'IDR';
              const isCross = invCcy !== bankCcy && v.bank_amount != null && v.bank_amount > 0;
              return (
                <tr key={v.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-xs font-medium">{v.voucher_number}</td>
                  <td className="px-3 py-2 text-xs">{new Date(v.voucher_date).toLocaleDateString('id-ID')}</td>
                  <td className="px-3 py-2 text-xs">{v.suppliers?.company_name}</td>
                  <td className="px-3 py-2">
                    <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs capitalize">
                      {v.payment_method.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {v.invoice_numbers && v.invoice_numbers.length > 0 ? (
                      <div className="flex flex-col gap-0.5">
                        {v.invoice_numbers.map(inv => (
                          <button
                            key={inv.id}
                            onClick={() => onViewInvoice?.(inv.id)}
                            className="text-blue-600 hover:text-blue-800 hover:underline text-left"
                            title="View purchase invoice"
                          >
                            {inv.number}
                          </button>
                        ))}
                      </div>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-700">
                    {v.bank_accounts
                      ? `${v.bank_accounts.alias || v.bank_accounts.account_name} (${v.bank_accounts.currency})`
                      : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-xs">
                    {(() => {
                      const debit = isCross
                        ? (v.bank_amount || 0)
                        : (v.amount || 0) + (v.bank_charge || 0);
                      return <span className="font-medium text-blue-700">{fmt(debit, bankCcy)}</span>;
                    })()}
                  </td>
                  <td className="px-3 py-2 text-right text-xs font-medium text-red-600">{fmt(v.net_amount, invCcy)}</td>
                  {canManage && (
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleView(v)}
                          className="p-1.5 text-gray-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
                          title="View"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleEdit(v)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(v)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
            {filteredVouchers.length === 0 && (
              <tr><td colSpan={canManage ? 9 : 8} className="px-4 py-8 text-center text-gray-500 text-sm">No payment vouchers found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); resetForm(); }}
        title={editingVoucher ? `Edit ${editingVoucher.voucher_number}` : 'New Payment Voucher'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-3">

          {/* Row 1: Date + Supplier */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date *</label>
              <input
                type="date"
                required
                value={formData.voucher_date}
                onChange={(e) => setFormData({ ...formData, voucher_date: e.target.value })}
                className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Supplier *</label>
              <SearchableSelect
                value={formData.supplier_id}
                onChange={(val) => setFormData({ ...formData, supplier_id: val })}
                options={suppliers.map(s => ({ value: s.id, label: s.company_name }))}
                placeholder="Select supplier"
              />
            </div>
          </div>

          {/* Row 2: Method + Amount */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Payment Method *</label>
              <select
                required
                value={formData.payment_method}
                onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg"
              >
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="check">Check</option>
                <option value="giro">Giro</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Amount{pendingInvoices.length > 0 ? ` (${invoiceCurrency})` : ''} *
              </label>
              <input
                type="number"
                required
                step="0.01"
                value={formData.amount || ''}
                onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg"
              />
            </div>
          </div>

          {/* Row 3: Bank Account + Reference (only for non-cash) */}
          {formData.payment_method !== 'cash' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Bank Account
                  {selectedBank && (
                    <span className="ml-1.5 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-bold">
                      {selectedBank.currency || 'IDR'}
                    </span>
                  )}
                </label>
                <select
                  value={formData.bank_account_id}
                  onChange={(e) => setFormData({ ...formData, bank_account_id: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg"
                >
                  <option value="">Select account</option>
                  {bankAccounts.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.alias || `${b.bank_name} - ${b.account_name}`} ({b.currency || 'IDR'})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Reference No.</label>
                <input
                  type="text"
                  value={formData.reference_number}
                  onChange={(e) => setFormData({ ...formData, reference_number: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg"
                />
              </div>
            </div>
          )}

          {/* Cross-currency panel */}
          {isCrossCurrency && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-amber-800 mb-2">
                Currency Conversion
                <span className="ml-2 font-normal text-amber-600">{invoiceCurrency} invoice → {bankCurrency} bank debit</span>
              </p>
              <div className="grid grid-cols-3 gap-2 mb-2">
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 mb-1">Invoice ({invoiceCurrency})</label>
                  <input
                    readOnly
                    value={formData.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded bg-gray-50 text-gray-700"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 mb-1">Rate (1 {invoiceCurrency} = {bankCurrency})</label>
                  <input
                    type="number"
                    required={isCrossCurrency}
                    step="0.000001"
                    min="0.000001"
                    value={formData.exchange_rate || ''}
                    onChange={(e) => setFormData({ ...formData, exchange_rate: parseFloat(e.target.value) || 1 })}
                    className="w-full px-2 py-1.5 text-sm border border-amber-300 rounded bg-white focus:ring-1 focus:ring-amber-400"
                    placeholder="e.g. 16200"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 mb-1">Converted ({bankCurrency})</label>
                  <input
                    readOnly
                    value={invoiceInIDR.toLocaleString('id-ID', { minimumFractionDigits: 0 })}
                    className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded bg-green-50 text-green-800 font-medium"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-[10px] font-medium text-gray-500 mb-1">
                    Bank Transfer Charge ({bankCurrency}) — added to bank debit
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={formData.bank_charge || ''}
                    onChange={(e) => setFormData({ ...formData, bank_charge: parseFloat(e.target.value) || 0 })}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded bg-white"
                    placeholder="e.g. 50000"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 mb-1">Total Bank Debit ({bankCurrency})</label>
                  <input
                    readOnly
                    value={totalBankDebit.toLocaleString('id-ID', { minimumFractionDigits: 0 })}
                    className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded bg-blue-50 text-blue-800 font-bold"
                  />
                </div>
              </div>
            </div>
          )}

          {/* PPh + Summary */}
          <div className="border border-gray-100 rounded-lg p-3 bg-gray-50/50">
            <div className="grid grid-cols-2 gap-3 mb-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">PPh Type</label>
                <select
                  value={formData.pph_code_id}
                  onChange={(e) => setFormData({ ...formData, pph_code_id: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg bg-white"
                >
                  <option value="">No withholding</option>
                  {taxCodes.map(t => (
                    <option key={t.id} value={t.id}>{t.code} - {t.name} ({t.rate}%)</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">PPh Amount {pendingInvoices.length > 0 ? `(${invoiceCurrency})` : ''}</label>
                <input
                  type="number"
                  value={formData.pph_amount || ''}
                  onChange={(e) => setFormData({ ...formData, pph_amount: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2.5 py-1.5 text-sm border border-orange-200 rounded-lg bg-orange-50"
                />
              </div>
            </div>
            <div className="border-t border-gray-200 pt-2 space-y-0.5 text-xs">
              <div className="flex justify-between text-gray-600">
                <span>Gross ({invoiceCurrency}):</span>
                <span className="font-medium">{fmt(formData.amount, invoiceCurrency)}</span>
              </div>
              {formData.pph_amount > 0 && (
                <div className="flex justify-between text-orange-600">
                  <span>Less PPh:</span>
                  <span>−{fmt(formData.pph_amount, invoiceCurrency)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-sm border-t border-gray-200 pt-1 mt-1">
                <span>Net Payment ({invoiceCurrency}):</span>
                <span className="text-red-600">{fmt(netInvoiceAmount, invoiceCurrency)}</span>
              </div>
              {isCrossCurrency && (
                <div className="flex justify-between font-semibold text-sm text-blue-700">
                  <span>Bank Debit ({bankCurrency}) incl. charges:</span>
                  <span>{fmt(netBankDebit, bankCurrency)}</span>
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg"
              rows={2}
            />
          </div>

          {pendingInvoices.length > 0 && (
            <div className="border-t pt-3">
              <h4 className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Allocate to Invoices</h4>
              <div className="max-h-40 overflow-y-auto border rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-medium text-gray-500">Invoice</th>
                      <th className="px-3 py-1.5 text-center font-medium text-gray-500">CCY</th>
                      <th className="px-3 py-1.5 text-right font-medium text-gray-500">Balance</th>
                      <th className="px-3 py-1.5 text-right font-medium text-gray-500">Allocate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {pendingInvoices.map(inv => {
                      const invCcy = inv.currency || 'IDR';
                      return (
                        <tr key={inv.id}>
                          <td className="px-3 py-1.5">
                            <div className="font-mono">{inv.invoice_number}</div>
                            <div className="text-gray-400">{new Date(inv.invoice_date).toLocaleDateString('id-ID')}</div>
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <span className={`px-1 py-0.5 rounded text-[10px] font-bold ${invCcy === 'USD' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                              {invCcy}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-right font-medium text-red-600">
                            {fmt(inv.balance_amount, invCcy)}
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            <input
                              type="number"
                              min={0}
                              max={inv.balance_amount + (allocations.find(a => a.invoiceId === inv.id)?.amount || 0)}
                              step="0.01"
                              value={allocations.find(a => a.invoiceId === inv.id)?.amount || ''}
                              onChange={(e) => handleAllocationChange(inv, parseFloat(e.target.value) || 0)}
                              className="w-24 px-2 py-1 border rounded text-right"
                              placeholder="0"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {totalAllocated > 0 && (
                <div className="mt-1.5 flex justify-between text-xs font-medium">
                  <span className="text-gray-500">Allocated ({invoiceCurrency}):</span>
                  <span className={totalAllocated > formData.amount ? 'text-red-600' : 'text-green-700'}>
                    {fmt(totalAllocated, invoiceCurrency)}
                    {totalAllocated > formData.amount && <span className="ml-1 text-red-400">Over!</span>}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => { setModalOpen(false); resetForm(); }} className="px-3 py-1.5 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" className="px-4 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">
              {editingVoucher ? 'Update Payment' : 'Save Payment'}
            </button>
          </div>
        </form>
      </Modal>

      {viewingVoucher && (
        <Modal isOpen={!!viewingVoucher} onClose={() => setViewingVoucher(null)} title={`Payment Voucher ${viewingVoucher.voucher_number}`}>
          <div className="space-y-4 text-sm">
            <div className="flex items-center justify-between pb-3 border-b border-gray-200">
              <div>
                <div className="text-xs text-gray-500">Voucher No.</div>
                <div className="text-lg font-semibold text-gray-900">{viewingVoucher.voucher_number}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-500">Date</div>
                <div className="font-medium text-gray-900">{new Date(viewingVoucher.voucher_date).toLocaleDateString('en-GB')}</div>
              </div>
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded hover:bg-gray-50 print:hidden"
              >
                <Printer className="w-3.5 h-3.5" /> Print
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-gray-500 mb-0.5">Supplier</div>
                <div className="font-medium text-gray-900">{viewingVoucher.suppliers?.company_name || '—'}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-0.5">Payment Method</div>
                <div className="font-medium text-gray-900 capitalize">{viewingVoucher.payment_method.replace(/_/g, ' ')}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-0.5">Bank Account</div>
                <div className="font-medium text-gray-900">
                  {viewingVoucher.bank_accounts
                    ? `${viewingVoucher.bank_accounts.alias || viewingVoucher.bank_accounts.bank_name || viewingVoucher.bank_accounts.account_name} (${viewingVoucher.bank_accounts.currency})`
                    : '—'}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-0.5">Reference No.</div>
                <div className="font-medium text-gray-900">{viewingVoucher.reference_number || '—'}</div>
              </div>
            </div>

            {(() => {
              const invCcy = viewAllocations[0]?.allocated_currency || viewingVoucher.invoice_currency || 'IDR';
              const bankCcy = viewingVoucher.bank_accounts?.currency || 'IDR';
              const isCross = invCcy !== bankCcy;
              return (
                <div className="rounded border border-gray-200 bg-gray-50 p-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs text-gray-500">Invoice Amount ({invCcy})</div>
                      <div className="font-semibold text-gray-900">{fmt(viewingVoucher.amount || 0, invCcy)}</div>
                    </div>
                    {isCross && viewingVoucher.exchange_rate && viewingVoucher.exchange_rate !== 1 && (
                      <div>
                        <div className="text-xs text-gray-500">Exchange Rate (1 {invCcy} = {bankCcy})</div>
                        <div className="font-semibold text-gray-900">{viewingVoucher.exchange_rate.toLocaleString()}</div>
                      </div>
                    )}
                    {viewingVoucher.bank_charge ? (
                      <div>
                        <div className="text-xs text-gray-500">Bank Charge ({bankCcy})</div>
                        <div className="font-semibold text-gray-900">{fmt(viewingVoucher.bank_charge, bankCcy)}</div>
                      </div>
                    ) : null}
                    <div>
                      <div className="text-xs text-gray-500">Bank Debit ({bankCcy})</div>
                      <div className="font-semibold text-blue-700">
                        {fmt(
                          viewingVoucher.bank_amount && viewingVoucher.bank_amount > 0
                            ? viewingVoucher.bank_amount
                            : (viewingVoucher.amount || 0) + (viewingVoucher.bank_charge || 0),
                          bankCcy,
                        )}
                      </div>
                    </div>
                    {viewingVoucher.pph_amount ? (
                      <div>
                        <div className="text-xs text-gray-500">PPh Withholding ({invCcy})</div>
                        <div className="font-semibold text-gray-900">{fmt(viewingVoucher.pph_amount, invCcy)}</div>
                      </div>
                    ) : null}
                    <div>
                      <div className="text-xs text-gray-500">Net Paid ({invCcy})</div>
                      <div className="font-semibold text-red-600">{fmt(viewingVoucher.net_amount || 0, invCcy)}</div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {viewAllocations.length > 0 && (
              <div>
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Allocated to Invoices</div>
                <div className="border border-gray-200 rounded overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Invoice No.</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Invoice Date</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-600">Allocated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewAllocations.map((a, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="px-3 py-2">
                            {onViewInvoice && a.invoice_id ? (
                              <button
                                onClick={() => { setViewingVoucher(null); onViewInvoice(a.invoice_id); }}
                                className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                              >
                                {a.invoice_number}
                              </button>
                            ) : (
                              <span className="text-gray-900 font-medium">{a.invoice_number}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-gray-600">{a.invoice_date ? new Date(a.invoice_date).toLocaleDateString('en-GB') : '—'}</td>
                          <td className="px-3 py-2 text-right font-medium text-gray-900">
                            {fmt(a.allocated_amount, a.allocated_currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {viewingVoucher.description && (
              <div>
                <div className="text-xs text-gray-500 mb-0.5">Description</div>
                <div className="text-gray-700 whitespace-pre-wrap">{viewingVoucher.description}</div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
