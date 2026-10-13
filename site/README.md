# getcollectionsplus.com

The Collections Plus website: the landing page, the mobile web app at `/app/`,
and accounts for the paid Plus Sync tier. Next.js on Vercel, with Clerk for
accounts.

- `/` is the landing page.
- `/app/` is the mobile web app. It's **copied in from `../pwa` and `../lib` on
  every dev/build** (`scripts/copy-pwa.mjs`), so there's one source of truth.
- `/privacy` renders the repo's `../PRIVACY.md` at build time.
- `/account`, `/sign-in`, `/sign-up` are the only pages that load Clerk. Free
  users never get Clerk scripts or cookies.

## Run locally

```bash
npm install
npm run dev
```

Accounts stay closed until Clerk keys are in `.env.local` (see `.env.example`).

## Deploy (one-time setup)

1. **Vercel:** import the GitHub repo, set **Root Directory** to `site`, and keep
   "Include files outside the root directory" on (the build reads `../pwa`,
   `../lib`, `../icons`, `../store-assets` and `../PRIVACY.md`).
2. **Domain:** in the Vercel project → Domains, add `getcollectionsplus.com` and
   `www.getcollectionsplus.com`, then set the DNS records Vercel shows at your
   registrar.
3. **Clerk** (when Plus Sync is ready to open): create an application, add the
   production domain, and put `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and
   `CLERK_SECRET_KEY` in Vercel's environment variables.
4. **Dropbox:** in the Dropbox App Console, add
   `https://getcollectionsplus.com/app/` as a redirect URI, and set the app key
   in `../pwa/config.js`.
