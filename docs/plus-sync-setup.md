# Plus Sync: setup (phase 1, invite only)

Plus Sync is the hosted sync tier. In phase 1 it keeps the **mobile web app**
(`/app/`) in sync across your phones and tablets. The desktop extension joins in
phase 2. There's no billing yet: only the Clerk user IDs you list can use it.

Everything runs on what the site already has: Vercel, Clerk, and **Neon
Postgres** through Vercel's Neon integration. Nothing else.

## Steps

1. **Add Neon to the Vercel project.** Vercel → the getcollectionsplus project →
   **Storage** → **Connect Database** → Neon. Pick your existing Neon project or
   create one. This sets `DATABASE_URL` (and friends) on the project for
   Production, Preview and Development.
2. **Create the tables.** On your machine, in `site/`:

   ```bash
   vercel env pull .env.local
   npm install
   npm run db:setup
   ```

   `db:setup` runs `site/db/migrations/*.sql`. It's safe to run again any time.
3. **Turn on Clerk** (if it isn't yet): put `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and
   `CLERK_SECRET_KEY` in Vercel → Settings → Environment Variables.
4. **Invite yourself.** Sign in once at https://getcollectionsplus.com/sign-in, then
   copy your user ID (`user_…`) from the Clerk dashboard → Users. Set
   `PLUS_SYNC_ALLOWED_USER_IDS` to it in Vercel (comma-separate more IDs later).
   Optional: `PLUS_SYNC_QUOTA_MB` (default 250) caps picture storage per user.
5. **Redeploy** so the new variables take effect.
6. **Try it.** On your phone open https://getcollectionsplus.com/app/ → menu →
   **Use Plus Sync**. You sign in, land back in the app, and it syncs. Do the
   same on a second device. https://getcollectionsplus.com/account shows last
   sync, storage used and your devices (with a Sign out button for each).

If Dropbox is connected in the app, disconnect it first: one sync at a time.

## How it works

- **Sign-in:** "Use Plus Sync" opens `/api/sync/connect`, which signs you in with
  Clerk and returns to `/app/#plus-token=…`. The app keeps that device token and
  sends it as a Bearer header. (Clerk's own session cookie only lasts a minute
  unless Clerk's script runs on the page, and the app never loads Clerk.) Only a
  SHA-256 of each token is stored, in `sync_devices`.
- **Images:** pictures are stored inline in a library, which can be tens of MB,
  and Vercel functions take at most 4.5 MB per request. The app swaps each
  picture for a `cpimg:<sha256>` reference, uploads only the pictures the server
  lacks (one per request), then sends the small library doc, gzipped. Pulls
  download only pictures that the device hasn't cached yet.
- **Conflicts:** each push sends the rev it started from. If another device
  wrote first the API answers 409, and the app pulls, merges and retries.
- **Change checks:** an open app asks for the doc's rev every 2 minutes (and
  syncs whenever it comes to the front or after an edit). Keeping it slow lets
  Neon suspend its database when nobody is active, which is most of what Plus
  Sync costs to run. `pollMs` in `lib/hosted-adapter.js` sets it.
- **Clean-up:** when a push drops a picture, the app asks the server to delete
  pictures the new doc no longer references. Pictures any device touched in
  the last hour are kept, so a push in progress never loses one.
- **Privacy-ready:** the server stores the doc without reading it, so end-to-end
  encryption can be added in the app later with no server change.
- **Off switch:** "Turn off Plus Sync" in the app forgets that device's token.
  Ticking "Also delete my library" erases the doc, the pictures and every
  device token for the account.

## Storage estimate (Neon)

What one user stores:

| | Size |
|---|---|
| Library doc (gzipped, no pictures) | ~50–150 KB per 1,000 items |
| One picture (thumbnail, cover or saved image, ≤512 px JPEG) | ~20–60 KB |
| Light user: 300 items, about 200 pictures | ~5–10 MB |
| Typical user: 1,500 items, about 1,000 pictures | ~30–50 MB |
| Heavy user (capped by `PLUS_SYNC_QUOTA_MB`) | 250 MB |

Pictures are stored once each, no matter how many items share them. JPEGs
don't compress further in Postgres.

On Neon's plans (check https://neon.com/pricing, since numbers change):
- **Free plan, 0.5 GB per project:** about 10–15 typical users. That's plenty
  for the invite phase.
- **Paid plans, billed per GB-month:** at roughly $0.35 per GB-month, a 40 MB
  user costs about **$0.17 a year**, well under a $20/year price. Vercel
  function time and transfer for syncing are small next to that.

## Before launch (phase 3)

- Billing (Stripe) is built: see [plus-sync-billing-setup.md](plus-sync-billing-setup.md).
  `PLUS_SYNC_ALLOWED_USER_IDS` stays as the complimentary/admin list.
- Check the sign-in return on production: after signing in, Clerk should send
  you on to `/api/sync/connect` (from `redirect_url`) and then back to the app.
  If Clerk refuses the redirect, add the site's domain to Clerk's allowed
  redirect origins.

## Files

- API: `site/app/api/sync/` (`doc`, `images/missing`, `images/[hash]`,
  `images/prune`, `status`, `connect`, `device`, and `DELETE /api/sync`)
- Queries: `site/lib/plus-sync-db.js`; auth and allowlist: `site/lib/plus-sync.js`
- Schema: `site/db/migrations/001_plus_sync.sql`; setup: `site/scripts/db-setup.mjs`
- App side: `lib/hosted-adapter.js`, `lib/image-split.js`, `pwa/app.js`
- Tests: `tools/test_hosted_adapter.mjs`, `tools/test_image_split.mjs`
