import { auth, currentUser } from '@clerk/nextjs/server';
import { UserButton } from '@clerk/nextjs';
import { revalidatePath } from 'next/cache';
import { clerkEnabled } from '../../../lib/clerk.js';
import { dbEnabled, q } from '../../../lib/db.js';
import { usage, listDevices, removeDevice } from '../../../lib/plus-sync-db.js';
import { allowedUserIds, plusAccess, QUOTA_BYTES } from '../../../lib/plus-sync.js';
import { canCheckout, GRACE_DAYS, LIVE_STATUSES } from '../../../lib/billing.js';
import { billingReady } from '../../../lib/stripe.js';
import { PLUS_ON_SALE, PLUS_PRICE } from '../../../lib/site.js';
import NotOpen from '../not-open.jsx';

export const metadata = { title: 'Your account' };

function bytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const when = (iso) =>
  new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC';
const day = (iso) => new Date(iso).toLocaleDateString('en-US', { dateStyle: 'long', timeZone: 'UTC' });

async function signOutDevice(form) {
  'use server';
  const { userId } = await auth();
  const id = String(form.get('id') || '');
  if (!userId || !/^[0-9a-f]{16}$/.test(id)) return;
  await removeDevice(q, userId, id);
  revalidatePath('/account');
}

const HEADINGS = { comp: 'Enabled (complimentary)', subscription: 'Active', grace: 'Active, payment past due' };

/** The Plus Sync card for someone with access: last sync, storage, devices. */
async function PlusSyncEnabled({ userId, reason }) {
  const heading = HEADINGS[reason] || 'Enabled';
  if (!dbEnabled) {
    return (
      <div className="card plan" style={{ marginTop: '2rem' }}>
        <span className="tag">Plus Sync</span>
        <h3>{heading}</h3>
        <p>Storage isn’t connected on this server yet, so there’s nothing to show.</p>
      </div>
    );
  }
  const [u, devices] = await Promise.all([usage(q, userId), listDevices(q, userId)]);
  const used = u.docBytes + u.imageBytes;
  return (
    <div className="card plan" style={{ marginTop: '2rem' }}>
      <span className="tag">Plus Sync</span>
      <h3>{heading}</h3>
      <p>{u.updatedAt ? `Last synced ${when(u.updatedAt)}.` : 'Nothing synced yet.'}</p>
      <p>
        Storage used: {bytes(used)} of {bytes(QUOTA_BYTES)} ({bytes(u.docBytes)} library,{' '}
        {u.imageCount} {u.imageCount === 1 ? 'picture' : 'pictures'} in {bytes(u.imageBytes)}).
      </p>
      {devices.length ? (
        <ul>
          {devices.map((d) => (
            <li key={d.id}>
              <form action={signOutDevice} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <span>
                  {d.label || 'Device'}, last used {when(d.lastUsedAt)}
                </span>
                <input type="hidden" name="id" value={d.id} />
                <button className="btn btn-small" type="submit">
                  Sign out
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p>No devices yet.</p>
      )}
      <p>
        To start, <a href="/app/">open the mobile app</a>, tap the menu, and choose Use Plus Sync.
      </p>
    </div>
  );
}

const SubscribeButton = () => (
  <form action="/api/billing/checkout" method="post">
    <button className="btn btn-brand" type="submit">
      Subscribe for {PLUS_PRICE.amount} {PLUS_PRICE.period}
    </button>
  </form>
);

const ManageButton = () => (
  <form action="/api/billing/portal" method="post">
    <button className="btn btn-small" type="submit">
      Manage billing
    </button>
  </form>
);

/** For someone without access: the price and Subscribe, or "not on sale yet". */
function NotActive({ sub, buyable, justSubscribed }) {
  const lapsed = sub?.stripe_subscription_id && !LIVE_STATUSES.includes(sub.status);
  if (sub?.stripe_subscription_id && !lapsed) {
    // past_due beyond the grace period: the Billing card explains how to fix it.
    return (
      <div className="card plan" style={{ marginTop: '2rem' }}>
        <span className="tag">Plus Sync</span>
        <h3>Paused</h3>
        <p>Syncing is paused until your payment goes through. Your synced library is safe.</p>
      </div>
    );
  }
  return (
    <div className="card plan" style={{ marginTop: '2rem' }}>
      <span className="tag">Plus Sync</span>
      <h3>Not active</h3>
      {justSubscribed && (
        <p className="notice">Thanks for subscribing! We’re confirming your payment with Stripe. Refresh this page in a moment.</p>
      )}
      {lapsed && (
        <p>
          Your subscription ended{sub.current_period_end ? ` on ${day(sub.current_period_end)}` : ''}, so syncing has
          stopped. Your synced library is kept until you delete it; subscribe again to pick up where you left off.
        </p>
      )}
      {buyable ? (
        <>
          <p>
            Plus Sync is {PLUS_PRICE.amount} {PLUS_PRICE.period}. Cancel any time.
          </p>
          <SubscribeButton />
        </>
      ) : (
        <>
          <p>Plus Sync isn’t on sale yet.</p>
          <p>
            Until then, the free option already works: <a href="/app/">open the mobile app</a> and connect your
            own Dropbox.
          </p>
        </>
      )}
      {lapsed && billingReady && <ManageButton />}
    </div>
  );
}

/** Subscription status and Manage billing, for anyone with a Stripe subscription. */
function Billing({ sub, reason, buyable }) {
  const live = sub?.stripe_subscription_id && LIVE_STATUSES.includes(sub.status);
  if (!live) {
    // Complimentary users can still subscribe, which is how billing gets tested before launch.
    if (reason !== 'comp' || !buyable) return null;
    return (
      <div className="card plan" style={{ marginTop: '1.5rem' }}>
        <span className="tag">Billing</span>
        <p>
          You have complimentary access, so there’s nothing to pay.
          {PLUS_ON_SALE ? '' : ' Subscribing is open to you for testing before Plus Sync goes on sale.'}
        </p>
        <SubscribeButton />
      </div>
    );
  }
  const end = sub.current_period_end ? day(sub.current_period_end) : null;
  const graceEnd = sub.past_due_since
    ? day(new Date(new Date(sub.past_due_since).getTime() + GRACE_DAYS * 86400_000).toISOString())
    : null;
  return (
    <div className="card plan" style={{ marginTop: '1.5rem' }}>
      <span className="tag">Billing</span>
      {sub.status === 'past_due' ? (
        <p className="notice notice-warn" role="alert">
          <strong>Your last payment didn’t go through.</strong> Update your card in Manage billing to keep Plus Sync.
          {reason === 'grace' && graceEnd ? ` Syncing continues until ${graceEnd}.` : ' Syncing is paused until it’s paid.'}
        </p>
      ) : (
        <p>
          {PLUS_PRICE.amount} {PLUS_PRICE.period}, {sub.status === 'trialing' ? 'in a free trial' : 'active'}.
        </p>
      )}
      {end && (
        <p>
          {sub.cancel_at_period_end
            ? `Cancelled: Plus Sync stays on until ${end}, then stops. Your synced library is kept until you delete it.`
            : `Renews on ${end}.`}
        </p>
      )}
      <ManageButton />
    </div>
  );
}

export default async function Account({ searchParams }) {
  if (!clerkEnabled) return <NotOpen />;
  // proxy.js has already sent signed-out visitors to sign in.
  const user = await currentUser();
  const name = user?.firstName || user?.primaryEmailAddress?.emailAddress || 'there';
  const params = (await searchParams) || {};

  const access = await plusAccess(user?.id);
  const buyable = canCheckout({ userId: user?.id, allowlist: allowedUserIds(), onSale: PLUS_ON_SALE, billingReady });

  return (
    <div className="wrap narrow">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
        <h1 style={{ margin: 0 }}>Hi, {name}</h1>
        <UserButton />
      </div>
      {params['billing-error'] && (
        <p className="notice notice-warn" role="alert" style={{ marginTop: '1.5rem' }}>
          We couldn’t reach our payment provider. Please try again in a moment.
        </p>
      )}
      {access.allowed ? (
        <>
          {params.subscribed && (
            <p className="notice" style={{ marginTop: '1.5rem' }}>
              Thanks for subscribing! Plus Sync is on.
            </p>
          )}
          <PlusSyncEnabled userId={user.id} reason={access.reason} />
        </>
      ) : (
        <NotActive sub={access.sub} buyable={buyable} justSubscribed={Boolean(params.subscribed)} />
      )}
      {billingReady && <Billing sub={access.sub} reason={access.reason} buyable={buyable} />}
    </div>
  );
}
