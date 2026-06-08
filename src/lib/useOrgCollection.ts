import { useEffect, useState } from 'react';
import { onSnapshot, query } from 'firebase/firestore';
import type { QueryConstraint } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { orgCol } from './orgData';

// Subscribes to orgs/{orgId}/<collectionName> and returns live data
export function useOrgCollection<T = any>(collectionName: string, constraints: QueryConstraint[] = []) {
  const { org } = useAuth();
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!org) {
      setData([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(orgCol(org.id, collectionName), ...constraints);
    const unsub = onSnapshot(
      q,
      (snap) => {
        setData(snap.docs.map((d) => ({ id: d.id, ...d.data() } as T)));
        setLoading(false);
      },
      (err) => {
        console.error(`Error loading ${collectionName}:`, err);
        setLoading(false);
      }
    );
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org?.id, collectionName]);

  return { data, loading };
}
