import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, serverTimestamp, getDocs, query, where, writeBatch, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { generateSKU } from '../lib/sku';
import { toast } from 'sonner';
import { Package, Save, RefreshCw, Camera, Sparkles, Loader2 } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { GoogleGenAI } from "@google/genai";
import { useAuth } from '../contexts/AuthContext';

export function AddProduct() {
  const navigate = useNavigate();
  const { profile, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  
  const isTechnician = profile?.role === 'admin' || profile?.role === 'storekeeper' || profile?.role === 'technician';

  useEffect(() => {
    if (!authLoading && !isTechnician) {
      toast.error('Unauthorized access.');
      navigate('/inventory');
    }
  }, [authLoading, isTechnician, navigate]);

  const [formData, setFormData] = useState({
    name: '',
    category: '',
    subcategory: '',
    type: '',
    spec: '',
    size: '',
    minStock: 5,
    initialStock: 0,
  });

  const [skuPreview, setSkuPreview] = useState('');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleGeneratePreview = async () => {
    if (!formData.category || !formData.subcategory || !formData.type || !formData.spec) {
      toast.error('Please fill in all category fields for SKU generation.');
      return;
    }
    setLoading(true);
    try {
      // We don't actually generate the final SKU here because it increments the counter
      // But we can show the prefix
      const prefix = `${formData.category}-${formData.subcategory}-${formData.type}-${formData.spec}`.toUpperCase().replace(/\s+/g, '-');
      setSkuPreview(`${prefix}-###`);
    } catch (error) {
      toast.error('Failed to generate SKU preview.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const sku = await generateSKU(
        formData.category,
        formData.subcategory,
        formData.type,
        formData.spec
      );

      const productData = {
        sku,
        name: formData.name,
        category: formData.category.toUpperCase(),
        subcategory: formData.subcategory.toUpperCase(),
        type: formData.type.toUpperCase(),
        spec: formData.spec.toUpperCase(),
        size: formData.size,
        stockQuantity: Number(formData.initialStock),
        minStock: Number(formData.minStock),
        isLowStock: Number(formData.initialStock) <= Number(formData.minStock),
        barcode: sku,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const productDoc = await addDoc(collection(db, 'products'), productData).catch(error => {
        handleFirestoreError(error, OperationType.WRITE, 'products');
      });

      if (productDoc && Number(formData.initialStock) > 0) {
        // Sync with pending orders
        try {
          const ordersQuery = query(
            collection(db, 'orders'),
            where('status', 'in', ['PENDING', 'ORDERED'])
          );
          const ordersSnapshot = await getDocs(ordersQuery);
          
          if (!ordersSnapshot.empty) {
            const batch = writeBatch(db);
            let remainingInitial = Number(formData.initialStock);

            ordersSnapshot.docs.forEach(orderDoc => {
              const order = orderDoc.data();
              let orderChanged = false;
              
              const updatedItems = order.items.map((item: any) => {
                const currentReceived = item.receivedQuantity || 0;
                if (!item.isCancelled && item.sku.toUpperCase() === productData.sku.toUpperCase() && currentReceived < item.quantity && remainingInitial > 0) {
                  const needed = item.quantity - currentReceived;
                  const taken = Math.min(needed, remainingInitial);
                  remainingInitial -= taken;
                  orderChanged = true;
                  return { 
                    ...item, 
                    receivedQuantity: currentReceived + taken,
                    productId: productDoc.id // Link the newly created product ID
                  };
                }
                return item;
              });

              if (orderChanged) {
                const allReceived = updatedItems.every((item: any) => item.isCancelled || (item.receivedQuantity || 0) >= item.quantity);
                batch.update(orderDoc.ref, {
                  items: updatedItems,
                  updatedAt: new Date().toISOString(),
                  ...(allReceived ? { status: 'RECEIVED', receivedAt: new Date().toISOString() } : { status: 'ORDERED' })
                });
              }
            });

            await batch.commit();
            if (remainingInitial < Number(formData.initialStock)) {
              toast.info(`Stock synchronized with pending orders.`);
            }
          }
        } catch (orderSyncError) {
          console.error('Order sync failed:', orderSyncError);
          // Don't fail the whole product creation
        }
      }

      toast.success(`Product added successfully! SKU: ${sku}`);
      navigate('/inventory');
    } catch (error) {
      console.error(error);
      toast.error('Failed to add product.');
    } finally {
      setLoading(false);
    }
  };

  const handleAIAnalysis = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAiLoading(true);
    const toastId = toast.loading('AI is analyzing the product image...');

    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
      });
      reader.readAsDataURL(file);
      const base64Data = await base64Promise;

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: file.type,
                  data: base64Data,
                },
              },
              {
                text: `Analyze this product image or label and extract the following information in JSON format:
                {
                  "name": "Full descriptive name of the product",
                  "category": "Short code for category (e.g. MECH, ELEC, TOOL)",
                  "subcategory": "Short code for subcategory (e.g. PUMP, MTR, HAND)",
                  "type": "Short code for type (e.g. CENT, AC, WREN)",
                  "spec": "Short code for specification (e.g. 50HP, 220V, 12MM)",
                  "size": "Physical size or dimensions (e.g. 1/2 inch, 10x10, Large)"
                }
                If you cannot find a specific field, provide a reasonable guess based on the item type. Keep codes short (3-5 characters).`,
              },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
        }
      });

      const result = JSON.parse(response.text || '{}');
      setFormData(prev => ({
        ...prev,
        name: result.name || prev.name,
        category: result.category || prev.category,
        subcategory: result.subcategory || prev.subcategory,
        type: result.type || prev.type,
        spec: result.spec || prev.spec,
        size: result.size || prev.size,
      }));

      toast.success('AI Analysis complete! Form updated.', { id: toastId });
    } catch (error) {
      console.error(error);
      toast.error('AI Analysis failed. Please enter details manually.', { id: toastId });
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900">Add New Product</h2>
          <p className="text-zinc-500">Define a new item in your inventory. SKU will be auto-generated.</p>
        </div>
        <div className="relative">
          <input
            type="file"
            accept="image/*"
            onChange={handleAIAnalysis}
            className="absolute inset-0 opacity-0 cursor-pointer"
            disabled={aiLoading}
          />
          <button
            type="button"
            className="flex items-center gap-2 bg-amber-50 text-amber-700 px-6 py-3 rounded-xl font-bold border border-amber-200 hover:bg-amber-100 transition-all"
          >
            {aiLoading ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
            AI Scan Label
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 bg-white p-8 rounded-2xl border border-zinc-200 shadow-sm">
        <div className="grid grid-cols-1 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-zinc-700">Product Name</label>
            <input
              required
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              placeholder="e.g. Centrifugal Pump 50HP"
              className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-zinc-700">Category</label>
              <input
                required
                name="category"
                value={formData.category}
                onChange={handleInputChange}
                placeholder="MECH"
                className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-zinc-700">Subcategory</label>
              <input
                required
                name="subcategory"
                value={formData.subcategory}
                onChange={handleInputChange}
                placeholder="PUMP"
                className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-zinc-700">Type</label>
              <input
                required
                name="type"
                value={formData.type}
                onChange={handleInputChange}
                placeholder="CENT"
                className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-zinc-700">Spec</label>
              <input
                required
                name="spec"
                value={formData.spec}
                onChange={handleInputChange}
                placeholder="50HP"
                className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-zinc-700">Size</label>
            <input
              name="size"
              value={formData.size}
              onChange={handleInputChange}
              placeholder="e.g. 1/2 inch, Large, 10x10"
              className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-zinc-700">Min Stock Level</label>
              <input
                required
                type="number"
                name="minStock"
                value={formData.minStock}
                onChange={handleInputChange}
                className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-zinc-700">Initial Stock</label>
              <input
                required
                type="number"
                name="initialStock"
                value={formData.initialStock}
                onChange={handleInputChange}
                className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all"
              />
            </div>
          </div>
        </div>

        <div className="pt-4 space-y-4">
          <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">SKU Preview</p>
              <p className="text-lg font-mono font-bold text-zinc-900">{skuPreview || 'Fill fields to preview'}</p>
            </div>
            <button
              type="button"
              onClick={handleGeneratePreview}
              className="p-2 text-zinc-500 hover:text-zinc-900 transition-colors"
            >
              <RefreshCw size={20} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => navigate('/inventory')}
              className="w-full bg-white text-zinc-600 py-4 rounded-xl font-bold border border-zinc-200 hover:bg-zinc-50 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-zinc-900 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-zinc-800 transition-all disabled:opacity-50"
            >
              <Save size={20} />
              {loading ? 'Adding Product...' : 'Save Product'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
