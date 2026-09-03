// Core domain types — org-scoped, currency-agnostic, custom-attribute friendly

// How a Firestore timestamp actually arrives on the client. Every date in this
// app is written with serverTimestamp(), so it is never a JS Date: it reads
// back as a Timestamp (which has toMillis), and raw snapshot data can surface
// the plain { seconds } shape instead. Both are optional because a document
// read straight after a write can arrive before the server has stamped it.
// Use toMs() in lib/insights.ts to turn one into a number.
export interface FirestoreDate {
  toMillis?: () => number;
  toDate?: () => Date;
  seconds?: number;
}

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
  createdAt: FirestoreDate;
}

export type OrgRole = 'owner' | 'cashier' | 'viewer';

export interface OrgMember {
  id?: string;
  userId: string;
  email: string;
  role: OrgRole;
  joinedAt: FirestoreDate;
}

// A pending invite, stored at top-level invites/{emailLowercased}
export interface Invite {
  email: string;
  orgId: string;
  orgName: string;
  role: OrgRole;
  invitedBy: string;
  createdAt: FirestoreDate;
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
  createdAt: FirestoreDate;
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
  createdAt: FirestoreDate;
  updatedAt?: FirestoreDate;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  balance: number;
  totalSpend: number;
  createdAt: FirestoreDate;
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
  createdAt: FirestoreDate;
  createdBy: string; // userId
}
