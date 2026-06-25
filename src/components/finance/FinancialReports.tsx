import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Download, RefreshCw } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useFinance } from '../../contexts/FinanceContext';
import { useLanguage } from '../../contexts/LanguageContext';

interface TrialBalanceRow {
  code: string;
  name: string;
  name_id: string | null;
  account_type: string;
  account_group: string | null;
  normal_balance: string;
  total_debit: number;
  total_credit: number;
  balance: number;
}

type ReportType = 'trial_balance' | 'pnl' | 'balance_sheet';

interface FinancialReportsProps {
  initialReport?: ReportType;
}

const fmt = (n: number) =>
  n.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });

// Grouped Balance Sheet rows helper
function groupBy<T>(arr: T[], key: (r: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of arr) {
    const k = key(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(item);
  }
  return map;
}

export function FinancialReports({ initialReport = 'trial_balance' }: FinancialReportsProps) {
  const { dateRange } = useFinance();
  const { t } = useLanguage();
  const [reportType, setReportType] = useState<ReportType>(initialReport);
  const [loading, setLoading] = useState(false);

  // Period data (start→end) — used for Trial Balance and P&L
  const [trialBalance, setTrialBalance] = useState<TrialBalanceRow[]>([]);
  // Cumulative data (inception→end) — used for Balance Sheet
  const [balanceSheetData, setBalanceSheetData] = useState<TrialBalanceRow[]>([]);

  useEffect(() => { setReportType(initialReport); }, [initialReport]);

  useEffect(() => { loadReport(); }, [reportType, dateRange]);

  const loadReport = async () => {
    setLoading(true);
    try {
      // Period trial balance (always load for P&L + TB)
      const { data: tbData } = await supabase.rpc('get_trial_balance', {
        p_start_date: dateRange.startDate,
        p_end_date:   dateRange.endDate,
      });
      setTrialBalance((tbData || []) as TrialBalanceRow[]);

      // Cumulative balance sheet (only when needed)
      if (reportType === 'balance_sheet') {
        const { data: bsData } = await supabase.rpc('get_balance_sheet', {
          p_as_of_date: dateRange.endDate,
        });
        setBalanceSheetData((bsData || []) as TrialBalanceRow[]);
      }
    } catch (err) {
      console.error('Error loading financial report:', err);
    } finally {
      setLoading(false);
    }
  };

  // ── Trial Balance calculations ──────────────────────────────────────────
  // Footer: sum of positive balances (debit column) and abs of negative balances (credit column)
  const tbTotals = useMemo(() => trialBalance.reduce(
    (acc, row) => ({
      debit:  acc.debit  + (row.balance > 0 ? row.balance : 0),
      credit: acc.credit + (row.balance < 0 ? Math.abs(row.balance) : 0),
    }),
    { debit: 0, credit: 0 }
  ), [trialBalance]);

  // ── P&L calculations ────────────────────────────────────────────────────
  const revenueRows  = useMemo(() => trialBalance.filter(r => r.account_type === 'revenue'), [trialBalance]);
  const contraRevRows = useMemo(() => trialBalance.filter(r => r.account_type === 'contra' && r.account_group === 'Revenue'), [trialBalance]);
  const cogsRows     = useMemo(() => trialBalance.filter(r => r.account_type === 'expense' && r.account_group === 'COGS'), [trialBalance]);
  const opexRows     = useMemo(() => trialBalance.filter(r => r.account_type === 'expense' && r.account_group === 'Operating Expenses'), [trialBalance]);
  const otherExpRows = useMemo(() => trialBalance.filter(r => r.account_type === 'expense' && (r.account_group === 'Other Expenses' || (!r.account_group && r.account_type === 'expense'))), [trialBalance]);

  const totalRevenue    = revenueRows.reduce((s, r) => s + Math.abs(r.balance), 0);
  const totalContraRev  = contraRevRows.reduce((s, r) => s + Math.abs(r.balance), 0);
  const netRevenue      = totalRevenue - totalContraRev;
  const totalCOGS       = cogsRows.reduce((s, r) => s + r.balance, 0);
  const grossProfit     = netRevenue - totalCOGS;
  const totalOpex       = opexRows.reduce((s, r) => s + r.balance, 0);
  const operatingIncome = grossProfit - totalOpex;
  const totalOtherExp   = otherExpRows.reduce((s, r) => s + r.balance, 0);
  const netIncome       = operatingIncome - totalOtherExp;

  // ── Balance Sheet calculations (cumulative data) ────────────────────────
  const bsAssetRows     = useMemo(() => balanceSheetData.filter(r => r.account_type === 'asset'), [balanceSheetData]);
  const bsContraAssets  = useMemo(() => balanceSheetData.filter(r => r.account_type === 'contra' && (r.account_group?.includes('Assets') || r.account_group?.includes('Fixed'))), [balanceSheetData]);
  const bsLiabRows      = useMemo(() => balanceSheetData.filter(r => r.account_type === 'liability'), [balanceSheetData]);
  const bsEquityRows    = useMemo(() => balanceSheetData.filter(r => r.account_type === 'equity' || (r.account_type === 'contra' && r.account_group === 'Equity')), [balanceSheetData]);

  const totalAssets     = bsAssetRows.reduce((s, r) => s + r.balance, 0) - bsContraAssets.reduce((s, r) => s + Math.abs(r.balance), 0);
  const totalLiabilities = bsLiabRows.reduce((s, r) => s + Math.abs(r.balance), 0);
  const totalEquity     = bsEquityRows.reduce((s, r) => s + (r.account_type === 'equity' ? Math.abs(r.balance) : -Math.abs(r.balance)), 0);
  const totalLiabEquity = totalLiabilities + totalEquity + netIncome;
  const balanceCheck    = Math.abs(totalAssets - totalLiabEquity);

  // Asset groups for structured Balance Sheet
  const assetGroups = useMemo(() => groupBy(bsAssetRows, r => r.account_group || 'Other Assets'), [bsAssetRows]);
  const liabGroups  = useMemo(() => groupBy(bsLiabRows, r => r.account_group || 'Other Liabilities'), [bsLiabRows]);

  // ── Export helpers ──────────────────────────────────────────────────────
  const exportTrialBalance = () => {
    const rows = trialBalance.map(r => ({
      'Code':         r.code,
      'Account Name': r.name,
      'Type':         r.account_type,
      'Debit':        r.balance > 0 ? r.balance : '',
      'Credit':       r.balance < 0 ? Math.abs(r.balance) : '',
    }));
    rows.push({
      'Code': '', 'Account Name': 'TOTAL', 'Type': '',
      'Debit': tbTotals.debit, 'Credit': tbTotals.credit,
    } as any);
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Trial Balance');
    XLSX.writeFile(wb, `Trial_Balance_${dateRange.endDate}.xlsx`);
  };

  const exportPnL = () => {
    const rows: Record<string, string | number>[] = [];
    const addSection = (label: string, items: TrialBalanceRow[], getAmt: (r: TrialBalanceRow) => number) => {
      rows.push({ Section: label, Code: '', Account: '', Amount: '' });
      items.forEach(r => rows.push({ Section: '', Code: r.code, Account: r.name, Amount: getAmt(r) }));
    };
    addSection('Revenue', revenueRows, r => Math.abs(r.balance));
    if (contraRevRows.length) addSection('Less: Sales Deductions', contraRevRows, r => -Math.abs(r.balance));
    rows.push({ Section: 'NET REVENUE', Code: '', Account: '', Amount: netRevenue });
    addSection('Cost of Goods Sold', cogsRows, r => r.balance);
    rows.push({ Section: 'GROSS PROFIT', Code: '', Account: '', Amount: grossProfit });
    addSection('Operating Expenses', opexRows, r => r.balance);
    rows.push({ Section: 'OPERATING INCOME', Code: '', Account: '', Amount: operatingIncome });
    if (otherExpRows.length) addSection('Other Expenses', otherExpRows, r => r.balance);
    rows.push({ Section: 'NET INCOME', Code: '', Account: '', Amount: netIncome });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'P&L');
    XLSX.writeFile(wb, `PnL_${dateRange.startDate}_${dateRange.endDate}.xlsx`);
  };

  const exportBalanceSheet = () => {
    const rows: Record<string, string | number>[] = [];
    const addGroup = (label: string, items: TrialBalanceRow[], getAmt: (r: TrialBalanceRow) => number) => {
      rows.push({ Section: label, Code: '', Account: '', Amount: '' });
      items.forEach(r => rows.push({ Section: '', Code: r.code, Account: r.name, Amount: getAmt(r) }));
    };
    rows.push({ Section: 'ASSETS', Code: '', Account: '', Amount: '' });
    assetGroups.forEach((items, group) => addGroup(group, items, r => r.balance));
    if (bsContraAssets.length) addGroup('Contra Assets', bsContraAssets, r => -Math.abs(r.balance));
    rows.push({ Section: 'TOTAL ASSETS', Code: '', Account: '', Amount: totalAssets });
    rows.push({ Section: 'LIABILITIES', Code: '', Account: '', Amount: '' });
    liabGroups.forEach((items, group) => addGroup(group, items, r => Math.abs(r.balance)));
    rows.push({ Section: 'TOTAL LIABILITIES', Code: '', Account: '', Amount: totalLiabilities });
    rows.push({ Section: 'EQUITY', Code: '', Account: '', Amount: '' });
    bsEquityRows.forEach(r => rows.push({ Section: '', Code: r.code, Account: r.name, Amount: r.account_type === 'equity' ? Math.abs(r.balance) : -Math.abs(r.balance) }));
    rows.push({ Section: '', Code: '', Account: 'Current Period Earnings', Amount: netIncome });
    rows.push({ Section: 'TOTAL EQUITY', Code: '', Account: '', Amount: totalEquity + netIncome });
    rows.push({ Section: 'TOTAL LIABILITIES + EQUITY', Code: '', Account: '', Amount: totalLiabEquity });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Balance Sheet');
    XLSX.writeFile(wb, `BalanceSheet_${dateRange.endDate}.xlsx`);
  };

  const SubtotalRow = ({ label, amount, color = 'gray' }: { label: string; amount: number; color?: string }) => (
    <tr className={`font-semibold border-t ${color === 'green' ? 'bg-green-50' : color === 'red' ? 'bg-red-50' : 'bg-gray-50'}`}>
      <td colSpan={2} className="py-1.5 px-1 text-xs">{label}</td>
      <td className={`py-1.5 text-right text-xs font-bold ${amount >= 0 ? 'text-gray-800' : 'text-red-700'}`}>
        Rp {fmt(amount)}
      </td>
    </tr>
  );

  return (
    <div>
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : (
        <>
          {/* ═══════════════════════════════════════════
              TRIAL BALANCE
          ═══════════════════════════════════════════ */}
          {reportType === 'trial_balance' && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-base">Trial Balance — {fmtDate(dateRange.startDate)} to {fmtDate(dateRange.endDate)}</h3>
                  <p className="text-xs text-gray-500 italic">Neraca Saldo periode {fmtDate(dateRange.startDate)} s/d {fmtDate(dateRange.endDate)}</p>
                </div>
                <button onClick={exportTrialBalance}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50">
                  <Download className="w-3.5 h-3.5" /> Excel
                </button>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase w-20">Code</th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Account Name</th>
                    <th className="px-3 py-2 text-right text-[10px] font-semibold text-blue-600 uppercase w-36">Debit</th>
                    <th className="px-3 py-2 text-right text-[10px] font-semibold text-green-600 uppercase w-36">Credit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {trialBalance.map(row => (
                    <tr key={row.code} className="hover:bg-gray-50">
                      <td className="px-3 py-1.5 font-mono text-xs text-gray-500">{row.code}</td>
                      <td className="px-3 py-1.5 text-xs">
                        <div className="font-medium">{row.name}</div>
                        {row.name_id && <div className="text-[10px] text-gray-400">{row.name_id}</div>}
                      </td>
                      <td className="px-3 py-1.5 text-right text-xs text-blue-700 tabular-nums">
                        {row.balance > 0 ? `Rp ${fmt(row.balance)}` : ''}
                      </td>
                      <td className="px-3 py-1.5 text-right text-xs text-green-700 tabular-nums">
                        {row.balance < 0 ? `Rp ${fmt(Math.abs(row.balance))}` : ''}
                      </td>
                    </tr>
                  ))}
                  {trialBalance.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-8 text-center text-sm text-gray-400">
                        No transactions in selected period
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot className="bg-blue-900 text-white font-bold">
                  <tr>
                    <td colSpan={2} className="px-3 py-2 text-right text-xs uppercase tracking-wide">Total</td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums">Rp {fmt(tbTotals.debit)}</td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums">Rp {fmt(tbTotals.credit)}</td>
                  </tr>
                  {Math.abs(tbTotals.debit - tbTotals.credit) > 0.02 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-1 text-center text-[10px] bg-red-700">
                        ⚠ Out of balance by Rp {fmt(Math.abs(tbTotals.debit - tbTotals.credit))}
                      </td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          )}

          {/* ═══════════════════════════════════════════
              PROFIT & LOSS
          ═══════════════════════════════════════════ */}
          {reportType === 'pnl' && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-base">Profit & Loss — {fmtDate(dateRange.startDate)} to {fmtDate(dateRange.endDate)}</h3>
                  <p className="text-xs text-gray-500 italic">Laporan Laba Rugi {fmtDate(dateRange.startDate)} s/d {fmtDate(dateRange.endDate)}</p>
                </div>
                <button onClick={exportPnL}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50">
                  <Download className="w-3.5 h-3.5" /> Excel
                </button>
              </div>

              <div className="p-4 max-w-2xl">

                {/* REVENUE */}
                <div className="mb-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-green-700 mb-1">Revenue (Pendapatan)</p>
                  <table className="w-full">
                    <tbody>
                      {revenueRows.map(row => (
                        <tr key={row.code} className="hover:bg-gray-50">
                          <td className="py-0.5 font-mono text-[10px] text-gray-400 w-16">{row.code}</td>
                          <td className="py-0.5 text-xs pl-1">{row.name}</td>
                          <td className="py-0.5 text-right text-xs tabular-nums text-gray-800">Rp {fmt(Math.abs(row.balance))}</td>
                        </tr>
                      ))}
                      {contraRevRows.map(row => (
                        <tr key={row.code} className="text-gray-500 hover:bg-gray-50">
                          <td className="py-0.5 font-mono text-[10px] w-16">{row.code}</td>
                          <td className="py-0.5 text-xs pl-1">Less: {row.name}</td>
                          <td className="py-0.5 text-right text-xs tabular-nums text-red-500">({fmt(Math.abs(row.balance))})</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-300 font-semibold bg-green-50">
                        <td colSpan={2} className="py-1.5 text-xs pl-1">Net Revenue</td>
                        <td className="py-1.5 text-right text-xs font-bold text-green-700 tabular-nums">Rp {fmt(netRevenue)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* COGS */}
                {cogsRows.length > 0 && (
                  <div className="mb-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-orange-700 mb-1">Cost of Goods Sold (HPP)</p>
                    <table className="w-full">
                      <tbody>
                        {cogsRows.map(row => (
                          <tr key={row.code} className="hover:bg-gray-50">
                            <td className="py-0.5 font-mono text-[10px] text-gray-400 w-16">{row.code}</td>
                            <td className="py-0.5 text-xs pl-1">{row.name}</td>
                            <td className="py-0.5 text-right text-xs tabular-nums text-gray-800">Rp {fmt(row.balance)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-gray-300 font-semibold bg-orange-50">
                          <td colSpan={2} className="py-1.5 text-xs pl-1">Total COGS</td>
                          <td className="py-1.5 text-right text-xs font-bold text-orange-700 tabular-nums">Rp {fmt(totalCOGS)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}

                {/* GROSS PROFIT */}
                <div className={`px-3 py-2 rounded mb-3 ${grossProfit >= 0 ? 'bg-blue-50 border border-blue-200' : 'bg-red-50 border border-red-200'}`}>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-gray-800">Gross Profit (Laba Kotor)</span>
                    <span className={`text-sm font-bold tabular-nums ${grossProfit >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
                      Rp {fmt(grossProfit)}
                    </span>
                  </div>
                  {netRevenue > 0 && (
                    <div className="text-[10px] text-gray-500 mt-0.5">
                      Gross margin: {((grossProfit / netRevenue) * 100).toFixed(1)}%
                    </div>
                  )}
                </div>

                {/* OPERATING EXPENSES */}
                {opexRows.length > 0 && (
                  <div className="mb-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-red-700 mb-1">Operating Expenses (Beban Operasional)</p>
                    <table className="w-full">
                      <tbody>
                        {opexRows.map(row => (
                          <tr key={row.code} className="hover:bg-gray-50">
                            <td className="py-0.5 font-mono text-[10px] text-gray-400 w-16">{row.code}</td>
                            <td className="py-0.5 text-xs pl-1">{row.name}</td>
                            <td className="py-0.5 text-right text-xs tabular-nums text-gray-800">Rp {fmt(row.balance)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-gray-300 font-semibold bg-red-50">
                          <td colSpan={2} className="py-1.5 text-xs pl-1">Total Operating Expenses</td>
                          <td className="py-1.5 text-right text-xs font-bold text-red-700 tabular-nums">Rp {fmt(totalOpex)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}

                {/* OPERATING INCOME */}
                <div className={`px-3 py-2 rounded mb-3 border ${operatingIncome >= 0 ? 'bg-indigo-50 border-indigo-200' : 'bg-red-50 border-red-200'}`}>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-gray-800">Operating Income (Laba Usaha)</span>
                    <span className={`text-sm font-bold tabular-nums ${operatingIncome >= 0 ? 'text-indigo-700' : 'text-red-700'}`}>
                      Rp {fmt(operatingIncome)}
                    </span>
                  </div>
                </div>

                {/* OTHER EXPENSES */}
                {otherExpRows.length > 0 && (
                  <div className="mb-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600 mb-1">Other Expenses (Beban Lain-lain)</p>
                    <table className="w-full">
                      <tbody>
                        {otherExpRows.map(row => (
                          <tr key={row.code} className="hover:bg-gray-50">
                            <td className="py-0.5 font-mono text-[10px] text-gray-400 w-16">{row.code}</td>
                            <td className="py-0.5 text-xs pl-1">{row.name}</td>
                            <td className="py-0.5 text-right text-xs tabular-nums text-gray-800">Rp {fmt(row.balance)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* NET INCOME */}
                <div className={`px-4 py-3 rounded-lg ${netIncome >= 0 ? 'bg-green-100 border border-green-300' : 'bg-red-100 border border-red-300'}`}>
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="font-bold text-sm text-gray-900">Net Income (Laba Bersih)</span>
                      <span className="text-[10px] text-gray-500 ml-1.5 italic">Provisional</span>
                    </div>
                    <span className={`font-bold text-base tabular-nums ${netIncome >= 0 ? 'text-green-800' : 'text-red-800'}`}>
                      Rp {fmt(netIncome)}
                    </span>
                  </div>
                  {netRevenue > 0 && (
                    <div className="text-[10px] text-gray-500 mt-0.5 text-right">
                      Net margin: {((netIncome / netRevenue) * 100).toFixed(1)}%
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════
              BALANCE SHEET
          ═══════════════════════════════════════════ */}
          {reportType === 'balance_sheet' && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-base">Balance Sheet — As of {fmtDate(dateRange.endDate)}</h3>
                  <p className="text-xs text-gray-500 italic">Neraca per {fmtDate(dateRange.endDate)} (kumulatif)</p>
                </div>
                <button onClick={exportBalanceSheet}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50">
                  <Download className="w-3.5 h-3.5" /> Excel
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-gray-200">

                {/* ── ASSETS ── */}
                <div className="p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-blue-700 mb-2">Assets (Aset)</p>

                  {Array.from(assetGroups.entries()).map(([group, rows]) => {
                    const subtotal = rows.reduce((s, r) => s + r.balance, 0);
                    return (
                      <div key={group} className="mb-3">
                        <p className="text-[10px] font-semibold text-gray-500 uppercase mb-0.5">{group}</p>
                        <table className="w-full">
                          <tbody>
                            {rows.map(row => (
                              <tr key={row.code} className="hover:bg-gray-50">
                                <td className="py-0.5 font-mono text-[10px] text-gray-400 w-16">{row.code}</td>
                                <td className="py-0.5 text-xs pl-1">{row.name}</td>
                                <td className="py-0.5 text-right text-xs tabular-nums text-blue-700">Rp {fmt(row.balance)}</td>
                              </tr>
                            ))}
                            {/* Contra accounts that belong to this group */}
                            {bsContraAssets.filter(r => r.account_group?.includes(group.includes('Fixed') ? 'Fixed' : group.includes('Current') ? 'Current' : '') || group === 'Fixed Assets').map(row => (
                              <tr key={row.code} className="text-gray-400 hover:bg-gray-50">
                                <td className="py-0.5 font-mono text-[10px] w-16">{row.code}</td>
                                <td className="py-0.5 text-xs pl-1 italic">Less: {row.name}</td>
                                <td className="py-0.5 text-right text-xs tabular-nums">({fmt(Math.abs(row.balance))})</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t border-gray-200 bg-blue-50">
                              <td colSpan={2} className="py-1 text-[10px] font-semibold pl-1">Total {group}</td>
                              <td className="py-1 text-right text-[10px] font-bold text-blue-700 tabular-nums">Rp {fmt(subtotal)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    );
                  })}

                  <div className="mt-3 pt-2 border-t-2 border-blue-300 bg-blue-50 px-2 py-2 rounded">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-blue-900">TOTAL ASSETS (Total Aset)</span>
                      <span className="text-sm font-bold text-blue-900 tabular-nums">Rp {fmt(totalAssets)}</span>
                    </div>
                  </div>
                </div>

                {/* ── LIABILITIES + EQUITY ── */}
                <div className="p-4">

                  {/* Liabilities */}
                  <p className="text-[10px] font-bold uppercase tracking-widest text-red-700 mb-2">Liabilities (Kewajiban)</p>

                  {Array.from(liabGroups.entries()).map(([group, rows]) => {
                    const subtotal = rows.reduce((s, r) => s + Math.abs(r.balance), 0);
                    return (
                      <div key={group} className="mb-3">
                        <p className="text-[10px] font-semibold text-gray-500 uppercase mb-0.5">{group}</p>
                        <table className="w-full">
                          <tbody>
                            {rows.map(row => (
                              <tr key={row.code} className="hover:bg-gray-50">
                                <td className="py-0.5 font-mono text-[10px] text-gray-400 w-16">{row.code}</td>
                                <td className="py-0.5 text-xs pl-1">{row.name}</td>
                                <td className="py-0.5 text-right text-xs tabular-nums text-red-700">Rp {fmt(Math.abs(row.balance))}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t border-gray-200 bg-red-50">
                              <td colSpan={2} className="py-1 text-[10px] font-semibold pl-1">Total {group}</td>
                              <td className="py-1 text-right text-[10px] font-bold text-red-700 tabular-nums">Rp {fmt(subtotal)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    );
                  })}

                  <div className="pt-2 border-t border-red-200 bg-red-50 px-2 py-1 rounded mb-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-red-900">Total Liabilities</span>
                      <span className="text-xs font-bold text-red-900 tabular-nums">Rp {fmt(totalLiabilities)}</span>
                    </div>
                  </div>

                  {/* Equity */}
                  <p className="text-[10px] font-bold uppercase tracking-widest text-purple-700 mb-2">Equity (Modal)</p>
                  <table className="w-full mb-2">
                    <tbody>
                      {bsEquityRows.map(row => {
                        const displayAmt = row.account_type === 'equity'
                          ? Math.abs(row.balance)
                          : -Math.abs(row.balance);
                        return (
                          <tr key={row.code} className="hover:bg-gray-50">
                            <td className="py-0.5 font-mono text-[10px] text-gray-400 w-16">{row.code}</td>
                            <td className="py-0.5 text-xs pl-1">{row.name}</td>
                            <td className={`py-0.5 text-right text-xs tabular-nums ${displayAmt >= 0 ? 'text-purple-700' : 'text-red-600'}`}>
                              {displayAmt < 0 ? `(Rp ${fmt(Math.abs(displayAmt))})` : `Rp ${fmt(displayAmt)}`}
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="hover:bg-gray-50">
                        <td className="py-0.5 font-mono text-[10px] text-gray-400 w-16" />
                        <td className="py-0.5 text-xs pl-1 italic">Current Period Earnings</td>
                        <td className={`py-0.5 text-right text-xs tabular-nums ${netIncome >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                          {netIncome < 0 ? `(Rp ${fmt(Math.abs(netIncome))})` : `Rp ${fmt(netIncome)}`}
                        </td>
                      </tr>
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-purple-200 bg-purple-50">
                        <td colSpan={2} className="py-1 text-xs font-bold pl-1 text-purple-900">Total Equity</td>
                        <td className="py-1 text-right text-xs font-bold text-purple-900 tabular-nums">Rp {fmt(totalEquity + netIncome)}</td>
                      </tr>
                    </tfoot>
                  </table>

                  {/* Balance check */}
                  <div className={`mt-3 px-3 py-2 rounded-lg border ${balanceCheck < 0.02 ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-gray-800">Total Liabilities + Equity</span>
                      <span className="text-sm font-bold text-gray-900 tabular-nums">Rp {fmt(totalLiabEquity)}</span>
                    </div>
                    {balanceCheck > 0.02 ? (
                      <p className="text-[10px] text-red-600 mt-0.5">
                        ⚠ Out of balance — difference: Rp {fmt(balanceCheck)}
                      </p>
                    ) : (
                      <p className="text-[10px] text-green-600 mt-0.5">✓ Assets = Liabilities + Equity</p>
                    )}
                  </div>
                </div>

              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
