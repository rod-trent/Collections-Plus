import { auth, currentUser } from '@clerk/nextjs/server';
import { UserButton } from '@clerk/nextjs';
import { revalidatePath } from 'next/cache';
import { clerkEnabled } from '../../../lib/clerk.js';
import { dbEnabled, q } from '../../../lib/db.js';
import { usage, listDevices, removeDevice } from '../../../lib/plus-sync-db.js';
import { isAllowed, QUOTA_BYTES } from '../../../lib/plus-sync.js';
import { PLUS_PRICE } from '../../../lib/site.js';
import NotOpen from '../not-open.jsx';

export const metadata = { title: 'Your account' };

function bytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const when = (iso) =>
  new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC';

async function signOutDevice(form) {
  'use server';
  const { userId } = await auth();
  const id = String(form.get('id') || '');
  if (!userId || !/^[0-9a-f]{16}$/.test(id)) return;
  await removeDevice(q, userId, id);
  revalidatePath('/account');
}

/** The Plus Sync card for an invited user: last sync, storage, devices. */
async function PlusSyncEnabled({ userId }) {
  if (!dbEnabled) {
    return (
      <div className="card plan" style={{ marginTop: '2rem' }}>
        <span className="tag">Plus Sync</span>
        <h3>Enabled (invite)</h3>
        <p>Storage isn’t connected on this server yet, so there’s nothing to show.</p>
      </div>
    );
  }
  const [u, devices] = await Promise.all([usage(q, userId), listDevices(q, userId)]);
  const used = u.docBytes + u.imageBytes;
  return (
    <div className="card plan" style={{ marginTop: '2rem' }}>
      <span className="tag">Plus Sync</span>
      <h3>Enabled (invite)</h3>
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
      {isAllowed(user?.id) ? (
        <PlusSyncEnabled userId={user.id} />
      ) : (
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
      )}
    </div>
  );
}
