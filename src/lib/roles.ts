// Staff roles & what each can do. Enforced in the UI here and mirrored
// in firestore.rules on the server.
//
//   owner   — full control: catalogue, billing, settings, team, void bills
//   cashier — day-to-day operations: ring up bills, manage customers,
//             view everything. Cannot edit catalogue/settings/billing/team.
//   viewer  — read-only: dashboards, insights, history. No writes at all.

import type { OrgRole } from '../types';

export const ROLES: { id: OrgRole; label: string; blurb: string }[] = [
  { id: 'owner', label: 'Owner', blurb: 'Full access — catalogue, billing, settings & team' },
  { id: 'cashier', label: 'Cashier', blurb: 'Can create bills and manage customers' },
  { id: 'viewer', label: 'Viewer', blurb: 'Read-only access to reports and history' },
];

export function roleLabel(role: OrgRole | null | undefined): string {
  return ROLES.find((r) => r.id === role)?.label ?? 'Member';
}

// ── permission predicates ────────────────────────────────────────────────
export const can = {
  manageCatalogue: (r: OrgRole | null) => r === 'owner',
  bill: (r: OrgRole | null) => r === 'owner' || r === 'cashier',
  manageCustomers: (r: OrgRole | null) => r === 'owner' || r === 'cashier',
  voidBill: (r: OrgRole | null) => r === 'owner',
  manageSettings: (r: OrgRole | null) => r === 'owner',
  manageBilling: (r: OrgRole | null) => r === 'owner',
  manageTeam: (r: OrgRole | null) => r === 'owner',
};
