# Plus Sync billing: setup (Stripe)

Plus Sync is sold as one **annual subscription** through **Stripe Checkout**.
People manage it (cancel, change card, invoices) in the **Stripe Customer
Portal**. There are no card forms on the site, and no card details are stored.

This is set up in **live mode** from the start (Stripe test mode is optional;
see the end). Nothing is on sale until you set `PLUS_SYNC_ON_SALE=1`. Until
then only the Clerk user IDs in `PLUS_SYNC_ALLOWED_USER_IDS` see the Subscribe
button, so you can test the whole flow on production with one real purchase
and a refund.

## 1. Create the table (Neon)

Paste this into **Neon → your project → SQL Editor** and run it. It's the same
as `site/db/migrations/002_billing.sql` and safe to run again. (Or, where it
works, `npm run db:setup` in `site/`.)

```sql
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

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS past_due_since timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_customer_idx ON subscriptions (stripe_customer_id);
```

Until this table exists, Plus Sync still works for the allowlist and denies
everyone else, so it's safe to deploy the code first.

## 2. Product and Price (Stripe dashboard, live mode)

1. **Product catalog → Add product.** Name: **Collections Plus Plus Sync**.
   Description, e.g. "Hosted sync for Collections Plus. Billed yearly."
2. Pricing: **Recurring**, **$20.00**, billing period **Yearly**.
3. Save, open the price, and copy its ID (`price_…`). That's `STRIPE_PRICE_ID`.

The Stripe account also bills other products, so customers' statements and
receipts show the account's public business name. Check **Settings → Business
→ Public details** if that should mention Collections Plus.

## 3. Customer Portal

**Settings → Billing → Customer portal**:

- **Subscriptions:** allow customers to **cancel** subscriptions. Choose
  **Cancel at end of billing period**, so people keep what they paid for.
- **Payment methods:** allow customers to **update payment methods**.
- **Invoice history:** on.
- Business information: add a link to https://getcollectionsplus.com/privacy and
  support@getcollectionsplus.com.
- Save.

Also worth setting, under **Settings → Billing → Subscriptions and emails**:
turn on Stripe's emails for **failed payments** and **upcoming renewals** (an
annual charge without a reminder causes refunds and chargebacks), and set
**Manage failed payments** to retry for about a week and then **cancel the
subscription**. The site gives past-due accounts a 7-day grace period
(`GRACE_DAYS` in `site/lib/billing.js`).

## 4. Webhook endpoint

**Developers → Webhooks → Add endpoint**:

- URL: `https://getcollectionsplus.com/api/stripe/webhook`
- Events:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`
- After saving, reveal the **Signing secret** (`whsec_…`). That's
  `STRIPE_WEBHOOK_SECRET`.

The endpoint isn't behind Clerk (see `site/proxy.js`); it checks Stripe's
signature instead. Each event makes it fetch the subscription from Stripe and
store its current state, so retries and out-of-order events are harmless.

## 5. API key and environment variables (Vercel)

Use a **restricted key** (`rk_live_…`), not the account's secret key, since
the Stripe account is shared with other products. **Developers → API keys →
Create restricted key**, with only:

| Resource | Permission |
|---|---|
| Customers | Write |
| Checkout Sessions | Write |
| Customer portal | Write |
| Subscriptions | Read |

Everything else stays **None**. (Webhook signatures are checked with the
signing secret, which needs no API permission.)

Then Vercel → the project → **Settings → Environment Variables**, for
Production:

| Name | Value |
|---|---|
| `STRIPE_SECRET_KEY` | the `rk_live_…` restricted key |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` from step 4 |
| `STRIPE_PRICE_ID` | `price_…` from step 2 |
| `PLUS_SYNC_ALLOWED_USER_IDS` | your Clerk user ID (`user_…`) while testing |
| `PLUS_SYNC_ON_SALE` | leave unset until launch; `1` to open sales |
| `PLUS_SYNC_PRICE_AMOUNT` | optional, default `$20` (what the site shows) |
| `PLUS_SYNC_PRICE_PERIOD` | optional, default `per year` |

The shown price is only text: the amount charged is the Stripe Price, so keep
them matching. **Redeploy** after any change; the landing page is built
statically, so it only picks up `PLUS_SYNC_ON_SALE` on a new deploy.

With `STRIPE_SECRET_KEY` or `STRIPE_PRICE_ID` missing, billing is hidden and the
billing routes just send people back to `/account`.

## 6. Test it (one real purchase, then a refund)

Before launch only allowlisted accounts can check out, and an allowlisted
account always has access (its account page offers **Subscribe** under
Billing, for testing).

1. Sign in at https://getcollectionsplus.com/account and choose **Subscribe**.
2. Pay $20 with a real card.
3. You land on `/account?subscribed=1`. The Billing card shows **active** and
   the renewal date. (If it still says "confirming", the webhook is slow or
   failing: check **Developers → Webhooks → your endpoint** for errors.)
4. **Manage billing** opens the portal. Cancel: back on the account page it
   says when Plus Sync stops. Renew it from the portal to undo.
5. Check sync on two devices: https://getcollectionsplus.com/app/ → menu →
   **Use Plus Sync** on each.
6. Clean up: in the Stripe dashboard, **refund** the payment and **cancel** the
   subscription immediately. Then in Neon's SQL Editor:

   ```sql
   DELETE FROM subscriptions WHERE user_id = 'user_…';
   ```

   You keep access through the allowlist, so Plus Sync goes on working for you.

Failed payments and grace periods are hard to rehearse with a real card. If
you want to see them, use Stripe test mode (below) on a Preview deployment.

## 7. Go live

1. Finish Stripe's account activation if it asks for anything (business
   details, bank account for payouts).
2. Make sure your test subscription row is gone (step 6.6).
3. Set `PLUS_SYNC_ON_SALE=1` and redeploy. The landing page shows the price and
   a Subscribe button, and the account page offers Subscribe to everyone.
4. Keep your ID in `PLUS_SYNC_ALLOWED_USER_IDS` for complimentary access.

## Optional: rehearse in test mode

To try failed payments, cancellations and lapses without real charges, set up
a Preview deployment with test-mode values (Vercel lets you scope variables to
Preview): in Stripe's **Test mode**, redo steps 2–4 (test and live have
separate products, portal settings and webhooks; point the test webhook at the
Preview URL), and use `sk_test_…`, the test `whsec_…` and the test `price_…`.

- Pay with card **4242 4242 4242 4242**, any future expiry, CVC and postcode.
- Failed payments: in the portal, change the card to **4000 0000 0000 0341**
  (it attaches, then declines charges). Then make a renewal happen now: open
  the subscription in the dashboard, **Update subscription**, and reset the
  billing cycle to now, or create the customer on a **test clock** (Billing →
  Test clocks) and advance it past the renewal date. The subscription goes
  past due, the account page shows the warning, and sync keeps working for the
  grace period.
- To see sync stop when a subscription lapses, use a second account that isn't
  on the allowlist, with `PLUS_SYNC_ON_SALE=1` on that Preview deployment only.
- Locally, forward events with the Stripe CLI:
  `stripe listen --forward-to localhost:3000/api/stripe/webhook`, and use the
  `whsec_…` it prints as `STRIPE_WEBHOOK_SECRET` in `.env.local`.

Preview and Production share the Neon database unless the integration gives
Preview its own branch, so delete test-mode rows (`DELETE FROM subscriptions
WHERE stripe_customer_id = 'cus_…'`) when you're done; test customer IDs don't
exist in live mode.

## Optional: Stripe Tax

If you need to collect sales tax or VAT: turn on **Stripe Tax** in the
dashboard, add your registrations, set the product's tax code (e.g. "Software
as a service"), and add `automatic_tax: { enabled: true }` and
`customer_update: { address: 'auto' }` to the Checkout session in
`site/app/api/billing/checkout/route.js`. Stripe charges a fee per transaction
for it, so check whether you need it at your volume first.

## Files

- Routes: `site/app/api/billing/checkout`, `site/app/api/billing/portal`,
  `site/app/api/stripe/webhook`
- Access rules and event mapping (pure, tested): `site/lib/billing.js`,
  tests in `tools/test_billing.mjs`
- Queries: `site/lib/billing-db.js`; Stripe client: `site/lib/stripe.js`
- Schema: `site/db/migrations/002_billing.sql`
- Account page: `site/app/(account)/account/page.jsx`
