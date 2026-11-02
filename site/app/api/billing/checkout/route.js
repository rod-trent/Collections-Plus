// POST (the account page's Subscribe button) → a Stripe Checkout session for
// the annual Plus Sync price, then a redirect to it. Back to
// /account?subscribed=1 on success, /account on cancel.
//
// Each Clerk user gets one Stripe customer, created here the first time and
// stored in `subscriptions`, with the Clerk user ID in its metadata.
import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { q } from '../../../../lib/db.js';
import { saveCustomer } from '../../../../lib/billing-db.js';
import { canCheckout, LIVE_STATUSES } from '../../../../lib/billing.js';
import { allowedUserIds, subscriptionFor } from '../../../../lib/plus-sync.js';
import { billingReady, PRICE_ID, stripe } from '../../../../lib/stripe.js';
import { PLUS_ON_SALE } from '../../../../lib/site.js';

const to = (req, path) => NextResponse.redirect(new URL(path, req.url), 303);

export async function POST(req) {
  if (!billingReady) return to(req, '/account');
  try {
    const { userId } = await auth();
    if (!userId) {
      const signIn = new URL(process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL || '/sign-in', req.url);
      signIn.searchParams.set('redirect_url', '/account');
      return NextResponse.redirect(signIn, 303);
    }
    if (!canCheckout({ userId, allowlist: allowedUserIds(), onSale: PLUS_ON_SALE, billingReady })) {
      return to(req, '/account');
    }
    const sub = await subscriptionFor(userId);
    // Already subscribed: billing changes go through the portal, not a second subscription.
    if (sub && LIVE_STATUSES.includes(sub.status)) return to(req, '/account');

    let customerId = sub?.stripe_customer_id;
    if (!customerId) {
      const user = await currentUser();
      const customer = await stripe().customers.create(
        {
          email: user?.primaryEmailAddress?.emailAddress || undefined,
          metadata: { clerk_user_id: userId },
        },
        { idempotencyKey: `customer-${userId}` }
      );
      customerId = await saveCustomer(q, userId, customer.id);
    }

    const session = await stripe().checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: userId,
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      subscription_data: { metadata: { clerk_user_id: userId } },
      metadata: { clerk_user_id: userId },
      success_url: new URL('/account?subscribed=1', req.url).href,
      cancel_url: new URL('/account', req.url).href,
    });
    return NextResponse.redirect(session.url, 303);
  } catch (err) {
    console.error('billing checkout', err);
    return to(req, '/account?billing-error=1');
  }
}

export const GET = (req) => to(req, '/account');
