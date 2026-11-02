// billing.js — the pure parts of Plus Sync billing: who has access, and how a
// Stripe webhook event becomes a `subscriptions` row. No Stripe SDK, database
// or env reads here, so tools/test_billing.mjs can run it with fake objects.

/** How long a past_due subscription keeps syncing while Stripe retries. */
export const GRACE_DAYS = 7;

/** Subscription statuses that unlock Plus Sync outright. */
const PAID = new Set(['active', 'trialing']);

/** Statuses for which a user shouldn't be sent to a second checkout. */
export const LIVE_STATUSES = ['active', 'trialing', 'past_due'];

/** Webhook events we act on; everything else is acknowledged and ignored. */
export const HANDLED_EVENTS = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_failed',
]);

const ms = (t) => (t == null ? null : t instanceof Date ? t.getTime() : new Date(t).getTime());

/**
 * Plus Sync access for a user.
 *   userId     Clerk user ID
 *   allowlist  PLUS_SYNC_ALLOWED_USER_IDS, as an array (complimentary/admin)
 *   sub        their `subscriptions` row, or null
 *   now        Date, for tests
 * Returns { allowed, reason } with reason 'comp' | 'subscription' | 'grace' | null.
 */
export function accessFor({ userId, allowlist = [], sub = null, now = new Date(), graceDays = GRACE_DAYS }) {
  if (!userId) return { allowed: false, reason: null };
  if (allowlist.includes(userId)) return { allowed: true, reason: 'comp' };
  if (sub && PAID.has(sub.status)) return { allowed: true, reason: 'subscription' };
  if (sub?.status === 'past_due') {
    // No start date recorded yet (the row predates it): treat as just started.
    const since = ms(sub.past_due_since) ?? ms(now);
    if (ms(now) - since < graceDays * 86400_000) return { allowed: true, reason: 'grace' };
  }
  return { allowed: false, reason: null };
}

/** May this user start a checkout? Off for everyone but the allowlist until on sale. */
export function canCheckout({ userId, allowlist = [], onSale = false, billingReady = false }) {
  return Boolean(billingReady && userId && (onSale || allowlist.includes(userId)));
}

/**
 * Which subscription a webhook event is about. Returns
 * { subscriptionId, customerId, userId } (userId only when the event carries
 * it) or null when there's nothing to record (a one-off payment, an invoice
 * that isn't for a subscription).
 */
export function eventRef(event) {
  if (!event || !HANDLED_EVENTS.has(event.type)) return null;
  const o = event.data?.object || {};
  const id = (v) => (typeof v === 'string' ? v : v?.id) || null;
  switch (event.type) {
    case 'checkout.session.completed':
      if (o.mode !== 'subscription' || !o.subscription) return null;
      return {
        subscriptionId: id(o.subscription),
        customerId: id(o.customer),
        userId: o.client_reference_id || o.metadata?.clerk_user_id || null,
      };
    case 'invoice.payment_failed': {
      // Newer API versions moved invoice.subscription under parent.
      const subId = id(o.subscription) || id(o.parent?.subscription_details?.subscription);
      if (!subId) return null;
      return {
        subscriptionId: subId,
        customerId: id(o.customer),
        userId: o.parent?.subscription_details?.metadata?.clerk_user_id || null,
      };
    }
    default: // customer.subscription.*
      return { subscriptionId: o.id || null, customerId: id(o.customer), userId: o.metadata?.clerk_user_id || null };
  }
}

const iso = (unix) => (unix ? new Date(unix * 1000).toISOString() : null);

/**
 * A `subscriptions` row from a Stripe Subscription object (ideally fetched
 * fresh, with `customer` expanded). `userIdHint` comes from eventRef. Returns
 * null when the subscription can't be tied to a Clerk user.
 */
export function rowFromSubscription(sub, userIdHint = null) {
  if (!sub?.id) return null;
  const customer = typeof sub.customer === 'object' && sub.customer ? sub.customer : null;
  const userId = sub.metadata?.clerk_user_id || customer?.metadata?.clerk_user_id || userIdHint || null;
  const customerId = (typeof sub.customer === 'string' ? sub.customer : customer?.id) || null;
  if (!userId || !customerId) return null;
  const item = sub.items?.data?.[0];
  // Newer API versions keep the period on the item, older ones on the subscription.
  let periodEnd = sub.current_period_end ?? item?.current_period_end ?? null;
  // A cancel scheduled for a set date (rather than period end) ends access sooner.
  if (sub.cancel_at && (!periodEnd || sub.cancel_at < periodEnd)) periodEnd = sub.cancel_at;
  return {
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    status: sub.status || 'none',
    price_id: item?.price?.id || null,
    current_period_end: iso(sub.status === 'canceled' ? sub.ended_at || periodEnd : periodEnd),
    cancel_at_period_end: Boolean(sub.cancel_at_period_end || sub.cancel_at),
  };
}
