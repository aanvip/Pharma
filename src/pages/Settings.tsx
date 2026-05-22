import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Save, Building2, Mail, DollarSign, Package, Users, Calendar, FileText, Download, Upload, X, CheckCircle, AlertCircle } from 'lucide-react';
import { GmailSettings } from '../components/crm/GmailSettings';
import { GmailVisibilityPanel } from '../components/crm/GmailVisibilityPanel';
import { UserManagement } from '../components/settings/UserManagement';
import { EmailTemplates } from '../components/settings/EmailTemplates';
import { ExtractData } from '../components/settings/ExtractData';
import { SuppliersManager } from '../components/settings/SuppliersManager';
import { formatDate } from '../utils/dateFormat';

interface AppSettings {
  id: string;
  company_name: string;
  company_address: string;
  company_phone: string;
  company_email: string;
  tax_rate: number;
  invoice_prefix: string;
  invoice_start_number: number;
  email_host: string | null;
  email_port: number | null;
  email_username: string | null;
  low_stock_threshold: number;
  expiry_alert_days: number;
  default_language: string;
  financial_year_start: string;
  financial_year_end: string;
  current_financial_year: string;
}

interface UserProfile {
  id: string;
  username?: string;
  email: string;
  full_name: string;
  role: 'admin' | 'manager' | 'accounts' | 'sales' | 'warehouse' | 'auditor_ca';
  language?: string;
  is_active: boolean;
  created_at?: string;
}

export function Settings() {
  const { t } = useLanguage();
  const { profile } = useAuth();

  const getDefaultTab = () => {
    if (profile?.role === 'sales') return 'gmail';
    if (profile?.role === 'warehouse') return 'suppliers';
    if (profile?.role === 'accounts') return 'company';
    return 'company';
  };

  const [activeTab, setActiveTab] = useState<'company' | 'users' | 'suppliers' | 'system' | 'financial' | 'gmail' | 'templates' | 'extract'>(getDefaultTab());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [formData, setFormData] = useState({
    company_name: '',
    company_address: '',
    company_phone: '',
    company_email: '',
    tax_rate: 11,
    invoice_prefix: 'SAPJ',
    invoice_start_number: 1,
    email_host: '',
    email_port: 587,
    email_username: '',
    low_stock_threshold: 100,
    expiry_alert_days: 30,
    default_language: 'en',
    financial_year_start: '2024-01-01',
    financial_year_end: '2024-12-31',
    current_financial_year: '2024',
  });

  useEffect(() => {
    if (profile?.role === 'admin') {
      loadSettings();
      loadUsers();
    } else if (profile?.role === 'accounts') {
      loadSettings();
    } else if (profile?.role === 'warehouse') {
      setLoading(false);
    } else {
      setLoading(false);
    }
  }, [profile]);

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettings(data);
        setFormData({
          company_name: data.company_name || '',
          company_address: data.company_address || '',
          company_phone: data.company_phone || '',
          company_email: data.company_email || '',
          tax_rate: data.tax_rate || 11,
          invoice_prefix: data.invoice_prefix || 'SAPJ',
          invoice_start_number: data.invoice_start_number || 1,
          email_host: data.email_host || '',
          email_port: data.email_port || 587,
          email_username: data.email_username || '',
          low_stock_threshold: data.low_stock_threshold || 100,
          expiry_alert_days: data.expiry_alert_days || 30,
          default_language: data.default_language || 'en',
          financial_year_start: data.financial_year_start || '2024-01-01',
          financial_year_end: data.financial_year_end || '2024-12-31',
          current_financial_year: data.current_financial_year || '2024',
        });
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, email, full_name, role, is_active, created_at, username')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error loading users:', error);
      setUsers([]);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      if (settings) {
        const { error } = await supabase
          .from('app_settings')
          .update({
            ...formData,
            email_host: formData.email_host || null,
            email_username: formData.email_username || null,
          })
          .eq('id', settings.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('app_settings')
          .insert([{
            ...formData,
            email_host: formData.email_host || null,
            email_username: formData.email_username || null,
          }]);

        if (error) throw error;
      }

      alert('Settings saved successfully!');
      loadSettings();
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };


  const handleDownloadBackup = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/backup-export`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) throw new Error('Backup export failed');
      const json = await response.json();
      const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (error) {
      console.error('Backup error:', error);
      alert('Failed to download backup. Please try again.');
    }
  };

  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<{ success: boolean; message: string; imported?: Record<string, number> } | null>(null);
  const [confirmStep, setConfirmStep] = useState<0 | 1 | 2>(0);

  const handleRestoreBackup = async () => {
    if (!restoreFile) return;
    setRestoring(true);
    setRestoreResult(null);
    try {
      const text = await restoreFile.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        setRestoreResult({ success: false, message: 'Invalid JSON file. Please select a valid backup file.' });
        return;
      }
      if (
        typeof payload !== 'object' ||
        payload === null ||
        (payload as Record<string, unknown>)['version'] !== '1.0'
      ) {
        setRestoreResult({ success: false, message: 'Invalid backup version. Only version 1.0 backups are supported.' });
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/backup-import`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!response.ok) {
        setRestoreResult({ success: false, message: json.error ?? 'Import failed. Please try again.' });
      } else {
        setRestoreResult({ success: true, message: 'Backup restored successfully.', imported: json.imported });
      }
    } catch (error) {
      setRestoreResult({ success: false, message: (error as Error).message ?? 'Unexpected error during restore.' });
    } finally {
      setRestoring(false);
      setConfirmStep(0);
    }
  };

  const handleCloseRestoreModal = () => {
    setShowRestoreModal(false);
    setRestoreFile(null);
    setRestoreResult(null);
    setConfirmStep(0);
  };

  const isAdmin = profile?.role === 'admin';
  const isSales = profile?.role === 'sales';
  const isAccountant = profile?.role === 'accounts';
  const isWarehouse = profile?.role === 'warehouse';

  if (!isAdmin && !isSales && !isAccountant && !isWarehouse) {
    return (
      <Layout>
        <div className="text-center py-12">
          <p className="text-xl text-gray-600">You do not have permission to access settings.</p>
          <p className="text-sm text-gray-500 mt-2">Only administrators can view and modify system settings.</p>
        </div>
      </Layout>
    );
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
            <p className="text-gray-600 mt-1">Configure system settings and manage users</p>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowRestoreModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
              >
                <Upload className="w-4 h-4" />
                Restore Backup
              </button>
              <button
                onClick={handleDownloadBackup}
                className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition text-sm font-medium"
              >
                <Download className="w-4 h-4" />
                Download Backup
              </button>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              {(isAdmin || isAccountant) && (
                <button
                  onClick={() => setActiveTab('company')}
                  className={`px-6 py-3 text-sm font-medium border-b-2 transition ${
                    activeTab === 'company'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    Company Profile
                  </div>
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => setActiveTab('users')}
                  className={`px-6 py-3 text-sm font-medium border-b-2 transition ${
                    activeTab === 'users'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Users
                  </div>
                </button>
              )}
              {(isAdmin || isAccountant || isSales || isWarehouse) && (
                <button
                  onClick={() => setActiveTab('suppliers')}
                  className={`px-6 py-3 text-sm font-medium border-b-2 transition ${
                    activeTab === 'suppliers'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    Suppliers
                  </div>
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => setActiveTab('financial')}
                  className={`px-6 py-3 text-sm font-medium border-b-2 transition ${
                    activeTab === 'financial'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Financial Year
                  </div>
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => setActiveTab('system')}
                  className={`px-6 py-3 text-sm font-medium border-b-2 transition ${
                    activeTab === 'system'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    System
                  </div>
                </button>
              )}
              {(isAdmin || isSales) && (
                <button
                  onClick={() => setActiveTab('gmail')}
                  className={`px-6 py-3 text-sm font-medium border-b-2 transition ${
                    activeTab === 'gmail'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    Gmail
                  </div>
                </button>
              )}
              {(isAdmin || isSales) && (
                <button
                  onClick={() => setActiveTab('templates')}
                  className={`px-6 py-3 text-sm font-medium border-b-2 transition ${
                    activeTab === 'templates'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Email Templates
                  </div>
                </button>
              )}
              {(isAdmin || isSales) && (
                <button
                  onClick={() => setActiveTab('extract')}
                  className={`px-6 py-3 text-sm font-medium border-b-2 transition ${
                    activeTab === 'extract'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Download className="w-4 h-4" />
                    Extract Data
                  </div>
                </button>
              )}
            </nav>
          </div>

          <div className="p-6">
            {activeTab === 'gmail' && (
              <div className="space-y-6">
                <GmailSettings />
                <GmailVisibilityPanel />
              </div>
            )}

            {activeTab === 'templates' && (
              <EmailTemplates />
            )}

            {activeTab === 'extract' && (
              <ExtractData />
            )}

            {activeTab === 'suppliers' && (
              <SuppliersManager />
            )}

            {activeTab === 'company' && (
              <form onSubmit={handleSave} className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Building2 className="w-5 h-5" />
                    Company Information
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Company Name *
                      </label>
                      <input
                        type="text"
                        value={formData.company_name}
                        onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Address
                      </label>
                      <textarea
                        value={formData.company_address}
                        onChange={(e) => setFormData({ ...formData, company_address: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        rows={3}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Phone
                      </label>
                      <input
                        type="text"
                        value={formData.company_phone}
                        onChange={(e) => setFormData({ ...formData, company_phone: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email
                      </label>
                      <input
                        type="email"
                        value={formData.company_email}
                        onChange={(e) => setFormData({ ...formData, company_email: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t pt-6">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <DollarSign className="w-5 h-5" />
                    Financial Settings
                  </h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Default Tax Rate (%)
                      </label>
                      <input
                        type="number"
                        value={formData.tax_rate}
                        onChange={(e) => setFormData({ ...formData, tax_rate: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        min="0"
                        max="100"
                        step="0.1"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Invoice Prefix
                      </label>
                      <input
                        type="text"
                        value={formData.invoice_prefix}
                        onChange={(e) => setFormData({ ...formData, invoice_prefix: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Invoice Start Number
                      </label>
                      <input
                        type="number"
                        value={formData.invoice_start_number}
                        onChange={(e) => setFormData({ ...formData, invoice_start_number: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        min="1"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                  >
                    <Save className="w-5 h-5" />
                    {saving ? 'Saving...' : 'Save Settings'}
                  </button>
                </div>
              </form>
            )}

            {activeTab === 'users' && (
              <UserManagement users={users} onRefresh={loadUsers} />
            )}

            {activeTab === 'financial' && (
              <form onSubmit={handleSave} className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Calendar className="w-5 h-5" />
                    Financial Year Configuration
                  </h3>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                    <p className="text-sm text-blue-800">
                      Configure your company's financial year period. This will be used to filter reports and dashboard statistics.
                      The system will automatically organize data based on the selected financial year.
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Current Financial Year *
                      </label>
                      <select
                        value={formData.current_financial_year}
                        onChange={(e) => {
                          const year = e.target.value;
                          setFormData({
                            ...formData,
                            current_financial_year: year,
                            financial_year_start: `${year}-01-01`,
                            financial_year_end: `${year}-12-31`,
                          });
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        required
                      >
                        <option value="2023">2023</option>
                        <option value="2024">2024</option>
                        <option value="2025">2025</option>
                        <option value="2026">2026</option>
                        <option value="2027">2027</option>
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        Select the active financial year
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Start Date *
                      </label>
                      <input
                        type="date"
                        value={formData.financial_year_start}
                        onChange={(e) => setFormData({ ...formData, financial_year_start: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        required
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Financial year start date
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        End Date *
                      </label>
                      <input
                        type="date"
                        value={formData.financial_year_end}
                        onChange={(e) => setFormData({ ...formData, financial_year_end: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        required
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Financial year end date
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm font-medium text-green-800 mb-2">Active Financial Year Period:</p>
                    <p className="text-lg font-bold text-green-900">
                      {formatDate(formData.financial_year_start)} - {formatDate(formData.financial_year_end)}
                    </p>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                  >
                    <Save className="w-5 h-5" />
                    {saving ? 'Saving...' : 'Save Financial Year'}
                  </button>
                </div>
              </form>
            )}

            {activeTab === 'system' && (
              <form onSubmit={handleSave} className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Package className="w-5 h-5" />
                    Inventory Alerts
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Low Stock Threshold
                      </label>
                      <input
                        type="number"
                        value={formData.low_stock_threshold}
                        onChange={(e) => setFormData({ ...formData, low_stock_threshold: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        min="0"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Alert when stock falls below this quantity
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Expiry Alert Days
                      </label>
                      <input
                        type="number"
                        value={formData.expiry_alert_days}
                        onChange={(e) => setFormData({ ...formData, expiry_alert_days: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        min="0"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Alert when products will expire within this many days
                      </p>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-6">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Mail className="w-5 h-5" />
                    Email Configuration (Optional)
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        SMTP Host
                      </label>
                      <input
                        type="text"
                        value={formData.email_host}
                        onChange={(e) => setFormData({ ...formData, email_host: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="smtp.example.com"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        SMTP Port
                      </label>
                      <input
                        type="number"
                        value={formData.email_port}
                        onChange={(e) => setFormData({ ...formData, email_port: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email Username
                      </label>
                      <input
                        type="text"
                        value={formData.email_username}
                        onChange={(e) => setFormData({ ...formData, email_username: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="user@example.com"
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t pt-6">
                  <h3 className="text-lg font-semibold mb-4">Language Preference</h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Default Language
                    </label>
                    <select
                      value={formData.default_language}
                      onChange={(e) => setFormData({ ...formData, default_language: e.target.value })}
                      className="w-full md:w-1/3 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="en">English</option>
                      <option value="id">Indonesian</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                  >
                    <Save className="w-5 h-5" />
                    {saving ? 'Saving...' : 'Save Settings'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>

      {showRestoreModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Restore Backup</h2>
                <p className="text-sm text-gray-500 mt-0.5">Upload a JSON backup file to restore data</p>
              </div>
              <button
                onClick={handleCloseRestoreModal}
                className="text-gray-400 hover:text-gray-600 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Step 0: file picker */}
              {confirmStep === 0 && !restoreResult && (
                <>
                  <div
                    className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition"
                    onClick={() => document.getElementById('restore-file-input')?.click()}
                  >
                    <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    {restoreFile ? (
                      <div>
                        <p className="text-sm font-medium text-gray-900">{restoreFile.name}</p>
                        <p className="text-xs text-gray-500 mt-1">{(restoreFile.size / 1024).toFixed(1)} KB</p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm font-medium text-gray-700">Click to select backup file</p>
                        <p className="text-xs text-gray-500 mt-1">JSON files only</p>
                      </div>
                    )}
                  </div>
                  <input
                    id="restore-file-input"
                    type="file"
                    accept=".json,application/json"
                    className="hidden"
                    onChange={(e) => {
                      setRestoreFile(e.target.files?.[0] ?? null);
                      e.target.value = '';
                    }}
                  />
                </>
              )}

              {/* Step 1: first confirmation */}
              {confirmStep === 1 && !restoreResult && (
                <div className="space-y-3">
                  <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4">
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-800">
                      <strong>This will REPLACE all existing data.</strong> This action cannot be undone. All current products, customers, batches, invoices, and transactions will be permanently deleted and replaced with the backup data.
                    </p>
                  </div>
                  <p className="text-sm text-gray-600 text-center">Do you want to proceed?</p>
                </div>
              )}

              {/* Step 2: second confirmation */}
              {confirmStep === 2 && !restoreResult && (
                <div className="space-y-3">
                  <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4">
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm font-semibold text-red-800">
                      Are you absolutely sure you want to restore this backup?
                    </p>
                  </div>
                  <p className="text-xs text-gray-500 text-center">
                    Restoring: <span className="font-medium text-gray-700">{restoreFile?.name}</span>
                  </p>
                </div>
              )}

              {/* Result */}
              {restoreResult && (
                <div className={`rounded-lg p-4 ${restoreResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  <div className="flex items-start gap-3">
                    {restoreResult.success
                      ? <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                      : <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    }
                    <div>
                      <p className={`text-sm font-medium ${restoreResult.success ? 'text-green-800' : 'text-red-800'}`}>
                        {restoreResult.message}
                      </p>
                      {restoreResult.imported && (
                        <ul className="mt-2 space-y-0.5">
                          {Object.entries(restoreResult.imported).map(([table, count]) => (
                            <li key={table} className="text-xs text-green-700">
                              {table}: {count} record{count !== 1 ? 's' : ''}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 pb-6">
              <button
                onClick={handleCloseRestoreModal}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
              >
                {restoreResult?.success ? 'Close' : 'Cancel'}
              </button>

              {/* Step 0 action */}
              {confirmStep === 0 && !restoreResult && (
                <button
                  onClick={() => setConfirmStep(1)}
                  disabled={!restoreFile}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Upload className="w-4 h-4" />
                  Restore
                </button>
              )}

              {/* Step 1 action */}
              {confirmStep === 1 && !restoreResult && (
                <button
                  onClick={() => setConfirmStep(2)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition"
                >
                  Yes, continue
                </button>
              )}

              {/* Step 2 action */}
              {confirmStep === 2 && !restoreResult && (
                <button
                  onClick={handleRestoreBackup}
                  disabled={restoring}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-700 rounded-lg hover:bg-red-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {restoring ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Restoring...
                    </>
                  ) : (
                    'Yes, I am absolutely sure'
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
