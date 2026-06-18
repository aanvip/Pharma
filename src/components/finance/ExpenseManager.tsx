import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, DollarSign, Package, Truck, Building2, CreditCard as Edit, Trash2, FileText, Upload, X, ExternalLink, Download, Eye, CheckCircle, XCircle, Clock, Clipboard } from 'lucide-react';
import { Modal } from '../Modal';
import { useFinance } from '../../contexts/FinanceContext';
import { useAuth } from '../../contexts/AuthContext';
import { getFinancialYear } from '../../utils/dateFormat';

interface FinanceExpense {
  id: string;
  expense_category: string;
  amount: number;
  expense_date: string;
  description: string | null;
  batch_id: string | null;
  import_container_id: string | null;
  delivery_challan_id: string | null;
  expense_type: string | null;
  document_urls: string[] | null;
  payment_method: string;
  bank_account_id: string | null;
  payment_reference: string | null;
  voucher_number: string | null;
  approval_status: 'pending_approval' | 'approved' | 'rejected';
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  batches?: { batch_number: string } | null;
  import_containers?: { container_ref: string } | null;
  delivery_challans?: { challan_number: string } | null;
  bank_accounts?: { bank_name: string; account_number: string; alias: string | null; currency: string } | null;
  bank_statement_lines?: Array<{
    id: string;
    transaction_date: string;
    description: string | null;
    debit_amount: number;
    credit_amount: number;
    bank_account_id: string;
    bank_accounts?: { bank_name: string; account_number: string; alias: string | null; currency: string } | null;
  }> | null;
}

interface Batch {
  id: string;
  batch_number: string;
}

interface ImportContainer {
  id: string;
  container_ref: string;
}

interface DeliveryChallan {
  id: string;
  challan_number: string;
  challan_date: string;
  customers?: {
    company_name: string;
  } | null;
}

interface BankAccount {
  id: string;
  bank_name: string;
  account_number: string;
  alias: string | null;
  currency: string;
}

interface ExpenseManagerProps {
  canManage: boolean;
  initialViewExpenseId?: string | null;
  onInitialViewHandled?: () => void;
}

const expenseCategories = [
  {
    value: 'duty_customs',
    label: 'Duty & Customs (BM)',
    type: 'import',
    icon: Building2,
    description: 'Import duties and customs charges - CAPITALIZED to inventory',
    requiresContainer: true,
    group: 'Import Costs'
  },
  {
    value: 'ppn_import',
    label: 'PPN Import',
    type: 'import',
    icon: Building2,
    description: 'Import VAT - CAPITALIZED to inventory',
    requiresContainer: true,
    group: 'Import Costs'
  },
  {
    value: 'pph_import',
    label: 'PPh Import',
    type: 'import',
    icon: Building2,
    description: 'Import withholding tax - CAPITALIZED to inventory',
    requiresContainer: true,
    group: 'Import Costs'
  },
  {
    value: 'freight_import',
    label: 'Freight (Import)',
    type: 'import',
    icon: Package,
    description: 'International freight charges - CAPITALIZED to inventory',
    requiresContainer: true,
    group: 'Import Costs'
  },
  {
    value: 'clearing_forwarding',
    label: 'Clearing & Forwarding',
    type: 'import',
    icon: Building2,
    description: 'Customs clearance - CAPITALIZED to inventory',
    requiresContainer: true,
    group: 'Import Costs'
  },
  {
    value: 'port_charges',
    label: 'Port Charges',
    type: 'import',
    icon: Building2,
    description: 'Port handling charges - CAPITALIZED to inventory',
    requiresContainer: true,
    group: 'Import Costs'
  },
  {
    value: 'container_handling',
    label: 'Container Handling',
    type: 'import',
    icon: Package,
    description: 'Container unloading - CAPITALIZED to inventory',
    requiresContainer: true,
    group: 'Import Costs'
  },
  {
    value: 'transport_import',
    label: 'Transportation (Import)',
    type: 'import',
    icon: Truck,
    description: 'Port to godown transport - CAPITALIZED to inventory',
    requiresContainer: true,
    group: 'Import Costs'
  },
  {
    value: 'loading_import',
    label: 'Loading / Unloading (Import)',
    type: 'import',
    icon: Truck,
    description: 'Import container loading/unloading - CAPITALIZED to inventory',
    requiresContainer: true,
    group: 'Import Costs'
  },
  {
    value: 'bpom_ski_fees',
    label: 'BPOM / SKI Fees',
    type: 'import',
    icon: FileText,
    description: 'BPOM/SKI regulatory fees - CAPITALIZED to inventory',
    requiresContainer: true,
    group: 'Import Costs'
  },
  {
    value: 'other_import',
    label: 'Other (Import)',
    type: 'import',
    icon: DollarSign,
    description: 'Other import-related expenses - CAPITALIZED to inventory',
    requiresContainer: true,
    group: 'Import Costs'
  },
  {
    value: 'delivery_sales',
    label: 'Delivery / Dispatch (Sales)',
    type: 'sales',
    icon: Truck,
    description: 'Customer delivery - EXPENSED to P&L',
    requiresContainer: false,
    group: 'Sales & Distribution'
  },
  {
    value: 'loading_sales',
    label: 'Loading / Unloading (Sales)',
    type: 'sales',
    icon: Truck,
    description: 'Sales loading charges - EXPENSED to P&L',
    requiresContainer: false,
    group: 'Sales & Distribution'
  },
  {
    value: 'other_sales',
    label: 'Other (Sales)',
    type: 'sales',
    icon: DollarSign,
    description: 'Other sales-related expenses - EXPENSED to P&L',
    requiresContainer: false,
    group: 'Sales & Distribution'
  },
  {
    value: 'salary',
    label: 'Salary',
    type: 'staff',
    icon: DollarSign,
    description: 'Staff salaries - EXPENSED to P&L',
    requiresContainer: false,
    group: 'Staff Costs'
  },
  {
    value: 'staff_overtime',
    label: 'Staff Overtime',
    type: 'staff',
    icon: DollarSign,
    description: 'Overtime payments - EXPENSED to P&L',
    requiresContainer: false,
    group: 'Staff Costs'
  },
  {
    value: 'staff_welfare',
    label: 'Staff Welfare / Allowances',
    type: 'staff',
    icon: DollarSign,
    description: 'Driver food, snacks, overtime meals, welfare - EXPENSED to P&L',
    requiresContainer: false,
    group: 'Staff Costs'
  },
  {
    value: 'travel_conveyance',
    label: 'Travel & Conveyance',
    type: 'staff',
    icon: Truck,
    description: 'Local travel, taxi, fuel reimbursements, tolls - EXPENSED to P&L',
    requiresContainer: false,
    group: 'Staff Costs'
  },
  {
    value: 'warehouse_rent',
    label: 'Warehouse Rent',
    type: 'operations',
    icon: Building2,
    description: 'Rent expense - EXPENSED to P&L',
    requiresContainer: false,
    group: 'Operations'
  },
  {
    value: 'utilities',
    label: 'Utilities',
    type: 'operations',
    icon: Building2,
    description: 'Electricity, water, etc - EXPENSED to P&L',
    requiresContainer: false,
    group: 'Operations'
  },
  {
    value: 'bank_charges',
    label: 'Bank Charges',
    type: 'operations',
    icon: DollarSign,
    description: 'Bank fees, charges, and transaction costs - EXPENSED to P&L',
    requiresContainer: false,
    group: 'Operations'
  },
  {
    value: 'office_admin',
    label: 'Office & Admin',
    type: 'admin',
    icon: Building2,
    description: 'General admin expenses - EXPENSED to P&L',
    requiresContainer: false,
    group: 'Administrative'
  },
  {
    value: 'office_shifting_renovation',
    label: 'Office Shifting & Renovation',
    type: 'admin',
    icon: Building2,
    description: 'Office shifting, partition work, electrical, cabling, interior renovation - EXPENSED to P&L',
    requiresContainer: false,
    group: 'Administrative'
  },
  {
    value: 'other',
    label: 'Other',
    type: 'admin',
    icon: DollarSign,
    description: 'Miscellaneous expenses - EXPENSED to P&L',
    requiresContainer: false,
    group: 'Administrative'
  },
];

export function ExpenseManager({ canManage, initialViewExpenseId, onInitialViewHandled }: ExpenseManagerProps) {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [rejectionModalOpen, setRejectionModalOpen] = useState(false);
  const [rejectionTarget, setRejectionTarget] = useState<{ id: string; type: 'expense' } | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [approvalLoading, setApprovalLoading] = useState<string | null>(null);
  const [expenses, setExpenses] = useState<FinanceExpense[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [containers, setContainers] = useState<ImportContainer[]>([]);
  const [challans, setChallans] = useState<DeliveryChallan[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [reconciledExpenseIds, setReconciledExpenseIds] = useState<Set<string>>(new Set());
  const [unlinkedBankTransactions, setUnlinkedBankTransactions] = useState<any[]>([]);
  const [selectedBankTransactionId, setSelectedBankTransactionId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<FinanceExpense | null>(null);
  const [viewingExpense, setViewingExpense] = useState<FinanceExpense | null>(null);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [linkedDCQuickView, setLinkedDCQuickView] = useState<{ challan: any; items: any[] } | null>(null);
  const [linkedDCQuickViewLoading, setLinkedDCQuickViewLoading] = useState(false);
  const [signedUrlCache, setSignedUrlCache] = useState<Record<string, string>>({});
  const [filterType, setFilterType] = useState<'all' | 'import' | 'sales' | 'staff' | 'operations' | 'admin'>('all');
  const [reconFilter, setReconFilter] = useState<'all' | 'reconciled' | 'not_reconciled'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [uploadingFiles, setUploadingFiles] = useState<File[]>([]);
  const [showPasteHint, setShowPasteHint] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  // Use master date range from Finance context
  const { dateRange } = useFinance();
  const startDate = dateRange.startDate;
  const endDate = dateRange.endDate;

  const [formData, setFormData] = useState({
    expense_category: 'other',
    amount: 0,
    expense_date: new Date().toISOString().split('T')[0],
    description: '',
    batch_id: '',
    import_container_id: '',
    delivery_challan_id: '',
    payment_method: 'bank_transfer',
    bank_account_id: '',
    payment_reference: '',
    document_urls: [] as string[],
  });

  useEffect(() => {
    if (!linkedDCQuickView) return;

    const handleEscapeForLinkedDC = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setLinkedDCQuickView(null);
      }
    };

    document.addEventListener('keydown', handleEscapeForLinkedDC, true);
    return () => document.removeEventListener('keydown', handleEscapeForLinkedDC, true);
  }, [linkedDCQuickView]);

  const openLinkedDCQuickView = async () => {
    if (!viewingExpense?.delivery_challan_id) return;

    setLinkedDCQuickViewLoading(true);
    try {
      const { data: challan, error: challanError } = await supabase
        .from('delivery_challans')
        .select(`*, customers(company_name, address, city, phone, npwp, pharmacy_license, gst_vat_type)`)
        .eq('id', viewingExpense.delivery_challan_id)
        .maybeSingle();

      if (challanError) throw challanError;
      if (!challan) throw new Error('Linked delivery challan not found');

      const { data: items, error: itemsError } = await supabase
        .from('delivery_challan_items')
        .select(`*, products(product_name, product_code, unit), batches(batch_number)`)
        .eq('challan_id', challan.id);

      if (itemsError) throw itemsError;

      setLinkedDCQuickView({ challan, items: items || [] });
    } catch (error) {
      console.error('Error loading linked DC quick view:', error);
      alert('Failed to open Delivery Challan details');
    } finally {
      setLinkedDCQuickViewLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Set up realtime subscriptions for expenses and bank statements
    const expenseSubscription = supabase
      .channel('expense-changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'finance_expenses' },
        () => {
          loadData();
        }
      )
      .subscribe();

    const bankStatementSubscription = supabase
      .channel('bank-statement-changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'bank_statement_lines' },
        () => {
          loadData();
        }
      )
      .subscribe();

    return () => {
      expenseSubscription.unsubscribe();
      bankStatementSubscription.unsubscribe();
    };
  }, [dateRange]);

  // Paste handler for images
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!modalOpen) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      const pastedFiles: File[] = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        if (item.type.indexOf('image') !== -1) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (blob) {
            const fileName = `pasted-image-${Date.now()}.png`;
            const file = new File([blob], fileName, { type: blob.type });
            pastedFiles.push(file);
          }
        }
      }

      if (pastedFiles.length > 0) {
        setUploadingFiles([...uploadingFiles, ...pastedFiles]);
        setShowPasteHint(true);
        setTimeout(() => setShowPasteHint(false), 2000);
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [modalOpen, uploadingFiles]);

  useEffect(() => {
    if (!initialViewExpenseId) return;

    const openExpense = async () => {
      const existing = expenses.find(expense => expense.id === initialViewExpenseId);
      if (existing) {
        setViewingExpense(existing);
        setViewModalOpen(true);
        onInitialViewHandled?.();
        return;
      }

      const { data, error } = await supabase
        .from('finance_expenses')
        .select(`
          *,
          batches(batch_number),
          import_containers(container_ref),
          delivery_challans(challan_number),
          bank_accounts(bank_name, account_number, alias, currency),
          bank_statement_lines(
            id,
            transaction_date,
            description,
            debit_amount,
            credit_amount,
            bank_account_id,
            bank_accounts(bank_name, account_number, alias, currency)
          )
        `)
        .eq('id', initialViewExpenseId)
        .maybeSingle();

      if (!error && data) {
        setViewingExpense(data as FinanceExpense);
        setViewModalOpen(true);
      }
      onInitialViewHandled?.();
    };

    openExpense();
  }, [initialViewExpenseId, expenses, onInitialViewHandled]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [expensesRes, batchesRes, containersRes, challansRes, banksRes, bankStmtRes] = await Promise.all([
        supabase
          .from('finance_expenses')
          .select(`
            *,
            batches(batch_number),
            import_containers(container_ref),
            delivery_challans(challan_number),
            bank_accounts(bank_name, account_number, alias, currency),
            bank_statement_lines(
              id,
              transaction_date,
              description,
              debit_amount,
              credit_amount,
              bank_account_id,
              bank_accounts(bank_name, account_number, alias, currency)
            )
          `)
          .order('expense_date', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase
          .from('batches')
          .select('id, batch_number')
          .order('batch_number'),
        supabase
          .from('import_containers')
          .select('id, container_ref')
          .order('container_ref'),
        supabase
          .from('delivery_challans')
          .select('id, challan_number, challan_date, customers(company_name)')
          .order('challan_number', { ascending: false })
          .limit(50),
        supabase
          .from('bank_accounts')
          .select('id, bank_name, account_number, alias, currency')
          .order('bank_name'),
        supabase
          .from('bank_statement_lines')
          .select('matched_expense_id')
          .not('matched_expense_id', 'is', null),
      ]);

      if (expensesRes.error) throw expensesRes.error;
      setExpenses(expensesRes.data || []);
      setBatches(batchesRes.data || []);
      setContainers(containersRes.data || []);
      setChallans(challansRes.data || []);
      setBankAccounts(banksRes.data || []);

      // Build set of reconciled expense IDs
      const reconciledIds = new Set<string>();
      if (bankStmtRes.data) {
        bankStmtRes.data.forEach(line => {
          if (line.matched_expense_id) {
            reconciledIds.add(line.matched_expense_id);
          }
        });
      }
      setReconciledExpenseIds(reconciledIds);
    } catch (error: any) {
      console.error('Error loading data:', error.message);
      alert('Failed to load expenses');
    } finally {
      setLoading(false);
    }
  };

  const loadUnlinkedBankTransactions = async (bankAccountId?: string, currentExpenseId?: string) => {
    try {
      let query = supabase
        .from('bank_statement_lines')
        .select(`
          id,
          transaction_date,
          description,
          debit_amount,
          credit_amount,
          bank_account_id,
          bank_accounts(bank_name, account_number, alias, currency)
        `)
        .or(`matched_expense_id.is.null,matched_expense_id.eq.${currentExpenseId || 'NULL'}`)
        .is('matched_receipt_id', null)
        .is('matched_petty_cash_id', null)
        .is('matched_entry_id', null)
        .is('matched_fund_transfer_id', null)
        .order('transaction_date', { ascending: false });

      // Filter by bank account if provided
      if (bankAccountId) {
        query = query.eq('bank_account_id', bankAccountId);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Filter to only show debit transactions (expenses) with amount > 0
      const debitTransactions = (data || []).filter(txn =>
        txn.debit_amount && txn.debit_amount > 0
      );

      setUnlinkedBankTransactions(debitTransactions);
    } catch (error) {
      console.error('Error loading unlinked transactions:', error);
    }
  };


  const getSignedUrl = async (fileUrl: string): Promise<string> => {
    try {
      const match = fileUrl.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)/);
      if (!match) {
        // Try authenticated path pattern
        const authMatch = fileUrl.match(/\/storage\/v1\/object\/([^/]+)\/(.+)/);
        if (!authMatch) return fileUrl;
        const [, bucket, path] = authMatch;
        const { data } = await supabase.storage.from(bucket).createSignedUrl(decodeURIComponent(path), 3600);
        return data?.signedUrl || fileUrl;
      }
      const [, bucket, path] = match;
      const { data } = await supabase.storage.from(bucket).createSignedUrl(decodeURIComponent(path), 3600);
      return data?.signedUrl || fileUrl;
    } catch {
      return fileUrl;
    }
  };

  const openDocument = async (url: string) => {
    const signed = await getSignedUrl(url);
    window.open(signed, '_blank', 'noopener,noreferrer');
  };

  const downloadDocument = async (url: string, filename: string) => {
    try {
      const signed = await getSignedUrl(url);
      const response = await fetch(signed);
      if (!response.ok) throw new Error('Fetch failed');
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch {
      // fallback: open directly
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    console.log('=== EXPENSE FORM SUBMIT ===');
    console.log('Editing:', !!editingExpense);
    console.log('Files to upload:', uploadingFiles.length);
    console.log('Existing URLs:', formData.document_urls);

    try {
      const category = expenseCategories.find(c => c.value === formData.expense_category);

      // Upload new files first
      const uploadedUrls: string[] = [];
      if (uploadingFiles.length > 0) {
        console.log('=== UPLOADING', uploadingFiles.length, 'FILES ===');

        for (const file of uploadingFiles) {
          console.log('Uploading file:', file.name, '(', file.size, 'bytes)');

          const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
          const filePath = `${formData.expense_category}/${fileName}`;

          console.log('Storage path:', filePath);

          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('expense-documents')
            .upload(filePath, file, {
              cacheControl: '3600',
              upsert: false
            });

          if (uploadError) {
            console.error('Upload error:', uploadError);
            throw new Error(`Failed to upload ${file.name}: ${uploadError.message}`);
          }

          console.log('Upload successful:', uploadData);

          const { data: { publicUrl } } = supabase.storage
            .from('expense-documents')
            .getPublicUrl(filePath);

          console.log('Public URL:', publicUrl);
          uploadedUrls.push(publicUrl);
        }

        console.log('All uploads complete. Uploaded URLs:', uploadedUrls);
      } else {
        console.log('No new files to upload');
      }

      // Combine existing URLs with newly uploaded ones
      const allDocumentUrls = [...formData.document_urls, ...uploadedUrls];
      console.log('Combined document URLs:', allDocumentUrls);

      const expenseData = {
        expense_category: formData.expense_category,
        expense_type: category?.type || 'admin',
        amount: formData.amount,
        expense_date: formData.expense_date,
        description: formData.description || null,
        batch_id: formData.batch_id || null,
        import_container_id: formData.import_container_id || null,
        delivery_challan_id: formData.delivery_challan_id || null,
        payment_method: formData.payment_method,
        bank_account_id: formData.bank_account_id || null,
        payment_reference: formData.payment_reference || null,
        paid_by: 'bank',
        document_urls: allDocumentUrls.length > 0 ? allDocumentUrls : null,
      };

      console.log('=== EXPENSE DATA TO SAVE ===');
      console.log('document_urls:', expenseData.document_urls);
      console.log('Full expense data:', expenseData);

      if (editingExpense) {
        // Regular update - bank expenses only (cash expenses go to Petty Cash Manager)
        console.log('=== UPDATING EXPENSE ===');
        console.log('Expense ID:', editingExpense.id);

        const { error } = await supabase
          .from('finance_expenses')
          .update(expenseData)
          .eq('id', editingExpense.id);

        if (error) {
          console.error('Update error:', error);
          throw error;
        }

        console.log('Update successful! Fetching updated data...');

        // Fetch the updated expense with relations
        const { data: updatedExpense, error: fetchError } = await supabase
          .from('finance_expenses')
          .select(`
            *,
            batches (batch_number),
            import_containers (container_ref),
            delivery_challans (challan_number),
            bank_accounts (bank_name, account_number),
            bank_statement_lines (
              id,
              transaction_date,
              description,
              debit_amount,
              credit_amount,
              bank_account_id,
              bank_accounts (bank_name, account_number)
            )
          `)
          .eq('id', editingExpense.id)
          .single();

        if (fetchError) {
          console.error('Fetch error:', fetchError);
          throw fetchError;
        }

        console.log('=== FETCHED UPDATED EXPENSE ===');
        console.log('document_urls from DB:', updatedExpense.document_urls);
        console.log('Full updated expense:', updatedExpense);

        // Update in local state
        setExpenses(prev => prev.map(exp =>
          exp.id === editingExpense.id ? updatedExpense : exp
        ));

        // Link to bank transaction if selected
        if (selectedBankTransactionId) {
          const { data: { user: currentUser } } = await supabase.auth.getUser();
          const { error: linkError } = await supabase
            .from('bank_statement_lines')
            .update({
              matched_expense_id: editingExpense.id,
              reconciliation_status: 'matched',
              matched_at: new Date().toISOString(),
              matched_by: currentUser?.id
            })
            .eq('id', selectedBankTransactionId);

          if (linkError) {
            console.error('Error linking to bank transaction:', linkError);
            alert('Expense updated but failed to link to bank transaction. Please link manually from Bank Reconciliation.');
          } else {
            // Fetch the expense again to get updated bank_statement_lines
            const { data: refreshedExpense, error: refreshError } = await supabase
              .from('finance_expenses')
              .select(`
                *,
                batches (batch_number),
                import_containers (container_ref),
                delivery_challans (challan_number),
                bank_accounts (bank_name, account_number),
                bank_statement_lines (
                  id,
                  transaction_date,
                  description,
                  debit_amount,
                  credit_amount,
                  bank_account_id,
                  bank_accounts (bank_name, account_number)
                )
              `)
              .eq('id', editingExpense.id)
              .single();

            if (!refreshError && refreshedExpense) {
              // Update local state with refreshed expense
              setExpenses(prev => prev.map(exp =>
                exp.id === editingExpense.id ? refreshedExpense : exp
              ));

              // Remove from unlinked transactions
              setUnlinkedBankTransactions(prev =>
                prev.filter(txn => txn.id !== selectedBankTransactionId)
              );

              // Add to reconciled list
              setReconciledExpenseIds(prev => new Set(prev).add(editingExpense.id));
            }
          }
        }

        alert('Expense updated successfully');
      } else {
        // Create new bank expense - cash expenses should be recorded in Petty Cash Manager
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        console.log('=== CREATING NEW EXPENSE ===');

        // Generate voucher number: EXP/YY-YY/NNN
        const fy = getFinancialYear(new Date());
        const fyPrefix = `EXP/${fy}/`;
        const { data: fyNums } = await supabase
          .from('finance_expenses')
          .select('voucher_number')
          .like('voucher_number', `${fyPrefix}%`);
        const maxSeq = (fyNums || []).reduce((max, r) => {
          const n = parseInt(r.voucher_number?.split('/')[2] || '0', 10);
          return isNaN(n) ? max : Math.max(max, n);
        }, 0);
        const voucherNumber = `${fyPrefix}${String(maxSeq + 1).padStart(3, '0')}`;

        const { data: newExpense, error } = await supabase
          .from('finance_expenses')
          .insert([{ ...expenseData, created_by: user.id, voucher_number: voucherNumber }])
          .select(`
            *,
            batches (batch_number),
            import_containers (container_ref),
            delivery_challans (challan_number),
            bank_accounts (bank_name, account_number),
            bank_statement_lines (
              id,
              transaction_date,
              description,
              debit_amount,
              credit_amount,
              bank_account_id,
              bank_accounts (bank_name, account_number)
            )
          `)
          .single();

        if (error) {
          console.error('Insert error:', error);
          throw error;
        }

        console.log('=== NEW EXPENSE CREATED ===');
        console.log('document_urls from DB:', newExpense?.document_urls);
        console.log('Full new expense:', newExpense);

        // Variable to hold the final expense (may be refreshed if linked to bank)
        let finalExpense = newExpense;

        // Link to bank transaction if selected
        if (selectedBankTransactionId && newExpense) {
          const { error: linkError } = await supabase
            .from('bank_statement_lines')
            .update({
              matched_expense_id: newExpense.id,
              reconciliation_status: 'matched',
              matched_at: new Date().toISOString(),
              matched_by: user.id
            })
            .eq('id', selectedBankTransactionId);

          if (linkError) {
            console.error('Error linking to bank transaction:', linkError);
            alert('Expense created but failed to link to bank transaction. Please link manually from Bank Reconciliation.');
          } else {
            // Fetch the expense again to get updated bank_statement_lines
            const { data: refreshedExpense, error: refreshError } = await supabase
              .from('finance_expenses')
              .select(`
                *,
                batches (batch_number),
                import_containers (container_ref),
                delivery_challans (challan_number),
                bank_accounts (bank_name, account_number),
                bank_statement_lines (
                  id,
                  transaction_date,
                  description,
                  debit_amount,
                  credit_amount,
                  bank_account_id,
                  bank_accounts (bank_name, account_number)
                )
              `)
              .eq('id', newExpense.id)
              .single();

            if (!refreshError && refreshedExpense) {
              // Use refreshed expense with bank_statement_lines included
              finalExpense = refreshedExpense;

              // Remove from unlinked transactions
              setUnlinkedBankTransactions(prev =>
                prev.filter(txn => txn.id !== selectedBankTransactionId)
              );

              // Add to reconciled list
              setReconciledExpenseIds(prev => new Set(prev).add(newExpense.id));
            }
          }
        }

        // Add to local state (with bank link if applicable)
        setExpenses(prev => [finalExpense, ...prev]);
        alert('Expense recorded successfully');
      }

      setModalOpen(false);
      resetForm();
    } catch (error: any) {
      console.error('Error saving expense:', error.message);
      // Show clear error message from backend validation
      const errorMessage = error.message || 'Unknown error occurred';
      if (errorMessage.includes('Import expenses must be linked')) {
        alert('❌ Context Required\n\nImport expenses must be linked to an Import Container.\nPlease select a container before saving.');
      } else {
        alert('Failed to save expense:\n\n' + errorMessage);
      }
    }
  };

  const handleEdit = async (expense: FinanceExpense) => {
    setEditingExpense(expense);

    // Check if expense is reconciled to a bank statement
    const reconciledBankInfo = expense.bank_statement_lines && expense.bank_statement_lines.length > 0
      ? expense.bank_statement_lines[0]
      : null;

    // Use reconciled bank info if available, otherwise use expense's own payment info
    const effectiveBankAccountId = reconciledBankInfo?.bank_account_id || expense.bank_account_id || '';
    const effectivePaymentMethod = reconciledBankInfo?.bank_account_id
      ? 'bank_transfer'
      : (expense.payment_method || 'bank_transfer');

    setFormData({
      expense_category: expense.expense_category,
      amount: expense.amount,
      expense_date: expense.expense_date,
      description: expense.description || '',
      batch_id: expense.batch_id || '',
      import_container_id: expense.import_container_id || '',
      delivery_challan_id: expense.delivery_challan_id || '',
      payment_method: effectivePaymentMethod,
      bank_account_id: effectiveBankAccountId,
      payment_reference: expense.payment_reference || '',
      document_urls: expense.document_urls || [],
    });

    // Set selected bank transaction if expense is already linked
    setSelectedBankTransactionId(reconciledBankInfo?.id || '');

    // Load unlinked bank transactions for the selected bank account
    if (effectiveBankAccountId) {
      await loadUnlinkedBankTransactions(effectiveBankAccountId, expense.id);
    }

    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this expense?')) return;

    try {
      const { error } = await supabase
        .from('finance_expenses')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Remove from local state
      setExpenses(prev => prev.filter(exp => exp.id !== id));
      alert('Expense deleted successfully');
    } catch (error: any) {
      console.error('Error deleting expense:', error.message);
      alert('Failed to delete expense: ' + error.message);
    }
  };


  const handleApproveExpense = async (id: string) => {
    if (!isAdmin) return;
    setApprovalLoading(id);
    try {
      const { error } = await supabase
        .from('finance_expenses')
        .update({ approval_status: 'approved', approved_by: profile?.id, approved_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      setExpenses(prev => prev.map(e => e.id === id ? { ...e, approval_status: 'approved', approved_by: profile?.id ?? null, approved_at: new Date().toISOString() } : e));
    } catch (err: any) {
      alert('Failed to approve: ' + err.message);
    } finally {
      setApprovalLoading(null);
    }
  };

  const handleRejectExpenseConfirm = async () => {
    if (!rejectionTarget || !rejectionReason.trim()) return;
    setApprovalLoading(rejectionTarget.id);
    try {
      const { error } = await supabase
        .from('finance_expenses')
        .update({ approval_status: 'rejected', approved_by: profile?.id, approved_at: new Date().toISOString(), rejection_reason: rejectionReason })
        .eq('id', rejectionTarget.id);
      if (error) throw error;
      setExpenses(prev => prev.map(e => e.id === rejectionTarget.id ? { ...e, approval_status: 'rejected', rejection_reason: rejectionReason } : e));
      setRejectionModalOpen(false);
      setRejectionTarget(null);
      setRejectionReason('');
    } catch (err: any) {
      alert('Failed to reject: ' + err.message);
    } finally {
      setApprovalLoading(null);
    }
  };

  const handleUnlinkFromBankStatement = async (expenseId: string) => {
    if (!confirm(
      'Are you sure you want to unlink this expense from the bank statement?\n\n' +
      'The bank statement line will be set back to "Unmatched" status.'
    )) return;

    try {
      const { error } = await supabase
        .from('bank_statement_lines')
        .update({
          expense_id: null,
          status: 'unmatched',
          matched_date: null
        })
        .eq('expense_id', expenseId);

      if (error) throw error;

      // Fetch the updated expense with relations
      const { data: updatedExpense, error: fetchError } = await supabase
        .from('finance_expenses')
        .select(`
          *,
          batches (batch_number),
          import_containers (container_ref),
          delivery_challans (challan_number),
          bank_accounts (bank_name, account_number),
          bank_statement_lines (
            id,
            transaction_date,
            description,
            debit_amount,
            credit_amount,
            bank_account_id,
            bank_accounts (bank_name, account_number)
          )
        `)
        .eq('id', expenseId)
        .single();

      if (fetchError) throw fetchError;

      // Update in local state
      setExpenses(prev => prev.map(exp =>
        exp.id === expenseId ? updatedExpense : exp
      ));

      alert('Expense unlinked from bank statement successfully');
      setModalOpen(false);
      setEditingExpense(null);
      resetForm();
    } catch (error: any) {
      console.error('Error unlinking expense:', error.message);
      alert('Failed to unlink expense: ' + error.message);
    }
  };

  const handleRemoveDocument = (urlToRemove: string) => {
    setFormData({
      ...formData,
      document_urls: formData.document_urls.filter(url => url !== urlToRemove)
    });
  };

  const handleRemoveUploadingFile = (indexToRemove: number) => {
    setUploadingFiles(uploadingFiles.filter((_, index) => index !== indexToRemove));
  };

  const resetForm = () => {
    setEditingExpense(null);
    setUploadingFiles([]);
    setFormData({
      expense_category: 'other',
      amount: 0,
      expense_date: new Date().toISOString().split('T')[0],
      description: '',
      batch_id: '',
      import_container_id: '',
      delivery_challan_id: '',
      payment_method: 'bank_transfer',
      bank_account_id: '',
      payment_reference: '',
      document_urls: [],
    });
  };

  const selectedCategory = expenseCategories.find(c => c.value === formData.expense_category);
  const requiresContainer = selectedCategory?.type === 'import';
  const requiresDC = selectedCategory?.type === 'sales';

  const filteredExpenses = expenses.filter(exp => {
    // Filter by type
    if (filterType !== 'all') {
      const cat = expenseCategories.find(c => c.value === exp.expense_category);
      if (cat?.type !== filterType) return false;
    }

    // Filter by specific category
    if (categoryFilter !== 'all' && exp.expense_category !== categoryFilter) {
      return false;
    }

    // Filter by reconciliation status
    if (reconFilter === 'reconciled') {
      if (!reconciledExpenseIds.has(exp.id)) return false;
    } else if (reconFilter === 'not_reconciled') {
      if (reconciledExpenseIds.has(exp.id)) return false;
    }

    // Filter by date range
    if (startDate && exp.expense_date < startDate) return false;
    if (endDate && exp.expense_date > endDate) return false;

    return true;
  });

  // Sorting function
  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedExpenses = [...filteredExpenses].sort((a, b) => {
    if (!sortConfig) return 0;

    const { key, direction } = sortConfig;
    let aValue: any;
    let bValue: any;

    if (key === 'date') {
      aValue = new Date(a.expense_date).getTime();
      bValue = new Date(b.expense_date).getTime();
    } else if (key === 'category') {
      const aCat = expenseCategories.find(c => c.value === a.expense_category);
      const bCat = expenseCategories.find(c => c.value === b.expense_category);
      aValue = aCat?.label?.toLowerCase() || '';
      bValue = bCat?.label?.toLowerCase() || '';
    } else if (key === 'amount') {
      aValue = Number(a.amount) || 0;
      bValue = Number(b.amount) || 0;
    } else if (key === 'description') {
      aValue = (a.description || '').toLowerCase();
      bValue = (b.description || '').toLowerCase();
    } else if (key === 'payment_method') {
      // Sort by payment method (bank expenses only - cash expenses are in Petty Cash)
      aValue = (a.payment_method || 'unknown').toLowerCase();
      bValue = (b.payment_method || 'unknown').toLowerCase();
    } else if (key === 'reconciliation') {
      // Sort by reconciliation status
      const aReconciled = a.bank_statement_lines && a.bank_statement_lines.length > 0;
      const bReconciled = b.bank_statement_lines && b.bank_statement_lines.length > 0;
      aValue = aReconciled ? 1 : 0;
      bValue = bReconciled ? 1 : 0;
    } else {
      aValue = a[key as keyof FinanceExpense];
      bValue = b[key as keyof FinanceExpense];
      if (typeof aValue === 'string') aValue = aValue.toLowerCase();
      if (typeof bValue === 'string') bValue = bValue.toLowerCase();
    }

    if (aValue < bValue) return direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return direction === 'asc' ? 1 : -1;
    return 0;
  });

  const exportToCSV = () => {
    if (filteredExpenses.length === 0) {
      alert('No expenses to export');
      return;
    }

    const headers = [
      'Number',
      'Type',
      'Date',
      'Category',
      'Description',
      'Linked To',
      'Amount',
      'Payment Method',
      'Bank Account',
      'Approval Status',
    ];
    const rows = filteredExpenses.map(exp => {
      const category = expenseCategories.find(c => c.value === exp.expense_category);
      const linkedTo =
        exp.import_containers?.container_ref ||
        exp.delivery_challans?.challan_number ||
        '';
      const bankInfo = exp.bank_accounts
        ? (exp.bank_accounts.alias || exp.bank_accounts.bank_name)
        : (exp.bank_statement_lines?.[0]?.bank_accounts?.alias ||
           exp.bank_statement_lines?.[0]?.bank_accounts?.bank_name ||
           '');
      return [
        exp.voucher_number || '',
        category?.type || '',
        exp.expense_date,
        category?.label || exp.expense_category,
        exp.description || '',
        linkedTo,
        exp.amount.toString(),
        (exp.payment_method || '').replace(/_/g, ' '),
        bankInfo,
        exp.approval_status || '',
      ];
    });

    const escape = (cell: string) => `"${String(cell).replace(/"/g, '""')}"`;
    const csvContent = [
      headers.map(escape).join(','),
      ...rows.map(row => row.map(c => escape(String(c))).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `expenses_${startDate || 'all'}_to_${endDate || 'all'}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'import': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'sales': return 'bg-green-100 text-green-800 border-green-300';
      case 'staff': return 'bg-purple-100 text-purple-800 border-purple-300';
      case 'operations': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'admin': return 'bg-gray-100 text-gray-800 border-gray-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const formatCurrency = (amount: number) => {
    return `Rp ${amount?.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  return (
    <div className="space-y-4">
      {/* Compact Header with Summary Stats */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg p-2.5 text-white shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold">Expense Tracker</h2>
            <div className="flex gap-2">
              <div className="bg-white/20 rounded px-2.5 py-1">
                <div className="text-blue-100 text-[9px] leading-tight">Total</div>
                <div className="text-xs font-bold">
                  Rp {filteredExpenses.reduce((sum, exp) => sum + exp.amount, 0).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </div>
              </div>
              <div className="bg-white/20 rounded px-2.5 py-1">
                <div className="text-blue-100 text-[9px] leading-tight">Reconciled</div>
                <div className="text-xs font-bold">
                  {expenses.filter(e => reconciledExpenseIds.has(e.id)).length} / {expenses.length}
                </div>
              </div>
            </div>
          </div>
          {canManage && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  resetForm();
                  setModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white text-blue-600 rounded hover:bg-blue-50 font-medium transition-all shadow-sm text-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                New
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Compact Single-Line Filter Bar */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-2">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Type Filter Pills */}
          <div className="flex gap-1">
            {[
              { value: 'all', label: 'All', icon: '📋' },
              { value: 'import', label: 'Import', icon: '📦' },
              { value: 'sales', label: 'Sales', icon: '🚚' },
              { value: 'staff', label: 'Staff', icon: '👥' },
              { value: 'operations', label: 'Ops', icon: '🏢' },
              { value: 'admin', label: 'Admin', icon: '📄' },
            ].map((tab) => (
              <button
                key={tab.value}
                onClick={() => setFilterType(tab.value as any)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  filterType === tab.value
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          <div className="h-6 w-px bg-gray-300"></div>

          {/* Reconciliation Filter */}
          <div className="flex gap-1">
            {[
              { value: 'all', label: 'All' },
              { value: 'reconciled', label: '✓ Linked' },
              { value: 'not_reconciled', label: '⚠ Unlinked' },
            ].map((filter) => (
              <button
                key={filter.value}
                onClick={() => setReconFilter(filter.value as any)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  reconFilter === filter.value
                    ? 'bg-green-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-2 py-1 border border-gray-300 rounded-md text-xs"
          >
            <option value="all">All Categories</option>
            {expenseCategories
              .sort((a, b) => {
                const groupOrder = { 'Import Costs': 1, 'Sales & Distribution': 2, 'Staff Costs': 3, 'Operations': 4, 'Administrative': 5 };
                const aOrder = groupOrder[a.group as keyof typeof groupOrder] || 999;
                const bOrder = groupOrder[b.group as keyof typeof groupOrder] || 999;
                if (aOrder !== bOrder) return aOrder - bOrder;
                return a.label.localeCompare(b.label);
              })
              .map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
          </select>

          {/* Export Button */}
          <button
            onClick={exportToCSV}
            disabled={filteredExpenses.length === 0}
            className="ml-auto px-3 py-1.5 bg-green-600 text-white rounded-md text-xs hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-1.5 font-medium"
          >
            <Download className="w-3.5 h-3.5" />
            Export ({filteredExpenses.length})
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">No.</th>
              <th
                onClick={() => handleSort('date')}
                className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 select-none"
              >
                <div className="flex items-center gap-1">
                  Date
                  {sortConfig?.key === 'date' && (
                    <span className="text-blue-600 text-sm">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                  )}
                </div>
              </th>
              <th
                onClick={() => handleSort('category')}
                className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 select-none"
              >
                <div className="flex items-center gap-1">
                  Category
                  {sortConfig?.key === 'category' && (
                    <span className="text-blue-600 text-sm">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                  )}
                </div>
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">Context</th>
              <th
                onClick={() => handleSort('description')}
                className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 select-none"
              >
                <div className="flex items-center gap-1">
                  Description
                  {sortConfig?.key === 'description' && (
                    <span className="text-blue-600 text-sm">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                  )}
                </div>
              </th>
              <th
                onClick={() => handleSort('amount')}
                className="px-4 py-2.5 text-right text-xs font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 select-none"
              >
                <div className="flex items-center justify-end gap-1">
                  Amount
                  {sortConfig?.key === 'amount' && (
                    <span className="text-blue-600 text-sm">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                  )}
                </div>
              </th>
              <th
                onClick={() => handleSort('payment_method')}
                className="px-4 py-2.5 text-center text-xs font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center justify-center gap-1">
                  Payment
                  {sortConfig?.key === 'payment_method' && (
                    <span className="text-blue-600 text-sm">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                  )}
                </div>
              </th>
              <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-600">Type</th>
              <th
                onClick={() => handleSort('reconciliation')}
                className="px-4 py-2.5 text-center text-xs font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center justify-center gap-1">
                  Status
                  {sortConfig?.key === 'reconciliation' && (
                    <span className="text-blue-600 text-sm">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                  )}
                </div>
              </th>
              <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-600">Approval</th>
              {canManage && <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-600">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={canManage ? 11 : 10} className="px-6 py-8 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : filteredExpenses.length === 0 ? (
              <tr>
                <td colSpan={canManage ? 10 : 9} className="px-6 py-8 text-center text-gray-500">
                  No expenses found
                </td>
              </tr>
            ) : (
              sortedExpenses.map((expense) => {
                const category = expenseCategories.find(c => c.value === expense.expense_category);

                // Fix: Check reconciliation from actual bank_statement_lines relationship
                const isReconciled = expense.bank_statement_lines && expense.bank_statement_lines.length > 0;

                // Get bank info from reconciled statement line
                const reconciledBankInfo = isReconciled
                  ? expense.bank_statement_lines[0].bank_accounts
                  : null;

                return (
                  <tr key={expense.id} className="hover:bg-blue-50/50 transition-colors">
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <div className="font-mono text-xs text-gray-500">
                        {expense.voucher_number || '—'}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <div className="text-xs text-gray-900 font-medium">
                        {formatDate(expense.expense_date)}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="text-xs font-medium text-gray-900">
                        {category?.label || expense.expense_category}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      {expense.import_container_id && expense.import_containers ? (
                        <div className="flex items-center gap-1.5 text-xs">
                          <Package className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                          <span className="text-blue-700 font-medium">
                            {expense.import_containers.container_ref}
                          </span>
                        </div>
                      ) : expense.delivery_challan_id && expense.delivery_challans ? (
                        <div className="flex items-center gap-1.5 text-xs">
                          <Truck className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                          <span className="text-green-700 font-medium">
                            {expense.delivery_challans.challan_number}
                          </span>
                        </div>
                      ) : category?.requiresContainer ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-red-700 bg-red-50 border border-red-200 rounded">
                          ⚠️ Missing
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="text-xs text-gray-700 line-clamp-1">{expense.description || '—'}</div>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-right">
                      <div className="text-xs font-semibold text-gray-900">
                        {expense.bank_accounts?.currency === 'USD' ? '$' : 'Rp'} {expense.amount.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-center">
                      {isReconciled && reconciledBankInfo ? (
                        <div className="text-xs">
                          <div className="font-medium text-blue-700">{reconciledBankInfo.alias || reconciledBankInfo.bank_name}</div>
                        </div>
                      ) : expense.bank_account_id && expense.bank_accounts ? (
                        <div className="text-xs">
                          <div className="font-medium text-gray-700">{expense.bank_accounts.alias || expense.bank_accounts.bank_name}</div>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-600">{expense.payment_method ? expense.payment_method.replace('_', ' ') : '—'}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-center">
                      <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-bold rounded ${getTypeColor(category?.type || 'admin')}`}>
                        {category?.type === 'import' && 'CAP'}
                        {category?.type === 'sales' && 'EXP'}
                        {category?.type === 'staff' && 'EXP'}
                        {category?.type === 'operations' && 'EXP'}
                        {category?.type === 'admin' && 'EXP'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-center">
                      {isReconciled ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold text-green-700 bg-green-50 border border-green-300 rounded">
                          ✓ LINKED
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold text-orange-700 bg-orange-50 border border-orange-300 rounded">
                          ⚠ UNLINKED
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-center">
                      {expense.approval_status === 'approved' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold text-green-700 bg-green-50 border border-green-200 rounded-full">
                          <CheckCircle className="w-3 h-3" />Approved
                        </span>
                      ) : expense.approval_status === 'rejected' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 rounded-full" title={expense.rejection_reason || ''}>
                          <XCircle className="w-3 h-3" />Rejected
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-full">
                          <Clock className="w-3 h-3" />Pending
                        </span>
                      )}
                    </td>
                    {canManage && (
                      <td className="px-4 py-2.5 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={async () => {
                              setViewingExpense(expense);
                              setViewModalOpen(true);
                              if (expense.document_urls?.length) {
                                const entries = await Promise.all(
                                  expense.document_urls.map(async (url) => [url, await getSignedUrl(url)] as [string, string])
                                );
                                setSignedUrlCache(prev => ({ ...prev, ...Object.fromEntries(entries) }));
                              }
                            }}
                            className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="View"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {isAdmin && expense.approval_status === 'pending_approval' && (
                            <>
                              <button
                                onClick={() => handleApproveExpense(expense.id)}
                                disabled={approvalLoading === expense.id}
                                className="p-1 text-green-600 hover:bg-green-50 rounded transition-colors disabled:opacity-50"
                                title="Approve"
                              >
                                <CheckCircle className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => { setRejectionTarget({ id: expense.id, type: 'expense' }); setRejectionModalOpen(true); }}
                                disabled={approvalLoading === expense.id}
                                className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                                title="Reject"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => handleEdit(expense)}
                            className="p-1 text-green-600 hover:bg-green-50 rounded transition-colors"
                            title="Edit"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(expense.id)}
                            className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
            {/* Totals Row */}
            {!loading && sortedExpenses.length > 0 && (
              <tr className="bg-gradient-to-r from-blue-50 to-blue-100 border-t-2 border-blue-200 font-bold">
                <td colSpan={4} className="px-4 py-2.5 text-right text-xs text-gray-900">
                  TOTAL ({sortedExpenses.length} expenses):
                </td>
                <td className="px-4 py-2.5 text-right text-sm text-blue-900 font-bold">
                  Rp {sortedExpenses.reduce((sum, exp) => sum + exp.amount, 0).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </td>
                <td colSpan={canManage ? 5 : 4}></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <Modal
          isOpen={modalOpen}
          onClose={() => {
            setModalOpen(false);
            resetForm();
          }}
          title={editingExpense ? 'Edit Expense' : 'Record New Expense'}
          maxWidth="max-w-2xl"
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Expense Category <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.expense_category}
                onChange={(e) => {
                  const newCategory = e.target.value;
                  const cat = expenseCategories.find(c => c.value === newCategory);
                  // Clear container/DC when changing categories
                  setFormData({
                    ...formData,
                    expense_category: newCategory,
                    import_container_id: cat?.type === 'import' ? formData.import_container_id : '',
                    delivery_challan_id: cat?.type === 'sales' ? formData.delivery_challan_id : ''
                  });
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                required
              >
                <option value="">Select Category</option>

                {/* Import Costs - Capitalized to Inventory */}
                <optgroup label="═══ IMPORT COSTS (Capitalized to Inventory) ═══">
                  {expenseCategories.filter(c => c.group === 'Import Costs').map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label} [Requires Container]
                    </option>
                  ))}
                </optgroup>

                {/* Sales & Distribution - P&L Expense */}
                <optgroup label="═══ SALES & DISTRIBUTION (P&L Expense) ═══">
                  {expenseCategories.filter(c => c.group === 'Sales & Distribution').map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </optgroup>

                {/* Staff Costs - P&L Expense */}
                <optgroup label="═══ STAFF COSTS (P&L Expense) ═══">
                  {expenseCategories.filter(c => c.group === 'Staff Costs').map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </optgroup>

                {/* Operations - P&L Expense */}
                <optgroup label="═══ OPERATIONS (P&L Expense) ═══">
                  {expenseCategories.filter(c => c.group === 'Operations').map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </optgroup>

                {/* Administrative - P&L Expense */}
                <optgroup label="═══ ADMINISTRATIVE (P&L Expense) ═══">
                  {expenseCategories.filter(c => c.group === 'Administrative').map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </optgroup>
              </select>
              {selectedCategory && (
                <div className={`mt-2 p-3 rounded-lg border ${getTypeColor(selectedCategory.type)}`}>
                  <p className="text-sm font-medium">{selectedCategory.description}</p>
                  {selectedCategory.requiresContainer && (
                    <p className="text-xs font-semibold text-red-600 mt-1">
                      ⚠️ Must be linked to Import Container
                    </p>
                  )}
                </div>
              )}
            </div>

            {requiresContainer && (
              <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-4">
                <label className="block text-sm font-medium text-blue-900 mb-2">
                  <Package className="w-4 h-4 inline mr-1" />
                  Import Container <span className="text-red-500">* REQUIRED</span>
                </label>
                <select
                  value={formData.import_container_id}
                  onChange={(e) => setFormData({ ...formData, import_container_id: e.target.value })}
                  className="w-full px-3 py-2 border border-blue-300 rounded-lg bg-white"
                  required={requiresContainer}
                >
                  <option value="">Select Container (Required)</option>
                  {containers.map((container) => (
                    <option key={container.id} value={container.id}>
                      {container.container_ref}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-blue-800 font-medium">
                  ✓ This expense will be CAPITALIZED to inventory and allocated to batches
                </p>
                <p className="mt-1 text-xs text-red-700 font-semibold">
                  ⚠️ Backend will block saving without a container selection
                </p>
              </div>
            )}

            {requiresDC && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <label className="block text-sm font-medium text-green-900 mb-2">
                  Delivery Challan (Optional)
                </label>
                <select
                  value={formData.delivery_challan_id}
                  onChange={(e) => setFormData({ ...formData, delivery_challan_id: e.target.value })}
                  className="w-full px-3 py-2 border border-green-300 rounded-lg"
                >
                  <option value="">Select DC (Optional)</option>
                  {challans.map((challan) => (
                    <option key={challan.id} value={challan.id}>
                      {challan.challan_number} - {new Date(challan.challan_date).toLocaleDateString('en-GB')} - {challan.customers?.company_name || 'No Customer'}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-green-700">
                  This expense will be EXPENSED to P&L (not capitalized)
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={formData.expense_date}
                  onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount (Rp) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>
            </div>

            {/* Payment Method Section */}
            <div className="border-2 border-blue-200 rounded-lg p-4 bg-blue-50">
              <h3 className="text-sm font-semibold text-blue-900 mb-3">Payment Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Payment Method <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.payment_method}
                    onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    required
                  >
                    <option value="bank_transfer">🏦 Bank Transfer</option>
                    <option value="check">📝 Check</option>
                    <option value="giro">📋 Giro</option>
                    <option value="other">📌 Other</option>
                  </select>
                  <p className="text-xs text-gray-600 mt-1">
                    ✓ Will appear in Bank Reconciliation
                  </p>
                  <p className="text-xs text-blue-600 mt-1">
                    💡 For cash expenses, use Petty Cash Manager
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Bank Account <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.bank_account_id}
                    onChange={(e) => {
                      setFormData({ ...formData, bank_account_id: e.target.value });
                      if (e.target.value) {
                        loadUnlinkedBankTransactions(e.target.value, editingExpense?.id);
                      } else {
                        setUnlinkedBankTransactions([]);
                      }
                      setSelectedBankTransactionId('');
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    required
                  >
                    <option value="">Select Bank Account</option>
                    {bankAccounts.map((bank) => (
                      <option key={bank.id} value={bank.id}>
                        {bank.bank_name} - {bank.alias || bank.account_number}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Link to Bank Transaction
                  </label>
                  {formData.bank_account_id && unlinkedBankTransactions.length > 0 ? (
                    <>
                      <select
                        value={selectedBankTransactionId}
                        onChange={(e) => setSelectedBankTransactionId(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      >
                        <option value="">Choose a transaction...</option>
                        {unlinkedBankTransactions.map((txn) => {
                          // Format date as DD/MM/YY
                          const date = new Date(txn.transaction_date);
                          const dd = String(date.getDate()).padStart(2, '0');
                          const mm = String(date.getMonth() + 1).padStart(2, '0');
                          const yy = String(date.getFullYear()).slice(-2);
                          const formattedDate = `${dd}/${mm}/${yy}`;

                          return (
                            <option key={txn.id} value={txn.id}>
                              {formattedDate} - {txn.description?.substring(0, 50) || 'No description'} - Rp {txn.debit_amount?.toLocaleString()}
                            </option>
                          );
                        })}
                      </select>
                      <p className="text-xs text-gray-600 mt-1">
                        {unlinkedBankTransactions.length} unreconciled transaction{unlinkedBankTransactions.length !== 1 ? 's' : ''}
                      </p>
                    </>
                  ) : formData.bank_account_id ? (
                    <div className="text-sm text-gray-500 italic py-2 px-3 bg-gray-50 rounded-lg border border-gray-200">
                      No unreconciled transactions
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={formData.payment_reference}
                      onChange={(e) => setFormData({ ...formData, payment_reference: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="Enter reference number"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Linked Bank Statement Section */}
            {editingExpense && editingExpense.bank_statement_lines && editingExpense.bank_statement_lines.length > 0 && (
              <div className="p-4 bg-green-50 border border-green-300 rounded-lg">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-green-600" />
                    <h4 className="font-semibold text-green-900">Linked Bank Transaction</h4>
                  </div>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => handleUnlinkFromBankStatement(editingExpense.id)}
                      className="text-sm text-red-600 hover:text-red-700 font-medium"
                    >
                      Unlink
                    </button>
                  )}
                </div>
                {editingExpense.bank_statement_lines.map((line) => (
                  <div key={line.id} className="space-y-2 text-sm bg-white p-3 rounded border border-green-200">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Bank:</span>
                      <span className="font-medium text-gray-900">
                        {line.bank_accounts?.alias || line.bank_accounts?.bank_name} - {line.bank_accounts?.account_number}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Transaction Date:</span>
                      <span className="font-medium text-gray-900">
                        {new Date(line.transaction_date).toLocaleDateString('id-ID')}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Amount:</span>
                      <span className="font-medium text-gray-900">
                        Rp {(line.debit_amount || line.credit_amount || 0).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    {line.description && (
                      <div className="pt-2 border-t border-green-200">
                        <div className="text-gray-600 mb-1">Bank Description:</div>
                        <div className="text-gray-900 font-medium">{line.description}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>

            <div className="border-t pt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <FileText className="w-4 h-4 inline mr-1" />
                Supporting Documents (Invoices, Receipts, Bills)
              </label>

              {/* Existing documents */}
              {formData.document_urls.length > 0 && (
                <div className="mb-3 space-y-2">
                  <p className="text-xs text-gray-600 font-medium">Uploaded Documents:</p>
                  {formData.document_urls.map((url, index) => (
                    <div key={index} className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded">
                      <FileText className="w-4 h-4 text-green-600 flex-shrink-0" />
                      <button
                        type="button"
                        onClick={() => openDocument(url)}
                        className="flex-1 text-sm text-green-700 hover:text-green-900 truncate text-left"
                      >
                        Document {index + 1}
                      </button>
                      <button
                        type="button"
                        onClick={() => openDocument(url)}
                        className="p-1 text-green-600 hover:bg-green-100 rounded"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveDocument(url)}
                        className="p-1 text-red-600 hover:bg-red-100 rounded"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Files being uploaded */}
              {uploadingFiles.length > 0 && (
                <div className="mb-3 space-y-2">
                  <p className="text-xs text-gray-600 font-medium">Files to Upload:</p>
                  {uploadingFiles.map((file, index) => (
                    <div key={index} className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded">
                      <Upload className="w-4 h-4 text-blue-600 flex-shrink-0" />
                      <span className="flex-1 text-sm text-blue-700 truncate">{file.name}</span>
                      <span className="text-xs text-blue-600">{(file.size / 1024).toFixed(1)} KB</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveUploadingFile(index)}
                        className="p-1 text-red-600 hover:bg-red-100 rounded"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Simple file input */}
              <div
                className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-gray-400 transition-colors"
                onMouseEnter={() => setShowPasteHint(true)}
                onMouseLeave={() => setShowPasteHint(false)}
              >
                <input
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                  onChange={(e) => {
                    const files = e.target.files;
                    if (files && files.length > 0) {
                      setUploadingFiles([...uploadingFiles, ...Array.from(files)]);
                    }
                  }}
                  className="hidden"
                  id="expense-file-upload"
                />
                <label
                  htmlFor="expense-file-upload"
                  className="cursor-pointer flex flex-col items-center"
                >
                  <Upload className="w-8 h-8 text-gray-400 mb-2" />
                  <span className="text-sm text-blue-600 font-medium">Click to upload files</span>
                  <span className="text-xs text-gray-500 mt-1">
                    PDF, images, or documents (max 10MB each)
                  </span>
                </label>

                {showPasteHint && (
                  <div className="flex items-center justify-center gap-2 text-xs text-green-600 font-medium animate-pulse mt-2">
                    <Clipboard className="w-4 h-4" />
                    <span>Press Ctrl+V to paste images from clipboard</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  resetForm();
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                {editingExpense ? 'Update' : 'Record'} Expense
              </button>
            </div>
          </form>
        </Modal>
      )}

      {viewModalOpen && viewingExpense && (
        <Modal
          isOpen={viewModalOpen}
          onClose={() => {
            setViewModalOpen(false);
            setViewingExpense(null);
            setLinkedDCQuickView(null);
          }}
          title="Expense Details"
          maxWidth="max-w-3xl"
        >
          <div className="space-y-6">
            {/* Basic Information */}
            <div className="grid grid-cols-2 gap-6 pb-4 border-b">
              <div>
                <label className="text-xs text-gray-500 font-medium uppercase">Date</label>
                <p className="text-sm text-gray-900 mt-1 font-medium">
                  {new Date(viewingExpense.expense_date).toLocaleDateString()}
                </p>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium uppercase">Amount</label>
                <p className="text-lg text-gray-900 mt-1 font-bold">
                  Rp {viewingExpense.amount.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium uppercase">Category</label>
                <p className="text-sm text-gray-900 mt-1">
                  {expenseCategories.find(c => c.value === viewingExpense.expense_category)?.label || viewingExpense.expense_category}
                </p>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium uppercase">Type</label>
                <p className="text-sm text-gray-900 mt-1 capitalize">
                  {viewingExpense.expense_type || '-'}
                </p>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="text-xs text-gray-500 font-medium uppercase">Description</label>
              <p className="text-sm text-gray-900 mt-1">
                {viewingExpense.description || '-'}
              </p>
            </div>

            {/* Payment Information */}
            <div className="grid grid-cols-2 gap-6 pb-4 border-b">
              <div>
                <label className="text-xs text-gray-500 font-medium uppercase">Payment Method</label>
                <p className="text-sm text-gray-900 mt-1 capitalize">
                  {viewingExpense.payment_method?.replace('_', ' ') || '-'}
                </p>
              </div>
              {viewingExpense.bank_accounts && (
                <div>
                  <label className="text-xs text-gray-500 font-medium uppercase">Bank Account</label>
                  <p className="text-sm text-gray-900 mt-1">
                    {viewingExpense.bank_accounts.alias || viewingExpense.bank_accounts.bank_name} - {viewingExpense.bank_accounts.account_number}
                  </p>
                </div>
              )}
              {viewingExpense.payment_reference && (
                <div>
                  <label className="text-xs text-gray-500 font-medium uppercase">Payment Reference</label>
                  <p className="text-sm text-gray-900 mt-1">
                    {viewingExpense.payment_reference}
                  </p>
                </div>
              )}
            </div>

            {/* Context Links */}
            {(viewingExpense.batches || viewingExpense.import_containers || viewingExpense.delivery_challans) && (
              <div className="space-y-3 pb-4 border-b">
                <label className="text-xs text-gray-500 font-medium uppercase">Linked To</label>
                {viewingExpense.batches && (
                  <div className="flex items-center gap-2 text-sm">
                    <Package className="w-4 h-4 text-blue-600" />
                    <span className="text-blue-700 font-medium">Batch: {viewingExpense.batches.batch_number}</span>
                  </div>
                )}
                {viewingExpense.import_containers && (
                  <div className="flex items-center gap-2 text-sm">
                    <Package className="w-4 h-4 text-green-600" />
                    <span className="text-green-700 font-medium">Container: {viewingExpense.import_containers.container_ref}</span>
                  </div>
                )}
                {viewingExpense.delivery_challans && (
                  <div className="flex items-center gap-2 text-sm">
                    <Truck className="w-4 h-4 text-green-600" />
                    <button
                      type="button"
                      onClick={openLinkedDCQuickView}
                      disabled={linkedDCQuickViewLoading}
                      className="text-green-700 font-medium hover:text-green-800 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Delivery Challan: {viewingExpense.delivery_challans.challan_number}
                      {linkedDCQuickViewLoading ? ' (opening...)' : ''}
                    </button>
                  </div>
                )}
              </div>
            )}

            {linkedDCQuickView && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
                <div className="w-full max-w-2xl max-h-[80vh] overflow-hidden rounded-lg bg-white shadow-2xl">
                  <div className="flex items-center justify-between border-b px-4 py-3">
                    <h4 className="text-base font-semibold text-gray-900">
                      Delivery Challan {linkedDCQuickView.challan.challan_number}
                    </h4>
                    <button
                      type="button"
                      onClick={() => setLinkedDCQuickView(null)}
                      className="rounded p-1 text-gray-500 hover:bg-gray-100"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="space-y-4 overflow-y-auto p-4 text-sm">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs text-gray-500 uppercase font-medium">Date</div>
                        <div className="font-medium">{new Date(linkedDCQuickView.challan.challan_date).toLocaleDateString('id-ID')}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 uppercase font-medium">Customer</div>
                        <div className="font-medium">{linkedDCQuickView.challan.customers?.company_name || '-'}</div>
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-gray-500 uppercase font-medium mb-2">Items</div>
                      {linkedDCQuickView.items.length === 0 ? (
                        <div className="text-gray-500">No items found for this DC.</div>
                      ) : (
                        <div className="overflow-x-auto border rounded">
                          <table className="min-w-full text-sm">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600">Product</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600">Batch</th>
                                <th className="px-3 py-2 text-right font-semibold text-gray-600">Qty</th>
                              </tr>
                            </thead>
                            <tbody>
                              {linkedDCQuickView.items.map((item) => (
                                <tr key={item.id} className="border-t">
                                  <td className="px-3 py-2">{item.products?.product_name || '-'}</td>
                                  <td className="px-3 py-2">{item.batches?.batch_number || '-'}</td>
                                  <td className="px-3 py-2 text-right">{Number(item.quantity || 0).toLocaleString('id-ID')}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">Press Esc to close.</div>
                  </div>
                </div>
              </div>
            )}

            {/* Bank Reconciliation Status - Enhanced Details */}
            {viewingExpense.bank_statement_lines && viewingExpense.bank_statement_lines.length > 0 && (
              <div className="pb-4 border-b">
                <label className="text-xs text-gray-500 font-medium uppercase mb-3 block">
                  <FileText className="w-4 h-4 inline mr-1" />
                  Bank Reconciliation
                </label>
                <div className="space-y-3">
                  {viewingExpense.bank_statement_lines.map((line) => (
                    <div key={line.id} className="p-4 bg-green-50 border border-green-300 rounded-lg">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold text-green-700 bg-green-200 rounded">
                          ✓ LINKED TO BANK
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <div className="text-xs text-gray-600 font-medium mb-1">Bank Account</div>
                          <div className="text-gray-900 font-semibold">
                            {line.bank_accounts?.alias || line.bank_accounts?.bank_name}
                          </div>
                          <div className="text-xs text-gray-600">{line.bank_accounts?.account_number}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-600 font-medium mb-1">Transaction Date</div>
                          <div className="text-gray-900 font-semibold">
                            {new Date(line.transaction_date).toLocaleDateString('id-ID')}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-600 font-medium mb-1">Bank Transaction Amount</div>
                          <div className="text-lg text-green-700 font-bold">
                            Rp {(line.debit_amount || line.credit_amount || 0).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-600 font-medium mb-1">Expense Amount</div>
                          <div className="text-lg text-gray-900 font-bold">
                            Rp {viewingExpense.amount.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </div>
                      </div>
                      {line.description && (
                        <div className="mt-3 pt-3 border-t border-green-200">
                          <div className="text-xs text-gray-600 font-medium mb-1">Bank Statement Description</div>
                          <div className="text-sm text-gray-900 font-medium bg-white p-2 rounded border border-green-200">
                            {line.description}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Documents */}
            {viewingExpense.document_urls && viewingExpense.document_urls.length > 0 && (
              <div>
                <label className="text-xs text-gray-500 font-medium uppercase mb-3 block">
                  <FileText className="w-4 h-4 inline mr-1" />
                  Supporting Documents ({viewingExpense.document_urls.length})
                </label>
                <div className="grid grid-cols-1 gap-3">
                  {viewingExpense.document_urls.map((url, index) => {
                    const isImage = /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(url);
                    return (
                      <div key={index} className="p-3 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <FileText className="w-5 h-5 text-blue-600 flex-shrink-0" />
                            <span className="text-sm text-blue-900 font-medium">Document {index + 1}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openDocument(url)}
                              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-700 bg-white border border-blue-300 rounded hover:bg-blue-50"
                            >
                              <ExternalLink className="w-3 h-3" />
                              View
                            </button>
                            <button
                              type="button"
                              onClick={() => downloadDocument(url, `Document ${index + 1}`)}
                              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-green-700 bg-white border border-green-300 rounded hover:bg-green-50"
                            >
                              <Download className="w-3 h-3" />
                              Download
                            </button>
                          </div>
                        </div>
                        {isImage && (
                          <div className="mt-2">
                            <img
                              src={signedUrlCache[url] || url}
                              alt={`Document ${index + 1}`}
                              className="w-full max-w-md rounded-lg border-2 border-gray-300 hover:border-blue-400 cursor-pointer shadow-sm hover:shadow-md transition-all"
                              style={{ maxHeight: '300px', objectFit: 'contain' }}
                              onClick={() => openDocument(url)}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {(!viewingExpense.document_urls || viewingExpense.document_urls.length === 0) && (
              <div className="text-center py-4 text-gray-500 text-sm italic">
                No supporting documents attached
              </div>
            )}

            {/* Close Button */}
            <div className="flex justify-end pt-4 border-t">
              <button
                onClick={() => {
                  setViewModalOpen(false);
                  setViewingExpense(null);
                }}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Rejection reason modal */}
      {rejectionModalOpen && (
        <Modal isOpen={rejectionModalOpen} onClose={() => { setRejectionModalOpen(false); setRejectionReason(''); }} title="Reject Expense" maxWidth="max-w-md">
          <div className="space-y-4">
            <p className="text-sm text-gray-600">Please provide a reason for rejecting this expense entry.</p>
            <textarea
              value={rejectionReason}
              onChange={e => setRejectionReason(e.target.value)}
              rows={3}
              placeholder="Reason for rejection..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setRejectionModalOpen(false); setRejectionReason(''); }} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button
                onClick={handleRejectExpenseConfirm}
                disabled={!rejectionReason.trim() || !!approvalLoading}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
