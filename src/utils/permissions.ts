import type { UserRole } from '../lib/supabase';

export interface ModulePermission {
  module: string;
  label: string;
  can_access: boolean;
}

export const ALL_MODULES = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'products', label: 'Products' },
  { id: 'batches', label: 'Batches' },
  { id: 'stock', label: 'Stock' },
  { id: 'customers', label: 'Customers' },
  { id: 'sales-orders', label: 'Sales Orders' },
  { id: 'delivery-challan', label: 'Delivery Challan' },
  { id: 'sales', label: 'Sales Invoices' },
  { id: 'purchase-orders', label: 'Purchase Orders' },
  { id: 'import-requirements', label: 'Import Requirements' },
  { id: 'import-containers', label: 'Import Containers' },
  { id: 'finance', label: 'Finance' },
  { id: 'price-calculator', label: 'Price Calculator' },
  { id: 'crm', label: 'CRM' },
  { id: 'command-center', label: 'Command Center' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'inventory', label: 'Inventory Adjustments' },
  { id: 'reports', label: 'Reports' },
  { id: 'price-requests', label: 'Price Requests' },
  { id: 'pricing-desk', label: 'Pricing Desk' },
  { id: 'pricing-ledger', label: 'Pricing Ledger' },
  { id: 'settings', label: 'Settings' },
] as const;

export type ModuleId = typeof ALL_MODULES[number]['id'];

const ROLE_DEFAULT_MODULES: Record<UserRole, ModuleId[]> = {
  admin: ALL_MODULES.map(m => m.id) as ModuleId[], // all modules including 'reports'
  manager: ['dashboard', 'products', 'batches', 'stock', 'customers', 'sales-orders', 'delivery-challan', 'sales', 'purchase-orders', 'import-requirements', 'import-containers', 'finance', 'price-calculator', 'crm', 'command-center', 'tasks', 'inventory', 'reports', 'price-requests', 'pricing-desk', 'pricing-ledger'],
  accounts: ['dashboard', 'batches', 'stock', 'customers', 'sales-orders', 'delivery-challan', 'sales', 'purchase-orders', 'import-containers', 'finance', 'tasks', 'settings'],
  sales: ['dashboard', 'products', 'stock', 'customers', 'sales-orders', 'delivery-challan', 'sales', 'purchase-orders', 'import-requirements', 'price-calculator', 'crm', 'command-center', 'tasks', 'settings', 'price-requests', 'pricing-ledger'],
  warehouse: ['dashboard', 'products', 'batches', 'stock', 'customers', 'sales-orders', 'delivery-challan', 'sales', 'purchase-orders', 'tasks', 'inventory', 'settings'],
  auditor_ca: ['dashboard', 'sales', 'purchase-orders', 'finance'],
};

export function getDefaultModulesForRole(role: UserRole): ModuleId[] {
  return ROLE_DEFAULT_MODULES[role] ?? [];
}

export function buildPermissionsFromRole(role: UserRole): Record<ModuleId, boolean> {
  const defaults = getDefaultModulesForRole(role);
  const result = {} as Record<ModuleId, boolean>;
  for (const mod of ALL_MODULES) {
    result[mod.id] = defaults.includes(mod.id);
  }
  return result;
}

export function resolveAccessibleModules(
  role: UserRole,
  dbPermissions: { module: string; can_access: boolean }[] | null
): Set<string> {
  if (role === 'admin') {
    return new Set(ALL_MODULES.map(m => m.id));
  }

  if (!dbPermissions || dbPermissions.length === 0) {
    return new Set(getDefaultModulesForRole(role));
  }

  const accessible = new Set<string>();
  for (const p of dbPermissions) {
    if (p.can_access) {
      accessible.add(p.module);
    }
  }
  return accessible;
}
