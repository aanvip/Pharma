import { useEffect, useState, useCallback } from 'react';
import { Layout } from '../../components/Layout';
import { useFinance } from '../../contexts/FinanceContext';
import { supabase } from '../../lib/supabase';
import { formatCurrency, formatNumber } from '../../utils/currency';
import {
  BarChart2, TrendingUp, TrendingDown, Package, Users, DollarSign,
  ChevronRight, X, RefreshCw, Download, Search, Calendar,
} from 'lucide-react';

// ─── Shared helpers ───────────────────────────────────────────────────────────

function ProfitBadge({ pct }: { pct: number }) {
  const good = pct >= 20;
  const ok   = pct >= 0;
  const cls  = good ? 'bg-green-100 text-green-700' : ok ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
  const Icon = ok ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      <Icon className="w-3 h-3" />{formatNumber(pct, 1)}%
    </span>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 shadow-sm">
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className="text-xl font-bold text-gray-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-16 text-gray-400">
      <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mr-2" />
      Loading…
    </div>
  );
}

function Empty({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <Icon className="w-10 h-10 mb-3 opacity-20" />
      <p className="text-sm">{text}</p>
    </div>
  );
}

type SortDir = 'asc' | 'desc';

function useSortable<T>(initial: keyof T, dir: SortDir = 'desc') {
  const [sortKey, setSortKey] = useState<keyof T>(initial);
  const [sortDir, setSortDir] = useState<SortDir>(dir);
  const handleSort = (key: keyof T) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };
  const sort = (rows: T[]) =>
    [...rows].sort((a, b) => {
      const av = a[sortKey]; const bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number')
        return sortDir === 'asc' ? av - bv : bv - av;
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
  const SortIcon = ({ col }: { col: keyof T }) =>
    sortKey === col
      ? <span className="ml-1 text-blue-500">{sortDir === 'asc' ? '↑' : '↓'}</span>
      : <span className="ml-1 text-gray-300">↕</span>;
  return { sortKey, sortDir, handleSort, sort, SortIcon };
}

function thCls(active: boolean) {
  return `px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide cursor-pointer select-none whitespace-nowrap hover:text-gray-800 transition-colors ${active ? 'text-blue-600' : 'text-gray-500'}`;
}

function exportCSV(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProductRow {
  product_id: string; product_name: string; product_code: string;
  product_unit: string;
  total_qty_sold: number;
  avg_selling_price_usd: number; avg_landed_cost_usd: number;
  profit_per_unit_usd: number; profit_pct: number; total_profit: number;
  no_cost: boolean; using_purchase_price: boolean;
}
interface DrilldownRow {
  invoice_id: string; invoice_number: string; invoice_date: string;
  customer_name: string; batch_number: string; qty: number;
  product_unit: string;
  selling_price_usd: number; landed_cost_usd: number; profit_per_unit_usd: number;
  line_sales: number; line_cost: number; line_profit: number; profit_pct: number;
  no_cost: boolean; using_purchase_price: boolean;
}
interface MonthRow {
  month_label: string; month_start: string;
  total_sales: number; total_orders: number; total_qty_sold: number; avg_order_value: number;
}
interface ProductPerfRow {
  product_id: string; product_name: string; product_code: string;
  qty_sold: number; total_sales: number; total_cost: number; total_profit: number; profit_pct: number;
}
interface CustomerRow {
  customer_id: string; customer_name: string;
  total_orders: number; total_sales: number; avg_order_value: number; last_order_date: string;
}
interface ExpenseVsProfitRow {
  total_sales: number; total_cogs: number; gross_profit: number;
  total_expenses: number; net_profit: number; profit_pct: number;
}

// ─── Tab 1: Sales Profit Report ───────────────────────────────────────────────

function DrilldownPanel({ product, rows, loading, onClose }: {
  product: ProductRow; rows: DrilldownRow[]; loading: boolean; onClose: () => void;
}) {
  const exportDrillCSV = () => {
    if (!rows.length) return;
    const csvRows: Record<string, unknown>[] = rows.map(r => ({
      'Invoice Number': r.invoice_number,
      'Invoice Date': r.invoice_date,
      'Customer': r.customer_name,
      'Batch Number': r.batch_number,
      [`Qty (${r.product_unit || 'unit'})`]: r.qty,
      'Sell Price (USD)': r.selling_price_usd,
      'Cost (USD)': r.no_cost ? '' : r.landed_cost_usd,
      'Cost Type': r.no_cost ? 'No data' : r.using_purchase_price ? 'Purchase Price' : 'Landed Cost',
      'Profit/Unit (USD)': r.no_cost ? '' : r.profit_per_unit_usd,
      'Line Sales (IDR)': r.line_sales,
      'Line Cost (IDR)': r.line_cost,
      'Line Profit (IDR)': r.no_cost ? '' : r.line_profit,
      'Profit %': r.no_cost ? '' : r.profit_pct,
    }));
    exportCSV(csvRows, `drilldown-${product.product_name.replace(/\s+/g, '-')}.csv`);
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="w-16 bg-gray-900/40 shrink-0" onClick={onClose} />
      <div className="flex-1 bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Invoice Drill-down</p>
            <h2 className="text-base font-bold text-gray-900 mt-0.5">{product.product_name}</h2>
            {product.product_code && <p className="text-xs text-gray-400 font-mono">{product.product_code}</p>}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-gray-400">Total Profit</p>
              <p className={`text-lg font-bold ${product.total_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(product.total_profit)}
              </p>
            </div>
            <ProfitBadge pct={product.profit_pct} />
            {!loading && rows.length > 0 && (
              <button onClick={exportDrillCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition">
                <Download className="w-3.5 h-3.5" />Export
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-200 transition"><X className="w-5 h-5 text-gray-500" /></button>
          </div>
        </div>
        <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-200">
          {[
            { label: `Total Qty${product.product_unit ? ` (${product.product_unit})` : ''}`, value: formatNumber(product.total_qty_sold, 3) },
            { label: 'Avg Sell Price (USD)',  value: `$${formatNumber(product.avg_selling_price_usd, 4)}` },
            { label: `Avg ${product.using_purchase_price && !product.no_cost ? 'Purchase' : 'Landed'} Cost (USD)`,
              value: product.no_cost
                ? <span className="text-amber-600 font-semibold">No cost data</span>
                : `$${formatNumber(product.avg_landed_cost_usd, 4)}` },
          ].map(s => (
            <div key={s.label} className="px-5 py-3 text-center">
              <p className="text-xs text-gray-400">{s.label}</p>
              <p className="text-sm font-semibold text-gray-800 mt-0.5">{s.value}</p>
            </div>
          ))}
        </div>
        <div className="flex-1 overflow-auto">
          {loading ? <Spinner /> : rows.length === 0 ? <Empty icon={Package} text="No invoice lines found in this period" /> : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Invoice','Date','Customer','Batch','Qty','Sell (USD)','Cost (USD)','Profit/Unit (USD)','Profit (IDR)','Margin'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((r, i) => (
                  <tr key={`${r.invoice_id}-${i}`} className={`hover:bg-blue-50/40 transition-colors ${r.no_cost ? 'bg-amber-50/30' : r.using_purchase_price ? 'bg-yellow-50/20' : ''}`}>
                    <td className="px-3 py-2 font-mono text-xs font-medium text-blue-700 whitespace-nowrap">{r.invoice_number}</td>
                    <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">{r.invoice_date}</td>
                    <td className="px-3 py-2 text-xs text-gray-800 max-w-[120px] truncate">{r.customer_name}</td>
                    <td className="px-3 py-2 text-xs text-gray-500 font-mono whitespace-nowrap">{r.batch_number || '—'}</td>
                    <td className="px-3 py-2 text-right text-xs font-medium text-gray-800">
                      {formatNumber(r.qty, 3)}{r.product_unit ? <span className="text-gray-400 ml-0.5">{r.product_unit}</span> : ''}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-gray-700">${formatNumber(r.selling_price_usd, 4)}</td>
                    <td className="px-3 py-2 text-right text-xs">
                      {r.no_cost
                        ? <span className="text-amber-500 text-[10px]">—</span>
                        : <span className={r.using_purchase_price ? 'text-amber-600' : 'text-gray-500'}>
                            ${formatNumber(r.landed_cost_usd, 4)}
                            {r.using_purchase_price && <span className="ml-0.5 text-[9px] text-amber-400">P</span>}
                          </span>
                      }
                    </td>
                    <td className={`px-3 py-2 text-right text-xs font-medium ${r.profit_per_unit_usd >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {r.no_cost ? '—' : `$${formatNumber(r.profit_per_unit_usd, 4)}`}
                    </td>
                    <td className={`px-3 py-2 text-right text-xs font-semibold ${r.line_profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {r.no_cost ? '—' : formatCurrency(r.line_profit)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {r.no_cost ? <span className="text-[10px] text-amber-500 font-medium">No cost</span> : <ProfitBadge pct={r.profit_pct} />}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-gray-200 bg-gray-50 sticky bottom-0">
                <tr>
                  <td colSpan={4} className="px-3 py-2.5 text-xs font-bold text-gray-600">TOTAL</td>
                  <td className="px-3 py-2.5 text-right text-xs font-bold text-gray-800">{formatNumber(rows.reduce((s,r)=>s+r.qty,0),3)}</td>
                  <td colSpan={3} />
                  <td className="px-3 py-2.5 text-right text-xs font-bold text-green-700">{formatCurrency(rows.reduce((s,r)=>s+r.line_profit,0))}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function SalesProfitTab({ dateRange }: { dateRange: { startDate: string; endDate: string } }) {
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [search, setSearch] = useState('');
  const { sortKey, handleSort, sort, SortIcon } = useSortable<ProductRow>('total_profit');
  const [drillProduct, setDrillProduct] = useState<ProductRow | null>(null);
  const [drillRows, setDrillRows] = useState<DrilldownRow[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.rpc('get_sales_profit_summary', {
      p_start_date: dateRange.startDate, p_end_date: dateRange.endDate,
    });
    setRows((data as ProductRow[]) || []);
    setLoading(false);
  }, [dateRange.startDate, dateRange.endDate]);

  useEffect(() => { load(); }, [load]);

  const openDrilldown = async (p: ProductRow) => {
    setDrillProduct(p); setDrillRows([]); setDrillLoading(true);
    const { data } = await supabase.rpc('get_sales_profit_drilldown', {
      p_product_id: p.product_id, p_start_date: dateRange.startDate, p_end_date: dateRange.endDate,
    });
    setDrillRows((data as DrilldownRow[]) || []);
    setDrillLoading(false);
  };

  const exportFullReport = async () => {
    if (!rows.length) return;
    setExportLoading(true);
    try {
      const csvLines: string[] = [];

      // Header metadata
      csvLines.push(`Sales Profit Report — ${dateRange.startDate} to ${dateRange.endDate}`);
      csvLines.push('');

      // Summary section
      csvLines.push('=== SUMMARY ===');
      const summaryHeaders = ['Product Name','Product Code','Unit','Qty Sold','Avg Sell Price (USD)','Avg Cost (USD)','Cost Type','Profit %','Total Profit (IDR)'];
      csvLines.push(summaryHeaders.map(h => JSON.stringify(h)).join(','));
      for (const r of rows) {
        const summaryRow = [
          r.product_name, r.product_code, r.product_unit,
          r.total_qty_sold,
          r.avg_selling_price_usd,
          r.no_cost ? '' : r.avg_landed_cost_usd,
          r.no_cost ? 'No Data' : r.using_purchase_price ? 'Purchase Price' : 'Landed Cost',
          r.no_cost ? '' : r.profit_pct,
          r.no_cost ? '' : r.total_profit,
        ];
        csvLines.push(summaryRow.map(v => JSON.stringify(v ?? '')).join(','));
      }
      csvLines.push('');

      // Detail sections — one per product
      for (const r of rows) {
        csvLines.push(`=== ${r.product_name} (${r.product_code}) ===`);
        const detailHeaders = ['Invoice Number','Invoice Date','Customer','Batch Number',`Qty (${r.product_unit || 'unit'})`,
          'Sell Price (USD)','Cost (USD)','Cost Type','Profit/Unit (USD)','Line Sales (IDR)','Line Cost (IDR)','Line Profit (IDR)','Profit %'];
        csvLines.push(detailHeaders.map(h => JSON.stringify(h)).join(','));

        const { data: drill } = await supabase.rpc('get_sales_profit_drilldown', {
          p_product_id: r.product_id, p_start_date: dateRange.startDate, p_end_date: dateRange.endDate,
        });
        const drillData = (drill as DrilldownRow[]) || [];

        for (const d of drillData) {
          const detailRow = [
            d.invoice_number, d.invoice_date, d.customer_name, d.batch_number,
            d.qty,
            d.selling_price_usd,
            d.no_cost ? '' : d.landed_cost_usd,
            d.no_cost ? 'No Data' : d.using_purchase_price ? 'Purchase Price' : 'Landed Cost',
            d.no_cost ? '' : d.profit_per_unit_usd,
            d.line_sales,
            d.line_cost,
            d.no_cost ? '' : d.line_profit,
            d.no_cost ? '' : d.profit_pct,
          ];
          csvLines.push(detailRow.map(v => JSON.stringify(v ?? '')).join(','));
        }

        // Product subtotal
        const totalQtySold = drillData.reduce((s, d) => s + d.qty, 0);
        const totalProfit  = drillData.reduce((s, d) => s + (d.no_cost ? 0 : d.line_profit), 0);
        const subtotal = ['SUBTOTAL', '', '', '', totalQtySold, '', '', '', '', '', '', totalProfit, ''];
        csvLines.push(subtotal.map(v => JSON.stringify(v ?? '')).join(','));
        csvLines.push('');
      }

      const blob = new Blob([csvLines.join('\n')], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sales-profit-full-${dateRange.startDate}-to-${dateRange.endDate}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportLoading(false);
    }
  };

  const filtered = sort(rows.filter(r =>
    r.product_name.toLowerCase().includes(search.toLowerCase()) ||
    r.product_code.toLowerCase().includes(search.toLowerCase())
  ));

  const totalProfit  = filtered.reduce((s,r)=>s+r.total_profit,0);
  const totalQty     = filtered.reduce((s,r)=>s+r.total_qty_sold,0);
  const noCostCount  = filtered.filter(r=>r.no_cost).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatCard label="Total Profit"   value={formatCurrency(totalProfit)} sub={`${filtered.length} products`} />
        <StatCard label="Total Qty Sold" value={formatNumber(totalQty, 0)} />
        {noCostCount > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 shadow-sm">
            <p className="text-xs text-amber-600 font-medium">Missing Cost Data</p>
            <p className="text-xl font-bold text-amber-700 mt-1">{noCostCount}</p>
            <p className="text-xs text-amber-500 mt-0.5">products have no landed cost</p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search product…"
            className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
          {search && <button onClick={()=>setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"><X className="w-3.5 h-3.5" /></button>}
        </div>
        <span className="text-xs text-gray-400">{filtered.length} products</span>
        <button onClick={()=>exportCSV(filtered as unknown as Record<string,unknown>[], 'sales-profit-summary.csv')}
          className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
          <Download className="w-3.5 h-3.5" />Summary CSV
        </button>
        <button onClick={exportFullReport} disabled={exportLoading || loading || rows.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 text-xs text-white bg-blue-600 border border-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">
          <Download className={`w-3.5 h-3.5 ${exportLoading ? 'animate-spin' : ''}`} />
          {exportLoading ? 'Exporting…' : 'Full Report CSV'}
        </button>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? <Spinner /> : filtered.length === 0 ? <Empty icon={DollarSign} text="No sales data found for this period" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 w-6" />
                  <th className={thCls(sortKey==='product_name')} onClick={()=>handleSort('product_name')}>Product Name <SortIcon col="product_name" /></th>
                  <th className={`${thCls(sortKey==='total_qty_sold')} text-right`} onClick={()=>handleSort('total_qty_sold')}>Qty Sold <SortIcon col="total_qty_sold" /></th>
                  <th className={`${thCls(sortKey==='avg_selling_price_usd')} text-right`} onClick={()=>handleSort('avg_selling_price_usd')}>Avg Selling Price (USD) <SortIcon col="avg_selling_price_usd" /></th>
                  <th className={`${thCls(sortKey==='avg_landed_cost_usd')} text-right`} onClick={()=>handleSort('avg_landed_cost_usd')}>Avg Landed Cost (USD) <SortIcon col="avg_landed_cost_usd" /></th>
                  <th className={`${thCls(sortKey==='profit_pct')} text-right`} onClick={()=>handleSort('profit_pct')}>Profit % <SortIcon col="profit_pct" /></th>
                  <th className={`${thCls(sortKey==='total_profit')} text-right`} onClick={()=>handleSort('total_profit')}>Total Profit (IDR) <SortIcon col="total_profit" /></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(r => (
                  <tr key={r.product_id} onClick={()=>openDrilldown(r)}
                    className={`cursor-pointer transition-colors group ${r.no_cost ? 'bg-amber-50/30 hover:bg-amber-50' : r.total_profit >= 0 ? 'hover:bg-green-50/30' : 'hover:bg-red-50/30'}`}>
                    <td className="px-4 py-3 text-gray-300 group-hover:text-blue-400"><ChevronRight className="w-4 h-4" /></td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{r.product_name}</p>
                      {r.product_code && <p className="text-xs text-gray-400 font-mono">{r.product_code}</p>}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-800">
                      {formatNumber(r.total_qty_sold, 3)}
                      {r.product_unit && <span className="ml-1 text-xs text-gray-400">{r.product_unit}</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">${formatNumber(r.avg_selling_price_usd, 4)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {r.no_cost
                        ? <span className="text-xs text-amber-500 font-medium">No cost data</span>
                        : <span className={r.using_purchase_price ? 'text-amber-600' : ''}>
                            ${formatNumber(r.avg_landed_cost_usd, 4)}
                            {r.using_purchase_price && (
                              <span className="ml-1 text-[10px] text-amber-500 font-medium">purchase price</span>
                            )}
                          </span>
                      }
                    </td>
                    <td className="px-4 py-3 text-right">
                      {r.no_cost
                        ? <span className="text-xs text-amber-500 font-medium">—</span>
                        : <ProfitBadge pct={r.profit_pct} />}
                    </td>
                    <td className={`px-4 py-3 text-right font-bold ${r.no_cost ? 'text-amber-500' : r.total_profit>=0?'text-green-700':'text-red-600'}`}>
                      {r.no_cost ? '—' : formatCurrency(r.total_profit)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                <tr>
                  <td colSpan={2} className="px-4 py-3 text-xs font-bold text-gray-600 uppercase">Grand Total ({filtered.length} products)</td>
                  <td className="px-4 py-3 text-right text-xs font-bold text-gray-800">{formatNumber(filtered.reduce((s,r)=>s+r.total_qty_sold,0),3)}</td>
                  <td colSpan={3} />
                  <td className="px-4 py-3 text-right text-xs font-bold text-green-700">{formatCurrency(filtered.filter(r=>!r.no_cost).reduce((s,r)=>s+r.total_profit,0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {filtered.some(r => r.using_purchase_price) && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
          <span className="font-semibold">Note:</span> Rows marked <span className="font-semibold">"purchase price"</span> use the batch purchase price (import price) as cost — the landed cost including container charges has not yet been allocated for those batches. Profit % may appear higher than actual.
        </p>
      )}

      {drillProduct && (
        <DrilldownPanel product={drillProduct} rows={drillRows} loading={drillLoading} onClose={()=>setDrillProduct(null)} />
      )}
    </div>
  );
}

// ─── Tab 2: Monthly Sales Report ──────────────────────────────────────────────

function MonthlySalesTab({ dateRange }: { dateRange: { startDate: string; endDate: string } }) {
  const [rows, setRows] = useState<MonthRow[]>([]);
  const [loading, setLoading] = useState(false);
  const { sortKey, handleSort, sort, SortIcon } = useSortable<MonthRow>('month_start', 'asc');

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.rpc('get_monthly_sales_report', {
      p_start_date: dateRange.startDate, p_end_date: dateRange.endDate,
    });
    setRows((data as MonthRow[]) || []);
    setLoading(false);
  }, [dateRange.startDate, dateRange.endDate]);

  useEffect(() => { load(); }, [load]);

  const sorted = sort(rows);
  const totalSales = rows.reduce((s,r)=>s+r.total_sales,0);
  const totalOrders = rows.reduce((s,r)=>s+r.total_orders,0);
  const totalQty = rows.reduce((s,r)=>s+r.total_qty_sold,0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatCard label="Total Revenue" value={formatCurrency(totalSales)} sub={`${rows.length} months`} />
        <StatCard label="Total Orders"  value={String(totalOrders)} />
        <StatCard label="Total Qty Sold" value={formatNumber(totalQty,0)} />
      </div>

      <div className="flex items-center gap-3 justify-end">
        <button onClick={()=>exportCSV(sorted as unknown as Record<string,unknown>[], 'monthly-sales.csv')}
          className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
          <Download className="w-3.5 h-3.5" />Export CSV
        </button>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading?'animate-spin':''}`} />Refresh
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? <Spinner /> : sorted.length === 0 ? <Empty icon={Calendar} text="No sales data found for this period" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className={thCls(sortKey==='month_label')} onClick={()=>handleSort('month_label')}>Month <SortIcon col="month_label" /></th>
                  <th className={`${thCls(sortKey==='total_sales')} text-right`} onClick={()=>handleSort('total_sales')}>Total Sales <SortIcon col="total_sales" /></th>
                  <th className={`${thCls(sortKey==='total_orders')} text-right`} onClick={()=>handleSort('total_orders')}>Total Orders <SortIcon col="total_orders" /></th>
                  <th className={`${thCls(sortKey==='total_qty_sold')} text-right`} onClick={()=>handleSort('total_qty_sold')}>Total Qty Sold <SortIcon col="total_qty_sold" /></th>
                  <th className={`${thCls(sortKey==='avg_order_value')} text-right`} onClick={()=>handleSort('avg_order_value')}>Avg Order Value <SortIcon col="avg_order_value" /></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sorted.map(r => (
                  <tr key={r.month_start} className="hover:bg-blue-50/40 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{r.month_label}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-800">{formatCurrency(r.total_sales)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{r.total_orders}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{formatNumber(r.total_qty_sold,0)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(r.avg_order_value)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                <tr>
                  <td className="px-4 py-3 text-xs font-bold text-gray-600 uppercase">Total ({rows.length} months)</td>
                  <td className="px-4 py-3 text-right text-xs font-bold text-gray-800">{formatCurrency(totalSales)}</td>
                  <td className="px-4 py-3 text-right text-xs font-bold text-gray-800">{totalOrders}</td>
                  <td className="px-4 py-3 text-right text-xs font-bold text-gray-800">{formatNumber(totalQty,0)}</td>
                  <td className="px-4 py-3 text-right text-xs font-semibold text-gray-500">
                    {totalOrders > 0 ? formatCurrency(totalSales/totalOrders) : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab 3: Product Performance Report ───────────────────────────────────────

function ProductPerformanceTab({ dateRange }: { dateRange: { startDate: string; endDate: string } }) {
  const [rows, setRows] = useState<ProductPerfRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const { sortKey, handleSort, sort, SortIcon } = useSortable<ProductPerfRow>('total_sales');

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.rpc('get_product_performance_report', {
      p_start_date: dateRange.startDate, p_end_date: dateRange.endDate,
    });
    setRows((data as ProductPerfRow[]) || []);
    setLoading(false);
  }, [dateRange.startDate, dateRange.endDate]);

  useEffect(() => { load(); }, [load]);

  const filtered = sort(rows.filter(r =>
    r.product_name.toLowerCase().includes(search.toLowerCase()) ||
    r.product_code.toLowerCase().includes(search.toLowerCase())
  ));

  const totalSales = rows.reduce((s,r)=>s+r.total_sales,0);
  const totalProfit = rows.reduce((s,r)=>s+r.total_profit,0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatCard label="Total Sales"  value={formatCurrency(totalSales)} sub={`${rows.length} products`} />
        <StatCard label="Total Profit" value={formatCurrency(totalProfit)} />
        <StatCard label="Overall Margin" value={`${formatNumber(totalSales>0?(totalProfit/totalSales)*100:0,1)}%`} />
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search product…"
            className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
          {search && <button onClick={()=>setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"><X className="w-3.5 h-3.5" /></button>}
        </div>
        <span className="text-xs text-gray-400">{filtered.length} products</span>
        <button onClick={()=>exportCSV(filtered as unknown as Record<string,unknown>[], 'product-performance.csv')}
          className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
          <Download className="w-3.5 h-3.5" />Export CSV
        </button>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading?'animate-spin':''}`} />Refresh
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? <Spinner /> : filtered.length === 0 ? <Empty icon={Package} text="No product data found for this period" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 w-8">#</th>
                  <th className={thCls(sortKey==='product_name')} onClick={()=>handleSort('product_name')}>Product <SortIcon col="product_name" /></th>
                  <th className={`${thCls(sortKey==='qty_sold')} text-right`} onClick={()=>handleSort('qty_sold')}>Qty Sold <SortIcon col="qty_sold" /></th>
                  <th className={`${thCls(sortKey==='total_sales')} text-right`} onClick={()=>handleSort('total_sales')}>Total Sales <SortIcon col="total_sales" /></th>
                  <th className={`${thCls(sortKey==='total_profit')} text-right`} onClick={()=>handleSort('total_profit')}>Total Profit <SortIcon col="total_profit" /></th>
                  <th className={`${thCls(sortKey==='profit_pct')} text-right`} onClick={()=>handleSort('profit_pct')}>Profit % <SortIcon col="profit_pct" /></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((r, i) => (
                  <tr key={r.product_id} className="hover:bg-blue-50/40 transition-colors">
                    <td className="px-4 py-3 text-xs text-gray-400">{i+1}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{r.product_name}</p>
                      {r.product_code && <p className="text-xs text-gray-400 font-mono">{r.product_code}</p>}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-800">{formatNumber(r.qty_sold,3)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-800">{formatCurrency(r.total_sales)}</td>
                    <td className={`px-4 py-3 text-right font-bold ${r.total_profit>=0?'text-green-700':'text-red-600'}`}>{formatCurrency(r.total_profit)}</td>
                    <td className="px-4 py-3 text-right"><ProfitBadge pct={r.profit_pct} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                <tr>
                  <td colSpan={2} className="px-4 py-3 text-xs font-bold text-gray-600 uppercase">Grand Total ({filtered.length} products)</td>
                  <td className="px-4 py-3 text-right text-xs font-bold text-gray-800">{formatNumber(filtered.reduce((s,r)=>s+r.qty_sold,0),0)}</td>
                  <td className="px-4 py-3 text-right text-xs font-bold text-gray-800">{formatCurrency(filtered.reduce((s,r)=>s+r.total_sales,0))}</td>
                  <td className="px-4 py-3 text-right text-xs font-bold text-green-700">{formatCurrency(filtered.reduce((s,r)=>s+r.total_profit,0))}</td>
                  <td className="px-4 py-3 text-right">
                    <ProfitBadge pct={filtered.reduce((s,r)=>s+r.total_sales,0)>0
                      ?(filtered.reduce((s,r)=>s+r.total_profit,0)/filtered.reduce((s,r)=>s+r.total_sales,0))*100:0} />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab 4: Customer Sales Report ─────────────────────────────────────────────

function CustomerSalesTab({ dateRange }: { dateRange: { startDate: string; endDate: string } }) {
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const { sortKey, handleSort, sort, SortIcon } = useSortable<CustomerRow>('total_sales');

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.rpc('get_customer_sales_report', {
      p_start_date: dateRange.startDate, p_end_date: dateRange.endDate,
    });
    setRows((data as CustomerRow[]) || []);
    setLoading(false);
  }, [dateRange.startDate, dateRange.endDate]);

  useEffect(() => { load(); }, [load]);

  const filtered = sort(rows.filter(r =>
    r.customer_name.toLowerCase().includes(search.toLowerCase())
  ));

  const totalSales = rows.reduce((s,r)=>s+r.total_sales,0);
  const totalOrders = rows.reduce((s,r)=>s+r.total_orders,0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatCard label="Total Revenue"   value={formatCurrency(totalSales)}  sub={`${rows.length} customers`} />
        <StatCard label="Total Orders"    value={String(totalOrders)} />
        <StatCard label="Avg Order Value" value={formatCurrency(totalOrders>0?totalSales/totalOrders:0)} />
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search customer…"
            className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
          {search && <button onClick={()=>setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"><X className="w-3.5 h-3.5" /></button>}
        </div>
        <span className="text-xs text-gray-400">{filtered.length} customers</span>
        <button onClick={()=>exportCSV(filtered as unknown as Record<string,unknown>[], 'customer-sales.csv')}
          className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
          <Download className="w-3.5 h-3.5" />Export CSV
        </button>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading?'animate-spin':''}`} />Refresh
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? <Spinner /> : filtered.length === 0 ? <Empty icon={Users} text="No customer data found for this period" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 w-8">#</th>
                  <th className={thCls(sortKey==='customer_name')} onClick={()=>handleSort('customer_name')}>Customer Name <SortIcon col="customer_name" /></th>
                  <th className={`${thCls(sortKey==='total_orders')} text-right`} onClick={()=>handleSort('total_orders')}>Total Orders <SortIcon col="total_orders" /></th>
                  <th className={`${thCls(sortKey==='total_sales')} text-right`} onClick={()=>handleSort('total_sales')}>Total Sales <SortIcon col="total_sales" /></th>
                  <th className={`${thCls(sortKey==='avg_order_value')} text-right`} onClick={()=>handleSort('avg_order_value')}>Avg Order Value <SortIcon col="avg_order_value" /></th>
                  <th className={`${thCls(sortKey==='last_order_date')} text-right`} onClick={()=>handleSort('last_order_date')}>Last Order Date <SortIcon col="last_order_date" /></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((r, i) => (
                  <tr key={r.customer_id} className="hover:bg-blue-50/40 transition-colors">
                    <td className="px-4 py-3 text-xs text-gray-400">{i+1}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{r.customer_name}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{r.total_orders}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-800">{formatCurrency(r.total_sales)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(r.avg_order_value)}</td>
                    <td className="px-4 py-3 text-right text-gray-500 text-xs">{r.last_order_date || '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                <tr>
                  <td colSpan={2} className="px-4 py-3 text-xs font-bold text-gray-600 uppercase">Total ({filtered.length} customers)</td>
                  <td className="px-4 py-3 text-right text-xs font-bold text-gray-800">{filtered.reduce((s,r)=>s+r.total_orders,0)}</td>
                  <td className="px-4 py-3 text-right text-xs font-bold text-gray-800">{formatCurrency(filtered.reduce((s,r)=>s+r.total_sales,0))}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab 5: Expense vs Profit Report ──────────────────────────────────────────

function ExpenseVsProfitTab({ dateRange }: { dateRange: { startDate: string; endDate: string } }) {
  const [data, setData] = useState<ExpenseVsProfitRow | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: result } = await supabase.rpc('get_expense_vs_profit_report', {
      p_start_date: dateRange.startDate, p_end_date: dateRange.endDate,
    });
    const rows = result as ExpenseVsProfitRow[] | null;
    setData(rows && rows.length > 0 ? rows[0] : null);
    setLoading(false);
  }, [dateRange.startDate, dateRange.endDate]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner />;
  if (!data) return <Empty icon={DollarSign} text="No data found for this period" />;

  const rows = [
    { label: 'Total Sales Revenue', value: data.total_sales, type: 'income' },
    { label: 'Cost of Goods Sold (COGS)', value: data.total_cogs, type: 'cost' },
    { label: 'Gross Profit', value: data.gross_profit, type: data.gross_profit >= 0 ? 'profit' : 'loss' },
    { label: 'Operating Expenses', value: data.total_expenses, type: 'cost' },
    { label: 'Net Profit', value: data.net_profit, type: data.net_profit >= 0 ? 'profit' : 'loss' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Sales"     value={formatCurrency(data.total_sales)} />
        <StatCard label="Total Expenses"  value={formatCurrency(data.total_expenses)} />
        <StatCard label="Net Profit"      value={formatCurrency(data.net_profit)} sub={`${formatNumber(data.profit_pct,1)}% margin`} />
        <StatCard label="Gross Profit"    value={formatCurrency(data.gross_profit)} sub="Before expenses" />
      </div>

      <div className="flex items-center gap-3 justify-end">
        <button onClick={()=>exportCSV([data as unknown as Record<string,unknown>], 'expense-vs-profit.csv')}
          className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
          <Download className="w-3.5 h-3.5" />Export CSV
        </button>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading?'animate-spin':''}`} />Refresh
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r, i) => {
              const isTotal = r.label.startsWith('Gross') || r.label.startsWith('Net');
              return (
                <tr key={i} className={isTotal ? 'bg-gray-50' : ''}>
                  <td className={`px-6 py-4 ${isTotal ? 'font-bold text-gray-900' : 'text-gray-700'}`}>
                    {r.label}
                    {r.label === 'Net Profit' && (
                      <span className="ml-3"><ProfitBadge pct={data.profit_pct} /></span>
                    )}
                  </td>
                  <td className={`px-6 py-4 text-right font-semibold ${
                    r.type === 'income' ? 'text-gray-900' :
                    r.type === 'cost'   ? 'text-red-600'  :
                    r.type === 'profit' ? 'text-green-700':
                    'text-red-700'
                  } ${isTotal ? 'text-base font-bold' : ''}`}>
                    {r.type === 'cost' ? `(${formatCurrency(r.value)})` : formatCurrency(r.value)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Waterfall bar */}
        {data.total_sales > 0 && (
          <div className="px-6 pb-5 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400 font-medium mb-2">Profit breakdown</p>
            <div className="h-4 bg-gray-100 rounded-full overflow-hidden flex">
              <div className="h-full bg-red-400 transition-all" style={{ width: `${Math.min((data.total_cogs/data.total_sales)*100,100)}%` }} title="COGS" />
              <div className="h-full bg-orange-400 transition-all" style={{ width: `${Math.min((data.total_expenses/data.total_sales)*100,100)}%` }} title="Expenses" />
              <div className="h-full bg-green-500 transition-all" style={{ width: `${Math.max(0,Math.min((data.net_profit/data.total_sales)*100,100))}%` }} title="Net Profit" />
            </div>
            <div className="flex gap-4 mt-2 text-xs text-gray-400">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-400 inline-block" />COGS</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-orange-400 inline-block" />Expenses</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-500 inline-block" />Net Profit</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Reports page ────────────────────────────────────────────────────────

type Tab = 'sales-profit' | 'monthly' | 'product-perf' | 'customer' | 'expense-profit';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'sales-profit',   label: 'Sales Profit',        icon: TrendingUp },
  { id: 'monthly',        label: 'Monthly Sales',        icon: Calendar },
  { id: 'product-perf',   label: 'Product Performance',  icon: Package },
  { id: 'customer',       label: 'Customer Sales',       icon: Users },
  { id: 'expense-profit', label: 'Expense vs Profit',    icon: DollarSign },
];

export function Reports() {
  const { dateRange } = useFinance();
  const [activeTab, setActiveTab] = useState<Tab>('sales-profit');

  return (
    <Layout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg">
            <BarChart2 className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Reports</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {dateRange.startDate} — {dateRange.endDate} · Adjust range via header date filter
            </p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={()=>setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap
                  ${active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        {activeTab === 'sales-profit'   && <SalesProfitTab   dateRange={dateRange} />}
        {activeTab === 'monthly'        && <MonthlySalesTab  dateRange={dateRange} />}
        {activeTab === 'product-perf'   && <ProductPerformanceTab dateRange={dateRange} />}
        {activeTab === 'customer'       && <CustomerSalesTab dateRange={dateRange} />}
        {activeTab === 'expense-profit' && <ExpenseVsProfitTab dateRange={dateRange} />}
      </div>
    </Layout>
  );
}
