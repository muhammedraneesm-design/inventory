import React, { useState } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { Product, Transaction, MaintenanceLog } from '../types';
import { Download, FileSpreadsheet, History, Wrench, Loader2, ShoppingCart } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function Reports() {
  const { profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState<string | null>(null);

  // const isStorekeeper = profile?.role === 'admin' || profile?.role === 'storekeeper';

  React.useEffect(() => {
    if (!authLoading && !profile) {
      navigate('/login');
    }
  }, [authLoading, profile, navigate]);

  const downloadCSV = (data: any[], filename: string) => {
    if (data.length === 0) {
      toast.error('No data available to download.');
      return;
    }

    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(','),
      ...data.map(row => 
        headers.map(header => {
          const val = row[header];
          // Handle strings with commas, newlines, or quotes
          if (typeof val === 'string') {
            return `"${val.replace(/"/g, '""')}"`;
          }
          // Handle arrays (like partsUsed in maintenance logs)
          if (Array.isArray(val)) {
            return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
          }
          return val;
        }).join(',')
      )
    ];

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadInventory = async () => {
    setLoading('inventory');
    try {
      const snapshot = await getDocs(collection(db, 'products'));
      const products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      downloadCSV(products, 'inventory_report');
      toast.success('Inventory report downloaded.');
    } catch (error) {
      console.error(error);
      toast.error('Failed to download inventory report.');
    } finally {
      setLoading(null);
    }
  };

  const handleDownloadTransactions = async () => {
    setLoading('transactions');
    try {
      const q = query(collection(db, 'transactions'), orderBy('timestamp', 'desc'));
      const snapshot = await getDocs(q);
      const transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      downloadCSV(transactions, 'transaction_history');
      toast.success('Transaction history downloaded.');
    } catch (error) {
      console.error(error);
      toast.error('Failed to download transaction history.');
    } finally {
      setLoading(null);
    }
  };

  const handleDownloadMaintenance = async () => {
    setLoading('maintenance');
    try {
      const q = query(collection(db, 'maintenance_logs'), orderBy('timestamp', 'desc'));
      const snapshot = await getDocs(q);
      const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      downloadCSV(logs, 'maintenance_logs');
      toast.success('Maintenance logs downloaded.');
    } catch (error) {
      console.error(error);
      toast.error('Failed to download maintenance logs.');
    } finally {
      setLoading(null);
    }
  };

  const handleDownloadOrders = async () => {
    setLoading('orders');
    try {
      const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const orders = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          orderNumber: data.orderNumber,
          creatorName: data.creatorName,
          status: data.status,
          totalItems: data.totalItems,
          createdAt: data.createdAt,
          items: JSON.stringify(data.items)
        };
      });
      downloadCSV(orders, 'purchase_orders');
      toast.success('Purchase orders report downloaded.');
    } catch (error) {
      console.error(error);
      toast.error('Failed to download orders report.');
    } finally {
      setLoading(null);
    }
  };

  const reportCards = [
    {
      id: 'inventory',
      title: 'Inventory Report',
      description: 'Complete list of all products, current stock levels, and categories.',
      icon: FileSpreadsheet,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      action: handleDownloadInventory
    },
    {
      id: 'transactions',
      title: 'Transaction History',
      description: 'Detailed log of all stock movements (IN, OUT, ADJUST).',
      icon: History,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
      action: handleDownloadTransactions
    },
    {
      id: 'maintenance',
      title: 'Maintenance Logs',
      description: 'Record of all maintenance jobs, equipment serviced, and parts used.',
      icon: Wrench,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
      action: handleDownloadMaintenance
    },
    {
      id: 'orders',
      title: 'Purchase Orders',
      description: 'List of all procurement orders, status tracking, and fulfillment.',
      icon: ShoppingCart,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      action: handleDownloadOrders
    }
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-1">
        <h2 className="text-3xl font-bold tracking-tight text-zinc-900">Reports</h2>
        <p className="text-zinc-500">Export your data to CSV for analysis and record-keeping.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {reportCards.map((report) => (
          <div key={report.id} className="bg-white p-8 rounded-3xl border border-zinc-200 shadow-sm flex flex-col h-full">
            <div className={`${report.bgColor} ${report.color} w-14 h-14 rounded-2xl flex items-center justify-center mb-6`}>
              <report.icon size={28} />
            </div>
            <h3 className="text-xl font-bold text-zinc-900 mb-2">{report.title}</h3>
            <p className="text-zinc-500 text-sm mb-8 flex-1">{report.description}</p>
            <button
              onClick={report.action}
              disabled={loading !== null}
              className="w-full flex items-center justify-center gap-2 bg-zinc-900 text-white py-4 rounded-2xl font-bold hover:bg-zinc-800 transition-all disabled:opacity-50"
            >
              {loading === report.id ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                <Download size={20} />
              )}
              {loading === report.id ? 'Generating...' : 'Download CSV'}
            </button>
          </div>
        ))}
      </div>

      <div className="bg-zinc-900 text-white p-8 rounded-3xl overflow-hidden relative">
        <div className="relative z-10 space-y-4">
          <h3 className="text-2xl font-bold">Need custom reports?</h3>
          <p className="text-zinc-400 max-w-md">
            Our reporting system is designed to be flexible. If you need specific data formats or automated reports, contact your administrator.
          </p>
        </div>
        <div className="absolute -right-12 -bottom-12 opacity-10">
          <FileSpreadsheet size={240} />
        </div>
      </div>
    </div>
  );
}
