import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import Stripe from 'stripe';

if (getApps().length === 0) initializeApp();
const db = getFirestore();

const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');

const APP_URL = 'https://talliofinance.web.app';

// Stripe Product IDs (TEST mode). Each product has one active monthly GBP
// price; the checkout function resolves the price at runtime. Replace with
// live product IDs at launch.
const PRODUCT_IDS: Record<string, string> = {
  starter: 'prod_UmsXtWqCEEcAW6',
  growth: 'prod_UmsXJyuLALZbTw',
  scale: 'prod_UmsYAW9HAkYeiv',
};

const PLAN_BY_PRODUCT: Record<string, string> = Object.fromEntries(
  Object.entries(PRODUCT_IDS).map(([plan, product]) => [product, plan])
);

// Look up the active price for a plan's product.
async function priceForPlan(stripe: Stripe, planId: string): Promise<string | null> {
  const productId = PRODUCT_IDS[planId];
  if (!productId) return null;
  const prices = await stripe.prices.list({ product: productId, active: true, limit: 1 });
  return prices.data[0]?.id ?? null;
}

type PlanId = 'starter' | 'growth' | 'scale';

// ── Create a Checkout Session for the chosen plan ────────────────────────
export const createCheckoutSession = onCall<{ orgId: string; planId: PlanId }>(
  { secrets: [STRIPE_SECRET_KEY], region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Please sign in.');
    }
    const { orgId, planId } = request.data ?? ({} as { orgId: string; planId: PlanId });
    if (!orgId || !PRODUCT_IDS[planId]) {
      throw new HttpsError('invalid-argument', 'Unknown plan.');
    }

    // Only the org owner may start a subscription.
    const memberSnap = await db.doc(`orgs/${orgId}/members/${request.auth.uid}`).get();
    if (!memberSnap.exists || memberSnap.data()?.role !== 'owner') {
      throw new HttpsError('permission-denied', 'Only the owner can manage billing.');
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY.value());

    const priceId = await priceForPlan(stripe, planId);
    if (!priceId) {
      throw new HttpsError('failed-precondition', 'No active price found for this plan.');
    }

    // Reuse or create a Stripe customer for this org.
    const orgRef = db.doc(`orgs/${orgId}`);
    const orgSnap = await orgRef.get();
    let customerId = orgSnap.data()?.stripeCustomerId as string | undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: request.auth.token.email ?? undefined,
        metadata: { orgId },
      });
      customerId = customer.id;
      await orgRef.set({ stripeCustomerId: customerId }, { merge: true });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: orgId,
      metadata: { orgId, planId },
      subscription_data: { metadata: { orgId, planId } },
      success_url: `${APP_URL}/?billing=success`,
      cancel_url: `${APP_URL}/?billing=cancelled`,
    });

    return { url: session.url };
  }
);

// ── Stripe webhook — keeps org.plan in sync with the subscription ─────────
export const stripeWebhook = onRequest(
  { secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET], region: 'us-central1' },
  async (req, res) => {
    const stripe = new Stripe(STRIPE_SECRET_KEY.value());
    const sig = req.headers['stripe-signature'] as string | undefined;

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        sig ?? '',
        STRIPE_WEBHOOK_SECRET.value()
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'invalid signature';
      res.status(400).send(`Webhook signature verification failed: ${msg}`);
      return;
    }

    const setPlanForCustomer = async (customerId: string, plan: string, extra: object = {}) => {
      const q = await db.collection('orgs').where('stripeCustomerId', '==', customerId).limit(1).get();
      if (!q.empty) await q.docs[0].ref.set({ plan, ...extra }, { merge: true });
    };

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const s = event.data.object as Stripe.Checkout.Session;
          const orgId = s.metadata?.orgId;
          const planId = s.metadata?.planId;
          if (orgId && planId) {
            await db.doc(`orgs/${orgId}`).set(
              {
                plan: planId,
                stripeSubscriptionId: s.subscription,
                stripeStatus: 'active',
              },
              { merge: true }
            );
          }
          break;
        }
        case 'customer.subscription.updated': {
          const sub = event.data.object as Stripe.Subscription;
          const product = sub.items.data[0]?.price.product;
          const plan = typeof product === 'string' ? PLAN_BY_PRODUCT[product] : undefined;
          const active = sub.status === 'active' || sub.status === 'trialing';
          if (typeof sub.customer === 'string' && plan && active) {
            await setPlanForCustomer(sub.customer, plan, { stripeStatus: sub.status });
          }
          break;
        }
        case 'customer.subscription.deleted': {
          const sub = event.data.object as Stripe.Subscription;
          // Subscription ended — drop back to the entry tier.
          if (typeof sub.customer === 'string') {
            await setPlanForCustomer(sub.customer, 'starter', { stripeStatus: 'canceled' });
          }
          break;
        }
      }
      res.json({ received: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'handler error';
      res.status(500).send(msg);
    }
  }
);
