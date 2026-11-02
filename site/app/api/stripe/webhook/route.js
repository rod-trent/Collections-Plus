// POST from Stripe → keep `subscriptions` in step with Stripe. Not behind
// Clerk (see proxy.js): Stripe's signature is the authentication.
//
// Every handled event is turned into "which subscription is this about?",
// and that subscription is fetched fresh from Stripe and written as a whole.
// So retries and out-of-order deliveries are harmless: the row always ends
// up as Stripe's current state. Errors answer 500 so Stripe retries.
import { q } from '../../../../lib/db.js';
import { upsertSubscription } from '../../../../lib/billing-db.js';
import { eventRef, rowFromSubscription } from '../../../../lib/billing.js';
import { billingReady, stripe } from '../../../../lib/stripe.js';

export const dynamic = 'force-dynamic';

const reply = (status, body) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(req) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!billingReady || !secret) return reply(503, { error: 'not-configured' });

  const body = await req.text(); // raw body: the signature is over these exact bytes
  let event;
  try {
    event = stripe().webhooks.constructEvent(body, req.headers.get('stripe-signature') || '', secret);
  } catch (err) {
    console.warn('stripe webhook: bad signature', err.message);
    return reply(400, { error: 'bad-signature' });
  }

  try {
    const ref = eventRef(event);
    if (!ref?.subscriptionId) return reply(200, { received: true, ignored: true });
    const sub = await stripe().subscriptions.retrieve(ref.subscriptionId, { expand: ['customer'] });
    const row = rowFromSubscription(sub, ref.userId);
    if (!row) {
      console.warn('stripe webhook: no Clerk user for', ref.subscriptionId, event.id);
      return reply(200, { received: true, ignored: true });
    }
    const written = await upsertSubscription(q, row);
    return reply(200, { received: true, written });
  } catch (err) {
    console.error('stripe webhook', event.type, event.id, err);
    return reply(500, { error: 'server' });
  }
}
