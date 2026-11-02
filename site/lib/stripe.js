// Stripe, for the Plus Sync subscription. Billing is off until the secret key
// and the annual Price are set (and Plus Sync itself is set up); the account
// page then hides Subscribe and /api/billing/* answer 503.
// Setup: ../docs/plus-sync-billing-setup.md.
import Stripe from 'stripe';
import { plusSyncReady } from './plus-sync.js';

export const PRICE_ID = process.env.STRIPE_PRICE_ID || '';
export const billingReady = plusSyncReady && Boolean(process.env.STRIPE_SECRET_KEY && PRICE_ID);

let client = null;

export function stripe() {
  client ||= new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}
