-- Plus Sync billing (Stripe). Applied by `npm run db:setup` after 001; every
-- statement is safe to run again. Paste into Neon's SQL Editor if db:setup
-- can't run.

-- One row per Clerk user who has started a checkout. Written by
-- /api/billing/checkout (the customer, before paying) and by the Stripe
-- webhook (the subscription). No card details: Stripe keeps those.
CREATE TABLE IF NOT EXISTS subscriptions (
  user_id                 text PRIMARY KEY,
  stripe_customer_id      text NOT NULL,
  stripe_subscription_id  text,
  status                  text NOT NULL DEFAULT 'none',
  price_id                text,
  current_period_end      timestamptz,
  cancel_at_period_end    boolean NOT NULL DEFAULT false,
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- When the subscription went past_due (cleared once it isn't), so access can
-- carry on for a short grace period while Stripe retries the card.
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS past_due_since timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_customer_idx ON subscriptions (stripe_customer_id);
