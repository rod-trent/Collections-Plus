// POST (the account page's Manage billing button) → the Stripe Customer
// Portal, to cancel, change card or see invoices. Returns to /account.
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { subscriptionFor } from '../../../../lib/plus-sync.js';
import { billingReady, stripe } from '../../../../lib/stripe.js';

const to = (req, path) => NextResponse.redirect(new URL(path, req.url), 303);

export async function POST(req) {
  if (!billingReady) return to(req, '/account');
  try {
    const { userId } = await auth();
    if (!userId) return to(req, '/sign-in?redirect_url=%2Faccount');
    const sub = await subscriptionFor(userId);
    if (!sub?.stripe_customer_id) return to(req, '/account');
    const session = await stripe().billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: new URL('/account', req.url).href,
    });
    return NextResponse.redirect(session.url, 303);
  } catch (err) {
    console.error('billing portal', err);
    return to(req, '/account?billing-error=1');
  }
}

export const GET = (req) => to(req, '/account');
