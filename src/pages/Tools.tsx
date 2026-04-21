import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, updateDoc, doc, deleteDoc, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { Tool, UserProfile } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { 
  Wrench, 
  Plus, 
  Search, 
  Filter, 
  MoreVertical, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  User, 
  X, 
  Save, 
  Trash2,
  Loader2,
  ArrowRightLeft,
  Printer
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { BarcodeLabel } from '../components/BarcodeLabel';

export function Tools() {
  const { profile } = useAuth();
  const [tools, setTools] = useState<Tool[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [showBarcodeLabel, setShowBarcodeLabel] = useState(false);
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    serialNumber: '',
    category: '',
    condition: 'GOOD' as Tool['condition'],
    status: 'AVAILABLE' as Tool['status'],
    imageUrl: ''
  });

  const [checkoutData, setCheckoutData] = useState({
    userId: '',
    userName: '',
    isManualEntry: false
  });

  useEffect(() => {
    const toolsQuery = query(collection(db, 'tools'), orderBy('name'));
    const unsubscribeTools = onSnapshot(toolsQuery, (snapshot) => {
      const toolList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Tool));
      setTools(toolList);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'tools');
    });

    const usersQuery = query(collection(db, 'users'));
    const unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
      const userList = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
      setUsers(userList);
    });

    return () => {
      unsubscribeTools();
      unsubscribeUsers();
    };
  }, []);

  const handleAddTool = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const newTool = {
        ...formData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await addDoc(collection(db, 'tools'), newTool);
      toast.success('Tool added to register.');
      setIsAddModalOpen(false);
      setFormData({ name: '', serialNumber: '', category: '', condition: 'GOOD', status: 'AVAILABLE', imageUrl: '' });
    } catch (error) {
      toast.error('Failed to add tool.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateTool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTool) return;
    setSubmitting(true);
    try {
      const toolRef = doc(db, 'tools', selectedTool.id);
      await updateDoc(toolRef, {
        ...formData,
        updatedAt: new Date().toISOString()
      });
      toast.success('Tool updated.');
      setIsEditModalOpen(false);
      setSelectedTool(null);
    } catch (error) {
      toast.error('Failed to update tool.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTool) return;
    if (!checkoutData.isManualEntry && !checkoutData.userId) return;
    if (checkoutData.isManualEntry && !checkoutData.userName) return;

    setSubmitting(true);
    try {
      const toolRef = doc(db, 'tools', selectedTool.id);
      let assignedTo = checkoutData.userId;
      let assignedToName = checkoutData.userName;

      if (!checkoutData.isManualEntry) {
        const selectedUser = users.find(u => u.uid === checkoutData.userId);
        assignedTo = checkoutData.userId;
        assignedToName = selectedUser?.name || 'Unknown';
      } else {
        assignedTo = 'MANUAL'; // Marker for manual entry
      }

      await updateDoc(toolRef, {
        status: 'IN_USE',
        assignedTo,
        assignedToName,
        lastCheckedOut: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      toast.success(`Tool checked out to ${assignedToName}.`);
      setIsCheckoutModalOpen(false);
      setSelectedTool(null);
      setCheckoutData({ userId: '', userName: '', isManualEntry: false });
    } catch (error) {
      toast.error('Failed to checkout tool.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckIn = async (tool: Tool) => {
    try {
      const toolRef = doc(db, 'tools', tool.id);
      await updateDoc(toolRef, {
        status: 'AVAILABLE',
        assignedTo: null,
        assignedToName: null,
        updatedAt: new Date().toISOString()
      });
      toast.success('Tool checked back in.');
    } catch (error) {
      toast.error('Failed to check in tool.');
    }
  };

  const handleDeleteTool = async (id: string) => {
    if (!window.confirm('Are you sure you want to remove this tool from the register?')) return;
    try {
      await deleteDoc(doc(db, 'tools', id));
      toast.success('Tool removed.');
    } catch (error) {
      toast.error('Failed to remove tool.');
    }
  };

  const filteredTools = tools.filter(tool => {
    const matchesSearch = tool.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          tool.serialNumber.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === 'ALL' || tool.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const getStatusColor = (status: Tool['status']) => {
    switch (status) {
      case 'AVAILABLE': return 'bg-emerald-100 text-emerald-700';
      case 'IN_USE': return 'bg-amber-100 text-amber-700';
      case 'MAINTENANCE': return 'bg-blue-100 text-blue-700';
      case 'LOST': return 'bg-red-100 text-red-700';
      default: return 'bg-zinc-100 text-zinc-700';
    }
  };

  const getConditionColor = (condition: Tool['condition']) => {
    switch (condition) {
      case 'GOOD': return 'text-emerald-600';
      case 'FAIR': return 'text-amber-600';
      case 'POOR': return 'text-red-600';
      default: return 'text-zinc-600';
    }
  };

  const isStorekeeper = profile?.role === 'admin' || profile?.role === 'storekeeper';
  const isAdmin = profile?.role === 'admin';

  if (loading) return <div className="flex items-center justify-center h-full">Loading...</div>;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900">Tool Register</h2>
          <p className="text-zinc-500">Track company tools, equipment, and their current assignments.</p>
        </div>
        {isStorekeeper && (
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center justify-center gap-2 bg-zinc-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-zinc-800 transition-all shadow-lg shadow-zinc-200"
          >
            <Plus size={20} />
            Register New Tool
          </button>
        )}
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={20} />
          <input
            type="text"
            placeholder="Search by name or serial number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all bg-white"
          />
        </div>
        <div className="flex items-center gap-2 bg-white border border-zinc-200 rounded-xl px-4 py-2">
          <Filter size={18} className="text-zinc-400" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-transparent border-none focus:ring-0 text-sm font-medium text-zinc-600 cursor-pointer"
          >
            <option value="ALL">All Status</option>
            <option value="AVAILABLE">Available</option>
            <option value="IN_USE">In Use</option>
            <option value="MAINTENANCE">Maintenance</option>
            <option value="LOST">Lost</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTools.map((tool) => (
          <div key={tool.id} className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden flex flex-col group hover:border-zinc-300 transition-all">
            {tool.imageUrl && (
              <div className="h-48 w-full overflow-hidden border-b border-zinc-100">
                <img 
                  src={tool.imageUrl} 
                  alt={tool.name} 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  referrerPolicy="no-referrer"
                />
              </div>
            )}
            <div className="p-6 space-y-4 flex-1">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-zinc-900">{tool.name}</h3>
                  <p className="text-xs font-mono text-zinc-400 uppercase tracking-wider">{tool.serialNumber}</p>
                </div>
                <div className={cn("px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest", getStatusColor(tool.status))}>
                  {tool.status.replace('_', ' ')}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 py-2">
                <div className="space-y-1">
                  <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Category</p>
                  <p className="text-sm font-medium text-zinc-700">{tool.category}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Condition</p>
                  <p className={cn("text-sm font-bold", getConditionColor(tool.condition))}>{tool.condition}</p>
                </div>
              </div>

              {tool.status === 'IN_USE' && (
                <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-100 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-zinc-200 flex items-center justify-center text-zinc-600 text-xs font-bold uppercase">
                    {tool.assignedToName?.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-zinc-400 font-medium">Assigned to</p>
                    <p className="text-sm font-bold text-zinc-900 truncate">{tool.assignedToName}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-100 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setSelectedTool(tool);
                    setShowBarcodeLabel(true);
                  }}
                  className="p-2 text-zinc-400 hover:text-blue-600 transition-colors"
                  title="Print Barcode"
                >
                  <Printer size={18} />
                </button>
                {isStorekeeper && (
                  <button
                    onClick={() => {
                      setSelectedTool(tool);
                      setFormData({
                        name: tool.name,
                        serialNumber: tool.serialNumber,
                        category: tool.category,
                        condition: tool.condition,
                        status: tool.status,
                        imageUrl: tool.imageUrl || ''
                      });
                      setIsEditModalOpen(true);
                    }}
                    className="p-2 text-zinc-400 hover:text-zinc-900 transition-colors"
                  >
                    <MoreVertical size={18} />
                  </button>
                )}
                {isAdmin && (
                  <button
                    onClick={() => handleDeleteTool(tool.id)}
                    className="p-2 text-zinc-400 hover:text-red-600 transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>

              {tool.status === 'AVAILABLE' ? (
                <button
                  onClick={() => {
                    setSelectedTool(tool);
                    setIsCheckoutModalOpen(true);
                  }}
                  className="flex items-center gap-2 bg-zinc-900 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-zinc-800 transition-all"
                >
                  <ArrowRightLeft size={14} />
                  Checkout
                </button>
              ) : tool.status === 'IN_USE' ? (
                <button
                  onClick={() => handleCheckIn(tool)}
                  className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-emerald-700 transition-all"
                >
                  <CheckCircle2 size={14} />
                  Check In
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {/* Add/Edit Modal */}
      {(isAddModalOpen || isEditModalOpen) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-2xl font-bold text-zinc-900">{isAddModalOpen ? 'Register New Tool' : 'Edit Tool'}</h3>
              <button onClick={() => { setIsAddModalOpen(false); setIsEditModalOpen(false); }} className="p-2 text-zinc-400 hover:text-zinc-900">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={isAddModalOpen ? handleAddTool : handleUpdateTool} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Tool Name</label>
                <input
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  placeholder="e.g. Cordless Drill"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Serial Number</label>
                <input
                  required
                  value={formData.serialNumber}
                  onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  placeholder="e.g. SN-123456"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Category</label>
                <input
                  required
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  placeholder="e.g. Power Tools"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Condition</label>
                  <select
                    value={formData.condition}
                    onChange={(e) => setFormData({ ...formData, condition: e.target.value as any })}
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  >
                    <option value="GOOD">Good</option>
                    <option value="FAIR">Fair</option>
                    <option value="POOR">Poor</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  >
                    <option value="AVAILABLE">Available</option>
                    <option value="MAINTENANCE">Maintenance</option>
                    <option value="LOST">Lost</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Tool Photo URL</label>
                <input
                  value={formData.imageUrl}
                  onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  placeholder="https://example.com/photo.jpg"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-zinc-900 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-zinc-800 transition-all disabled:opacity-50 mt-4"
              >
                {submitting ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                {isAddModalOpen ? 'Register Tool' : 'Save Changes'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Checkout Modal */}
      {isCheckoutModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-2xl font-bold text-zinc-900">Checkout Tool</h3>
              <button onClick={() => setIsCheckoutModalOpen(false)} className="p-2 text-zinc-400 hover:text-zinc-900">
                <X size={24} />
              </button>
            </div>

            <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100 space-y-1">
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Tool</p>
              <p className="text-lg font-bold text-zinc-900">{selectedTool?.name}</p>
              <p className="text-xs font-mono text-zinc-500">{selectedTool?.serialNumber}</p>
            </div>

            <form onSubmit={handleCheckout} className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Assign to</label>
                <button
                  type="button"
                  onClick={() => setCheckoutData({ ...checkoutData, isManualEntry: !checkoutData.isManualEntry, userId: '', userName: '' })}
                  className="text-[10px] font-bold text-zinc-500 hover:text-zinc-900 uppercase tracking-widest underline underline-offset-4"
                >
                  {checkoutData.isManualEntry ? 'Select from list' : 'Manual Entry'}
                </button>
              </div>

              {checkoutData.isManualEntry ? (
                <div className="space-y-2">
                  <input
                    required
                    value={checkoutData.userName}
                    onChange={(e) => setCheckoutData({ ...checkoutData, userName: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder="Enter person's name..."
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <select
                    required
                    value={checkoutData.userId}
                    onChange={(e) => setCheckoutData({ ...checkoutData, userId: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  >
                    <option value="">Select a technician...</option>
                    {users.map((user) => (
                      <option key={user.uid} value={user.uid}>{user.name} ({user.role})</option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || (!checkoutData.isManualEntry && !checkoutData.userId) || (checkoutData.isManualEntry && !checkoutData.userName)}
                className="w-full bg-zinc-900 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-zinc-800 transition-all disabled:opacity-50 mt-4"
              >
                {submitting ? <Loader2 className="animate-spin" size={20} /> : <ArrowRightLeft size={20} />}
                Confirm Checkout
              </button>
            </form>
          </div>
        </div>
      )}

      {showBarcodeLabel && selectedTool && (
        <BarcodeLabel
          value={selectedTool.serialNumber}
          label={selectedTool.name}
          subLabel={selectedTool.serialNumber}
          onClose={() => setShowBarcodeLabel(false)}
        />
      )}
    </div>
  );
}
