import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { FileText, Download, Calendar, TrendingUp, TrendingDown } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { formatDate } from '../../utils/dateFormat';

interface InputPPNRecord {
  month: string;
  expense_date: string;
  container_ref: string;
  supplier: string;
  import_invoice_value: number;
  ppn_amount: number;
  description: string;
}

interface OutputPPNRecord {
  month: string;
  invoice_date: string;
  invoice_number: string;
  customer: string;
  customer_npwp: string;
  subtotal: number;
  ppn_amount: number;
  total_amount: number;
  payment_status: string;
}

interface MonthlySummary {
  month: string;
  input_ppn_paid: number;
  output_ppn_collected: number;
  net_ppn_payable: number;
}

export function TaxReports() {
  const { t } = useLanguage();
  const [inputPPN, setInputPPN] = useState<InputPPNRecord[]>([]);
  const [outputPPN, setOutputPPN] = useState<OutputPPNRecord[]>([]);
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'summary' | 'input' | 'output'>('summary');
  const [selectedMonth, setSelectedMonth] = useState<string>('');

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    try {
      setLoading(true);

      const [summaryRes, inputRes, outputRes] = await Promise.all([
        supabase.from('vw_monthly_tax_summary').select('*').order('month', { ascending: false }),
        supabase.from('vw_input_ppn_report').select('*'),
        supabase.from('vw_output_ppn_report').select('*'),
      ]);

      if (summaryRes.error) throw summaryRes.error;
      if (inputRes.error) throw inputRes.error;
      if (outputRes.error) throw outputRes.error;

      setMonthlySummary(summaryRes.data || []);
      setInputPPN(inputRes.data || []);
      setOutputPPN(outputRes.data || []);
    } catch (error: any) {
      console.error('Error loading tax reports:', error.message);
      alert('Failed to load tax reports');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return `Rp ${amount?.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatMonth = (monthStr: string) => {
    if (!monthStr) return '-';
    const date = new Date(monthStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
  };

  const filteredInput = selectedMonth
    ? inputPPN.filter((record) => record.month === selectedMonth)
    : inputPPN;

  const filteredOutput = selectedMonth
    ? outputPPN.filter((record) => record.month === selectedMonth)
    : outputPPN;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between bg-white p-2 rounded-lg shadow-sm">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{t('finance.taxReports') || 'Tax Reports (PPN)'}</h2>
          <p className="text-[10px] text-gray-600">{t('finance.taxReportsDesc') || 'Monthly Input PPN, Output PPN, Net PPN'}</p>
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 px-2.5 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-xs"
        >
          <Download className="w-3.5 h-3.5" />
          {t('common.print') || 'Print'}
        </button>
      </div>

      <div className="flex gap-1.5 border-b border-gray-200 bg-white">
        {[
          { value: 'summary', label: t('finance.monthlySummary') || 'Monthly Summary', icon: Calendar },
          { value: 'input', label: t('finance.inputPPN') || 'Input PPN', icon: TrendingDown },
          { value: 'output', label: t('finance.outputPPN') || 'Output PPN', icon: TrendingUp },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value as any)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors ${
                activeTab === tab.value
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500 text-xs">{t('common.loading') || 'Loading tax reports...'}</div>
      ) : (
        <>
          {activeTab === 'summary' && (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
                <h3 className="text-sm font-medium text-gray-900">{t('finance.monthlySummary') || 'Monthly Tax Summary'}</h3>
                <p className="text-[10px] text-gray-600">{t('finance.netPPNFormula') || 'Net PPN = Output PPN - Input PPN'}</p>
              </div>
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase">
                      {t('common.month') || 'Month'}
                    </th>
                    <th className="px-3 py-1.5 text-right text-[10px] font-medium text-gray-500 uppercase">
                      {t('finance.inputPPNPaid') || 'Input PPN'}
                    </th>
                    <th className="px-3 py-1.5 text-right text-[10px] font-medium text-gray-500 uppercase">
                      {t('finance.outputPPNCollected') || 'Output PPN'}
                    </th>
                    <th className="px-3 py-1.5 text-right text-[10px] font-medium text-gray-500 uppercase">
                      {t('finance.netPPNPayable') || 'Net PPN Payable'}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {monthlySummary.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-center text-gray-500 text-xs">
                        {t('common.noData') || 'No tax data available'}
                      </td>
                    </tr>
                  ) : (
                    monthlySummary.map((summary, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-3 py-2 whitespace-nowrap">
                          <div className="text-xs font-medium text-gray-900">
                            {formatMonth(summary.month)}
                          </div>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-right">
                          <div className="text-xs text-blue-600 font-medium">
                            {formatCurrency(summary.input_ppn_paid)}
                          </div>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-right">
                          <div className="text-xs text-green-600 font-medium">
                            {formatCurrency(summary.output_ppn_collected)}
                          </div>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-right">
                          <div
                            className={`text-xs font-bold ${
                              summary.net_ppn_payable > 0
                                ? 'text-red-600'
                                : summary.net_ppn_payable < 0
                                ? 'text-blue-600'
                                : 'text-gray-600'
                            }`}
                          >
                            {formatCurrency(summary.net_ppn_payable)}
                          </div>
                          <div className="text-[10px] text-gray-500">
                            {summary.net_ppn_payable > 0
                              ? t('finance.payToTax') || 'Pay to tax office'
                              : summary.net_ppn_payable < 0
                              ? t('finance.carryForward') || 'Carry forward'
                              : t('finance.balanced') || 'Balanced'}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'input' && (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-3 py-2 bg-blue-50 border-b border-blue-200">
                <h3 className="text-sm font-medium text-blue-900">{t('finance.inputPPNReport') || 'Input PPN Report'}</h3>
                <p className="text-[10px] text-blue-700">
                  {t('finance.inputPPNDesc') || 'PPN paid on imports - can be claimed as tax credit'}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase">
                        {t('common.date') || 'Date'}
                      </th>
                      <th className="px-3 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase">
                        {t('common.container') || 'Container'}
                      </th>
                      <th className="px-3 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase">
                        {t('common.supplier') || 'Supplier'}
                      </th>
                      <th className="px-3 py-1.5 text-right text-[10px] font-medium text-gray-500 uppercase">
                        {t('finance.invoiceValue') || 'Invoice Value'}
                      </th>
                      <th className="px-3 py-1.5 text-right text-[10px] font-medium text-gray-500 uppercase">
                        {t('finance.ppnAmount') || 'PPN Amount (11%)'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredInput.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-4 text-center text-gray-500 text-xs">
                          {t('common.noRecords') || 'No input PPN records'}
                        </td>
                      </tr>
                    ) : (
                      filteredInput.map((record, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-900">
                            {formatDate(record.expense_date)}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs font-medium text-gray-900">
                            {record.container_ref}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-700">{record.supplier}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-right text-gray-900">
                            {formatCurrency(record.import_invoice_value)}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-right font-medium text-blue-600">
                            {formatCurrency(record.ppn_amount)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'output' && (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-3 py-2 bg-green-50 border-b border-green-200">
                <h3 className="text-sm font-medium text-green-900">{t('finance.outputPPNReport') || 'Output PPN Report'}</h3>
                <p className="text-[10px] text-green-700">
                  {t('finance.outputPPNDesc') || 'PPN collected from customers - must be paid to tax office'}
                </p>
                <p className="text-[10px] font-semibold text-red-700 mt-1">
                  {t('finance.taxPayableWarning') || '⚠️ Tax is payable based on INVOICE DATE, not payment status!'}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase">
                        {t('common.date') || 'Date'}
                      </th>
                      <th className="px-3 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase">
                        {t('common.invoiceNo') || 'Invoice #'}
                      </th>
                      <th className="px-3 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase">
                        {t('common.customer') || 'Customer'}
                      </th>
                      <th className="px-3 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase">
                        NPWP
                      </th>
                      <th className="px-3 py-1.5 text-right text-[10px] font-medium text-gray-500 uppercase">
                        {t('finance.subtotal') || 'Subtotal'}
                      </th>
                      <th className="px-3 py-1.5 text-right text-[10px] font-medium text-gray-500 uppercase">
                        {t('finance.ppnAmount') || 'PPN Amount (11%)'}
                      </th>
                      <th className="px-3 py-1.5 text-center text-[10px] font-medium text-gray-500 uppercase">
                        {t('common.paymentStatus') || 'Payment Status'}
                        <div className="text-[10px] font-normal text-gray-500 normal-case">
                          {t('finance.forInfoOnly') || '(For info only - tax due regardless)'}
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredOutput.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-4 text-center text-gray-500 text-xs">
                          {t('common.noRecords') || 'No output PPN records'}
                        </td>
                      </tr>
                    ) : (
                      filteredOutput.map((record, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-900">
                            {formatDate(record.invoice_date)}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs font-medium text-gray-900">
                            {record.invoice_number}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-700">{record.customer}</td>
                          <td className="px-3 py-2 text-xs text-gray-600">
                            {record.customer_npwp || '-'}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-right text-gray-900">
                            {formatCurrency(record.subtotal)}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-right font-medium text-green-600">
                            {formatCurrency(record.ppn_amount)}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-center">
                            <span
                              className={`inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded ${
                                record.payment_status === 'paid'
                                  ? 'bg-green-100 text-green-800'
                                  : record.payment_status === 'partial'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-gray-100 text-gray-800'
                              }`}
                            >
                              {record.payment_status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <div className="bg-red-50 border border-red-300 rounded-lg p-2">
        <h4 className="text-xs font-semibold text-red-900 mb-1">{t('finance.taxRuleWarning') || '⚠️ CRITICAL: Indonesian PPN Tax Rule'}</h4>
        <div className="text-[10px] text-red-800 space-y-1">
          <p className="font-semibold">{t('finance.ppnPayableRule') || 'PPN is payable based on INVOICE DATE, NOT payment date!'}</p>
          <ul className="list-disc list-inside space-y-0.5 ml-1">
            <li>{t('finance.taxRule1') || 'When you issue an invoice → PPN is immediately owed to tax office'}</li>
            <li>{t('finance.taxRule2') || 'Payment status does NOT matter for tax'}</li>
            <li>{t('finance.taxRule3') || 'You must pay PPN to government even if customer hasn\'t paid you yet'}</li>
            <li>{t('finance.taxRule4') || 'All invoices in a month = PPN payable for that month'}</li>
          </ul>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-2">
        <h4 className="text-xs font-semibold text-blue-900 mb-1">{t('finance.taxFilingGuide') || '📋 Tax Filing Guide'}</h4>
        <ul className="text-[10px] text-blue-800 space-y-0.5">
          <li>• <strong>{t('finance.inputPPN') || 'Input PPN'}</strong>: {t('finance.inputPPNDesc2') || 'PPN paid on imports (can be claimed back)'}</li>
          <li>• <strong>{t('finance.outputPPN') || 'Output PPN'}</strong>: {t('finance.outputPPNDesc2') || 'PPN collected from customers (must pay to tax office)'}</li>
          <li>• <strong>{t('finance.netPPNPayable') || 'Net PPN Payable'}</strong>: {t('finance.netPPNFormula2') || 'Output PPN - Input PPN'}</li>
          <li>• {t('finance.taxRule5') || 'If positive: Pay to tax office by month-end'}</li>
          <li>• {t('finance.taxRule6') || 'If negative: Carry forward to next month or claim refund'}</li>
          <li>• <strong>{t('finance.ppnRate') || 'PPN Rate'}</strong>: 11% {t('finance.asPerLaw') || '(as per Indonesian tax law)'}</li>
        </ul>
      </div>
    </div>
  );
}
