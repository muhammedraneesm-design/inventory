import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { toast } from 'sonner';
import { Save, Loader2, ArrowLeft, Trash2, AlertCircle, X } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { Product } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';

export function EditProduct() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    subcategory: '',
    type: '',
    spec: '',
    size: '',
    minStock: 5,
    stockQuantity: 0,
  });

  useEffect(() => {
    const fetchProduct = async () => {
      if (!id) return;
      try {
        const docRef = doc(db, 'products', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as Product;
          setFormData({
            name: data.name,
            category: data.category,
            subcategory: data.subcategory,
            type: data.type,
            spec: data.spec,
            size: data.size || '',
            minStock: data.minStock,
            stockQuantity: data.stockQuantity,
          });
        } else {
          toast.error('Product not found.');
          navigate('/inventory');
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `products/${id}`);
      } finally {
        setLoading(false);
      }
    };

    fetchProduct();
  }, [id, navigate]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setSaving(true);

    try {
      const productRef = doc(db, 'products', id);
      let updateData: any;

      if (canEditFull) {
        updateData = {
          name: formData.name,
          category: formData.category.toUpperCase(),
          subcategory: formData.subcategory.toUpperCase(),
          type: formData.type.toUpperCase(),
          spec: formData.spec.toUpperCase(),
          size: formData.size,
          stockQuantity: Number(formData.stockQuantity),
          minStock: Number(formData.minStock),
          isLowStock: Number(formData.stockQuantity) <= Number(formData.minStock),
          updatedAt: new Date().toISOString(),
        };
      } else {
        // Technicians can only update stock-related fields
        updateData = {
          stockQuantity: Number(formData.stockQuantity),
          isLowStock: Number(formData.stockQuantity) <= Number(formData.minStock),
          updatedAt: new Date().toISOString(),
        };
      }

      await updateDoc(productRef, updateData).catch(error => {
        handleFirestoreError(error, OperationType.WRITE, `products/${id}`);
      });
      
      toast.success('Product updated successfully!');
      navigate('/inventory');
    } catch (error) {
      console.error(error);
      toast.error('Failed to update product.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-zinc-400" size={32} />
      </div>
    );
  }

  const canEditFull = profile?.role === 'admin' || profile?.role === 'storekeeper';
  const isAdmin = profile?.role === 'admin';

  const handleDelete = async () => {
    if (!id) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'products', id)).catch(error => {
        handleFirestoreError(error, OperationType.DELETE, `products/${id}`);
      });
      toast.success('Product deleted successfully.');
      navigate('/inventory');
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete product.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/inventory')}
            className="p-2 hover:bg-zinc-100 rounded-full transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          <div className="flex flex-col gap-1">
            <h2 className="text-3xl font-bold tracking-tight text-zinc-900">Edit Product</h2>
            <p className="text-zinc-500">Update product details and stock levels.</p>
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-3 text-red-500 hover:bg-red-50 rounded-xl transition-colors"
            title="Delete Product"
          >
            <Trash2 size={24} />
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 bg-white p-8 rounded-2xl border border-zinc-200 shadow-sm">
        <div className="grid grid-cols-1 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-zinc-700">Product Name</label>
            <input
              required
              name="name"
              disabled={!canEditFull}
              value={formData.name}
              onChange={handleInputChange}
              className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all disabled:bg-zinc-50 disabled:text-zinc-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-zinc-700">Category</label>
              <input
                required
                name="category"
                disabled={!canEditFull}
                value={formData.category}
                onChange={handleInputChange}
                className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all disabled:bg-zinc-50 disabled:text-zinc-500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-zinc-700">Subcategory</label>
              <input
                required
                name="subcategory"
                disabled={!canEditFull}
                value={formData.subcategory}
                onChange={handleInputChange}
                className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all disabled:bg-zinc-50 disabled:text-zinc-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-zinc-700">Type</label>
              <input
                required
                name="type"
                disabled={!canEditFull}
                value={formData.type}
                onChange={handleInputChange}
                className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all disabled:bg-zinc-50 disabled:text-zinc-500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-zinc-700">Spec</label>
              <input
                required
                name="spec"
                disabled={!canEditFull}
                value={formData.spec}
                onChange={handleInputChange}
                className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all disabled:bg-zinc-50 disabled:text-zinc-500"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-zinc-700">Size</label>
            <input
              name="size"
              disabled={!canEditFull}
              value={formData.size}
              onChange={handleInputChange}
              placeholder="e.g. 1/2 inch, Large, 10x10"
              className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all disabled:bg-zinc-50 disabled:text-zinc-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-zinc-700">Min Stock Level</label>
              <input
                required
                type="number"
                name="minStock"
                disabled={!canEditFull}
                value={formData.minStock}
                onChange={handleInputChange}
                className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all disabled:bg-zinc-50 disabled:text-zinc-500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-zinc-700">Current Stock</label>
              <input
                required
                type="number"
                name="stockQuantity"
                value={formData.stockQuantity}
                onChange={handleInputChange}
                className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all"
              />
            </div>
          </div>
        </div>

        <div className="pt-4 flex gap-4">
          <button
            type="button"
            onClick={() => navigate('/inventory')}
            className="flex-1 bg-white text-zinc-600 py-4 rounded-xl font-bold border border-zinc-200 hover:bg-zinc-50 transition-all"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 bg-zinc-900 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-zinc-800 transition-all disabled:opacity-50"
          >
            {saving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
            {saving ? 'Saving Changes...' : 'Update Product'}
          </button>
        </div>
      </form>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl space-y-6 text-center">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle size={32} />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-zinc-900">Delete Product?</h3>
              <p className="text-zinc-500">
                Are you sure you want to delete <span className="font-bold text-zinc-900">{formData.name}</span>? This action is permanent and cannot be undone.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="py-3 rounded-xl border border-zinc-200 font-bold text-zinc-600 hover:bg-zinc-50 transition-colors"
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="py-3 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700 transition-colors shadow-lg shadow-red-100 flex items-center justify-center gap-2"
              >
                {isDeleting ? <Loader2 className="animate-spin" size={20} /> : <Trash2 size={20} />}
                {isDeleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
