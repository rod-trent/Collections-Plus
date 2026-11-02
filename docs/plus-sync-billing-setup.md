# Plus Sync billing: setup (Stripe)

Plus Sync is sold as one **annual subscription** through **Stripe Checkout**.
People manage it (cancel, change card, invoices) in the **Stripe Customer
Portal**. There are no card forms on the site, and no card details are stored.

Do everything in **test mode** first. Nothing is on sale until you set
`PLUS_SYNC_ON_SALE=1`; until then only the Clerk user IDs in
`PLUS_SYNC_ALLOWED_USER_IDS` see the Subscribe button, so you can test the
whole flow on production with test keys.

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

## 2. Product and Price (Stripe dashboard, test mode)

Turn on **Test mode** (top right of the dashboard), then:

1. **Product catalog → Add product.** Name: **Collections Plus Plus Sync**.
   Description, e.g. "Hosted sync for Collections Plus. Billed yearly."
2. Pricing: **Recurring**, **$20.00**, billing period **Yearly**.
3. Save, open the price, and copy its ID (`price_…`). That's `STRIPE_PRICE_ID`.

## 3. Customer Portal

**Settings → Billing → Customer portal** (test mode):

- **Subscriptions:** allow customers to **cancel** subscriptions. Choose
  **Cancel at end of billing period**, so people keep what they paid for.
- **Payment methods:** allow customers to **update payment methods**.
- **Invoice history:** on.
- Business information: add a link to https://getcollectionsplus.com/privacy and
  support@getcollectionsplus.com.
- Save. (Test and live mode each have their own portal settings.)

Also worth setting, under **Settings → Billing → Subscriptions and emails**:
turn on Stripe's emails for **failed payments** and **upcoming renewals** (an
annual charge without a reminder causes refunds and chargebacks), and set
**Manage failed payments** to retry for about a week and then **cancel the
subscription**. The site gives past-due accounts a 7-day grace period
(`GRACE_DAYS` in `site/lib/billing.js`).

## 4. Webhook endpoint

**Developers → Webhooks → Add endpoint** (test mode):

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

## 5. Environment variables (Vercel)

Vercel → the project → **Settings → Environment Variables**, for Production
(and Preview if you test there):

| Name | Value |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_…` from **Developers → API keys** |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` from step 4 |
| `STRIPE_PRICE_ID` | `price_…` from step 2 |
| `PLUS_SYNC_ON_SALE` | leave unset (or `0`) while testing; `1` to open sales |
| `PLUS_SYNC_PRICE_AMOUNT` | optional, default `$20` (what the site shows) |
| `PLUS_SYNC_PRICE_PERIOD` | optional, default `per year` |

The shown price is only text: the amount charged is the Stripe Price, so keep
them matching. **Redeploy** after any change; the landing page is built
statically, so it only picks up `PLUS_SYNC_ON_SALE` on a new deploy.

With `STRIPE_SECRET_KEY` or `STRIPE_PRICE_ID` missing, billing is hidden and the
billing routes just send people back to `/account`.

## 6. Test it (test mode)

Before launch only allowlisted accounts can check out, and an allowlisted
account always has access. So: test checkout and the portal from an
allowlisted account (its account page offers **Subscribe** under Billing, for
testing). To see sync actually stop when a subscription lapses, take that ID
off the allowlist afterwards (its subscription row stays), or set
`PLUS_SYNC_ON_SALE=1` on a Preview deployment only and use a second,
non-allowlisted account.

1. Sign in at https://getcollectionsplus.com/account and choose **Subscribe**.
2. On Stripe's page, pay with card **4242 4242 4242 4242**, any future expiry,
   any CVC and any postcode.
3. You land on `/account?subscribed=1`. The Billing card shows **active** and
   the renewal date. (If it still says "confirming", the webhook is slow or
   failing: check **Developers → Webhooks → your endpoint** for errors.)
4. **Manage billing** opens the portal. Cancel: back on the account page it
   says when Plus Sync stops. Renew it from the portal to undo.
5. Failed payments: in the portal, change the card to **4000 0000 0000 0341**
   (it attaches, then declines charges). Then make a renewal happen now: in the
   dashboard, open the subscription, **Update subscription**, and reset the
   billing cycle to now (or, for a full rehearsal, create the customer on a
   **test clock** under Billing → Test clocks and advance it past the renewal
   date). The charge fails, the subscription goes past due, the account page
   shows the warning, and sync keeps working for the grace period.
6. Ending: cancel immediately from the dashboard. With the account off the
   allowlist, the mobile app's sync stops with "Plus Sync isn't active", which
   links to the account page. The synced library is still there; subscribing
   again resumes sync.

Locally you can forward events with the Stripe CLI instead of the dashboard
endpoint: `stripe listen --forward-to localhost:3000/api/stripe/webhook`, and
use the `whsec_…` it prints as `STRIPE_WEBHOOK_SECRET` in `.env.local`.

## 7. Go live

1. In the dashboard, switch to **live mode** and redo steps 2–4 there (the
   product, price, portal settings and webhook endpoint don't carry over;
   **Product catalog → Copy to live mode** handles the product and price).
2. Finish Stripe's account activation (business details, bank account for
   payouts).
3. In Vercel, replace `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and
   `STRIPE_PRICE_ID` with the live values (`sk_live_…`, the live `whsec_…`, the
   live `price_…`).
4. Clear out test rows: test-mode customer IDs don't exist in live mode, so in
   Neon run `DELETE FROM subscriptions;` (before anyone has paid for real).
5. Set `PLUS_SYNC_ON_SALE=1` and redeploy. The landing page shows the price and
   a Subscribe button, and the account page offers Subscribe to everyone.
6. Make one real purchase yourself, then refund it from the dashboard.

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
