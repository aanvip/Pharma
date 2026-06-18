import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { showToast } from './ToastNotification';
import { showConfirm } from './ConfirmDialog';
import { formatDate } from '../utils/dateFormat';
import { Link2, AlertTriangle, ChevronDown, ChevronRight, CheckCircle } from 'lucide-react';

interface DCItem {
  id: string;
  product_id: string;
  quantity: number;
  products?: { product_name: string; product_code: string };
}

interface UnlinkedDC {
  id: string;
  challan_number: string;
  challan_date: string;
  review_status: string | null;
  customers?: { id: string; company_name: string };
  delivery_challan_items?: DCItem[];
}

interface SOOption {
  id: string;
  so_number: string;
  so_date: string;
  status: string;
  matchScore: number;
  sales_order_items?: Array<{ product_id: string; quantity: number; products?: { product_name: string } }>;
}

interface Props {
  onLinked?: () => void;
}

export function UnlinkedDCReview({ onLinked }: Props) {
  const [unlinkedDCs, setUnlinkedDCs] = useState<UnlinkedDC[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDC, setExpandedDC] = useState<string | null>(null);
  const [soOptions, setSoOptions] = useState<Record<string, SOOption[]>>({});
  const [selectedSO, setSelectedSO] = useState<Record<string, string>>({});
  const [linking, setLinking] = useState<string | null>(null);

  const fetchUnlinkedDCs = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('delivery_challans')
        .select(`
          id, challan_number, challan_date, review_status,
          customers ( id, company_name ),
          delivery_challan_items (
            id, product_id, quantity,
            products ( product_name, product_code )
          )
        `)
        .or('sales_order_id.is.null,review_status.eq.needs_review')
        .order('challan_date', { ascending: false });

      if (error) throw error;
      setUnlinkedDCs(data || []);
    } catch (err: any) {
      showToast({ type: 'error', title: 'Error', message: 'Failed to load unlinked DCs' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUnlinkedDCs();
  }, [fetchUnlinkedDCs]);

  const loadSuggestedSOs = async (dc: UnlinkedDC) => {
    if (soOptions[dc.id]) return;
    if (!dc.customers?.id) return;

    try {
      const dcProductIds = (dc.delivery_challan_items || []).map(i => i.product_id);

      const { data, error } = await supabase
        .from('sales_orders')
        .select(`
          id, so_number, so_date, status,
          sales_order_items ( product_id, quantity, products ( product_name ) )
        `)
        .eq('customer_id', dc.customers.id)
        .eq('is_archived', false)
        .not('status', 'in', '("draft","cancelled","rejected")')
        .order('so_date', { ascending: false });

      if (error) throw error;

      const scored: SOOption[] = (data || []).map((so: any) => {
        const soProductIds = (so.sales_order_items || []).map((i: any) => i.product_id);
        const matchCount = dcProductIds.filter(pid => soProductIds.includes(pid)).length;
        const matchScore = dcProductIds.length > 0 ? matchCount / dcProductIds.length : 0;
        return { ...so, matchScore };
      });

      scored.sort((a, b) => b.matchScore - a.matchScore);
      setSoOptions(prev => ({ ...prev, [dc.id]: scored }));
    } catch (err: any) {
      showToast({ type: 'error', title: 'Error', message: 'Failed to load Sales Orders' });
    }
  };

  const handleExpand = (dc: UnlinkedDC) => {
    if (expandedDC === dc.id) {
      setExpandedDC(null);
    } else {
      setExpandedDC(dc.id);
      loadSuggestedSOs(dc);
    }
  };

  const handleLink = async (dcId: string) => {
    const soId = selectedSO[dcId];
    if (!soId) {
      showToast({ type: 'error', title: 'Error', message: 'Please select a Sales Order first' });
      return;
    }

    const soList = soOptions[dcId] || [];
    const so = soList.find(s => s.id === soId);

    if (!await showConfirm({
      title: 'Confirm Link',
      message: `Link this Delivery Challan to Sales Order ${so?.so_number || soId}? This cannot be undone automatically.`,
      variant: 'warning',
      confirmLabel: 'Link',
    })) return;

    setLinking(dcId);
    try {
      const { error } = await supabase
        .from('delivery_challans')
        .update({ sales_order_id: soId, review_status: null, updated_at: new Date().toISOString() })
        .eq('id', dcId);

      if (error) throw error;

      showToast({ type: 'success', title: 'Linked', message: 'Delivery Challan linked to Sales Order successfully.' });
      setExpandedDC(null);
      await fetchUnlinkedDCs();
      onLinked?.();
    } catch (err: any) {
      showToast({ type: 'error', title: 'Error', message: 'Failed to link DC to Sales Order' });
    } finally {
      setLinking(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-3" />
        Loading unlinked Delivery Challans...
      </div>
    );
  }

  if (unlinkedDCs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-500">
        <CheckCircle className="w-12 h-12 text-green-400 mb-3" />
        <p className="text-lg font-medium text-gray-700">All Delivery Challans are linked</p>
        <p className="text-sm mt-1">No unlinked or flagged records found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
        <p className="text-sm text-amber-800">
          <span className="font-semibold">{unlinkedDCs.length} Delivery Challan{unlinkedDCs.length !== 1 ? 's' : ''}</span> need{unlinkedDCs.length === 1 ? 's' : ''} manual review. Expand each record, select the correct Sales Order, then click Link.
        </p>
      </div>

      {unlinkedDCs.map(dc => {
        const isExpanded = expandedDC === dc.id;
        const options = soOptions[dc.id] || [];
        const chosen = selectedSO[dc.id] || '';

        return (
          <div key={dc.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => handleExpand(dc)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                )}
                <div>
                  <span className="font-semibold text-gray-900 text-sm">{dc.challan_number}</span>
                  <span className="mx-2 text-gray-300">|</span>
                  <span className="text-sm text-gray-700">{dc.customers?.company_name}</span>
                  <span className="mx-2 text-gray-300">|</span>
                  <span className="text-sm text-gray-500">{formatDate(dc.challan_date)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {dc.review_status === 'needs_review' && (
                  <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">Needs Review</span>
                )}
                <span className="text-xs text-gray-500">{dc.delivery_challan_items?.length || 0} item(s)</span>
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-gray-100 px-4 py-4 space-y-4">
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">DC Items</h4>
                  <div className="bg-gray-50 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Product</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Qty</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {(dc.delivery_challan_items || []).map(item => (
                          <tr key={item.id}>
                            <td className="px-3 py-2 text-gray-800">
                              {item.products?.product_name || item.product_id}
                              {item.products?.product_code && (
                                <span className="ml-1 text-xs text-gray-400">({item.products.product_code})</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right text-gray-700">{item.quantity}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">
                    Select Sales Order to Link
                    {options.length === 0 && (
                      <span className="ml-2 text-xs font-normal text-gray-400 normal-case">(loading...)</span>
                    )}
                  </h4>

                  {options.length === 0 && (
                    <p className="text-sm text-gray-500 italic">No active Sales Orders found for this customer.</p>
                  )}

                  {options.length > 0 && (
                    <div className="space-y-2">
                      {options.map(so => {
                        const soProductNames = (so.sales_order_items || [])
                          .map(i => i.products?.product_name)
                          .filter(Boolean)
                          .join(', ');
                        const isGoodMatch = so.matchScore >= 0.5;

                        return (
                          <label
                            key={so.id}
                            className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                              chosen === so.id
                                ? 'border-blue-400 bg-blue-50'
                                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`so-${dc.id}`}
                              value={so.id}
                              checked={chosen === so.id}
                              onChange={() => setSelectedSO(prev => ({ ...prev, [dc.id]: so.id }))}
                              className="mt-0.5 flex-shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-gray-900 text-sm">{so.so_number}</span>
                                <span className="text-xs text-gray-500">{formatDate(so.so_date)}</span>
                                <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                                  so.status === 'delivered' ? 'bg-teal-100 text-teal-700'
                                  : so.status === 'pending_delivery' || so.status === 'stock_reserved' ? 'bg-blue-100 text-blue-700'
                                  : 'bg-gray-100 text-gray-600'
                                }`}>{so.status.replace(/_/g, ' ')}</span>
                                {isGoodMatch && (
                                  <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700 font-medium">
                                    {Math.round(so.matchScore * 100)}% match
                                  </span>
                                )}
                              </div>
                              {soProductNames && (
                                <p className="text-xs text-gray-500 mt-1 truncate">Products: {soProductNames}</p>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setExpandedDC(null)}
                    className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLink(dc.id)}
                    disabled={!chosen || linking === dc.id}
                    className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {linking === dc.id ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Link2 className="w-4 h-4" />
                    )}
                    Link to Selected SO
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
