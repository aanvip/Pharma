import { useEffect, useState, useMemo, lazy, Suspense } from 'react';
import { Layout } from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useFinance } from '../contexts/FinanceContext';
import { useNavigation } from '../contexts/NavigationContext';
import { ChevronDown, ChevronRight, Menu, X, Loader } from 'lucide-react';

const PurchaseInvoiceManager = lazy(() => import('../components/finance/PurchaseInvoiceManager').then(m => ({ default: m.PurchaseInvoiceManager })));
const ReceiptVoucherManager = lazy(() => import('../components/finance/ReceiptVoucherManager').then(m => ({ default: m.ReceiptVoucherManager })));
const PaymentVoucherManager = lazy(() => import('../components/finance/PaymentVoucherManager').then(m => ({ default: m.PaymentVoucherManager })));
const ExpenseManager = lazy(() => import('../components/finance/ExpenseManager').then(m => ({ default: m.ExpenseManager })));
const PettyCashManager = lazy(() => import('../components/finance/PettyCashManager').then(m => ({ default: m.PettyCashManager })));
const FundTransferManager = lazy(() => import('../components/finance/FundTransferManager').then(m => ({ default: m.FundTransferManager })));
const JournalEntryViewer = lazy(() => import('../components/finance/JournalEntryViewerEnhanced').then(m => ({ default: m.JournalEntryViewerEnhanced })));
const AccountLedger = lazy(() => import('../components/finance/AccountLedger').then(m => ({ default: m.AccountLedger })));
const PartyLedger = lazy(() => import('../components/finance/PartyLedger'));
const BankLedger = lazy(() => import('../components/finance/BankLedger'));
const FinancialReports = lazy(() => import('../components/finance/FinancialReports').then(m => ({ default: m.FinancialReports })));
const ReceivablesManager = lazy(() => import('../components/finance/ReceivablesManager').then(m => ({ default: m.ReceivablesManager })));
const PayablesManager = lazy(() => import('../components/finance/PayablesManager').then(m => ({ default: m.PayablesManager })));
const OutstandingSummary = lazy(() => import('../components/finance/OutstandingSummary'));
const AgeingReport = lazy(() => import('./reports/AgeingReport').then(m => ({ default: m.AgeingReport })));
const BankReconciliation = lazy(() => import('../components/finance/BankReconciliationEnhanced').then(m => ({ default: m.BankReconciliationEnhanced })));
const ChartOfAccountsManager = lazy(() => import('../components/finance/ChartOfAccountsManager').then(m => ({ default: m.ChartOfAccountsManager })));
const SuppliersManager = lazy(() => import('../components/finance/SuppliersManager').then(m => ({ default: m.SuppliersManager })));
const BankAccountsManager = lazy(() => import('../components/finance/BankAccountsManager').then(m => ({ default: m.BankAccountsManager })));
const TaxReports = lazy(() => import('../components/finance/TaxReports').then(m => ({ default: m.TaxReports })));
const CAReports = lazy(() => import('../components/finance/CAReports').then(m => ({ default: m.CAReports })));
const GeneralJournalEntry = lazy(() => import('../components/finance/GeneralJournalEntry').then(m => ({ default: m.GeneralJournalEntry })));
const IntegrityMonitor = lazy(() => import('../components/finance/IntegrityMonitor').then(m => ({ default: m.IntegrityMonitor })));

type FinanceTab =
  | 'purchase' | 'receipt' | 'payment' | 'journal' | 'contra' | 'expenses' | 'petty_cash'
  | 'ledger' | 'journal_register' | 'bank_ledger' | 'party_ledger' | 'bank_recon'
  | 'trial_balance' | 'pnl' | 'balance_sheet' | 'receivables' | 'payables' | 'ageing' | 'tax' | 'ca_reports' | 'integrity_monitor'
  | 'coa' | 'customers' | 'suppliers' | 'products' | 'banks';

interface MenuItem {
  id: FinanceTab;
  label: string;
  shortcut?: string;
}

interface MenuGroup {
  label: string;
  items: MenuItem[];
  collapsible?: boolean;
}

const getFinanceMenu = (t: Record<string, Record<string, string>>): MenuGroup[] => [
  {
    label: t.finance.vouchers,
    items: [
      { id: 'purchase', label: t.finance.purchase, shortcut: 'F9' },
      { id: 'receipt', label: t.finance.receipt, shortcut: 'F6' },
      { id: 'payment', label: t.finance.payment, shortcut: 'F5' },
      { id: 'journal', label: t.finance.journal, shortcut: 'F7' },
      { id: 'contra', label: t.finance.contra, shortcut: 'F4' },
      { id: 'expenses', label: t.finance.expenses, shortcut: 'F8' },
      { id: 'petty_cash', label: t.finance.pettyCash },
    ]
  },
  {
    label: t.finance.books,
    items: [
      { id: 'ledger', label: t.finance.ledger, shortcut: 'Ctrl+L' },
      { id: 'journal_register', label: t.finance.journalRegister, shortcut: 'Ctrl+J' },
      { id: 'bank_ledger', label: t.finance.bankLedger },
      { id: 'party_ledger', label: t.finance.partyLedger },
      { id: 'bank_recon', label: t.finance.bankReconciliation },
    ]
  },
  {
    label: t.finance.reports,
    collapsible: true,
    items: [
      { id: 'ca_reports', label: '📊 ' + t.finance.caReports, shortcut: 'Ctrl+R' },
      { id: 'trial_balance', label: t.finance.trialBalance },
      { id: 'pnl', label: t.finance.profitLoss },
      { id: 'balance_sheet', label: t.finance.balanceSheet },
      { id: 'receivables', label: t.finance.receivables },
      { id: 'payables', label: t.finance.payables },
      { id: 'ageing', label: t.finance.ageing },
      { id: 'tax', label: t.finance.taxReports },
      { id: 'integrity_monitor', label: 'Integrity Monitor' },
    ]
  },
  {
    label: t.finance.masters,
    collapsible: true,
    items: [
      { id: 'coa', label: t.finance.chartOfAccounts },
      { id: 'suppliers', label: t.finance.suppliers },
      { id: 'banks', label: t.finance.banks },
    ]
  }
];

function FinanceContent() {
  const { profile } = useAuth();
  const { t } = useLanguage();
  const { dateRange } = useFinance();
  const { navigationData, clearNavigationData } = useNavigation();
  const [activeTab, setActiveTab] = useState<FinanceTab>('purchase');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(isMobile);
  const [editJournalEntryId, setEditJournalEntryId] = useState<string | null>(null);
  const [payInvoice, setPayInvoice] = useState<{ id: string; invoice_number: string; supplier_id: string; balance_amount: number } | null>(null);
  const [focusExpenseId, setFocusExpenseId] = useState<string | null>(null);
  const [focusPettyCashId, setFocusPettyCashId] = useState<string | null>(null);
  const canManage = profile?.role === 'admin' || profile?.role === 'accounts';

  const handlePayInvoice = (invoice: { id: string; invoice_number: string; supplier_id: string; balance_amount: number }) => {
    setPayInvoice(invoice);
    setActiveTab('payment');
  };

  const handleEditJournalEntry = (entryId: string) => {
    setEditJournalEntryId(entryId);
    setActiveTab('journal');
  };

  const financeMenu = useMemo(() => {
    if (!t || !t.finance) return [];
    return getFinanceMenu(t);
  }, [t]);

  const toggleGroup = (groupLabel: string) => {
    setCollapsedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupLabel)) {
        newSet.delete(groupLabel);
      } else {
        newSet.add(groupLabel);
      }
      return newSet;
    });
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      if (e.key === 'F2') {
        e.preventDefault();
        const input = document.querySelector('input[type="date"]') as HTMLInputElement;
        if (input) input.focus();
      } else if (e.key === 'F4') {
        e.preventDefault();
        setActiveTab('contra');
      } else if (e.key === 'F5') {
        e.preventDefault();
        setActiveTab('payment');
      } else if (e.key === 'F6') {
        e.preventDefault();
        setActiveTab('receipt');
      } else if (e.key === 'F7') {
        e.preventDefault();
        setActiveTab('journal');
      } else if (e.key === 'F8') {
        e.preventDefault();
        setActiveTab('expenses');
      } else if (e.key === 'F9') {
        e.preventDefault();
        setActiveTab('purchase');
      } else if (e.key === 'F10') {
        e.preventDefault();
        // Navigate to Sales page instead
        window.location.hash = 'sales';
      } else if (e.ctrlKey && e.key === 'l') {
        e.preventDefault();
        setActiveTab('ledger');
      } else if (e.ctrlKey && e.key === 'j') {
        e.preventDefault();
        setActiveTab('journal_register');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!navigationData?.sourceType || !navigationData?.sourceId) return;

    if (navigationData.sourceType === 'expense') {
      setActiveTab('expenses');
      setFocusExpenseId(String(navigationData.sourceId));
      setFocusPettyCashId(null);
      clearNavigationData();
      return;
    }

    if (navigationData.sourceType === 'petty_cash') {
      setActiveTab('petty_cash');
      setFocusPettyCashId(String(navigationData.sourceId));
      setFocusExpenseId(null);
      clearNavigationData();
    }
  }, [navigationData, clearNavigationData]);

  const renderContent = () => {
    switch (activeTab) {
      case 'purchase':
        return <PurchaseInvoiceManager canManage={canManage} onPayInvoice={handlePayInvoice} />;
      case 'receipt':
        return <ReceiptVoucherManager canManage={canManage} />;
      case 'payment':
        return <PaymentVoucherManager canManage={canManage} prefillInvoice={payInvoice} onPrefillConsumed={() => setPayInvoice(null)} onViewInvoice={() => setActiveTab('purchase')} />;
      case 'journal':
        return <GeneralJournalEntry
          canManage={canManage}
          onNavigateToLedger={() => setActiveTab('ledger')}
          initialEditEntryId={editJournalEntryId}
          onEditComplete={() => setEditJournalEntryId(null)}
        />;
      case 'contra':
        return <FundTransferManager canManage={canManage} />;
      case 'expenses':
        return (
          <ExpenseManager
            canManage={canManage}
            initialViewExpenseId={focusExpenseId}
            onInitialViewHandled={() => setFocusExpenseId(null)}
          />
        );
      case 'petty_cash':
        return (
          <PettyCashManager
            canManage={canManage}
            onNavigateToFundTransfer={() => setActiveTab('contra')}
            initialViewTransactionId={focusPettyCashId}
            onInitialViewHandled={() => setFocusPettyCashId(null)}
          />
        );
      case 'ledger':
        return <AccountLedger />;
      case 'journal_register':
        return <JournalEntryViewer canManage={canManage} onEditEntry={handleEditJournalEntry} />;
      case 'bank_ledger':
        return <BankLedger />;
      case 'party_ledger':
        return <PartyLedger />;
      case 'bank_recon':
        return <BankReconciliation canManage={canManage} />;
      case 'trial_balance':
        return <FinancialReports initialReport="trial_balance" />;
      case 'pnl':
        return <FinancialReports initialReport="pnl" />;
      case 'balance_sheet':
        return <FinancialReports initialReport="balance_sheet" />;
      case 'receivables':
        return <ReceivablesManager canManage={canManage} />;
      case 'payables':
        return <PayablesManager canManage={canManage} />;
      case 'ageing':
        return <AgeingReport />;
      case 'tax':
        return <TaxReports />;
      case 'ca_reports':
        return <CAReports />;
      case 'integrity_monitor':
        return <IntegrityMonitor />;
      case 'coa':
        return <ChartOfAccountsManager canManage={canManage} />;
      case 'suppliers':
        return <SuppliersManager canManage={canManage} />;
      case 'banks':
        return <BankAccountsManager canManage={canManage} />;
      default:
        return <div className="text-center p-8 text-gray-500">{t?.common?.noData || 'No data available'}</div>;
    }
  };

  return (
    <Layout>
      <div className="flex h-screen bg-gray-50">
        {/* Left Sidebar - Compact Menu */}
        {!sidebarCollapsed && (
          <div className="fixed inset-0 z-40 bg-black/30 md:hidden" onClick={() => setSidebarCollapsed(true)} />
        )}
        <div className={`fixed inset-y-0 left-0 z-50 w-48 bg-white border-r border-gray-200 flex flex-col md:relative md:z-auto transition-transform duration-300 ${sidebarCollapsed ? '-translate-x-full md:translate-x-0' : 'translate-x-0'}`}>
            {/* Menu Groups */}
            <div className="flex-1 overflow-y-auto">
              {financeMenu.map((group, groupIdx) => {
                const isCollapsed = collapsedGroups.has(group.label);
                const isCollapsible = group.collapsible;

                return (
                  <div key={group.label} className={groupIdx > 0 ? 'border-t border-gray-200' : ''}>
                    {isCollapsible ? (
                      <button
                        onClick={() => toggleGroup(group.label)}
                        className="w-full px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider flex items-center justify-between hover:bg-gray-50"
                      >
                        <span>{group.label}</span>
                        {isCollapsed ? (
                          <ChevronRight className="w-3 h-3" />
                        ) : (
                          <ChevronDown className="w-3 h-3" />
                        )}
                      </button>
                    ) : (
                      <div className="px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                        {group.label}
                      </div>
                    )}

                    {!isCollapsed && (
                      <div>
                        {group.items.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => {
                              setActiveTab(item.id);
                              if (window.innerWidth < 768) setSidebarCollapsed(true);
                            }}
                            className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                              activeTab === item.id
                                ? 'bg-blue-50 text-blue-700 font-medium border-l-2 border-blue-600'
                                : 'text-gray-700 hover:bg-gray-50 border-l-2 border-transparent'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span>{item.label}</span>
                              {item.shortcut && (
                                <span className="text-[10px] text-gray-400">{item.shortcut}</span>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top Bar */}
          <div className="bg-white border-b border-gray-200 px-3 md:px-6 py-3 flex items-center gap-3">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-1.5 hover:bg-gray-100 rounded transition-colors"
              title={sidebarCollapsed ? 'Show Menu' : 'Hide Menu'}
            >
              {sidebarCollapsed ? <Menu className="w-5 h-5 text-gray-600" /> : <X className="w-5 h-5 text-gray-600" />}
            </button>
            <h1 className="text-base md:text-lg font-semibold text-gray-900 truncate">
              <span className="hidden md:inline">{t.finance.title}</span>
              <span className="md:hidden">
                {financeMenu.flatMap(g => g.items).find(i => i.id === activeTab)?.label ?? t.finance.title}
              </span>
            </h1>
            <span className="text-xs text-gray-400 ml-2 hidden md:inline">
              {dateRange.startDate} to {dateRange.endDate}
            </span>
          </div>

          {/* Content Area - Pure White Background */}
          <div className="flex-1 overflow-auto bg-white">
            <div className="p-3 md:p-6">
              <Suspense fallback={
                <div className="flex items-center justify-center py-12">
                  <Loader className="w-6 h-6 animate-spin text-blue-600" />
                </div>
              }>
                {renderContent()}
              </Suspense>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

export function Finance() {
  return <FinanceContent />;
}
