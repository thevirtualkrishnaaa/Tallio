import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { HttpRequest } from "@azure/functions";

// Transition period: users still sign in with Firebase Auth.
// The API only needs the project ID to verify their tokens (no secret key).
if (getApps().length === 0) {
  initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID ?? "talliofinance" });
}

export interface AuthUser {
  uid: string;
  email?: string;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Reads "Authorization: Bearer <Firebase ID token>" and verifies it. */
export async function requireUser(req: HttpRequest): Promise<AuthUser> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new HttpError(401, "Please sign in.");
  try {
    const decoded = await getAuth().verifyIdToken(token);
    return { uid: decoded.uid, email: decoded.email };
  } catch {
    throw new HttpError(401, "Your session has expired. Please sign in again.");
  }
}
