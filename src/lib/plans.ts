// Subscription plans & their limits. UK pricing (GBP).
// Enforced client-side today; Stripe checkout + server enforcement comes later.

export type PlanId = 'starter' | 'growth' | 'scale';

export interface Plan {
  id: PlanId;
  name: string;
  price: number;          // monthly, in GBP
  priceLabel: string;     // display
  features: string[];
  highlight?: boolean;
  limits: {
    products: number;     // max catalogue size (Infinity = unlimited)
    salesPerMonth: number;
    users: number;
  };
}

export const PLANS: Record<PlanId, Plan> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    price: 10,
    priceLabel: '£10',
    features: ['50 products', '100 sales / month', '1 user'],
    limits: { products: 50, salesPerMonth: 100, users: 1 },
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    price: 49,
    priceLabel: '£49',
    highlight: true,
    features: ['500 products', 'Unlimited sales', '3 users'],
    limits: { products: 500, salesPerMonth: Infinity, users: 3 },
  },
  scale: {
    id: 'scale',
    name: 'Scale',
    price: 149,
    priceLabel: '£149',
    features: ['Unlimited everything', '10 users', 'Priority support'],
    limits: { products: Infinity, salesPerMonth: Infinity, users: 10 },
  },
};

export const PLAN_ORDER: PlanId[] = ['starter', 'growth', 'scale'];

export const DEFAULT_PLAN: PlanId = 'starter';

export function getPlan(id: PlanId | undefined | null): Plan {
  return PLANS[id ?? DEFAULT_PLAN] ?? PLANS[DEFAULT_PLAN];
}

// True when `count` is at or above the plan's limit for that resource.
export function isAtLimit(plan: Plan, resource: keyof Plan['limits'], count: number): boolean {
  return count >= plan.limits[resource];
}
