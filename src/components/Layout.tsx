import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useNavigation } from '../contexts/NavigationContext';
import { useFinance } from '../contexts/FinanceContext';
import { NotificationDropdown } from './NotificationDropdown';
import { formatDate } from '../utils/dateFormat';
import {
  LayoutDashboard, Package, Boxes, Warehouse, Users, CircleUser as UserCircle,
  ShoppingCart, DollarSign, Settings, LogOut, Menu, X, Globe, Truck, Zap,
  CheckSquare, FileText, TrendingUp, ClipboardList, Calendar, Calculator,
  BarChart2, Tags,
} from 'lucide-react';
import logo from '../assets/Untitled-1.svg';

export interface Quote {
  content: string;
  author: string;
}

export const fallbackQuotes: Quote[] = [
  { content: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
  { content: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { content: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
  { content: "Excellence is not a skill, it's an attitude.", author: "Ralph Marston" },
  { content: "Quality is not an act, it is a habit.", author: "Aristotle" },
  { content: "The best time to plant a tree was 20 years ago. The second best time is now.", author: "Chinese Proverb" },
  { content: "Success is the sum of small efforts repeated day in and day out.", author: "Robert Collier" },
  { content: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
  { content: "The future depends on what you do today.", author: "Mahatma Gandhi" },
  { content: "Strive not to be a success, but rather to be of value.", author: "Albert Einstein" },
  { content: "The harder you work for something, the greater you'll feel when you achieve it.", author: "Unknown" },
  { content: "Dream bigger. Do bigger.", author: "Unknown" },
  { content: "Don't stop when you're tired. Stop when you're done.", author: "Unknown" },
  { content: "Wake up with determination. Go to bed with satisfaction.", author: "Unknown" },
  { content: "Do something today that your future self will thank you for.", author: "Sean Patrick Flanery" },
  { content: "Little things make big days.", author: "Unknown" },
  { content: "It's going to be hard, but hard does not mean impossible.", author: "Unknown" },
  { content: "Don't wait for opportunity. Create it.", author: "Unknown" },
  { content: "Sometimes we're tested not to show our weaknesses, but to discover our strengths.", author: "Unknown" },
  { content: "The key to success is to focus on goals, not obstacles.", author: "Unknown" },
  { content: "Dream it. Believe it. Build it.", author: "Unknown" },
  { content: "Success doesn't just find you. You have to go out and get it.", author: "Unknown" },
  { content: "Great things never come from comfort zones.", author: "Unknown" },
  { content: "Opportunities don't happen. You create them.", author: "Chris Grosser" },
  { content: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { content: "Focus on being productive instead of busy.", author: "Tim Ferriss" },
  { content: "Action is the foundational key to all success.", author: "Pablo Picasso" },
  { content: "Your limitation—it's only your imagination.", author: "Unknown" },
  { content: "Push yourself, because no one else is going to do it for you.", author: "Unknown" },
  { content: "Sometimes later becomes never. Do it now.", author: "Unknown" },
];

export const getRandomFallbackQuote = (): Quote => {
  const randomIndex = Math.floor(Math.random() * fallbackQuotes.length);
  return fallbackQuotes[randomIndex];
};

interface LayoutProps {
  children: React.ReactNode;
}

interface MenuItem {
  id: string;
  label: string;
  icon: React.ElementType;
}

interface MenuGroup {
  label: string;
  items: MenuItem[];
}

// Tooltip for collapsed sidebar
function NavTooltip({ label }: { label: string }) {
  return (
    <span className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-[60]">
      {label}
    </span>
  );
}

export function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const datePickerRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { profile, accessibleModules, signOut } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const { currentPage, setCurrentPage, sidebarCollapsed, setSidebarCollapsed } = useNavigation();
  const { dateRange, setDateRange } = useFinance();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) {
        setDatePickerOpen(false);
      }
    };
    if (datePickerOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [datePickerOpen]);

  // Auto-collapse sidebar for specific pages
  const autoCollapsiblePages = ['crm', 'command-center', 'finance'];
  useEffect(() => {
    if (autoCollapsiblePages.includes(currentPage) && !sidebarCollapsed) {
      setSidebarCollapsed(true);
    }
  }, [currentPage]);

  const isCollapsed = sidebarCollapsed && !hoverExpanded;

  const handleSidebarMouseEnter = () => {
    if (!sidebarCollapsed) return;
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => setHoverExpanded(true), 80);
  };

  const handleSidebarMouseLeave = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => setHoverExpanded(false), 120);
  };

  // All menu items — order/IDs unchanged
  const allItems: MenuItem[] = [
    { id: 'dashboard',           label: t('nav.dashboard'),           icon: LayoutDashboard },
    { id: 'crm',                 label: t('nav.crm'),                  icon: UserCircle },
    { id: 'customers',           label: t('nav.customers'),            icon: Users },
    { id: 'sales-orders',        label: t('nav.salesOrders'),          icon: FileText },
    { id: 'delivery-challan',    label: t('nav.deliveryChallan'),      icon: Truck },
    { id: 'sales',               label: t('nav.sales'),                icon: ShoppingCart },
    { id: 'products',            label: t('nav.products'),             icon: Package },
    { id: 'batches',             label: t('nav.batches'),              icon: Boxes },
    { id: 'stock',               label: t('nav.stock'),                icon: Warehouse },
    { id: 'inventory',           label: t('nav.inventory'),            icon: Warehouse },
    { id: 'purchase-orders',     label: t('nav.purchaseOrders'),       icon: ClipboardList },
    { id: 'import-requirements', label: t('nav.importRequirements'),   icon: TrendingUp },
    { id: 'import-containers',   label: t('nav.importContainers'),     icon: Package },
    { id: 'finance',             label: t('nav.finance'),              icon: DollarSign },
    { id: 'price-calculator',    label: 'Price Calculator',            icon: Calculator },
    { id: 'pricing-dashboard',   label: 'Pricing Overview',            icon: Tags },
    { id: 'sourcing-outbox',     label: 'Anvi Sourcing',               icon: Tags },
    { id: 'pricing-worksheet',   label: 'Kunal Pricing',               icon: Tags },
    { id: 'pricing-ledger',      label: 'Price History',               icon: Tags },
    // Hidden from daily users — routes stay live for admin/debug.
    // { id: 'price-requests', ... }, { id: 'pricing-desk', ... }, { id: 'pricing-parser-review', ... }
    { id: 'reports',             label: 'Reports',                    icon: BarChart2 },
    { id: 'tasks',               label: t('nav.tasks'),                icon: CheckSquare },
    { id: 'command-center',      label: t('nav.commandCenter'),        icon: Zap },
    { id: 'settings',            label: t('nav.settings'),             icon: Settings },
  ];

  const groups: MenuGroup[] = [
    { label: 'Main',      items: allItems.filter(i => ['dashboard', 'crm', 'customers'].includes(i.id)) },
    { label: 'Sales',     items: allItems.filter(i => ['sales-orders', 'delivery-challan', 'sales'].includes(i.id)) },
    { label: 'Operations',items: allItems.filter(i => ['products', 'batches', 'stock', 'inventory'].includes(i.id)) },
    { label: 'Purchases', items: allItems.filter(i => ['purchase-orders', 'import-requirements', 'import-containers'].includes(i.id)) },
    { label: 'Finance',   items: allItems.filter(i => ['finance', 'price-calculator'].includes(i.id)) },
    { label: 'Pricing',   items: allItems.filter(i => ['pricing-dashboard', 'sourcing-outbox', 'pricing-worksheet', 'pricing-ledger'].includes(i.id)) },
    { label: 'Reports',   items: allItems.filter(i => ['reports'].includes(i.id)) },
    { label: 'System',    items: allItems.filter(i => ['tasks', 'command-center', 'settings'].includes(i.id)) },
  ];

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'id' : 'en');
  };

  const navigate = (id: string) => {
    setCurrentPage(id);
    setSidebarOpen(false);
    setHoverExpanded(false);
  };

  const mainPadding = sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-[200px]';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-gray-900 bg-opacity-50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        ref={sidebarRef}
        onMouseEnter={handleSidebarMouseEnter}
        onMouseLeave={handleSidebarMouseLeave}
        className={`fixed top-0 left-0 z-30 h-full bg-white border-r border-gray-200 flex flex-col
          transform transition-[width,transform] duration-200 ease-in-out
          lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          ${isCollapsed ? 'w-16' : 'w-[200px]'}`}
      >
        {/* Company header */}
        <div className={`flex items-center border-b border-gray-200 flex-shrink-0 ${isCollapsed ? 'justify-center px-2 py-2' : 'gap-1.5 px-2.5 py-2'}`} style={{ minHeight: 48 }}>
          <button
            type="button"
            onClick={() => navigate('dashboard')}
            className="flex flex-shrink-0 items-center rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            title="Dashboard"
            aria-label="Go to Dashboard"
          >
            <img src={logo} alt="Logo" className="flex-shrink-0" style={{ width: 28, height: 28 }} />
          </button>
          {!isCollapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-gray-900 truncate leading-tight">PT. SHUBHAM ANZEN PHARMA JAYA</p>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1 rounded hover:bg-gray-100 ml-auto"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Nav groups */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-0.5">
          {groups.map((group, gi) => {
            const visibleItems = group.items.filter(item => accessibleModules.has(item.id));
            if (visibleItems.length === 0) return null;

            return (
              <div key={group.label} className={gi > 0 ? 'mt-px' : ''}>
                {/* Group label — hidden when collapsed */}
                {!isCollapsed && (
                  <p className="px-2.5 pt-1 pb-px text-[9px] font-semibold text-gray-400 uppercase tracking-wider">
                    {group.label}
                  </p>
                )}
                {/* Collapsed: tiny gap line between groups */}
                {isCollapsed && gi > 0 && (
                  <div className="mx-2.5 my-px border-t border-gray-100" />
                )}

                <div className="px-1.5">
                  {visibleItems.map(item => {
                    const Icon = item.icon;
                    const isActive = currentPage === item.id;
                    return (
                      <a
                        key={item.id}
                        href={`/${item.id}`}
                        onClick={e => { e.preventDefault(); navigate(item.id); }}
                        className={`relative group flex items-center rounded-md transition-colors duration-100
                          ${isCollapsed ? 'justify-center px-0' : 'gap-2 px-2'}
                          ${isActive
                            ? 'bg-blue-50 text-blue-600'
                            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                          }`}
                        style={{ height: 28 }}
                      >
                        {/* Active left bar */}
                        {isActive && (
                          <span className="absolute left-0 top-1 bottom-1 w-0.5 bg-blue-500 rounded-r" />
                        )}
                        <Icon className="flex-shrink-0" style={{ width: 15, height: 15 }} />
                        {!isCollapsed && (
                          <span className="text-xs font-medium truncate">{item.label}</span>
                        )}
                        {/* Tooltip — only when truly collapsed (not hover-expanded) */}
                        {sidebarCollapsed && !hoverExpanded && (
                          <NavTooltip label={item.label} />
                        )}
                      </a>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* User footer */}
        {!isCollapsed && profile && (
          <div className="flex-shrink-0 border-t border-gray-200 px-2.5 py-1.5">
            <p className="text-xs font-medium text-gray-700 truncate">{profile.full_name || profile.username}</p>
            <p className="text-[11px] text-gray-400 capitalize truncate">{profile.role}</p>
          </div>
        )}
      </aside>

      {/* Main content */}
      <div className={`transition-[padding] duration-200 ${mainPadding}`}>
        <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-1.5 rounded hover:bg-gray-100"
              >
                <Menu className="w-5 h-5" />
              </button>
              <button
                onClick={() => { setSidebarCollapsed(!sidebarCollapsed); setHoverExpanded(false); }}
                className="hidden lg:block p-1.5 rounded hover:bg-gray-100"
                title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                <Menu className="w-5 h-5" />
              </button>
            </div>

            {/* Desktop date range */}
            <div className="flex-1 hidden md:flex items-center justify-center px-2">
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1">
                <Calendar className="w-3.5 h-3.5 text-gray-500" />
                <input
                  type="date"
                  value={dateRange.startDate}
                  onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
                  className="px-1.5 py-0.5 text-xs border border-gray-200 rounded bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
                <span className="text-xs text-gray-400">to</span>
                <input
                  type="date"
                  value={dateRange.endDate}
                  onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
                  className="px-1.5 py-0.5 text-xs border border-gray-200 rounded bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {/* Mobile date range toggle */}
            <div className="md:hidden relative" ref={datePickerRef}>
              <button
                onClick={() => setDatePickerOpen(!datePickerOpen)}
                className="p-1.5 rounded hover:bg-gray-100 flex items-center gap-1 text-gray-600"
              >
                <Calendar className="w-4 h-4" />
              </button>
              {datePickerOpen && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-50 w-64">
                  <p className="text-xs font-medium text-gray-600 mb-2">Date Range Filter</p>
                  <div className="space-y-2">
                    <div>
                      <label className="text-xs text-gray-500">From</label>
                      <input
                        type="date"
                        value={dateRange.startDate}
                        onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
                        className="w-full mt-0.5 px-2 py-1.5 text-xs border border-gray-200 rounded bg-white focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">To</label>
                      <input
                        type="date"
                        value={dateRange.endDate}
                        onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
                        className="w-full mt-0.5 px-2 py-1.5 text-xs border border-gray-200 rounded bg-white focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => setDatePickerOpen(false)}
                    className="mt-2 w-full text-xs bg-blue-600 text-white py-1.5 rounded hover:bg-blue-700"
                  >
                    Apply
                  </button>
                </div>
              )}
            </div>

            <div className="hidden lg:flex items-center gap-1.5 mr-3 text-xs text-gray-500">
              <Calendar className="w-3.5 h-3.5" />
              <span>{formatDate(new Date())}</span>
            </div>

            <div className="flex items-center gap-2">
              <NotificationDropdown />

              <button
                onClick={toggleLanguage}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded hover:bg-gray-100"
              >
                <Globe className="w-4 h-4 text-gray-600" />
                <span className="text-xs font-medium text-gray-700 uppercase">{language}</span>
              </button>

              <button
                onClick={() => signOut()}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded hover:bg-gray-100 text-gray-700"
              >
                <LogOut className="w-4 h-4" />
                <span className="text-xs font-medium">{t('auth.logout')}</span>
              </button>
            </div>
          </div>
        </header>

        <main className="p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
