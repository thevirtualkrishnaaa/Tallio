import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  collection,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import type { Organization, OrgRole } from '../types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  org: Organization | null;
  role: OrgRole | null;
  orgLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  createOrganization: (name: string, currencyCode: string, currencySymbol: string, defaultTaxRate: number) => Promise<void>;
  refreshOrg: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState<Organization | null>(null);
  const [role, setRole] = useState<OrgRole | null>(null);
  const [orgLoading, setOrgLoading] = useState(true);

  const loadOrgForUser = async (u: User) => {
    setOrgLoading(true);
    try {
      // Find org membership: we store a lightweight pointer doc at users/{uid}
      const userDoc = await getDoc(doc(db, 'users', u.uid));
      if (userDoc.exists() && userDoc.data().orgId) {
        const orgId = userDoc.data().orgId as string;
        const orgSnap = await getDoc(doc(db, 'orgs', orgId));
        if (orgSnap.exists()) {
          setOrg({ id: orgSnap.id, ...(orgSnap.data() as any) });
          setRole((userDoc.data().role as OrgRole) || 'staff');
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

  const refreshOrg = async () => {
    if (user) await loadOrgForUser(user);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, org, role, orgLoading, login, register, logout, createOrganization, refreshOrg }}
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
