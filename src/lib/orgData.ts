// Helpers for org-scoped Firestore collections: orgs/{orgId}/<collection>
import { collection, doc } from 'firebase/firestore';
import { db } from './firebase';

export const orgCol = (orgId: string, name: string) =>
  collection(db, 'orgs', orgId, name);

export const orgDoc = (orgId: string, name: string, id: string) =>
  doc(db, 'orgs', orgId, name, id);

// A Firestore document carries its id as the document key, never as a field.
// Editing forms hold the id alongside the data, so strip it before writing —
// otherwise the id is duplicated into the body and can drift from the real one.
export function withoutId<T extends { id?: string }>(docData: T): Omit<T, 'id'> {
  const copy = { ...docData };
  delete (copy as Partial<T>).id;
  return copy;
}
