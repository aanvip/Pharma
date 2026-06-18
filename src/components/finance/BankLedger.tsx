import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { BookOpen, Download, RefreshCw } from 'lucide-react';
import { Modal } from '../Modal';
import { useFinance } from '../../contexts/FinanceContext';

interface BankAccount {
  id: string;
  bank_name: string;
  account_number: string;
  currency: string;
  opening_balance: number;
  opening_balance_date: string;
}

interface LedgerEntry {
  id: string;
  entry_date: string;
  particulars: string;
  reference: string;
  canonical_reference?: string;
  debit: number;
  credit: number;
  running_balance: number;
}

interface BankLedgerProps {
  selectedBank?: string;
}

export default function BankLedger({ selectedBank: propSelectedBank }: BankLedgerProps) {
  const { dateRange: globalDateRange } = useFinance();

  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [selectedBank, setSelectedBank] = useState<string>('');
  const [ledgerEntries, setLedgerEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<any | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [expenseDocuments, setExpenseDocuments] = useState<string[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [showOpeningBalanceModal, setShowOpeningBalanceModal] = useState(false);
  const [openingBalanceForm, setOpeningBalanceForm] = useState({
    balance: 0,
    date: '2025-01-01'
  });

  useEffect(() => {
    loadBanks();
  }, []);

  useEffect(() => {
    if (propSelectedBank) {
      setSelectedBank(propSelectedBank);
    }
  }, [propSelectedBank]);

  useEffect(() => {
    if (selectedBank) {
      loadLedgerEntries();
    }
  }, [selectedBank, globalDateRange.startDate, globalDateRange.endDate]);

  useEffect(() => {
    if (showDetailModal && selectedEntry && selectedEntry.type === 'expense') {
      loadExpenseDocuments();
    }
  }, [showDetailModal, selectedEntry]);

  const loadExpenseDocuments = async () => {
    if (!selectedEntry || selectedEntry.type !== 'expense') return;

    setLoadingDocs(true);
    try {
      const { data: files } = await supabase.storage
        .from('expense-documents')
        .list(`${selectedEntry.id}/`);

      if (files && files.length > 0) {
        const publicUrls = files.map(file => {
          const { data } = supabase.storage
            .from('expense-documents')
            .getPublicUrl(`${selectedEntry.id}/${file.name}`);
          return data.publicUrl;
        });
        setExpenseDocuments(publicUrls);
      } else {
        setExpenseDocuments([]);
      }
    } catch (err) {
      console.error('Error loading expense documents:', err);
      setExpenseDocuments([]);
    } finally {
      setLoadingDocs(false);
    }
  };

  const loadBanks = async () => {
    const { data } = await supabase
      .from('bank_accounts')
      .select('*')
      .order('bank_name');
    if (data) setBanks(data);
  };

  const loadLedgerEntries = async () => {
    if (!selectedBank) return;

    setLoading(true);
    try {
      const selectedBankData = banks.find(b => b.id === selectedBank);
      const storedOpeningBalance = selectedBankData?.opening_balance || 0;
      const openingBalanceDate = selectedBankData?.opening_balance_date || '2025-01-01';

      // Calculate the effective opening balance for the filtered period
      let effectiveOpeningBalance = storedOpeningBalance;

      // Get all bank statement lines before filter start date (from opening balance date onwards)
      if (globalDateRange.startDate > openingBalanceDate) {
        const { data: priorLines } = await supabase
          .from('bank_statement_lines')
          .select('debit_amount, credit_amount')
          .eq('bank_account_id', selectedBank)
          .gte('transaction_date', openingBalanceDate)
          .lt('transaction_date', globalDateRange.startDate);

        if (priorLines) {
          priorLines.forEach(line => {
            effectiveOpeningBalance += Number(line.credit_amount || 0) - Number(line.debit_amount || 0);
          });
        }
      }

      setOpeningBalance(effectiveOpeningBalance);

      const entries: any[] = [];

      // Calculate next day for inclusive end date filtering
      const endDatePlusOne = new Date(globalDateRange.endDate);
      endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);
      const endDateStr = endDatePlusOne.toISOString().split('T')[0];

      // Get bank statement lines (source of truth for Bank Ledger)
      const { data: bankLines } = await supabase
        .from('bank_statement_lines')
        .select('id, transaction_date, description, reference, debit_amount, credit_amount, matched_expense_id, matched_receipt_id, matched_entry_id, notes')
        .eq('bank_account_id', selectedBank)
        .gte('transaction_date', globalDateRange.startDate)
        .lt('transaction_date', endDateStr)
        .order('transaction_date');

      if (bankLines) {
        bankLines.forEach(line => {
          entries.push({
            id: line.id,
            entry_date: line.transaction_date,
            particulars: line.description || 'Bank Transaction',
            reference: line.reference || '-',
            // canonical_reference: the user-facing voucher number from the
            // linked source module (Expenses / Receipt / Journal) so this
            // page matches what Expenses / Petty Cash / Ledger show.
            canonical_reference: line.reference || '-',
            debit: Number(line.debit_amount || 0),
            credit: Number(line.credit_amount || 0),
            type: 'bank',
            matched_expense_id: line.matched_expense_id || null,
            matched_receipt_id: line.matched_receipt_id || null,
            matched_entry_id: line.matched_entry_id || null,
            linkedId: line.matched_expense_id || line.matched_receipt_id || line.matched_entry_id,
            notes: line.notes
          });
        });
      }

      // Resolve canonical reference (voucher number) for matched entries —
      // single batched lookup per source table so the Ref No column matches
      // what the Expenses / Receipt / Journal pages display.
      const expenseIds = Array.from(new Set(entries.map(e => e.matched_expense_id).filter(Boolean)));
      const receiptIds = Array.from(new Set(entries.map(e => e.matched_receipt_id).filter(Boolean)));
      const entryIds = Array.from(new Set(entries.map(e => e.matched_entry_id).filter(Boolean)));

      const [expMap, recMap, entMap] = await Promise.all([
        expenseIds.length
          ? supabase.from('finance_expenses').select('id, voucher_number').in('id', expenseIds)
              .then(r => Object.fromEntries((r.data || []).map((x: any) => [x.id, x.voucher_number])))
          : Promise.resolve({} as Record<string, string>),
        receiptIds.length
          ? supabase.from('receipt_vouchers').select('id, voucher_number').in('id', receiptIds)
              .then(r => Object.fromEntries((r.data || []).map((x: any) => [x.id, x.voucher_number])))
          : Promise.resolve({} as Record<string, string>),
        entryIds.length
          ? supabase.from('journal_entries').select('id, reference_number, entry_number').in('id', entryIds)
              .then(r => Object.fromEntries((r.data || []).map((x: any) => [x.id, x.reference_number || x.entry_number])))
          : Promise.resolve({} as Record<string, string>),
      ]);

      entries.forEach(e => {
        const resolved =
          (e.matched_expense_id && expMap[e.matched_expense_id]) ||
          (e.matched_receipt_id && recMap[e.matched_receipt_id]) ||
          (e.matched_entry_id && entMap[e.matched_entry_id]);
        if (resolved) e.canonical_reference = resolved;
      });

      // Sort by date
      entries.sort((a, b) => {
        const dateCompare = new Date(a.entry_date).getTime() - new Date(b.entry_date).getTime();
        if (dateCompare !== 0) return dateCompare;
        const aIsCredit = a.credit > 0;
        const bIsCredit = b.credit > 0;
        if (aIsCredit && !bIsCredit) return -1;
        if (!aIsCredit && bIsCredit) return 1;
        return 0;
      });

      let runningBalance = effectiveOpeningBalance;
      const ledger: LedgerEntry[] = entries.map((entry: any) => {
        const debit = entry.debit || 0;
        const credit = entry.credit || 0;
        runningBalance += credit - debit;
        return {
          id: entry.id,
          entry_date: entry.entry_date,
          particulars: entry.particulars,
          reference: entry.reference,
          canonical_reference: entry.canonical_reference,
          debit,
          credit,
          running_balance: runningBalance,
        };
      });

      setLedgerEntries(ledger);
    } catch (err) {
      console.error('Error loading ledger:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateOpeningBalance = async () => {
    if (!selectedBank) return;

    try {
      const { error } = await supabase
        .from('bank_accounts')
        .update({
          opening_balance: openingBalanceForm.balance,
          opening_balance_date: openingBalanceForm.date
        })
        .eq('id', selectedBank);

      if (error) throw error;

      setShowOpeningBalanceModal(false);
      await loadBanks();
      await loadLedgerEntries();
    } catch (err: any) {
      alert('Failed to update opening balance: ' + err.message);
    }
  };

  const openEditOpeningBalance = () => {
    const selectedBankData = banks.find(b => b.id === selectedBank);
    if (selectedBankData) {
      setOpeningBalanceForm({
        balance: selectedBankData.opening_balance,
        date: selectedBankData.opening_balance_date || '2025-01-01'
      });
      setShowOpeningBalanceModal(true);
    }
  };

  const getCurrencySymbol = (currency: string) => {
    const symbols: Record<string, string> = {
      IDR: 'Rp',
      USD: '$',
      EUR: '€',
    };
    return symbols[currency] || currency;
  };

  const formatAmount = (amount: number, currency: string) => {
    if (amount === 0) return '-';
    return `${getCurrencySymbol(currency)} ${amount.toLocaleString('id-ID', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const exportToExcel = () => {
    const selectedBankData = banks.find(b => b.id === selectedBank);
    if (!selectedBankData) return;

    const headers = ['Date', 'Particulars', 'Reference', 'Debit (Dr)', 'Credit (Cr)', 'Balance'];
    const rows = ledgerEntries.map(entry => [
      new Date(entry.entry_date).toLocaleDateString('id-ID'),
      entry.particulars,
      entry.canonical_reference || entry.reference,
      entry.debit > 0 ? formatAmount(entry.debit, selectedBankData.currency) : '',
      entry.credit > 0 ? formatAmount(entry.credit, selectedBankData.currency) : '',
      formatAmount(entry.running_balance, selectedBankData.currency),
    ]);

    const csv = [
      `Bank Ledger - ${selectedBankData.bank_name} (${selectedBankData.account_number})`,
      `Period: ${new Date(globalDateRange.startDate).toLocaleDateString('id-ID')} to ${new Date(globalDateRange.endDate).toLocaleDateString('id-ID')}`,
      `Opening Balance: ${formatAmount(openingBalance, selectedBankData.currency)}`,
      '',
      headers.join(','),
      ...rows.map(row => row.join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `bank_ledger_${selectedBankData.bank_name}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const selectedBankData = banks.find(b => b.id === selectedBank);

  const totalDebit = ledgerEntries.reduce((sum, e) => sum + e.debit, 0);
  const totalCredit = ledgerEntries.reduce((sum, e) => sum + e.credit, 0);
  const closingBalance = openingBalance + totalCredit - totalDebit;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-blue-600" />
          <h2 className="text-xl font-semibold text-gray-800">Bank Ledger (Bank Book)</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadLedgerEntries}
            disabled={!selectedBank || loading}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={exportToExcel}
            disabled={!selectedBank || ledgerEntries.length === 0}
            className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-4">
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Bank Account</label>
          <select
            value={selectedBank}
            onChange={(e) => setSelectedBank(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg max-w-md"
          >
            <option value="">Select Bank Account</option>
            {banks.map(bank => (
              <option key={bank.id} value={bank.id}>
                {bank.bank_name} - {bank.account_number} ({bank.currency})
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">Period is controlled by global date range at top</p>
        </div>

        {selectedBankData && (
          <div className="mb-4 p-3 bg-blue-50 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">Opening Balance (as of {new Date(globalDateRange.startDate).toLocaleDateString('id-ID')})</p>
                <p className="text-lg font-bold text-blue-600">
                  {formatAmount(openingBalance, selectedBankData.currency)}
                </p>
                {globalDateRange.startDate > selectedBankData.opening_balance_date && (
                  <p className="text-xs text-gray-500 mt-1">
                    Adjusted for filtered date range
                  </p>
                )}
              </div>
              <button
                onClick={openEditOpeningBalance}
                className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Update
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedBank && (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Date</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Particulars</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Ref No</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">Debit (Dr)</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">Credit (Cr)</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">Balance</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                <tr className="bg-blue-50 font-semibold">
                  <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">
                    {new Date(globalDateRange.startDate).toLocaleDateString('id-ID')}
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-900" colSpan={2}>
                    Opening Balance
                    {globalDateRange.startDate > (selectedBankData?.opening_balance_date || '') && (
                      <span className="ml-2 text-xs font-normal text-gray-600">(adjusted for date filter)</span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 text-right">-</td>
                  <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 text-right">-</td>
                  <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 text-right font-bold">
                    {selectedBankData && formatAmount(openingBalance, selectedBankData.currency)}
                  </td>
                </tr>

                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-gray-500">Loading entries...</td>
                  </tr>
                ) : ledgerEntries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                      No recorded transactions found for this period
                    </td>
                  </tr>
                ) : (
                  ledgerEntries.map(entry => (
                    <tr
                      key={entry.id}
                      className="hover:bg-blue-50 cursor-pointer transition-colors"
                      onClick={() => {
                        setSelectedEntry(entry);
                        setShowDetailModal(true);
                      }}
                    >
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">
                        {new Date(entry.entry_date).toLocaleDateString('id-ID')}
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-900">
                        {entry.particulars}
                      </td>
                      <td
                        className="px-3 py-2 text-sm text-gray-600 font-mono"
                        title={entry.canonical_reference && entry.canonical_reference !== entry.reference ? `Bank statement ref: ${entry.reference}` : undefined}
                      >
                        {entry.canonical_reference || entry.reference}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-red-600 text-right font-medium">
                        {selectedBankData && (entry.debit > 0 ? formatAmount(entry.debit, selectedBankData.currency) : '-')}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-green-600 text-right font-medium">
                        {selectedBankData && (entry.credit > 0 ? formatAmount(entry.credit, selectedBankData.currency) : '-')}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 text-right font-semibold">
                        {selectedBankData && formatAmount(entry.running_balance, selectedBankData.currency)}
                      </td>
                    </tr>
                  ))
                )}

                {ledgerEntries.length > 0 && (
                  <tr className="bg-gray-100 font-semibold border-t-2 border-gray-300">
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900" colSpan={3}>
                      Closing Balance
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-red-600 text-right font-bold">
                      {selectedBankData && formatAmount(totalDebit, selectedBankData.currency)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-green-600 text-right font-bold">
                      {selectedBankData && formatAmount(totalCredit, selectedBankData.currency)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 text-right font-bold">
                      {selectedBankData && formatAmount(closingBalance, selectedBankData.currency)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showDetailModal && selectedEntry && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowDetailModal(false)}>
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Transaction Details</h3>
              <button onClick={() => setShowDetailModal(false)} className="text-gray-400 hover:text-gray-600">
                <span className="text-2xl">&times;</span>
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Date</p>
                  <p className="font-medium">{new Date(selectedEntry.entry_date).toLocaleDateString('id-ID')}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Reference</p>
                  <p className="font-medium font-mono">{selectedEntry.reference}</p>
                </div>
              </div>

              <div>
                <p className="text-sm text-gray-600">Particulars</p>
                <p className="font-medium">{selectedEntry.particulars}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Debit</p>
                  <p className="font-medium text-red-600">
                    {selectedBankData && (selectedEntry.debit > 0 ? formatAmount(selectedEntry.debit, selectedBankData.currency) : '-')}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Credit</p>
                  <p className="font-medium text-green-600">
                    {selectedBankData && (selectedEntry.credit > 0 ? formatAmount(selectedEntry.credit, selectedBankData.currency) : '-')}
                  </p>
                </div>
              </div>

              {selectedEntry.notes && (
                <div>
                  <p className="text-sm text-gray-600">Notes</p>
                  <p className="font-medium">{selectedEntry.notes}</p>
                </div>
              )}

              {selectedEntry.linkedId && (
                <div className="bg-blue-50 p-3 rounded-lg">
                  <p className="text-sm text-blue-900 font-medium">
                    This transaction is matched to a system entry
                  </p>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button onClick={() => setShowDetailModal(false)} className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <Modal
        isOpen={showOpeningBalanceModal}
        onClose={() => setShowOpeningBalanceModal(false)}
        title="Update Opening Balance"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Opening Balance Amount *
            </label>
            <input
              type="number"
              value={openingBalanceForm.balance}
              onChange={(e) => setOpeningBalanceForm({ ...openingBalanceForm, balance: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
              step="0.01"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Opening Balance Date *
            </label>
            <input
              type="date"
              value={openingBalanceForm.date}
              onChange={(e) => setOpeningBalanceForm({ ...openingBalanceForm, date: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Set the date when this opening balance is effective.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={() => setShowOpeningBalanceModal(false)}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={updateOpeningBalance}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Update
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
