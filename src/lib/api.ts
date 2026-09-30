import { auth } from './firebase';

// Tallio's Azure Functions backend.
export const API_URL =
  'https://tallio-api-feaegce2e8cxeqbz.francecentral-01.azurewebsites.net/api';

// Calls the Azure API with the signed-in user's Firebase token.
export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in.');
  const token = await user.getIdToken();

  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return data as T;
}
