import { app, HttpRequest, InvocationContext } from "@azure/functions";
import Stripe from "stripe";
import { requireUser, HttpError } from "../auth";
import { errorResponse } from "../http";
import { getPool, withOrg } from "../db";

// NOTE: these read/write PostgreSQL, so switch the frontend and the Stripe
// webhook URL to them only AFTER the Firestore data has been migrated.

const APP_URL = process.env.APP_URL ?? "https://talliofinance.web.app";

// Stripe Product IDs (TEST mode) — replace with live IDs at launch.
const PRODUCT_IDS: Record<string, string> = {
  starter: "prod_UmsXtWqCEEcAW6",
  growth: "prod_UmsXJyuLALZbTw",
  scale: "prod_UmsYAW9HAkYeiv",
};
const PLAN_BY_PRODUCT: Record<string, string> = Object.fromEntries(
  Object.entries(PRODUCT_IDS).map(([plan, product]) => [product, plan])
);

function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new HttpError(503, "Billing is not configured yet.");
  return new Stripe(key);
}

async function priceForPlan(stripe: Stripe, planId: string): Promise<string | null> {
  const productId = PRODUCT_IDS[planId];
  if (!productId) return null;
  const prices = await stripe.prices.list({ product: productId, active: true, limit: 1 });
  return prices.data[0]?.id ?? null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/billing/checkout  { orgId, planId }  -> { url }
app.http("createCheckoutSession", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "billing/checkout",
  handler: async (req: HttpRequest, context: InvocationContext) => {
    try {
      const user = await requireUser(req);
      const { orgId, planId } = (await req.json().catch(() => ({}))) as { orgId?: string; planId?: string };
      if (!orgId || !UUID_RE.test(orgId) || !planId || !PRODUCT_IDS[planId]) {
        throw new HttpError(400, "Unknown plan.");
      }

      const stripe = stripeClient();

      const url = await withOrg(orgId, async (db) => {
        // Only the org owner may start a subscription.
        const member = await db.query(
          "SELECT role FROM org_members WHERE user_uid = $1", [user.uid]);
        if (member.rows[0]?.role !== "owner") {
          throw new HttpError(403, "Only the owner can manage billing.");
        }

        const priceId = await priceForPlan(stripe, planId);
        if (!priceId) throw new HttpError(409, "No active price found for this plan.");

        // Reuse or create a Stripe customer for this org.
        const org = await db.query("SELECT stripe_customer_id FROM orgs WHERE id = $1", [orgId]);
        let customerId: string | undefined = org.rows[0]?.stripe_customer_id ?? undefined;
        if (!customerId) {
          const customer = await stripe.customers.create({ email: user.email, metadata: { orgId } });
          customerId = customer.id;
          await db.query("UPDATE orgs SET stripe_customer_id = $1 WHERE id = $2", [customerId, orgId]);
        }

        const session = await stripe.checkout.sessions.create({
          mode: "subscription",
          customer: customerId,
          line_items: [{ price: priceId, quantity: 1 }],
          client_reference_id: orgId,
          metadata: { orgId, planId },
          subscription_data: { metadata: { orgId, planId } },
          success_url: `${APP_URL}/?billing=success`,
          cancel_url: `${APP_URL}/?billing=cancelled`,
        });
        return session.url;
      });

      if (!url) throw new HttpError(502, "Could not start checkout.");
      return { jsonBody: { url } };
    } catch (err) {
      return errorResponse(err, context);
    }
  },
});

// Webhooks have no signed-in user, so we find the org from the Stripe
// customer ID via a narrow database function (see tallio_schema_update_1.sql).
async function orgIdForCustomer(customerId: string): Promise<string | null> {
  const { rows } = await getPool().query("SELECT org_id_for_stripe_customer($1) AS id", [customerId]);
  return rows[0]?.id ?? null;
}

async function updateOrgBilling(
  customerId: string,
  fields: { plan?: string; status: string; subscriptionId?: string | null }
) {
  const orgId = await orgIdForCustomer(customerId);
  if (!orgId) return;
  await withOrg(orgId, (db) =>
    db.query(
      `UPDATE orgs SET
         plan = COALESCE($2::org_plan, plan),
         stripe_status = $3,
         stripe_subscription_id = COALESCE($4, stripe_subscription_id)
       WHERE id = $1`,
      [orgId, fields.plan ?? null, fields.status, fields.subscriptionId ?? null]
    )
  );
}

// POST /api/billing/webhook  (called by Stripe)
app.http("stripeWebhook", {
  methods: ["POST"],
  authLevel: "anonymous", // verified with the Stripe signature instead
  route: "billing/webhook",
  handler: async (req: HttpRequest, context: InvocationContext) => {
    const stripe = stripeClient();
    const secret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
    const rawBody = await req.text();

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, req.headers.get("stripe-signature") ?? "", secret);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "invalid signature";
      return { status: 400, body: `Webhook signature verification failed: ${msg}` };
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const s = event.data.object as Stripe.Checkout.Session;
          const planId = s.metadata?.planId;
          if (typeof s.customer === "string" && planId && PRODUCT_IDS[planId]) {
            await updateOrgBilling(s.customer, {
              plan: planId,
              status: "active",
              subscriptionId: typeof s.subscription === "string" ? s.subscription : null,
            });
          }
          break;
        }
        case "customer.subscription.updated": {
          const sub = event.data.object as Stripe.Subscription;
          const product = sub.items.data[0]?.price.product;
          const plan = typeof product === "string" ? PLAN_BY_PRODUCT[product] : undefined;
          const active = sub.status === "active" || sub.status === "trialing";
          if (typeof sub.customer === "string" && plan && active) {
            await updateOrgBilling(sub.customer, { plan, status: sub.status, subscriptionId: sub.id });
          }
          break;
        }
        case "customer.subscription.deleted": {
          const sub = event.data.object as Stripe.Subscription;
          // Subscription ended — drop back to the entry tier.
          if (typeof sub.customer === "string") {
            await updateOrgBilling(sub.customer, { plan: "starter", status: "canceled" });
          }
          break;
        }
      }
      return { jsonBody: { received: true } };
    } catch (err) {
      context.error("Stripe webhook handler failed", err);
      return { status: 500, body: "handler error" };
    }
  },
});
