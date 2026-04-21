export type UserRole = 'admin' | 'technician' | 'storekeeper';

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  subcategory: string;
  type: string;
  spec: string;
  stockQuantity: number;
  minStock: number;
  size?: string;
  isLowStock: boolean;
  barcode: string;
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  productId: string;
  type: 'IN' | 'OUT' | 'ADJUST';
  quantity: number;
  previousStock: number;
  newStock: number;
  userId: string;
  timestamp: string;
  notes?: string;
  jobId?: string;
}

export interface MaintenanceLog {
  id: string;
  jobId: string;
  equipmentName: string;
  technicianId: string;
  technicianName: string;
  timestamp: string;
  partsUsed: {
    productId: string;
    sku: string;
    name: string;
    quantity: number;
  }[];
}

export interface Tool {
  id: string;
  name: string;
  serialNumber: string;
  category: string;
  status: 'AVAILABLE' | 'IN_USE' | 'MAINTENANCE' | 'LOST';
  assignedTo?: string;
  assignedToName?: string;
  lastCheckedOut?: string;
  condition: 'GOOD' | 'FAIR' | 'POOR';
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrder {
  id: string;
  orderNumber: string;
  creatorId: string;
  creatorName: string;
  status: 'PENDING' | 'ORDERED' | 'RECEIVED' | 'CANCELLED';
  items: {
    productId: string;
    sku: string;
    name: string;
    quantity: number;
    receivedQuantity: number;
    isCancelled?: boolean;
  }[];
  totalItems: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  receivedAt?: string;
}
