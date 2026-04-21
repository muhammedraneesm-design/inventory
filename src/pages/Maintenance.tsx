import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, onSnapshot, doc, runTransaction, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Product } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { Scan, Trash2, Save, Wrench, Package } from 'lucide-react';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

interface UsedPart {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  available: number;
}

export function Maintenance() {
  const { profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  
  const isTechnician = profile?.role === 'admin' || profile?.role === 'storekeeper' || profile?.role === 'technician';

  useEffect(() => {
    if (!authLoading && !isTechnician) {
      toast.error('Unauthorized access.');
      navigate('/inventory');
    }
  }, [authLoading, isTechnician, navigate]);

  const [jobData, setJobData] = useState({
    jobId: '',
    equipmentName: '',
  });
  const [partsUsed, setPartsUsed] = useState<UsedPart[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'products'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'products');
    });
    return () => unsubscribe();
  }, []);

  const handleScan = (sku: string) => {
    const product = products.find(p => p.sku === sku || p.barcode === sku);
    if (product) {
      if (partsUsed.some(p => p.productId === product.id)) {
        toast.error('Part already added to list.');
        return;
      }
      setPartsUsed([...partsUsed, {
        productId: product.id,
        sku: product.sku,
        name: product.name,
        quantity: 1,
        available: product.stockQuantity
      }]);
      setIsScanning(false);
      toast.success(`Added: ${product.name}`);
    } else {
      toast.error('Product not found.');
    }
  };

  const updatePartQuantity = (index: number, delta: number) => {
    const newParts = [...partsUsed];
    const newQty = newParts[index].quantity + delta;
    if (newQty > 0 && newQty <= newParts[index].available) {
      newParts[index].quantity = newQty;
      setPartsUsed(newParts);
    } else if (newQty > newParts[index].available) {
      toast.error('Exceeds available stock.');
    }
  };

  const removePart = (index: number) => {
    setPartsUsed(partsUsed.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    if (partsUsed.length === 0) {
      toast.error('Please add at least one part.');
      return;
    }

    setLoading(true);
    try {
      await runTransaction(db, async (transaction) => {
        // 1. Update each product stock
        for (const part of partsUsed) {
          const productRef = doc(db, 'products', part.productId);
          const pDoc = await transaction.get(productRef);
          if (!pDoc.exists()) throw new Error(`Product ${part.sku} not found`);
          
          const currentStock = pDoc.data().stockQuantity;
          const newStock = currentStock - part.quantity;
          
          if (newStock < 0) throw new Error(`Insufficient stock for ${part.name}`);

          transaction.update(productRef, {
            stockQuantity: newStock,
            isLowStock: newStock <= pDoc.data().minStock,
            updatedAt: new Date().toISOString()
          });

          // 2. Create transaction record
          const txRef = doc(collection(db, 'transactions'));
          transaction.set(txRef, {
            productId: part.productId,
            type: 'OUT',
            quantity: part.quantity,
            previousStock: currentStock,
            newStock,
            userId: profile.uid,
            timestamp: new Date().toISOString(),
            notes: `Maintenance Job: ${jobData.jobId}`,
            jobId: jobData.jobId
          });
        }

        // 3. Create maintenance log
        const logRef = doc(collection(db, 'maintenance_logs'));
        transaction.set(logRef, {
          jobId: jobData.jobId,
          equipmentName: jobData.equipmentName,
          technicianId: profile.uid,
          technicianName: profile.name,
          timestamp: new Date().toISOString(),
          partsUsed: partsUsed.map(p => ({
            productId: p.productId,
            sku: p.sku,
            name: p.name,
            quantity: p.quantity
          }))
        });
      }).catch(error => {
        handleFirestoreError(error, OperationType.WRITE, 'maintenance_logs');
      });

      toast.success('Maintenance job logged and stock updated!');
      setJobData({ jobId: '', equipmentName: '' });
      setPartsUsed([]);
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Failed to log maintenance job.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex flex-col gap-1">
        <h2 className="text-3xl font-bold tracking-tight text-zinc-900">Maintenance Job</h2>
        <p className="text-zinc-500">Log parts consumption for a specific repair task.</p>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Job Details */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-4">
            <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
              <Wrench size={20} className="text-zinc-400" />
              Job Details
            </h3>
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase">Job ID / Work Order</label>
              <input
                required
                value={jobData.jobId}
                onChange={(e) => setJobData({ ...jobData, jobId: e.target.value })}
                placeholder="e.g. WO-2024-001"
                className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase">Equipment Name</label>
              <input
                required
                value={jobData.equipmentName}
                onChange={(e) => setJobData({ ...jobData, equipmentName: e.target.value })}
                placeholder="e.g. Cooling Tower A"
                className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || partsUsed.length === 0}
            className="w-full bg-zinc-900 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-zinc-800 transition-all disabled:opacity-50"
          >
            <Save size={20} />
            {loading ? 'Processing...' : 'Complete Job'}
          </button>
        </div>

        {/* Parts List */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                <Package size={20} className="text-zinc-400" />
                Parts Consumed
              </h3>
              <button
                type="button"
                onClick={() => setIsScanning(!isScanning)}
                className="flex items-center gap-2 text-sm font-bold text-blue-600 hover:text-blue-700"
              >
                <Scan size={18} />
                {isScanning ? 'Hide Scanner' : 'Scan Part'}
              </button>
            </div>

            {isScanning && (
              <div className="p-6 bg-zinc-50 border-b border-zinc-100">
                <BarcodeScanner onScan={handleScan} />
              </div>
            )}

            <div className="divide-y divide-zinc-100">
              {partsUsed.length > 0 ? (
                partsUsed.map((part, index) => (
                  <div key={part.productId} className="p-6 flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-zinc-900 truncate">{part.name}</p>
                      <p className="text-xs font-mono text-zinc-500">{part.sku}</p>
                    </div>
                    
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => updatePartQuantity(index, -1)}
                          className="w-8 h-8 rounded-lg border border-zinc-200 flex items-center justify-center text-zinc-500 hover:bg-zinc-50"
                        >
                          -
                        </button>
                        <span className="w-8 text-center font-bold text-zinc-900">{part.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updatePartQuantity(index, 1)}
                          className="w-8 h-8 rounded-lg border border-zinc-200 flex items-center justify-center text-zinc-500 hover:bg-zinc-50"
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => removePart(index)}
                        className="text-red-400 hover:text-red-600 p-2"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-12 text-center text-zinc-400 italic">
                  No parts added. Scan a barcode to add parts used in this job.
                </div>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
