// Helpers for org-scoped Firestore collections: orgs/{orgId}/<collection>
import { collection, doc } from 'firebase/firestore';
import { db } from './firebase';

export const orgCol = (orgId: string, name: string) =>
  collection(db, 'orgs', orgId, name);

export const orgDoc = (orgId: string, name: string, id: string) =>
  doc(db, 'orgs', orgId, name, id);
