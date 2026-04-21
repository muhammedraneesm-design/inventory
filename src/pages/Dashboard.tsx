import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, limit, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { Product, Transaction } from '../types';
import { Package, AlertTriangle, TrendingUp, History, PlusCircle, Wrench, FileSpreadsheet, ShoppingCart } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../contexts/AuthContext';

export function Dashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const isTechnician = profile?.role === 'admin' || profile?.role === 'storekeeper' || profile?.role === 'technician';
  const isStorekeeper = profile?.role === 'admin' || profile?.role === 'storekeeper';

  useEffect(() => {
    const productsQuery = query(collection(db, 'products'));
    const unsubscribeProducts = onSnapshot(productsQuery, (snapshot) => {
      const productList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
      setProducts(productList);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'products');
    });

    const transactionsQuery = query(
      collection(db, 'transactions'),
      orderBy('timestamp', 'desc'),
      limit(5)
    );
    const unsubscribeTransactions = onSnapshot(transactionsQuery, (snapshot) => {
      const transactionList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
      setRecentTransactions(transactionList);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'transactions');
    });

    return () => {
      unsubscribeProducts();
      unsubscribeTransactions();
    };
  }, []);

  const lowStockItems = products.filter(p => p.isLowStock);
  const totalItems = products.length;
  const totalStockValue = products.reduce((acc, p) => acc + p.stockQuantity, 0);

  const stats = [
    { label: 'Total Products', value: totalItems, icon: Package, color: 'bg-blue-500' },
    { label: 'Low Stock Alerts', value: lowStockItems.length, icon: AlertTriangle, color: 'bg-amber-500' },
    { label: 'Total Inventory', value: totalStockValue, icon: TrendingUp, color: 'bg-emerald-500' },
  ];

  if (loading) return <div className="flex items-center justify-center h-full">Loading...</div>;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-1">
        <h2 className="text-3xl font-bold tracking-tight text-zinc-900">Dashboard</h2>
        <p className="text-zinc-500">Overview of your maintenance inventory.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm flex items-center gap-4">
            <div className={`${stat.color} p-3 rounded-xl text-white`}>
              <stat.icon size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-500">{stat.label}</p>
              <p className="text-2xl font-bold text-zinc-900">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-4">
        <h3 className="text-lg font-bold text-zinc-900">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {isTechnician && (
            <button
              onClick={() => navigate('/add-product')}
              className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border border-zinc-100 hover:bg-zinc-50 transition-all group"
            >
              <div className="p-3 rounded-xl bg-zinc-100 text-zinc-600 group-hover:bg-zinc-900 group-hover:text-white transition-all">
                <PlusCircle size={24} />
              </div>
              <span className="text-sm font-bold text-zinc-700">Add Product</span>
            </button>
          )}
          <button
            onClick={() => navigate('/inventory')}
            className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border border-zinc-100 hover:bg-zinc-50 transition-all group"
          >
            <div className="p-3 rounded-xl bg-zinc-100 text-zinc-600 group-hover:bg-zinc-900 group-hover:text-white transition-all">
              <Package size={24} />
            </div>
            <span className="text-sm font-bold text-zinc-700">Inventory</span>
          </button>
          {isTechnician && (
            <button
              onClick={() => navigate('/maintenance')}
              className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border border-zinc-100 hover:bg-zinc-50 transition-all group"
            >
              <div className="p-3 rounded-xl bg-zinc-100 text-zinc-600 group-hover:bg-zinc-900 group-hover:text-white transition-all">
                <Wrench size={24} />
              </div>
              <span className="text-sm font-bold text-zinc-700">Maintenance</span>
            </button>
          )}
          {isStorekeeper && (
            <>
              <button
                onClick={() => navigate('/orders')}
                className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border border-zinc-100 hover:bg-zinc-50 transition-all group"
              >
                <div className="p-3 rounded-xl bg-zinc-100 text-zinc-600 group-hover:bg-zinc-900 group-hover:text-white transition-all">
                  <ShoppingCart size={24} />
                </div>
                <span className="text-sm font-bold text-zinc-700">Stock Orders</span>
              </button>
              <button
                onClick={() => navigate('/reports')}
                className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border border-zinc-100 hover:bg-zinc-50 transition-all group"
              >
                <div className="p-3 rounded-xl bg-zinc-100 text-zinc-600 group-hover:bg-zinc-900 group-hover:text-white transition-all">
                  <FileSpreadsheet size={24} />
                </div>
                <span className="text-sm font-bold text-zinc-700">Reports</span>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Low Stock Alerts */}
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
            <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
              <AlertTriangle size={20} className="text-amber-500" />
              Low Stock Items
            </h3>
            <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs font-bold uppercase tracking-wider">
              {lowStockItems.length} Critical
            </span>
          </div>
          <div className="divide-y divide-zinc-100">
            {lowStockItems.length > 0 ? (
              lowStockItems.map((product) => (
                <div key={product.id} className="p-4 flex items-center justify-between hover:bg-zinc-50 transition-colors">
                  <div>
                    <p className="font-medium text-zinc-900">{product.name}</p>
                    <p className="text-xs text-zinc-500 font-mono">{product.sku}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-red-600">{product.stockQuantity} / {product.minStock}</p>
                    <p className="text-[10px] text-zinc-400 uppercase tracking-tighter">Current / Min</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-zinc-400 italic">No low stock items.</div>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
            <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
              <History size={20} className="text-blue-500" />
              Recent Activity
            </h3>
          </div>
          <div className="divide-y divide-zinc-100">
            {recentTransactions.length > 0 ? (
              recentTransactions.map((tx) => (
                <div key={tx.id} className="p-4 flex items-center gap-4 hover:bg-zinc-50 transition-colors">
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold",
                    tx.type === 'IN' ? "bg-emerald-50 text-emerald-700" : 
                    tx.type === 'OUT' ? "bg-red-50 text-red-700" : "bg-zinc-100 text-zinc-700"
                  )}>
                    {tx.type}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-900 truncate">
                      {tx.type === 'IN' ? 'Restocked' : tx.type === 'OUT' ? 'Consumed' : 'Adjusted'} {tx.quantity} units
                    </p>
                    <p className="text-xs text-zinc-500">
                      {format(new Date(tx.timestamp), 'MMM d, h:mm a')}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-zinc-400 italic">No recent activity.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
