import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, FileText, Trash2, Edit2 } from 'lucide-react';
import { Modal } from './Modal';
import { SourceDocuments } from './SourceDocuments';

interface ProductSource {
  id: string;
  product_id: string;
  supplier_id: string | null;
  supplier_name: string | null;
  grade: string | null;
  country: string | null;
  remarks: string | null;
  created_at: string;
  document_count?: number;
  available_doc_types?: string[];
  supplier_company_name?: string;
}

interface Supplier {
  id: string;
  company_name: string;
}

interface ProductSourcesProps {
  productId: string;
  productName: string;
}

export function ProductSources({ productId, productName }: ProductSourcesProps) {
  const [sources, setSources] = useState<ProductSource[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [documentsModalOpen, setDocumentsModalOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<ProductSource | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [selectedSourceName, setSelectedSourceName] = useState<string>('');
  const [formData, setFormData] = useState({
    supplier_id: '',
    supplier_name: '',
    grade: 'BP',
    country: '',
    remarks: '',
  });

  useEffect(() => {
    loadSources();
    loadSuppliers();
  }, [productId]);

  const loadSources = async () => {
    try {
      const { data, error } = await supabase
        .from('product_sources_with_stats')
        .select('*')
        .eq('product_id', productId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSources(data || []);
    } catch (error) {
      console.error('Error loading sources:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSuppliers = async () => {
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('id, company_name')
        .order('company_name');

      if (error) throw error;
      setSuppliers(data || []);
    } catch (error) {
      console.error('Error loading suppliers:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const dataToSave = {
        product_id: productId,
        supplier_id: formData.supplier_id || null,
        supplier_name: formData.supplier_name || null,
        grade: formData.grade || null,
        country: formData.country || null,
        remarks: formData.remarks || null,
      };

      if (editingSource) {
        const { error } = await supabase
          .from('product_sources')
          .update(dataToSave)
          .eq('id', editingSource.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('product_sources')
          .insert([dataToSave]);

        if (error) throw error;
      }

      setModalOpen(false);
      resetForm();
      loadSources();
      alert(editingSource ? 'Source updated successfully' : 'Source added successfully');
    } catch (error: any) {
      console.error('Error saving source:', error);
      alert('Failed to save source: ' + error.message);
    }
  };

  const handleEdit = (source: ProductSource) => {
    setEditingSource(source);
    setFormData({
      supplier_id: source.supplier_id || '',
      supplier_name: source.supplier_name || '',
      grade: source.grade || 'BP',
      country: source.country || '',
      remarks: source.remarks || '',
    });
    setModalOpen(true);
  };

  const handleDelete = async (source: ProductSource) => {
    if (!confirm('Are you sure you want to delete this source? All associated documents will also be deleted.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('product_sources')
        .delete()
        .eq('id', source.id);

      if (error) throw error;
      alert('Source deleted successfully');
      loadSources();
    } catch (error: any) {
      console.error('Error deleting source:', error);
      alert('Failed to delete source: ' + error.message);
    }
  };

  const openDocumentsModal = (source: ProductSource) => {
    setSelectedSourceId(source.id);
    setSelectedSourceName(
      source.supplier_company_name || source.supplier_name || 'Unknown Source'
    );
    setDocumentsModalOpen(true);
  };

  const resetForm = () => {
    setEditingSource(null);
    setFormData({
      supplier_id: '',
      supplier_name: '',
      grade: 'BP',
      country: '',
      remarks: '',
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Product Sources</h2>
          <p className="text-sm text-gray-600 mt-1">
            Manage suppliers and their documents for {productName}
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setModalOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          <Plus className="w-5 h-5" />
          Add Source
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading sources...</div>
      ) : sources.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <p className="text-gray-500 mb-4">No sources added yet</p>
          <button
            onClick={() => setModalOpen(true)}
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            Add your first source
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Supplier
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Grade
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Country
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Documents
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Added
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sources.map((source) => (
                <tr key={source.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {source.supplier_company_name || source.supplier_name || '—'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                      {source.grade || '—'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                    {source.country || '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => openDocumentsModal(source)}
                      className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition"
                    >
                      <FileText className="w-4 h-4" />
                      <span className="text-sm font-medium">
                        {source.document_count || 0}
                      </span>
                      {source.available_doc_types && source.available_doc_types.length > 0 && (
                        <span className="text-xs text-gray-500">
                          ({source.available_doc_types.join(', ')})
                        </span>
                      )}
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(source.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleEdit(source)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(source)}
                        className="text-red-600 hover:text-red-900"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          resetForm();
        }}
        title={editingSource ? 'Edit Source' : 'Add Source'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Supplier (from list)
            </label>
            <select
              value={formData.supplier_id}
              onChange={(e) => setFormData({ ...formData, supplier_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">-- Select Supplier --</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.company_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Or Enter Supplier Name
            </label>
            <input
              type="text"
              value={formData.supplier_name}
              onChange={(e) => setFormData({ ...formData, supplier_name: e.target.value })}
              placeholder="e.g., Everest Pharma"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <p className="text-xs text-gray-500 mt-1">Use this if supplier is not in the list above</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Grade
              </label>
              <select
                value={formData.grade}
                onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="BP">BP (British Pharmacopoeia)</option>
                <option value="USP">USP (US Pharmacopoeia)</option>
                <option value="EP">EP (European Pharmacopoeia)</option>
                <option value="IP">IP (Indian Pharmacopoeia)</option>
                <option value="Tech">Tech Grade</option>
                <option value="Food Grade">Food Grade</option>
                <option value="Industrial">Industrial</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Country
              </label>
              <input
                type="text"
                value={formData.country}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                placeholder="e.g., India, China"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Remarks
            </label>
            <textarea
              value={formData.remarks}
              onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
              rows={3}
              placeholder="Optional notes about this source..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={() => {
                setModalOpen(false);
                resetForm();
              }}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              {editingSource ? 'Update' : 'Add'} Source
            </button>
          </div>
        </form>
      </Modal>

      {selectedSourceId && (
        <SourceDocuments
          isOpen={documentsModalOpen}
          onClose={() => {
            setDocumentsModalOpen(false);
            setSelectedSourceId(null);
            setSelectedSourceName('');
            loadSources();
          }}
          sourceId={selectedSourceId}
          sourceName={selectedSourceName}
          productName={productName}
        />
      )}
    </div>
  );
}
