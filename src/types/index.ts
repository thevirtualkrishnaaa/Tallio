// Core domain types — org-scoped, currency-agnostic, custom-attribute friendly

export interface Currency {
  code: string;   // e.g. 'INR', 'USD'
  symbol: string; // e.g. '₹', '$'
}

export interface Organization {
  id: string;
  name: string;
  currency: Currency;
  defaultTaxRate: number; // percentage, e.g. 18
  ownerId: string;
  plan?: 'starter' | 'growth' | 'scale';
  isDemo?: boolean;
  createdAt: any;
}

export type OrgRole = 'owner' | 'admin' | 'staff';

export interface OrgMember {
  userId: string;
  email: string;
  role: OrgRole;
  joinedAt: any;
}

// Defines a custom field that products in a category can carry
export interface AttributeDef {
  key: string;          // 'size', 'voltage', etc.
  label: string;        // Display label
  type: 'text' | 'number' | 'select';
  options?: string[];   // for 'select' type
}

export interface Category {
  id: string;
  name: string;
  attributeSchema: AttributeDef[];
  createdAt: any;
}

export interface Product {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  price: number;       // selling price
  cost: number;        // cost price (for margin analytics)
  stock: number;
  lowStockAlert: number;
  unit: string;        // 'each', 'kg', 'hour', etc. — free text, universal
  sku: string;
  attributes: Record<string, string | number>; // dynamic per category schema
  createdAt: any;
  updatedAt?: any;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  balance: number;
  totalSpend: number;
  createdAt: any;
}

export interface BillItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  total: number;
}

export type PaymentStatus = 'Paid' | 'Pending' | 'Partially Paid';

export interface Bill {
  id: string;
  ref: string;             // human readable, e.g. #0001
  customerId?: string;
  customerName?: string;
  items: BillItem[];
  subTotal: number;
  discountPercent: number;
  discountAmount: number;
  taxPercent: number;
  taxAmount: number;
  total: number;
  paidAmount: number;
  status: PaymentStatus;
  notes?: string;
  createdAt: any;
  createdBy: string; // userId
}
