import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, updateDoc, doc, runTransaction, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { Product, PurchaseOrder } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { 
  ShoppingCart, 
  Plus, 
  Search, 
  Package, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  ArrowRight, 
  Trash2, 
  Loader2,
  AlertCircle,
  Truck,
  Printer,
  Edit2
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

export function Orders() {
  const { profile } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Draft Order State
  const [draftItems, setDraftItems] = useState<{product: Product, quantity: number}[]>([]);
  const [notes, setNotes] = useState('');
  const [editingOrder, setEditingOrder] = useState<PurchaseOrder | null>(null);
  const [comparisonOrder, setComparisonOrder] = useState<PurchaseOrder | null>(null);

  // const isStorekeeper = profile?.role === 'admin' || profile?.role === 'storekeeper';
  const isStorekeeper = profile?.role === 'admin' || profile?.role === 'storekeeper';

  useEffect(() => {
    const productsQuery = query(collection(db, 'products'));
    const ordersQuery = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));

    const unsubscribeProducts = onSnapshot(productsQuery, (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'products');
    });

    const unsubscribeOrders = onSnapshot(ordersQuery, (snapshot) => {
      setOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PurchaseOrder)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'orders');
    });

    return () => {
      unsubscribeProducts();
      unsubscribeOrders();
    };
  }, []);

  const lowStockProducts = products.filter(p => p.isLowStock);
  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const addToDraft = (product: Product) => {
    setDraftItems(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item => 
          item.product.id === product.id 
            ? { ...item, quantity: item.quantity + 1 } 
            : item
        );
      }
      // If low stock, suggest quantity to reach minStock
      const suggestedQty = product.isLowStock ? Math.max(1, product.minStock - product.stockQuantity) : 1;
      return [...prev, { product, quantity: suggestedQty }];
    });
    toast.success(`Added ${product.name} to order`);
  };

  const startEditOrder = (order: PurchaseOrder) => {
    setEditingOrder(order);
    const orderDraftItems = order.items.map(item => {
      const p = products.find(prod => prod.id === item.productId) || {
        id: item.productId,
        name: item.name,
        sku: item.sku,
        stockQuantity: 0,
        minStock: 0,
        isLowStock: false
      } as Product;
      return { product: p, quantity: item.quantity };
    });
    setDraftItems(orderDraftItems);
    setNotes(order.notes || '');
    setIsCreating(true);
  };

  const removeFromDraft = (productId: string) => {
    setDraftItems(prev => prev.filter(item => item.product.id !== productId));
  };

  const updateDraftQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromDraft(productId);
      return;
    }
    setDraftItems(prev => prev.map(item => 
      item.product.id === productId ? { ...item, quantity } : item
    ));
  };

  const createOrder = async () => {
    if (!profile || draftItems.length === 0) return;

    setLoading(true);
    try {
      if (editingOrder) {
        const orderRef = doc(db, 'orders', editingOrder.id);
        await updateDoc(orderRef, {
          items: draftItems.map(item => ({
            productId: item.product.id,
            sku: item.product.sku,
            name: item.product.name,
            quantity: item.quantity,
            receivedQuantity: editingOrder.items.find(i => i.productId === item.product.id)?.receivedQuantity || 0
          })),
          totalItems: draftItems.reduce((acc, item) => acc + item.quantity, 0),
          notes,
          updatedAt: new Date().toISOString()
        });
        toast.success(`Order ${editingOrder.orderNumber} updated successfully!`);
      } else {
        const orderNumber = `PO-${Date.now().toString().slice(-6)}`;
        const orderData = {
          orderNumber,
          creatorId: profile.uid,
          creatorName: profile.name,
          status: 'PENDING',
          items: draftItems.map(item => ({
            productId: item.product.id,
            sku: item.product.sku,
            name: item.product.name,
            quantity: item.quantity,
            receivedQuantity: 0
          })),
          totalItems: draftItems.reduce((acc, item) => acc + item.quantity, 0),
          notes,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        await addDoc(collection(db, 'orders'), orderData);
        toast.success(`Order ${orderNumber} created successfully!`);
      }
      setDraftItems([]);
      setNotes('');
      setIsCreating(false);
      setEditingOrder(null);
    } catch (error) {
      console.error(error);
      toast.error(editingOrder ? 'Failed to update order.' : 'Failed to create order.');
    } finally {
      setLoading(false);
    }
  };

  const updateOrderStatus = async (orderId: string, status: PurchaseOrder['status']) => {
    try {
      const orderRef = doc(db, 'orders', orderId);
      await updateDoc(orderRef, {
        status,
        updatedAt: new Date().toISOString(),
        ...(status === 'RECEIVED' ? { receivedAt: new Date().toISOString() } : {})
      });
      toast.success(`Order status updated to ${status}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `orders/${orderId}`);
    }
  };

  const [receivingOrder, setReceivingOrder] = useState<PurchaseOrder | null>(null);
  const [receiveQuants, setReceiveQuants] = useState<{[sku: string]: number}>({});
  const [orderToCancel, setOrderToCancel] = useState<PurchaseOrder | null>(null);
  const [itemToCancel, setItemToCancel] = useState<{order: PurchaseOrder, sku: string} | null>(null);

  const cancelOrderItem = async () => {
    if (!itemToCancel) return;
    const { order, sku } = itemToCancel;

    setLoading(true);
    try {
      const orderRef = doc(db, 'orders', order.id);
      const updatedItems = order.items.map(item => 
        item.sku === sku ? { ...item, isCancelled: true } : item
      );

      const allFulfilled = updatedItems.every(item => 
        item.isCancelled || (item.receivedQuantity >= item.quantity)
      );

      await updateDoc(orderRef, {
        items: updatedItems,
        status: allFulfilled ? 'RECEIVED' : order.status,
        updatedAt: new Date().toISOString(),
        ...(allFulfilled ? { receivedAt: new Date().toISOString() } : {})
      });

      toast.success(`Item ${sku} cancelled from order.`);
      if (comparisonOrder && comparisonOrder.id === order.id) {
        setComparisonOrder({ ...comparisonOrder, items: updatedItems });
      }
      setItemToCancel(null);
    } catch (error) {
      console.error(error);
      toast.error('Failed to cancel item.');
    } finally {
      setLoading(false);
    }
  };

  const receivePartialOrder = async (order: PurchaseOrder, quantities: {[sku: string]: number}) => {
    if (!profile) return;
    setLoading(true);
    try {
      await runTransaction(db, async (transaction) => {
        const orderRef = doc(db, 'orders', order.id);
        const orderDoc = await transaction.get(orderRef);
        if (!orderDoc.exists()) throw new Error("Order not found");
        
        const currentOrderData = orderDoc.data() as PurchaseOrder;
        const updatedItems = currentOrderData.items.map(item => {
          const receivedNow = quantities[item.sku] || 0;
          if (receivedNow <= 0) return item;

          return {
            ...item,
            receivedQuantity: (item.receivedQuantity || 0) + receivedNow
          };
        });

        // Update product stocks for items received now
        for (const item of order.items) {
          const receivedNow = quantities[item.sku] || 0;
          if (receivedNow <= 0) continue;

          const productRef = doc(db, 'products', item.productId);
          const pDoc = await transaction.get(productRef);
          
          if (pDoc.exists()) {
            const currentStock = pDoc.data().stockQuantity;
            const newStock = currentStock + receivedNow;
            
            transaction.update(productRef, {
              stockQuantity: newStock,
              isLowStock: newStock <= pDoc.data().minStock,
              updatedAt: new Date().toISOString()
            });

            // Create transaction record
            const txRef = doc(collection(db, 'transactions'));
            transaction.set(txRef, {
              productId: item.productId,
              type: 'IN',
              quantity: receivedNow,
              previousStock: currentStock,
              newStock,
              userId: profile.uid,
              timestamp: new Date().toISOString(),
              notes: `Partial Receipt from Order ${order.orderNumber}`
            });
          }
        }

        const allReceived = updatedItems.every(item => item.isCancelled || item.receivedQuantity >= item.quantity);
        
        transaction.update(orderRef, {
          items: updatedItems,
          status: allReceived ? 'RECEIVED' : (currentOrderData.status === 'PENDING' ? 'ORDERED' : currentOrderData.status),
          updatedAt: new Date().toISOString(),
          ...(allReceived ? { receivedAt: new Date().toISOString() } : {})
        });
      });
      toast.success(`Order ${order.orderNumber} updated successfully!`);
      setReceivingOrder(null);
      setReceiveQuants({});
    } catch (error) {
      console.error(error);
      toast.error('Failed to update order receipt.');
    } finally {
      setLoading(false);
    }
  };

  const printOrder = (order: PurchaseOrder) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const content = `
      <html>
        <head>
          <title>Order ${order.orderNumber}</title>
          <style>
            body { font-family: sans-serif; padding: 40px; color: #18181b; }
            .header { border-bottom: 2px solid #e4e4e7; padding-bottom: 20px; margin-bottom: 30px; }
            .order-info { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 40px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 40px; }
            th { text-align: left; background: #f4f4f5; padding: 12px; border-bottom: 1px solid #e4e4e7; }
            td { padding: 12px; border-bottom: 1px solid #e4e4e7; }
            .footer { margin-top: 50px; font-size: 12px; color: #71717a; text-align: center; }
            .status { font-weight: bold; text-transform: uppercase; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Purchase Order Details</h1>
            <p>Generated on ${format(new Date(), 'PPpp')}</p>
          </div>
          
          <div class="order-info">
            <div>
              <p><strong>Order Number:</strong> ${order.orderNumber}</p>
              <p><strong>Status:</strong> <span class="status">${order.status}</span></p>
              <p><strong>Created By:</strong> ${order.creatorName}</p>
            </div>
            <div>
              <p><strong>Date Placed:</strong> ${format(new Date(order.createdAt), 'PPP')}</p>
              ${order.receivedAt ? `<p><strong>Date Received:</strong> ${format(new Date(order.receivedAt), 'PPP')}</p>` : ''}
              ${order.notes ? `<p><strong>Notes:</strong> ${order.notes}</p>` : ''}
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Product Name</th>
                <th>Ordered Quantity</th>
              </tr>
            </thead>
            <tbody>
              ${order.items.map(item => `
                <tr>
                  <td>${item.sku}</td>
                  <td>${item.name}</td>
                  <td>${item.quantity}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="footer">
            <p>FixIt Inventory Management System</p>
          </div>

          <script>
            window.onload = () => {
              window.print();
              // window.close();
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(content);
    printWindow.document.close();
  };

  if (loading && orders.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-zinc-400" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900">Stock Orders</h2>
          <p className="text-zinc-500">Manage procurement and track supplier shipments.</p>
        </div>
        {isStorekeeper && !isCreating && (
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center justify-center gap-2 bg-zinc-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-zinc-800 transition-all shadow-lg shadow-zinc-200"
          >
            <Plus size={20} />
            New Purchase Order
          </button>
        )}
      </div>

      {isCreating ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-zinc-900">
                  {editingOrder ? `Edit Order ${editingOrder.orderNumber}` : 'New Purchase Order'}
                </h3>
                <span className="text-sm font-medium text-zinc-500">{draftItems.length} Products</span>
              </div>
              
              {draftItems.length === 0 ? (
                <div className="py-12 text-center space-y-3">
                  <div className="w-16 h-16 bg-zinc-50 text-zinc-300 rounded-full flex items-center justify-center mx-auto">
                    <ShoppingCart size={32} />
                  </div>
                  <p className="text-zinc-500">Your order is empty. Select products from the list.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {draftItems.map(({ product, quantity }) => (
                    <div key={product.id} className="flex items-center justify-between p-4 bg-zinc-50 rounded-xl border border-zinc-100">
                      <div className="flex-1">
                        <h4 className="font-bold text-zinc-900">{product.name}</h4>
                        <p className="text-xs font-mono text-zinc-500">
                          {product.sku} | Current: {product.stockQuantity} | Min: {product.minStock}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 bg-white border border-zinc-200 rounded-lg p-1">
                          <button 
                            onClick={() => updateDraftQuantity(product.id, quantity - 1)}
                            className="p-1 px-2 hover:bg-zinc-50 rounded transition-colors"
                          >
                            -
                          </button>
                          <input 
                            type="number" 
                            value={quantity}
                            onChange={(e) => updateDraftQuantity(product.id, Number(e.target.value))}
                            className="w-12 text-center font-bold focus:outline-none"
                          />
                          <button 
                            onClick={() => updateDraftQuantity(product.id, quantity + 1)}
                            className="p-1 px-2 hover:bg-zinc-50 rounded transition-colors"
                          >
                            +
                          </button>
                        </div>
                        <button 
                          onClick={() => removeFromDraft(product.id)}
                          className="p-2 text-zinc-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                  
                  <div className="pt-4 border-t border-zinc-100">
                    <label className="text-sm font-bold text-zinc-700 block mb-2">Order Notes (Optional)</label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Enter supplier details or delivery instructions..."
                      className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all resize-none h-24"
                    />
                  </div>

                  <div className="flex gap-4 pt-4">
                    <button
                      onClick={() => {
                        setIsCreating(false);
                        setEditingOrder(null);
                        setDraftItems([]);
                        setNotes('');
                      }}
                      className="flex-1 bg-white text-zinc-600 py-4 rounded-xl font-bold border border-zinc-200 hover:bg-zinc-50 transition-all"
                    >
                      Discard {editingOrder ? 'Changes' : 'Draft'}
                    </button>
                    <button
                      onClick={createOrder}
                      disabled={draftItems.length === 0 || loading}
                      className="flex-1 bg-zinc-900 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-zinc-800 transition-all disabled:opacity-50 shadow-lg shadow-zinc-200"
                    >
                      <ShoppingCart size={20} />
                      {loading ? (editingOrder ? 'Updating...' : 'Creating...') : (editingOrder ? 'Update Order' : 'Place Order')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-4">
              <h3 className="font-bold text-zinc-900 flex items-center gap-2">
                <AlertCircle size={18} className="text-amber-500" />
                Suggested (Low Stock)
              </h3>
              <div className="space-y-3">
                {lowStockProducts.length === 0 ? (
                  <p className="text-sm text-zinc-500 italic text-center py-4">No low stock alerts.</p>
                ) : (
                  lowStockProducts.map(product => (
                    <button
                      key={product.id}
                      onClick={() => addToDraft(product)}
                      className="w-full text-left p-3 hover:bg-zinc-50 rounded-xl border border-zinc-100 transition-all group border-l-4 border-l-amber-500"
                    >
                      <p className="font-bold text-sm text-zinc-900">{product.name}</p>
                      <div className="flex justify-between items-center mt-1">
                        <span className="text-[10px] uppercase tracking-wider font-bold text-zinc-400">{product.sku}</span>
                        <div className="flex gap-2">
                           <span className="text-xs font-bold text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded-full">Min: {product.minStock}</span>
                           <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Stock: {product.stockQuantity}</span>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-4">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Search products..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-sm rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                />
              </div>
              <div className="max-h-[400px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                {filteredProducts.map(product => (
                  <div key={product.id} className="flex items-center justify-between p-3 rounded-xl border border-zinc-100 hover:border-zinc-300 transition-all">
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-zinc-900 truncate">{product.name}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-zinc-400 font-mono">{product.sku}</span>
                        <span className={cn(
                          "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                          product.isLowStock ? "bg-amber-50 text-amber-600" : "bg-zinc-100 text-zinc-500"
                        )}>
                          {product.stockQuantity} / {product.minStock}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => addToDraft(product)}
                      className="p-1 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-all"
                    >
                      <Plus size={18} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {orders.length === 0 ? (
            <div className="bg-white py-24 text-center rounded-3xl border border-dashed border-zinc-300 space-y-4">
              <div className="w-20 h-20 bg-zinc-50 text-zinc-200 rounded-full flex items-center justify-center mx-auto">
                <Package size={40} />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-bold text-zinc-900">No Orders Found</h3>
                <p className="text-zinc-500">Create your first purchase order to restock inventory.</p>
              </div>
              <button
                onClick={() => setIsCreating(true)}
                className="inline-flex items-center gap-2 text-zinc-900 font-bold hover:underline"
              >
                <Plus size={20} />
                Create New Order
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-50/50 border-bottom border-zinc-100">
                    <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-widest">Order Info</th>
                    <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-widest">Items</th>
                    <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-widest">Status</th>
                    <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-widest">Date</th>
                    <th className="px-6 py-4 text-xs font-bold text-zinc-400 uppercase tracking-widest text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 font-medium">
                  {orders.map((order) => (
                    <tr key={order.id} className="hover:bg-zinc-50/50 transition-colors">
                      <td className="px-6 py-5">
                        <div className="flex flex-col">
                          <span className="font-bold text-zinc-900">{order.orderNumber}</span>
                          <span className="text-xs text-zinc-500">By {order.creatorName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex flex-col">
                          <span className="text-zinc-600">{order.totalItems} Items</span>
                          <span className="text-xs text-zinc-400 truncate max-w-[200px]">
                            {order.items.map(i => i.name).join(', ')}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold",
                          order.status === 'PENDING' && "bg-amber-50 text-amber-600",
                          order.status === 'ORDERED' && "bg-blue-50 text-blue-600",
                          order.status === 'RECEIVED' && "bg-emerald-50 text-emerald-600",
                          order.status === 'CANCELLED' && "bg-red-50 text-red-600",
                        )}>
                          {order.status === 'PENDING' && <Clock size={14} />}
                          {order.status === 'ORDERED' && <Truck size={14} />}
                          {order.status === 'RECEIVED' && <CheckCircle2 size={14} />}
                          {order.status === 'CANCELLED' && <XCircle size={14} />}
                          {order.status}
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <span className="text-zinc-500 text-sm">
                          {format(new Date(order.createdAt), 'MMM d, yyyy')}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-right">
                        <div className="flex items-center justify-end gap-2 text-xs font-bold text-zinc-400 mb-1">
                          <span>{order.items.reduce((acc, i) => acc + (i.receivedQuantity || 0), 0)} / {order.totalItems} RECEIVED</span>
                        </div>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setComparisonOrder(order)}
                            className="p-2 text-zinc-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-all"
                            title="Compare Ordered vs Received"
                          >
                            <ArrowRight size={20} />
                          </button>
                          <button
                            onClick={() => printOrder(order)}
                            className="p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-lg transition-all"
                            title="Print Order"
                          >
                            <Printer size={20} />
                          </button>
                          {order.status === 'PENDING' && (
                            <>
                              <button
                                onClick={() => startEditOrder(order)}
                                className="p-2 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                title="Edit Order"
                              >
                                <Edit2 size={20} />
                              </button>
                              <button
                                onClick={() => updateOrderStatus(order.id, 'ORDERED')}
                                className="p-2 text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                                title="Mark as Ordered"
                              >
                                <Truck size={20} />
                              </button>
                            </>
                          )}
                          {order.status === 'ORDERED' && (
                            <button
                              onClick={() => {
                                setReceivingOrder(order);
                                const initialQuants: {[sku: string]: number} = {};
                                order.items.forEach(item => {
                                  initialQuants[item.sku] = item.quantity - (item.receivedQuantity || 0);
                                });
                                setReceiveQuants(initialQuants);
                              }}
                              className="p-2 text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                              title="Record Receipt"
                            >
                              <CheckCircle2 size={20} />
                            </button>
                          )}
                          {order.status !== 'RECEIVED' && order.status !== 'CANCELLED' && (
                            <button
                              onClick={() => setOrderToCancel(order)}
                              className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                              title="Cancel Order"
                            >
                              <XCircle size={20} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Order Cancel Confirmation Modal */}
      {orderToCancel && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-3xl p-8 shadow-2xl space-y-6 text-center">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto">
              <XCircle size={32} />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-zinc-900">Cancel Order?</h3>
              <p className="text-sm text-zinc-500">
                Are you sure you want to cancel {orderToCancel.orderNumber}? This will mark the order as void.
              </p>
            </div>
            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={() => {
                  updateOrderStatus(orderToCancel.id, 'CANCELLED');
                  setOrderToCancel(null);
                }}
                className="w-full bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-100"
              >
                Yes, Cancel Order
              </button>
              <button
                onClick={() => setOrderToCancel(null)}
                className="w-full bg-zinc-100 text-zinc-600 py-3 rounded-xl font-bold hover:bg-zinc-200 transition-all"
              >
                Go Back
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Item Cancel Confirmation Modal */}
      {itemToCancel && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-3xl p-8 shadow-2xl space-y-6 text-center">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto">
              <XCircle size={32} />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-zinc-900">Cancel Item?</h3>
              <p className="text-sm text-zinc-500">
                Are you sure you want to void {itemToCancel.sku} from this order?
              </p>
            </div>
            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={cancelOrderItem}
                className="w-full bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-100"
              >
                Yes, Cancel Item
              </button>
              <button
                onClick={() => setItemToCancel(null)}
                className="w-full bg-zinc-100 text-zinc-600 py-3 rounded-xl font-bold hover:bg-zinc-200 transition-all"
              >
                Go Back
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Comparison Modal */}
      {comparisonOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-2xl rounded-3xl p-8 shadow-2xl space-y-6">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-2xl font-bold text-zinc-900">Order Comparison</h3>
                <p className="text-sm font-mono text-zinc-500">PO: {comparisonOrder.orderNumber} | {comparisonOrder.status}</p>
              </div>
              <button 
                onClick={() => setComparisonOrder(null)} 
                className="p-2 text-zinc-400 hover:text-zinc-900 bg-zinc-50 rounded-full"
              >
                <XCircle size={24} />
              </button>
            </div>

            <div className="bg-zinc-50 rounded-2xl border border-zinc-100 overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-zinc-100/50 border-b border-zinc-200">
                    <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase">Product</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase text-center">Ordered</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase text-center">Received</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase text-center">Remaining</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase text-right">Status</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {comparisonOrder.items.map(item => {
                    const remaining = item.quantity - (item.receivedQuantity || 0);
                    const isFullyReceived = remaining <= 0 || item.isCancelled;
                    return (
                      <tr key={item.sku} className={cn("bg-white hover:bg-zinc-50/50 transition-colors", item.isCancelled && "opacity-50")}>
                        <td className="px-4 py-4">
                          <p className="font-bold text-sm text-zinc-900">{item.name}</p>
                          <p className="text-[10px] text-zinc-400 font-mono">{item.sku}</p>
                        </td>
                        <td className="px-4 py-4 text-sm font-bold text-zinc-900 text-center">{item.quantity}</td>
                        <td className="px-4 py-4 text-sm font-bold text-emerald-600 text-center">{item.receivedQuantity || 0}</td>
                        <td className="px-4 py-4 text-sm font-bold text-amber-600 text-center">{item.isCancelled ? 0 : remaining}</td>
                        <td className="px-4 py-4 text-right">
                          <span className={cn(
                            "text-[10px] font-bold px-2 py-0.5 rounded-full",
                            item.isCancelled ? "bg-red-100 text-red-700" : (isFullyReceived ? "bg-emerald-100 text-emerald-700" : (item.receivedQuantity > 0 ? "bg-blue-100 text-blue-700" : "bg-zinc-100 text-zinc-500"))
                          )}>
                            {item.isCancelled ? 'CANCELLED' : (isFullyReceived ? 'FULFILLED' : (item.receivedQuantity > 0 ? 'PARTIAL' : 'PENDING'))}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right">
                          {!item.isCancelled && !isFullyReceived && comparisonOrder.status !== 'CANCELLED' && (
                            <button
                              onClick={() => setItemToCancel({ order: comparisonOrder, sku: item.sku })}
                              className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                              title="Cancel Item"
                            >
                              <XCircle size={16} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setComparisonOrder(null)}
                className="px-6 py-3 rounded-xl border border-zinc-200 font-bold text-zinc-600 hover:bg-zinc-50 transition-all"
              >
                Close
              </button>
              {comparisonOrder.status !== 'RECEIVED' && comparisonOrder.status !== 'CANCELLED' && (
                <button
                  onClick={() => {
                    setReceivingOrder(comparisonOrder);
                    setComparisonOrder(null);
                    const initialQuants: {[sku: string]: number} = {};
                    comparisonOrder.items.forEach(item => {
                      initialQuants[item.sku] = item.quantity - (item.receivedQuantity || 0);
                    });
                    setReceiveQuants(initialQuants);
                  }}
                  className="px-6 py-3 rounded-xl bg-zinc-900 text-white font-bold hover:bg-zinc-800 transition-all shadow-lg shadow-zinc-200"
                >
                  Record Receipt
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Manual Delivery / Partial Receipt Modal */}
      {receivingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-3xl p-8 shadow-2xl space-y-6">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-2xl font-bold text-zinc-900">Record Receipt</h3>
                <p className="text-sm font-mono text-zinc-500">PO: {receivingOrder.orderNumber}</p>
              </div>
              <button onClick={() => setReceivingOrder(null)} className="p-2 text-zinc-400 hover:text-zinc-900">
                <XCircle size={24} />
              </button>
            </div>

            <div className="space-y-4 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
              {receivingOrder.items.map(item => {
                const remaining = item.quantity - (item.receivedQuantity || 0);
                return (
                  <div key={item.sku} className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-bold text-zinc-900">{item.name}</p>
                        <p className="text-xs text-zinc-400 font-mono">{item.sku}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold text-zinc-400 uppercase">Remaining</p>
                        <p className="text-sm font-bold text-zinc-900">{remaining} / {item.quantity}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <label className="text-xs font-bold text-zinc-500 uppercase flex-1">Qty Received Now:</label>
                      <input
                        type="number"
                        min="0"
                        max={remaining}
                        value={receiveQuants[item.sku] ?? 0}
                        onChange={(e) => setReceiveQuants(prev => ({
                          ...prev,
                          [item.sku]: Math.min(remaining, Math.max(0, Number(e.target.value)))
                        }))}
                        className="w-24 text-center py-2 rounded-xl border border-zinc-200 font-bold focus:ring-2 focus:ring-zinc-900 focus:outline-none"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setReceivingOrder(null)}
                className="py-3 rounded-xl border border-zinc-200 font-bold text-zinc-600 hover:bg-zinc-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => receivePartialOrder(receivingOrder, receiveQuants)}
                className="py-3 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition-colors shadow-lg"
              >
                Save Receipt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
