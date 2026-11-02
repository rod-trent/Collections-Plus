// Plus Sync request plumbing: who is calling, are they allowed, and JSON
// replies. Route handlers live in app/api/sync/.
//
// Callers prove who they are in one of two ways:
//  • a device token (`Authorization: Bearer cps_…`), minted by
//    /api/sync/connect after a Clerk sign-in. The mobile app uses this: it
//    never loads Clerk's script, so Clerk's one-minute session cookie would
//    expire under it.
//  • a Clerk session cookie, for pages that do run Clerk.
//
// Who may use it (lib/billing.js decides): anyone with a live subscription,
// plus the Clerk user IDs in PLUS_SYNC_ALLOWED_USER_IDS (complimentary/admin).
import { createHash, randomBytes } from 'node:crypto';
import { auth } from '@clerk/nextjs/server';
import { clerkEnabled } from './clerk.js';
import { dbEnabled, q } from './db.js';
import { deviceUser } from './plus-sync-db.js';
import { accessFor } from './billing.js';
import { getSubscription } from './billing-db.js';

export const plusSyncReady = clerkEnabled && dbEnabled;

export const TOKEN_PREFIX = 'cps_';
export const MAX_DOC_BYTES = 4 * 1024 * 1024; // Vercel caps request bodies at 4.5 MB
export const MAX_IMAGE_BYTES = 1024 * 1024;
export const QUOTA_BYTES = (Number(process.env.PLUS_SYNC_QUOTA_MB) || 250) * 1024 * 1024;

export function allowedUserIds() {
  return (process.env.PLUS_SYNC_ALLOWED_USER_IDS || '')
    .split(/[\s,]+/)
    .filter(Boolean);
}

/** The user's subscription row, or null (also before 002_billing.sql has run). */
export async function subscriptionFor(userId) {
  if (!userId || !dbEnabled) return null;
  try {
    return await getSubscription(q, userId);
  } catch (err) {
    if (err?.code === '42P01') return null; // no subscriptions table yet
    throw err;
  }
}

/** { allowed, reason, sub } for a user; see accessFor in lib/billing.js. */
export async function plusAccess(userId) {
  const allowlist = allowedUserIds();
  // Complimentary users skip the database.
  const sub = userId && !allowlist.includes(userId) ? await subscriptionFor(userId) : null;
  return { ...accessFor({ userId, allowlist, sub }), sub };
}

export const isAllowed = async (userId) => (await plusAccess(userId)).allowed;

export const sha256 = (s) => createHash('sha256').update(s).digest('hex');

export function newDeviceToken() {
  const token = TOKEN_PREFIX + randomBytes(32).toString('base64url');
  return { token, tokenHash: sha256(token) };
}

export function json(status, body, headers = {}) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

export const fail = (status, error, message) => json(status, { error, message });

/** The bearer device token on a request, if any. */
export function bearer(req) {
  const h = req.headers.get('authorization') || '';
  return h.startsWith(`Bearer ${TOKEN_PREFIX}`) ? h.slice(7) : null;
}

/**
 * Resolve the caller. Returns { userId, tokenHash? } or a Response to send
 * back as-is (503 not set up, 401 signed out, 403 not invited).
 */
export async function authenticate(req) {
  if (!plusSyncReady) return fail(503, 'not-configured', 'Plus Sync isn’t set up on this server.');
  let userId = null;
  let tokenHash = null;
  const token = bearer(req);
  if (token) {
    tokenHash = sha256(token);
    userId = await deviceUser(q, tokenHash);
  } else {
    userId = (await auth()).userId;
  }
  if (!userId) return fail(401, 'signed-out', 'Sign in to use Plus Sync.');
  if (!(await isAllowed(userId))) {
    return fail(403, 'not-enabled', 'Plus Sync isn’t active for this account. Subscribe at /account.');
  }
  return { userId, tokenHash };
}

/** Wrap a handler: authenticate, then run it; turn surprises into 500s. */
export function withUser(handler) {
  return async (req, ctx) => {
    try {
      const who = await authenticate(req);
      if (who instanceof Response) return who;
      return await handler(req, who, ctx);
    } catch (err) {
      console.error('plus-sync', err);
      return fail(500, 'server', 'Something went wrong on our side.');
    }
  };
}

export const HASH_RE = /^[0-9a-f]{64}$/;
