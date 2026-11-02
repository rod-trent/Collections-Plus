// Tests for site/lib/billing.js: who gets Plus Sync (allowlist, subscription
// statuses, the past_due grace period), the on-sale switch for checkout, and
// mapping Stripe webhook events and Subscription objects to `subscriptions`
// rows, using fake Stripe objects in both the older and newer API shapes.
// `node tools/test_billing.mjs`. Exits non-zero on failure.
const { accessFor, canCheckout, eventRef, rowFromSubscription, GRACE_DAYS, HANDLED_EVENTS } = await import(
  '../site/lib/billing.js'
);

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
}

const NOW = new Date('2026-11-02T12:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400_000).toISOString();
const unix = (iso) => Math.floor(new Date(iso).getTime() / 1000);

console.log('accessFor');
{
  const a = (sub, extra = {}) => accessFor({ userId: 'user_a', allowlist: ['user_comp'], sub, now: NOW, ...extra });
  assert(!a(null).allowed, 'no subscription → no access');
  assert(!accessFor({ userId: null, sub: { status: 'active' } }).allowed, 'no user → no access');
  const comp = accessFor({ userId: 'user_comp', allowlist: ['user_comp'], sub: null, now: NOW });
  assert(comp.allowed && comp.reason === 'comp', 'allowlisted user has complimentary access');
  const compLapsed = accessFor({ userId: 'user_comp', allowlist: ['user_comp'], sub: { status: 'canceled' }, now: NOW });
  assert(compLapsed.allowed, 'allowlist overrides a lapsed subscription');
  assert(a({ status: 'active' }).reason === 'subscription', 'active → access');
  assert(a({ status: 'trialing' }).allowed, 'trialing → access');
  for (const s of ['canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused', 'none']) {
    assert(!a({ status: s }).allowed, `${s} → no access`);
  }
  const grace = a({ status: 'past_due', past_due_since: daysAgo(2) });
  assert(grace.allowed && grace.reason === 'grace', 'past_due 2 days → access (grace)');
  assert(!a({ status: 'past_due', past_due_since: daysAgo(GRACE_DAYS + 1) }).allowed, 'past_due past the grace → no access');
  assert(a({ status: 'past_due', past_due_since: null }).allowed, 'past_due with no start date → grace starts now');
  assert(
    !a({ status: 'past_due', past_due_since: daysAgo(2) }, { graceDays: 1 }).allowed,
    'grace length is a parameter'
  );
}

console.log('canCheckout');
{
  const base = { userId: 'user_a', allowlist: ['user_comp'], billingReady: true };
  assert(!canCheckout({ ...base, onSale: false }), 'not on sale → off for regular users');
  assert(canCheckout({ ...base, userId: 'user_comp', onSale: false }), 'not on sale → on for the allowlist (testing)');
  assert(canCheckout({ ...base, onSale: true }), 'on sale → on for everyone signed in');
  assert(!canCheckout({ ...base, onSale: true, billingReady: false }), 'billing not configured → off');
  assert(!canCheckout({ ...base, userId: null, onSale: true }), 'signed out → off');
}

// ---- Fake Stripe objects ------------------------------------------------------

const PERIOD_END = '2027-11-02T12:00:00.000Z';
// Newer API (2025-03-31 and later): the period lives on the item.
const subNew = (over = {}) => ({
  id: 'sub_1',
  object: 'subscription',
  customer: 'cus_1',
  status: 'active',
  cancel_at_period_end: false,
  cancel_at: null,
  metadata: { clerk_user_id: 'user_a' },
  items: { data: [{ price: { id: 'price_year' }, current_period_end: unix(PERIOD_END) }] },
  ...over,
});
// Older API: the period on the subscription.
const subOld = (over = {}) => ({
  id: 'sub_2',
  customer: { id: 'cus_2', object: 'customer', metadata: { clerk_user_id: 'user_b' } },
  status: 'past_due',
  cancel_at_period_end: false,
  current_period_end: unix(PERIOD_END),
  metadata: {},
  items: { data: [{ price: { id: 'price_year' } }] },
  ...over,
});
const ev = (type, object) => ({ id: 'evt_' + type, type, data: { object } });

console.log('eventRef');
{
  const cs = eventRef(
    ev('checkout.session.completed', {
      mode: 'subscription',
      subscription: 'sub_1',
      customer: 'cus_1',
      client_reference_id: 'user_a',
    })
  );
  assert(cs?.subscriptionId === 'sub_1' && cs.customerId === 'cus_1' && cs.userId === 'user_a', 'checkout.session.completed → sub, customer, client_reference_id');
  assert(eventRef(ev('checkout.session.completed', { mode: 'payment', customer: 'cus_1' })) === null, 'one-off checkout → ignored');
  const created = eventRef(ev('customer.subscription.created', subNew()));
  assert(created?.subscriptionId === 'sub_1' && created.userId === 'user_a', 'customer.subscription.created → its own ID and metadata user');
  const del = eventRef(ev('customer.subscription.deleted', subOld({ status: 'canceled' })));
  assert(del?.subscriptionId === 'sub_2' && del.customerId === 'cus_2', 'expanded customer object → its ID');
  const invOld = eventRef(ev('invoice.payment_failed', { customer: 'cus_1', subscription: 'sub_1' }));
  assert(invOld?.subscriptionId === 'sub_1', 'invoice.payment_failed (old shape: invoice.subscription)');
  const invNew = eventRef(
    ev('invoice.payment_failed', {
      customer: 'cus_1',
      parent: { subscription_details: { subscription: 'sub_1', metadata: { clerk_user_id: 'user_a' } } },
    })
  );
  assert(invNew?.subscriptionId === 'sub_1' && invNew.userId === 'user_a', 'invoice.payment_failed (new shape: parent.subscription_details)');
  assert(eventRef(ev('invoice.payment_failed', { customer: 'cus_1' })) === null, 'invoice without a subscription → ignored');
  assert(eventRef(ev('charge.refunded', {})) === null, 'unhandled event type → ignored');
  assert(HANDLED_EVENTS.size === 5, 'five event types handled');
}

console.log('rowFromSubscription');
{
  const r = rowFromSubscription(subNew());
  assert(r.user_id === 'user_a' && r.stripe_customer_id === 'cus_1' && r.stripe_subscription_id === 'sub_1', 'IDs mapped');
  assert(r.status === 'active' && r.price_id === 'price_year', 'status and price');
  assert(r.current_period_end === PERIOD_END, 'period end from the item (new API)');
  assert(r.cancel_at_period_end === false, 'not cancelling');

  const o = rowFromSubscription(subOld());
  assert(o.user_id === 'user_b' && o.stripe_customer_id === 'cus_2', 'user from expanded customer metadata');
  assert(o.current_period_end === PERIOD_END && o.status === 'past_due', 'period end from the subscription (old API)');

  const hinted = rowFromSubscription(subNew({ metadata: {} }), 'user_hint');
  assert(hinted.user_id === 'user_hint', 'falls back to the user from the event (client_reference_id)');
  assert(rowFromSubscription(subNew({ metadata: {} })) === null, 'no user anywhere → null (nothing to write)');
  assert(rowFromSubscription(null) === null, 'no subscription → null');

  const cancelling = rowFromSubscription(subNew({ cancel_at_period_end: true }));
  assert(cancelling.cancel_at_period_end && cancelling.current_period_end === PERIOD_END, 'cancel at period end → flag, same end date');
  const cancelAt = unix('2027-01-01T00:00:00Z');
  const early = rowFromSubscription(subNew({ cancel_at: cancelAt }));
  assert(early.cancel_at_period_end && early.current_period_end === '2027-01-01T00:00:00.000Z', 'cancel_at before period end → that date');
  const ended = unix('2026-11-01T00:00:00Z');
  const gone = rowFromSubscription(subNew({ status: 'canceled', ended_at: ended }));
  assert(gone.status === 'canceled' && gone.current_period_end === '2026-11-01T00:00:00.000Z', 'canceled → the date it ended');

  // The same event delivered twice maps to the same row (the upsert is then a no-op change).
  const e = ev('customer.subscription.updated', subNew());
  const once = rowFromSubscription(e.data.object, eventRef(e).userId);
  const twice = rowFromSubscription(e.data.object, eventRef(e).userId);
  assert(JSON.stringify(once) === JSON.stringify(twice), 'mapping is deterministic (retries write the same row)');

  // A lapsed row from the mapping denies access; an active one grants it.
  assert(!accessFor({ userId: 'user_a', sub: gone, now: NOW }).allowed, 'canceled row → sync stops');
  assert(accessFor({ userId: 'user_a', sub: r, now: NOW }).allowed, 'active row → sync works');
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nAll billing tests passed.');
