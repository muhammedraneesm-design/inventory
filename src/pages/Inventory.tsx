import React, { useEffect, useState } from 'react';
import { collection, query, onSnapshot, doc, runTransaction, addDoc, getDocs, where, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { Product } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { Search, Scan, Plus, Minus, AlertCircle, X, PlusCircle, Edit2, Printer, ShoppingCart } from 'lucide-react';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { BarcodeLabel } from '../components/BarcodeLabel';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { useNavigate } from 'react-router-dom';

export function Inventory() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [adjustAmount, setAdjustAmount] = useState(1);
  const [isConfirming, setIsConfirming] = useState(false);
  const [adjustmentType, setAdjustmentType] = useState<'IN' | 'OUT' | null>(null);
  const [showBarcodeLabel, setShowBarcodeLabel] = useState(false);

  const isTechnician = profile?.role === 'admin' || profile?.role === 'storekeeper' || profile?.role === 'technician';
  const isStorekeeper = profile?.role === 'admin' || profile?.role === 'storekeeper';

  useEffect(() => {
    const q = query(collection(db, 'products'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'products');
    });
    return () => unsubscribe();
  }, []);

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.size && p.size.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleScan = (sku: string) => {
    const product = products.find(p => p.sku === sku || p.barcode === sku);
    if (product) {
      setSelectedProduct(product);
      setIsScanning(false);
      toast.success(`Found: ${product.name}`);
    } else {
      toast.error('Product not found.');
    }
  };

  const handleStockAdjust = (type: 'IN' | 'OUT') => {
    if (!selectedProduct) return;
    const amount = Number(adjustAmount);
    if (amount <= 0) return;

    if (type === 'OUT' && selectedProduct.stockQuantity < amount) {
      toast.error('Insufficient stock.');
      return;
    }

    setAdjustmentType(type);
    setIsConfirming(true);
  };

  const executeStockAdjust = async () => {
    if (!selectedProduct || !profile || !adjustmentType) return;
    
    const amount = Number(adjustAmount);
    const type = adjustmentType;

    try {
      const productRef = doc(db, 'products', selectedProduct.id);
      
      await runTransaction(db, async (transaction) => {
        const pDoc = await transaction.get(productRef);
        if (!pDoc.exists()) throw new Error("Product does not exist!");

        const currentStock = pDoc.data().stockQuantity;
        const newStock = type === 'IN' ? currentStock + amount : currentStock - amount;
        
        transaction.update(productRef, {
          stockQuantity: newStock,
          isLowStock: newStock <= pDoc.data().minStock,
          updatedAt: new Date().toISOString()
        });

        const txData = {
          productId: selectedProduct.id,
          type,
          quantity: amount,
          previousStock: currentStock,
          newStock,
          userId: profile.uid,
          timestamp: new Date().toISOString(),
          notes: `Manual stock ${type.toLowerCase()}`
        };

        const txRef = doc(collection(db, 'transactions'));
        transaction.set(txRef, txData);

        // Sync with pending orders if Stock IN
        if (type === 'IN') {
          const ordersQuery = query(
            collection(db, 'orders'),
            where('status', 'in', ['PENDING', 'ORDERED'])
          );
          
          // We fetch outside the transaction context generally, but to keep it simple and responsive to the user's "Add Product Section" request
          // (which they likely use for adding stock), we'll perform a separate update.
          // Note: Standard Firestore transactions can't do collection queries. We will handle this post-transaction.
        }
      });

      // Post-transaction order sync for Stock IN
      if (adjustmentType === 'IN') {
        try {
          const ordersQuery = query(
            collection(db, 'orders'),
            where('status', 'in', ['PENDING', 'ORDERED'])
          );
          const ordersSnapshot = await getDocs(ordersQuery);
          
          if (!ordersSnapshot.empty) {
            const batch = writeBatch(db);
            let remainingAdjust = amount;

            ordersSnapshot.docs.forEach(orderDoc => {
              const order = orderDoc.data();
              let orderChanged = false;
              
              const updatedItems = order.items.map((item: any) => {
                const currentReceived = item.receivedQuantity || 0;
                if (!item.isCancelled && item.productId === selectedProduct.id && currentReceived < item.quantity && remainingAdjust > 0) {
                  const needed = item.quantity - currentReceived;
                  const taken = Math.min(needed, remainingAdjust);
                  remainingAdjust -= taken;
                  orderChanged = true;
                  return { 
                    ...item, 
                    receivedQuantity: currentReceived + taken
                  };
                }
                return item;
              });

              if (orderChanged) {
                const allReceived = updatedItems.every((item: any) => item.isCancelled || (item.receivedQuantity || 0) >= item.quantity);
                batch.update(orderDoc.ref, {
                  items: updatedItems,
                  updatedAt: new Date().toISOString(),
                  ...(allReceived ? { status: 'RECEIVED', receivedAt: new Date().toISOString() } : { status: 'ORDERED' }) // Transition from PENDING to ORDERED if fulfillment started
                });
              }
            });

            await batch.commit();
            if (remainingAdjust < amount) {
              toast.info(`Stock adjustment synchronized with pending orders.`);
            } else {
              toast.warning(`Stock added, but no matching pending orders were found for this product.`);
            }
          } else {
            toast.warning(`Stock added, but no open Purchase Orders exist for synchronization.`);
          }
        } catch (error) {
          console.error('Order sync failed:', error);
        }
      }

      toast.success(`Stock ${type === 'IN' ? 'added' : 'deducted'} successfully.`);
      setSelectedProduct(null);
      setAdjustAmount(1);
      setIsConfirming(false);
      setAdjustmentType(null);
    } catch (error) {
      console.error(error);
      toast.error('Failed to update stock.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900">Inventory</h2>
          <p className="text-zinc-500">Manage stock levels and track movements.</p>
        </div>
        <div className="flex items-center gap-3">
          {isTechnician && (
            <button
              onClick={() => navigate('/add-product')}
              className="flex items-center justify-center gap-2 bg-white text-zinc-900 border border-zinc-200 px-6 py-3 rounded-xl font-bold hover:bg-zinc-50 transition-all"
            >
              <PlusCircle size={20} />
              Add New Product
            </button>
          )}
          <button
            onClick={() => setIsScanning(!isScanning)}
            className="flex items-center justify-center gap-2 bg-zinc-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-zinc-800 transition-all"
          >
            <Scan size={20} />
            {isScanning ? 'Close Scanner' : 'Scan Barcode'}
          </button>
        </div>
      </div>

      {isScanning && (
        <div className="space-y-4">
          <p className="text-center text-sm font-medium text-zinc-500">Point camera at product barcode</p>
          <BarcodeScanner onScan={handleScan} />
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={20} />
        <input
          type="text"
          placeholder="Search by name or SKU..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-12 pr-4 py-4 rounded-2xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all bg-white shadow-sm"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredProducts.map((product) => (
          <div
            key={product.id}
            onClick={() => setSelectedProduct(product)}
            className={cn(
              "bg-white p-6 rounded-2xl border transition-all cursor-pointer hover:shadow-md",
              product.isLowStock ? "border-amber-200 bg-amber-50/30" : "border-zinc-200"
            )}
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <h4 className="font-bold text-zinc-900">{product.name}</h4>
                <p className="text-xs font-mono text-zinc-500">{product.sku}</p>
              </div>
              {product.isLowStock && (
                <AlertCircle size={20} className="text-amber-500" />
              )}
            </div>
            
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-zinc-400 uppercase font-bold tracking-widest">Stock Level</p>
                <p className={cn(
                  "text-3xl font-black",
                  product.isLowStock ? "text-amber-600" : "text-zinc-900"
                )}>
                  {product.stockQuantity}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-zinc-400 font-medium">Min: {product.minStock}</p>
                <p className="text-xs text-zinc-400 font-medium">
                  {product.category} / {product.type}
                  {product.size && ` (${product.size})`}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Stock Adjustment Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl space-y-6">
            {!isConfirming ? (
              <>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-zinc-900">{selectedProduct.name}</h3>
                    <p className="text-sm font-mono text-zinc-500">{selectedProduct.sku}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => navigate('/orders')}
                      className="p-2 text-zinc-400 hover:text-amber-600 transition-colors"
                      title="Stock Order"
                    >
                      <ShoppingCart size={20} />
                    </button>
                    <button
                      onClick={() => setShowBarcodeLabel(true)}
                      className="p-2 text-zinc-400 hover:text-blue-600 transition-colors"
                      title="Print Barcode Label"
                    >
                      <Printer size={20} />
                    </button>
                    {isStorekeeper && (
                      <button
                        onClick={() => navigate(`/edit-product/${selectedProduct.id}`)}
                        className="p-2 text-zinc-400 hover:text-blue-600 transition-colors"
                        title="Edit Product"
                      >
                        <Edit2 size={20} />
                      </button>
                    )}
                    <button onClick={() => setSelectedProduct(null)} className="p-2 text-zinc-400 hover:text-zinc-900">
                      <X size={24} />
                    </button>
                  </div>
                </div>

                <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100 flex justify-between items-center">
                  <p className="text-sm font-medium text-zinc-600">Current Stock</p>
                  <p className="text-2xl font-bold text-zinc-900">{selectedProduct.stockQuantity}</p>
                </div>

                <div className="space-y-4">
                  <label className="text-sm font-bold text-zinc-700">Adjustment Quantity</label>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setAdjustAmount(Math.max(1, adjustAmount - 1))}
                      className="p-4 rounded-xl border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                    >
                      <Minus size={20} />
                    </button>
                    <input
                      type="number"
                      value={adjustAmount}
                      onChange={(e) => setAdjustAmount(Number(e.target.value))}
                      className="flex-1 text-center text-2xl font-bold py-3 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    />
                    <button
                      onClick={() => setAdjustAmount(adjustAmount + 1)}
                      className="p-4 rounded-xl border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                    >
                      <Plus size={20} />
                    </button>
                  </div>
                </div>

                {isTechnician && (
                  <div className="grid grid-cols-2 gap-4 pt-4">
                    <button
                      onClick={() => handleStockAdjust('OUT')}
                      className="py-4 rounded-xl bg-red-50 text-red-600 font-bold hover:bg-red-100 transition-colors"
                    >
                      Stock Out
                    </button>
                    <button
                      onClick={() => handleStockAdjust('IN')}
                      className="py-4 rounded-xl bg-emerald-50 text-emerald-600 font-bold hover:bg-emerald-100 transition-colors"
                    >
                      Stock In
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-6 text-center">
                <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto">
                  <AlertCircle size={32} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-zinc-900">Confirm Adjustment</h3>
                  <p className="text-zinc-500">
                    Are you sure you want to perform a <span className="font-bold text-zinc-900">Stock {adjustmentType}</span> of <span className="font-bold text-zinc-900">{adjustAmount}</span> units for:
                  </p>
                  <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-100">
                    <p className="font-bold text-zinc-900">{selectedProduct.name}</p>
                    <p className="text-sm font-mono text-zinc-500">{selectedProduct.sku}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <button
                    onClick={() => {
                      setIsConfirming(false);
                      setAdjustmentType(null);
                    }}
                    className="py-3 rounded-xl border border-zinc-200 font-bold text-zinc-600 hover:bg-zinc-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={executeStockAdjust}
                    className={cn(
                      "py-3 rounded-xl font-bold text-white transition-colors shadow-lg shadow-zinc-200",
                      adjustmentType === 'IN' ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"
                    )}
                  >
                    Confirm
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showBarcodeLabel && selectedProduct && (
        <BarcodeLabel
          value={selectedProduct.sku}
          label={selectedProduct.name}
          subLabel={selectedProduct.sku}
          onClose={() => setShowBarcodeLabel(false)}
        />
      )}
    </div>
  );
}
