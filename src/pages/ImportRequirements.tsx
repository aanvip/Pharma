import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Layout } from '../components/Layout';
import { useLanguage } from '../contexts/LanguageContext';
import { AlertTriangle, TrendingUp, Package, Calendar, FileText } from 'lucide-react';
import { ImportRequirementsTable } from '../components/ImportRequirementsTable';
import { showToast } from '../components/ToastNotification';
import { useAuth } from '../contexts/AuthContext';

interface ImportRequirement {
  id: string;
  product_id: string;
  sales_order_id: string;
  customer_id: string;
  required_quantity: number;
  shortage_quantity: number;
  required_delivery_date: string;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'ordered' | 'partially_received' | 'received' | 'cancelled';
  lead_time_days: number;
  notes?: string;
  created_at: string;
  products?: { product_name: string; product_code: string };
  sales_orders?: { so_number: string };
  customers?: { company_name: string };
}

interface StockInfo {
  product_id: string;
  total_stock: number;
  reserved_stock: number;
  free_stock: number;
}

export default function ImportRequirements() {
  const { profile } = useAuth();
  const { t } = useLanguage();
  const [requirements, setRequirements] = useState<ImportRequirement[]>([]);
  const [stockInfo, setStockInfo] = useState<Record<string, StockInfo>>({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [priorityFilter, setPriorityFilter] = useState('all');

  const canEdit = true;

  useEffect(() => {
    fetchImportRequirements();
  }, [statusFilter]);

  const fetchImportRequirements = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('import_requirements')
        .select('*, products(product_name, product_code), sales_orders(so_number), customers(company_name)')
        .order('priority', { ascending: true })
        .order('required_delivery_date', { ascending: true });

      if (statusFilter !== 'all') query = query.eq('status', statusFilter);

      const { data, error } = await query;
      if (error) throw error;
      setRequirements(data || []);

      const productIds = [...new Set(data?.map(r => r.product_id))];
      if (productIds.length > 0) await fetchStockInfo(productIds);
    } catch (error: any) {
      showToast({ type: 'error', title: t('common.error'), message: 'Failed to load import requirements' });
    } finally {
      setLoading(false);
    }
  };

  const fetchStockInfo = async (productIds: string[]) => {
    try {
      const stockMap: Record<string, StockInfo> = {};
      for (const productId of productIds) {
        const { data: batches } = await supabase.from('batches').select('current_stock').eq('product_id', productId);
        const totalStock = batches?.reduce((sum, b) => sum + Number(b.current_stock), 0) || 0;
        const { data: reservations } = await supabase.from('stock_reservations').select('reserved_quantity').eq('product_id', productId).eq('status', 'active');
        const reservedStock = reservations?.reduce((sum, r) => sum + Number(r.reserved_quantity), 0) || 0;
        stockMap[productId] = { product_id: productId, total_stock: totalStock, reserved_stock: reservedStock, free_stock: totalStock - reservedStock };
      }
      setStockInfo(stockMap);
    } catch (error: any) {
      console.error('Error fetching stock info:', error.message);
    }
  };

  const getPriorityBadge = (priority: string) => {
    const config: Record<string, { color: string; label: string }> = {
      high: { color: 'bg-red-100 text-red-800', label: t('importRequirements.highPriority') },
      medium: { color: 'bg-yellow-100 text-yellow-800', label: t('importRequirements.mediumPriority') },
      low: { color: 'bg-green-100 text-green-800', label: t('importRequirements.lowPriority') },
    };
    const { color, label } = config[priority] || config.medium;
    return <span className={`px-2 py-1 text-xs font-medium rounded-full ${color}`}>{label}</span>;
  };

  const filteredRequirements = requirements.filter(req => {
    if (priorityFilter === 'all') return true;
    return req.priority === priorityFilter;
  });

  const stats = {
    total: requirements.length,
    high_priority: requirements.filter(r => r.priority === 'high' && r.status === 'pending').length,
    pending: requirements.filter(r => r.status === 'pending').length,
    ordered: requirements.filter(r => r.status === 'ordered').length,
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{t('importRequirements.title')}</h1>
          <p className="text-gray-600 mt-1 text-sm">{t('importRequirements.subtitle')}</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white p-3 sm:p-4 rounded-lg shadow">
            <div className="flex items-center gap-2 sm:gap-3">
              <Package className="w-5 h-5 text-blue-600 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-xs sm:text-sm text-gray-600 truncate">{t('importRequirements.totalRequirements')}</div>
                <div className="text-xl sm:text-2xl font-bold text-gray-900">{stats.total}</div>
              </div>
            </div>
          </div>
          <div className="bg-white p-3 sm:p-4 rounded-lg shadow">
            <div className="flex items-center gap-2 sm:gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-xs sm:text-sm text-gray-600 truncate">{t('importRequirements.highPriority')}</div>
                <div className="text-xl sm:text-2xl font-bold text-red-600">{stats.high_priority}</div>
              </div>
            </div>
          </div>
          <div className="bg-white p-3 sm:p-4 rounded-lg shadow">
            <div className="flex items-center gap-2 sm:gap-3">
              <Calendar className="w-5 h-5 text-yellow-600 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-xs sm:text-sm text-gray-600 truncate">{t('common.pending')}</div>
                <div className="text-xl sm:text-2xl font-bold text-yellow-600">{stats.pending}</div>
              </div>
            </div>
          </div>
          <div className="bg-white p-3 sm:p-4 rounded-lg shadow">
            <div className="flex items-center gap-2 sm:gap-3">
              <TrendingUp className="w-5 h-5 text-green-600 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-xs sm:text-sm text-gray-600 truncate">{t('importRequirements.ordered')}</div>
                <div className="text-xl sm:text-2xl font-bold text-green-600">{stats.ordered}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Filters + Table */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b flex flex-wrap gap-3 items-center">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="all">{t('importRequirements.allStatus')}</option>
              <option value="pending">{t('common.pending')}</option>
              <option value="ordered">{t('importRequirements.ordered')}</option>
              <option value="partially_received">{t('importRequirements.partiallyReceived')}</option>
              <option value="received">{t('importRequirements.received')}</option>
              <option value="cancelled">{t('common.cancelled')}</option>
            </select>

            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="all">{t('importRequirements.allPriorities')}</option>
              <option value="high">{t('importRequirements.highPriorityFilter')}</option>
              <option value="medium">{t('importRequirements.mediumPriority')}</option>
              <option value="low">{t('importRequirements.lowPriority')}</option>
            </select>

            {canEdit && (
              <div className="ml-auto text-sm text-gray-600 flex items-center gap-2">
                <Package className="w-4 h-4" />
                {t('importRequirements.clickToEdit')}
              </div>
            )}
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-500">{t('common.loading')}</div>
          ) : (
            <div className="overflow-x-auto">
              <ImportRequirementsTable
                requirements={filteredRequirements}
                onRefresh={fetchImportRequirements}
                canEdit={canEdit}
              />
            </div>
          )}
        </div>

        {/* Info box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-medium text-blue-900">{t('importRequirements.aboutTitle')}</h3>
              <p className="text-sm text-blue-700 mt-1">{t('importRequirements.aboutText')}</p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
