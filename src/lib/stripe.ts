import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './firebase';
import type { PlanId } from './plans';

const functions = getFunctions(app, 'us-central1');

// Starts Stripe Checkout for a plan and redirects the browser to it.
export async function startCheckout(orgId: string, planId: PlanId): Promise<void> {
  const call = httpsCallable<{ orgId: string; planId: PlanId }, { url: string }>(
    functions,
    'createCheckoutSession'
  );
  const res = await call({ orgId, planId });
  if (res.data?.url) {
    window.location.href = res.data.url;
  } else {
    throw new Error('Could not start checkout.');
  }
}
