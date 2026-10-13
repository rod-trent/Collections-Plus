import { currentUser } from '@clerk/nextjs/server';
import { UserButton } from '@clerk/nextjs';
import { clerkEnabled } from '../../../lib/clerk.js';
import { PLUS_PRICE } from '../../../lib/site.js';
import NotOpen from '../not-open.jsx';

export const metadata = { title: 'Your account' };

export default async function Account() {
  if (!clerkEnabled) return <NotOpen />;
  // proxy.js has already sent signed-out visitors to sign in.
  const user = await currentUser();
  const name = user?.firstName || user?.primaryEmailAddress?.emailAddress || 'there';

  return (
    <div className="wrap narrow">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
        <h1 style={{ margin: 0 }}>Hi, {name}</h1>
        <UserButton />
      </div>
      <div className="card plan" style={{ marginTop: '2rem' }}>
        <span className="tag">Plus Sync</span>
        <h3>Not active</h3>
        <p>
          {PLUS_PRICE
            ? `Plus Sync is ${PLUS_PRICE.amount} ${PLUS_PRICE.period}.`
            : 'Plus Sync isn’t on sale yet.'}
        </p>
        <p>
          Until then, the free option already works: <a href="/app/">open the mobile app</a> and connect your
          own Dropbox.
        </p>
      </div>
    </div>
  );
}
