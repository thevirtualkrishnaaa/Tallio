import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  signOut,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  serverTimestamp,
  collection,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { seedDemoOrg } from '../lib/demoSeed';
import { getPlan } from '../lib/plans';
import type { Plan, PlanId } from '../lib/plans';
import type { Organization, OrgRole, OrgMember, Invite } from '../types';

const inviteKey = (email: string) => email.trim().toLowerCase();

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  org: Organization | null;
  role: OrgRole | null;
  orgLoading: boolean;
  plan: Plan;
  isDemo: boolean;
  demoExpired: boolean;
  demoMsLeft: number | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  startDemo: () => Promise<void>;
  logout: () => Promise<void>;
  createOrganization: (name: string, currencyCode: string, currencySymbol: string, defaultTaxRate: number) => Promise<void>;
  changePlan: (planId: PlanId) => Promise<void>;
  refreshOrg: () => Promise<void>;
  // Team management (owner only)
  listMembers: () => Promise<OrgMember[]>;
  listInvites: () => Promise<Invite[]>;
  inviteMember: (email: string, role: OrgRole) => Promise<void>;
  cancelInvite: (email: string) => Promise<void>;
  updateMemberRole: (memberId: string, role: OrgRole) => Promise<void>;
  removeMember: (memberId: string) => Promise<void>;
}

// 24-hour demo window
const DEMO_DURATION_MS = 24 * 60 * 60 * 1000;

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState<Organization | null>(null);
  const [role, setRole] = useState<OrgRole | null>(null);
  const [orgLoading, setOrgLoading] = useState(true);
  const [demoMsLeft, setDemoMsLeft] = useState<number | null>(null);

  const isDemo = !!org?.isDemo;
  const plan = getPlan(org?.plan);

  // Resolve demo start time (ms) from the org's createdAt Firestore timestamp
  const demoStartMs = (() => {
    if (!org?.isDemo || !org.createdAt) return null;
    const ts: any = org.createdAt;
    if (typeof ts.toMillis === 'function') return ts.toMillis();
    if (ts.seconds) return ts.seconds * 1000;
    return null;
  })();

  // Tick down the demo countdown every second
  useEffect(() => {
    if (!isDemo || demoStartMs == null) {
      setDemoMsLeft(null);
      return;
    }
    const update = () => {
      const left = demoStartMs + DEMO_DURATION_MS - Date.now();
      setDemoMsLeft(left > 0 ? left : 0);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [isDemo, demoStartMs]);

  const demoExpired = isDemo && demoMsLeft !== null && demoMsLeft <= 0;

  // If the user has no org yet but was invited by email, join them automatically.
  const acceptPendingInvite = async (u: User): Promise<string | null> => {
    if (!u.email) return null;
    const invSnap = await getDoc(doc(db, 'invites', inviteKey(u.email)));
    if (!invSnap.exists()) return null;
    const inv = invSnap.data() as Invite;

    // Create our own member doc with the invited role (validated by rules
    // against the invite), point users/{uid} at the org, and clear the invite.
    await setDoc(doc(db, 'orgs', inv.orgId, 'members', u.uid), {
      userId: u.uid,
      email: u.email,
      role: inv.role,
      joinedAt: serverTimestamp(),
    });
    await setDoc(
      doc(db, 'users', u.uid),
      { orgId: inv.orgId, role: inv.role, email: u.email },
      { merge: true }
    );
    await deleteDoc(doc(db, 'invites', inviteKey(u.email)));
    return inv.orgId;
  };

  const loadOrgForUser = async (u: User) => {
    setOrgLoading(true);
    try {
      const userDoc = await getDoc(doc(db, 'users', u.uid));
      let orgId: string | null =
        userDoc.exists() && userDoc.data().orgId ? (userDoc.data().orgId as string) : null;

      // No org yet — check for an invitation addressed to this email.
      if (!orgId) {
        orgId = await acceptPendingInvite(u);
      }

      if (orgId) {
        const orgSnap = await getDoc(doc(db, 'orgs', orgId));
        // Role's source of truth is the member doc (owner can change it).
        const memberSnap = await getDoc(doc(db, 'orgs', orgId, 'members', u.uid));
        if (orgSnap.exists() && memberSnap.exists()) {
          setOrg({ id: orgSnap.id, ...(orgSnap.data() as any) });
          setRole((memberSnap.data().role as OrgRole) || 'viewer');
        } else {
          setOrg(null);
          setRole(null);
        }
      } else {
        setOrg(null);
        setRole(null);
      }
    } catch (e) {
      console.error('Error loading org:', e);
      setOrg(null);
      setRole(null);
    } finally {
      setOrgLoading(false);
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setLoading(false);
      if (u) {
        await loadOrgForUser(u);
      } else {
        setOrg(null);
        setRole(null);
        setOrgLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const login = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const register = async (email: string, password: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    // Create a pointer doc so we can look up org membership later
    await setDoc(doc(db, 'users', cred.user.uid), {
      email,
      orgId: null,
      role: null,
      createdAt: serverTimestamp(),
    });
  };

  const startDemo = async () => {
    // Sign in anonymously — no email/password required
    const cred = await signInAnonymously(auth);
    const uid = cred.user.uid;

    // One demo org per anonymous user
    const orgId = `demo-${uid}`;
    await seedDemoOrg(orgId, uid);

    // Pointer doc so loadOrgForUser can resolve membership
    await setDoc(doc(db, 'users', uid), {
      email: 'demo@tallio.app',
      orgId,
      role: 'owner',
      isDemo: true,
      createdAt: serverTimestamp(),
    });

    await loadOrgForUser(cred.user);
  };

  const logout = async () => {
    await signOut(auth);
  };

  const createOrganization = async (
    name: string,
    currencyCode: string,
    currencySymbol: string,
    defaultTaxRate: number
  ) => {
    if (!user) throw new Error('Not authenticated');

    const orgRef = doc(collection(db, 'orgs'));
    await setDoc(orgRef, {
      name,
      currency: { code: currencyCode, symbol: currencySymbol },
      defaultTaxRate,
      ownerId: user.uid,
      plan: 'starter',
      createdAt: serverTimestamp(),
    });

    await setDoc(doc(db, 'orgs', orgRef.id, 'members', user.uid), {
      userId: user.uid,
      email: user.email,
      role: 'owner',
      joinedAt: serverTimestamp(),
    });

    await setDoc(
      doc(db, 'users', user.uid),
      { orgId: orgRef.id, role: 'owner', email: user.email },
      { merge: true }
    );

    await loadOrgForUser(user);
  };

  const changePlan = async (planId: PlanId) => {
    if (!user || !org) throw new Error('No active organisation');
    // No real billing yet — this just records the chosen plan.
    // Stripe Checkout will replace this with a verified, server-side update.
    await setDoc(doc(db, 'orgs', org.id), { plan: planId }, { merge: true });
    await loadOrgForUser(user);
  };

  // ── Team management (owner only; also enforced by security rules) ────────
  const listMembers = async (): Promise<OrgMember[]> => {
    if (!org) return [];
    const snap = await getDocs(collection(db, 'orgs', org.id, 'members'));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  };

  const listInvites = async (): Promise<Invite[]> => {
    if (!org) return [];
    const snap = await getDocs(collection(db, 'orgs', org.id, 'pendingInvites'));
    return snap.docs.map((d) => d.data() as Invite);
  };

  const inviteMember = async (email: string, role: OrgRole) => {
    if (!user || !org) throw new Error('No active organisation');
    const key = inviteKey(email);
    const payload: Invite = {
      email: key,
      orgId: org.id,
      orgName: org.name,
      role,
      invitedBy: user.uid,
      createdAt: serverTimestamp(),
    };
    // Global invite (looked up by the invitee on login) + a mirror under the
    // org so the owner can list/cancel pending invites.
    await setDoc(doc(db, 'invites', key), payload);
    await setDoc(doc(db, 'orgs', org.id, 'pendingInvites', key), payload);
  };

  const cancelInvite = async (email: string) => {
    if (!org) throw new Error('No active organisation');
    const key = inviteKey(email);
    await deleteDoc(doc(db, 'invites', key));
    await deleteDoc(doc(db, 'orgs', org.id, 'pendingInvites', key));
  };

  const updateMemberRole = async (memberId: string, role: OrgRole) => {
    if (!org) throw new Error('No active organisation');
    await setDoc(doc(db, 'orgs', org.id, 'members', memberId), { role }, { merge: true });
  };

  const removeMember = async (memberId: string) => {
    if (!org) throw new Error('No active organisation');
    if (memberId === org.ownerId) throw new Error('The owner cannot be removed');
    await deleteDoc(doc(db, 'orgs', org.id, 'members', memberId));
  };

  const refreshOrg = async () => {
    if (user) await loadOrgForUser(user);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, org, role, orgLoading, plan, isDemo, demoExpired, demoMsLeft, login, register, startDemo, logout, createOrganization, changePlan, refreshOrg, listMembers, listInvites, inviteMember, cancelInvite, updateMemberRole, removeMember }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
