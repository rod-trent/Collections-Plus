// GET (a page navigation from the mobile app's "Use Plus Sync") → sign in with
// Clerk if needed, then return to the app with a new device token in the URL
// fragment, which never reaches a server: /app/#plus-token=cps_…
// Problems come back the same way: /app/#plus-error=not-enabled.
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { q } from '../../../../lib/db.js';
import { addDevice } from '../../../../lib/plus-sync-db.js';
import { plusSyncReady, isAllowed, newDeviceToken } from '../../../../lib/plus-sync.js';

const back = (req, frag) => {
  const res = NextResponse.redirect(new URL(`/app/#${frag}`, req.url), 303);
  res.headers.set('Cache-Control', 'no-store');
  return res;
};

/** "iPhone · Safari", "Android · Chrome"… so the account page can list devices. */
function deviceLabel(ua = '') {
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Mac OS X/.test(ua)
          ? 'Mac'
          : /Windows/.test(ua)
            ? 'Windows'
            : /Linux/.test(ua)
              ? 'Linux'
              : 'Device';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\/|FxiOS/.test(ua)
      ? 'Firefox'
      : /Chrome\/|CriOS/.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'browser';
  return `${os} · ${browser}`;
}

export async function GET(req) {
  if (!plusSyncReady) return back(req, 'plus-error=unavailable');
  try {
    const { userId } = await auth();
    if (!userId) {
      const signIn = new URL(process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL || '/sign-in', req.url);
      signIn.searchParams.set('redirect_url', '/api/sync/connect');
      return NextResponse.redirect(signIn, 303);
    }
    if (!isAllowed(userId)) return back(req, 'plus-error=not-enabled');
    const { token, tokenHash } = newDeviceToken();
    await addDevice(q, userId, { tokenHash, label: deviceLabel(req.headers.get('user-agent') || '') });
    return back(req, `plus-token=${token}`);
  } catch (err) {
    console.error('plus-sync connect', err);
    return back(req, 'plus-error=server');
  }
}
