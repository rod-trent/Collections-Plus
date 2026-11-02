// Links and copy shared across pages.
export const STORE_URL =
  'https://chromewebstore.google.com/detail/collections-plus/eekpoobgfoollcmobjeeahonpbjjghia';
export const GITHUB_URL = 'https://github.com/rod-trent/Collections-Plus';
export const SITE_URL = 'https://getcollectionsplus.com';

// The Plus Sync price as shown on the site. Keep it matching the Stripe Price
// (STRIPE_PRICE_ID), which is what's actually charged.
export const PLUS_PRICE = {
  amount: process.env.PLUS_SYNC_PRICE_AMOUNT || '$20',
  period: process.env.PLUS_SYNC_PRICE_PERIOD || 'per year',
};

// The launch switch. Until PLUS_SYNC_ON_SALE=1, Subscribe and checkout are
// open only to PLUS_SYNC_ALLOWED_USER_IDS (for testing), and the landing page
// says "Coming soon". The landing page is built statically, so redeploy after
// changing it.
export const PLUS_ON_SALE = process.env.PLUS_SYNC_ON_SALE === '1';
