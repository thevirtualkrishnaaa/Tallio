// One place to turn an unknown thrown value into something showable.
//
// catch binds `unknown`, and most of what this app catches comes from Firebase
// (FirebaseError extends Error, so `.message` is there) — but a thrown string
// or a rejected non-Error would make `e.message` undefined and render "undefined"
// into the UI. This narrows properly and falls back to a written message.
export function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === 'string' && e) return e;
  return fallback;
}
