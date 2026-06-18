import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, ShieldCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type IntegrityKey =
  | 'unbalanced_journals'
  | 'duplicate_postings'
  | 'orphan_lines'
  | 'missing_petty_cash_links'
  | 'negative_cash_anomalies';

interface IntegrityMetric {
  key: IntegrityKey;
  label: string;
  viewName: string;
  count: number;
}

const INITIAL_METRICS: IntegrityMetric[] = [
  { key: 'unbalanced_journals', label: 'Unbalanced Journals', viewName: 'unbalanced_journal_entries', count: 0 },
  { key: 'duplicate_postings', label: 'Duplicate Postings', viewName: 'duplicate_postings', count: 0 },
  { key: 'orphan_lines', label: 'Orphan Lines', viewName: 'orphan_journal_lines', count: 0 },
  { key: 'missing_petty_cash_links', label: 'Missing Petty Cash Links', viewName: 'missing_petty_cash_links', count: 0 },
  { key: 'negative_cash_anomalies', label: 'Negative Cash Anomalies', viewName: 'negative_cash_anomalies', count: 0 },
];

export function IntegrityMonitor() {
  const [metrics, setMetrics] = useState<IntegrityMetric[]>(INITIAL_METRICS);
  const [loading, setLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const results = await Promise.all(
        INITIAL_METRICS.map(async metric => {
          const { count, error: queryError } = await supabase
            .from(metric.viewName)
            .select('*', { count: 'exact', head: true });

          if (queryError) {
            throw new Error(`Failed loading ${metric.label}: ${queryError.message}`);
          }

          return { ...metric, count: count ?? 0 };
        })
      );

      setMetrics(results);
      setLastRefreshed(new Date().toISOString());
    } catch (err: any) {
      console.error('Error loading integrity monitor:', err);
      setError(err?.message || 'Failed to load integrity checks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Integrity Monitor</h2>
          <p className="text-sm text-gray-500">Read-only finance integrity checks.</p>
        </div>
        <button
          onClick={loadMetrics}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Check</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Count</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {metrics.map(metric => {
              const hasIssue = metric.count > 0;
              return (
                <tr key={metric.key}>
                  <td className="px-4 py-3 text-sm text-gray-900">{metric.label}</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">{metric.count}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${hasIssue ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'}`}>
                      {hasIssue ? <AlertTriangle className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
                      {hasIssue ? 'Issue detected' : 'OK'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {lastRefreshed && (
        <p className="text-xs text-gray-500">Last refreshed: {new Date(lastRefreshed).toLocaleString()}</p>
      )}
    </div>
  );
}
