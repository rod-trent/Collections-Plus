// billing-db.js — the `subscriptions` queries (db/migrations/002_billing.sql).
// Like plus-sync-db.js, each takes `q(text, params) → rows`.

/** The user's row, or null. Dates come back as ISO strings. */
export async function getSubscription(q, userId) {
  const [r] = await q(
    `SELECT user_id, stripe_customer_id, stripe_subscription_id, status, price_id,
            current_period_end, cancel_at_period_end, past_due_since, updated_at
       FROM subscriptions WHERE user_id = $1`,
    [userId]
  );
  if (!r) return null;
  const d = (v) => (v ? new Date(v).toISOString() : null);
  return { ...r, current_period_end: d(r.current_period_end), past_due_since: d(r.past_due_since), updated_at: d(r.updated_at) };
}

/**
 * Remember the user's Stripe customer before checkout, unless they already
 * have one. Returns the customer ID stored (theirs if a race got there first).
 */
export async function saveCustomer(q, userId, customerId) {
  await q(`INSERT INTO subscriptions (user_id, stripe_customer_id) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`, [
    userId,
    customerId,
  ]);
  const [r] = await q(`SELECT stripe_customer_id FROM subscriptions WHERE user_id = $1`, [userId]);
  return r.stripe_customer_id;
}

/**
 * Write a row from billing.js's rowFromSubscription. Safe to repeat: the row
 * is the subscription's current state. An event about a different (older)
 * subscription never replaces one that's still live.
 */
export async function upsertSubscription(q, row) {
  const rows = await q(
    `INSERT INTO subscriptions AS s
       (user_id, stripe_customer_id, stripe_subscription_id, status, price_id,
        current_period_end, cancel_at_period_end, past_due_since, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $4 = 'past_due' THEN now() END, now())
     ON CONFLICT (user_id) DO UPDATE SET
       stripe_customer_id     = EXCLUDED.stripe_customer_id,
       stripe_subscription_id = EXCLUDED.stripe_subscription_id,
       status                 = EXCLUDED.status,
       price_id               = EXCLUDED.price_id,
       current_period_end     = EXCLUDED.current_period_end,
       cancel_at_period_end   = EXCLUDED.cancel_at_period_end,
       past_due_since         = CASE WHEN EXCLUDED.status <> 'past_due' THEN NULL
                                     WHEN s.status = 'past_due' AND s.stripe_subscription_id = EXCLUDED.stripe_subscription_id
                                       THEN coalesce(s.past_due_since, now())
                                     ELSE now() END,
       updated_at             = now()
     WHERE s.stripe_subscription_id IS NULL
        OR s.stripe_subscription_id = EXCLUDED.stripe_subscription_id
        OR s.status NOT IN ('active', 'trialing', 'past_due')
     RETURNING 1`,
    [
      row.user_id,
      row.stripe_customer_id,
      row.stripe_subscription_id,
      row.status,
      row.price_id,
      row.current_period_end,
      row.cancel_at_period_end,
    ]
  );
  return rows.length > 0;
}
