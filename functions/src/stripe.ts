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

// Stripe Price IDs (TEST mode). Replace with live price IDs at launch.
// Every plan is a monthly recurring GBP price created in the Stripe dashboard.
const PRICE_IDS: Record<string, string> = {
  starter: 'REPLACE_WITH_STARTER_PRICE_ID',
  growth: 'REPLACE_WITH_GROWTH_PRICE_ID',
  scale: 'REPLACE_WITH_SCALE_PRICE_ID',
};

const PLAN_BY_PRICE: Record<string, string> = Object.fromEntries(
  Object.entries(PRICE_IDS).map(([plan, price]) => [price, plan])
);

type PlanId = 'starter' | 'growth' | 'scale';

// ── Create a Checkout Session for the chosen plan ────────────────────────
export const createCheckoutSession = onCall<{ orgId: string; planId: PlanId }>(
  { secrets: [STRIPE_SECRET_KEY], region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Please sign in.');
    }
    const { orgId, planId } = request.data ?? ({} as { orgId: string; planId: PlanId });
    const priceId = PRICE_IDS[planId];
    if (!orgId || !priceId || priceId.startsWith('REPLACE_')) {
      throw new HttpsError('invalid-argument', 'Unknown plan or billing not configured.');
    }

    // Only the org owner may start a subscription.
    const memberSnap = await db.doc(`orgs/${orgId}/members/${request.auth.uid}`).get();
    if (!memberSnap.exists || memberSnap.data()?.role !== 'owner') {
      throw new HttpsError('permission-denied', 'Only the owner can manage billing.');
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY.value());

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
          const priceId = sub.items.data[0]?.price.id;
          const plan = PLAN_BY_PRICE[priceId];
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
