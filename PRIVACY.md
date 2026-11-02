# Privacy Policy — Collections Plus

_Last updated: 2026-11-02_

Collections Plus is a **local-first** browser extension with a companion
**mobile web app** at <https://getcollectionsplus.com/app/>. Both are designed
so that your data stays on your own devices. This policy explains exactly what
the extension, the mobile web app, the getcollectionsplus.com website and the
optional **Plus Sync** accounts do and do not do with your information.

## The short version

- **No account needed, and nothing collected by default.** The extension and
  the mobile web app have no analytics and no telemetry, and your collections
  stay on your own devices.
- **Your data lives in your browser's local storage** on your device.
- **The one exception is your choice: Plus Sync.** If you create an account and
  turn on Plus Sync, your library is stored on the service's servers so your
  devices can sync. It's used for nothing else. See **Accounts and Plus Sync**
  below.
- **The website** counts page visits with cookie-free analytics. See **The
  website and hosting** below.
- **One automatic exception:** a lightweight recovery copy of your collections
  is saved to your browser's built-in account-synced storage so your library can
  be restored if the extension is ever reset or reinstalled. This is handled by
  your browser (Google for Chrome, Microsoft for Edge) under its own privacy
  policy and tied to your browser account, never to the developer. See
  **Automatic recovery backup** below.
- Beyond that and Plus Sync, data only leaves your device when **you** turn on
  an optional feature: cross-device sync (a file in your own cloud folder), offline image
  caching (fetching images you saved), or the **AI chat** (sending the
  collections you choose to the AI provider **you** configured). Each is **off
  until you enable it**, and none of them route through the developer.
- **The mobile web app** keeps your library in your phone's browser. If you
  connect Dropbox, it syncs directly between your phone and your own Dropbox.
  See **The mobile web app** below.

## What data the extension stores

When you save items, Collections Plus stores the following **locally** on your
device via `chrome.storage.local`:

- Pages you save (URL, title, favicon, and an optional preview thumbnail).
- Images and notes you save.
- Collections, folders, tags, custom fields, and your settings.

This data never leaves your device unless **you** explicitly export it or turn
on optional sync (see below), aside from the automatic recovery backup described
next.

## Automatic recovery backup

To protect against losing your collections if the browser wipes the extension's
local storage — for example when a browser update resets your extensions — the
extension keeps a **lightweight recovery copy** of your data in the browser's
built-in account-synced storage (`chrome.storage.sync`). This is **on by
default** and updates automatically in the background.

- **What's included:** collection titles, links (URLs), notes, tags, folders,
  folder colors, and item done-state — the structure of your library.
- **What's excluded:** heavy content such as cached images, saved page snapshots
  and thumbnails, and your **settings and AI API key** are **not** part of this
  backup.
- **Where it goes:** into your own browser account's sync storage, which the
  browser (Google for Chrome, Microsoft for Edge) replicates across your
  signed-in devices under **its** privacy policy. It is **never** sent to the
  developer.
- **Size limits:** the browser caps this storage at roughly 100 KB, so for a
  large library only your most-recent collections are kept in the recovery copy
  (the extension tells you when this happens). For a complete backup, use the
  optional cross-device sync below.
- **Restore:** if your local data is ever empty (for example after an extension
  reset), the recovery copy is restored automatically.

## Optional features that touch the network or filesystem

These are **off by default** and only do anything if you turn them on:

- **Cross-device sync.** If you enable it, the extension reads and writes a
  single JSON file that **you** place in a folder your own cloud client
  (OneDrive, Google Drive, Dropbox, iCloud Drive, etc.) already syncs. The
  extension uses the browser's File System Access API to read/write that one
  file on your disk. The file holds your library (including your auto-file
  rules) and, so that deletions carry over between devices, a list of recently
  deleted items: just each item's internal ID and when it was deleted, kept for
  90 days. The developer never sees this file; only your chosen cloud service
  handles it, under that service's own privacy policy.
- **Offline image caching.** If you enable it, the extension downloads images
  you save (from the page they came from) so they survive the source going
  offline, and stores a downscaled copy locally. These requests go directly from
  your browser to the image's origin server — not to the developer.
- **Fetch missing images.** When you click "Fetch missing images" (on a
  collection, on a single item, or "Fetch all missing images" in settings), the
  extension fetches the saved page's HTML to read its preview image
  (`og:image`/`twitter:image`), then downloads that image and stores a
  downscaled copy locally. This is the way to add pictures to pages imported from
  a CSV, which arrive without them. It only runs when you click, requests go
  directly from your browser to the pages and image servers you saved (not to the
  developer, and without sending your cookies), and by default it only fills in
  pages that have no image yet.
- **Watched pages.** If you mark a saved page as watched (the 👁 button), the
  extension checks it for changes on the schedule you choose (from hourly to
  daily). It does this in two ways, both on your computer: it fetches the page's
  HTML directly from the site (without sending your cookies), and, if the page is
  open in one of your tabs, it reads that tab's visible text. In both cases the
  text is reduced to a short fingerprint (a SHA-256 hash) that is compared with
  the previous one and stored with the saved page; the page text itself is not
  kept. Only pages you have chosen to watch are checked or read. Nothing is sent
  to the developer. The fingerprints and check times sync with the rest of your
  library if you use sync.
- **AI chat (bring your own provider).** If you open AI settings and enter an API
  key, the extension can chat with your collections. When you send a chat
  message, the extension sends your message **and the contents of the
  collection(s) in scope** (titles, URLs, notes, tags, and custom fields — all
  the data of the collection you're chatting about, or of every collection if you
  chose the "all collections" scope) directly from your browser to the **AI
  provider you selected** (e.g. Anthropic, OpenAI, xAI, Google, Azure, or a local
  Ollama server). That provider processes the request under **its own privacy
  policy and terms** — review them before enabling this. Your **API key is stored
  locally** in `chrome.storage.local`, is **never synced and never included in
  exports or backups**, and the developer never receives your key, your messages,
  or your collections. This feature is **off until you configure it**, and no
  data is sent to any AI provider unless you actively send a chat message.

## The mobile web app

The mobile web app at <https://getcollectionsplus.com/app/> runs in your
phone's browser and works like the extension: your data stays on your device
unless you choose to sync it.

- **Where your data lives:** your collections are stored in your browser's
  storage for getcollectionsplus.com (IndexedDB) on your phone. They are never
  sent to the developer unless you turn on **Plus Sync** (see **Accounts and
  Plus Sync**). Clearing the site's data in your browser, or uninstalling the
  app, deletes this copy.
- **Dropbox sync (optional):** if you tap **Connect Dropbox**, you sign in on
  Dropbox's own page, and Dropbox asks you to approve access. The app can only
  reach **its own folder** (`Dropbox/Apps/` followed by the app's folder name),
  not the rest of your Dropbox, and it reads and writes one file there:
  `collections-sync.json`, the same sync file described under
  **Cross-device sync** above. Requests go directly from your browser to
  Dropbox, under Dropbox's privacy policy, never through the developer.
- **Your Dropbox sign-in:** the access tokens Dropbox issues are stored only in
  your browser on that device. The developer never receives them. **Disconnect**
  in the app revokes access and deletes them from the device, and you can also
  revoke access at any time in your Dropbox account settings under
  **Connected apps**.
- **AI search (optional, bring your own provider):** if you add an API key in
  the app's **AI settings**, tapping **Search by meaning** sends your search
  and the titles, links, notes and custom fields of up to 250 saved items
  directly from your phone to the **AI provider you selected**, which handles
  them under its own privacy policy and terms. Your API key is stored only in
  your browser on that phone, is **never synced or included in backups**, and
  can be removed with **Remove key**. The developer never receives your key,
  your searches or your collections. Nothing is sent to any AI provider unless
  you tap **Search by meaning**.

## The website and hosting

The getcollectionsplus.com website, including the mobile web app's files, is
hosted by **Vercel**. Like any web host, Vercel receives standard technical
information when your browser requests a page, such as your IP address and
browser type, and handles it under Vercel's privacy policy.

- **Page-visit counts.** The website's pages (not the mobile web app, and not
  the extension) use **Vercel Web Analytics** to count visits. It sets no
  cookies and doesn't identify you: it records which page was viewed, the site
  that linked to it, and your country, browser and device type.
- **No advertising or tracking cookies.** The only cookies the site sets are the
  ones the sign-in pages need to keep you signed in (see below).

## Accounts and Plus Sync

Accounts exist only for **Plus Sync**, an optional hosted sync service. You
don't need an account for anything else. While Plus Sync is being tested, only
invited accounts can use it.

- **Signing in.** Accounts are run by **Clerk**, which handles sign-up and
  sign-in for getcollectionsplus.com under its own privacy policy. Clerk stores
  your email address, your name if you give one, and sign-in records such as
  when and from which browser you signed in. The sign-in pages set the cookies
  Clerk needs to keep you signed in; they aren't used for tracking or
  advertising.
- **Signing in with Google.** If you choose **Continue with Google**, Google
  shares your name, email address and profile picture with Clerk. They are used
  only to create your account and sign you in. Collections Plus requests no
  other access to your Google account, and doesn't share Google user data with
  anyone or use it for advertising. Collections Plus's use of information
  received from Google APIs adheres to the
  [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy),
  including the Limited Use requirements.
- **What Plus Sync stores.** When you turn on Plus Sync in the mobile web app,
  it uploads your library so your other devices can sync with it: your
  collections, folders, saved pages, images and notes, tags, custom fields,
  auto-file rules, and a list of recently deleted items (each item's internal
  ID and when it was deleted). Pictures in your library (page thumbnails,
  covers and saved images) are stored separately, once each. It also keeps a
  list of the devices you connected: a label such as "iPhone · Safari", when
  each was connected and when it last synced. Each device gets its own sign-in
  key, and only a scrambled (hashed) form of that key is stored. Your settings
  and AI API keys are never uploaded.
- **Where it's stored.** In a **Neon** Postgres database, connected through
  **Vercel**, under their privacy policies. Everything travels over encrypted
  (HTTPS) connections.
- **How it's used.** Only to keep your library in sync between your devices.
  The service stores your library as the app sends it and doesn't read,
  analyze or index its contents. It is never sold, shared, used for
  advertising, or used to train AI. The developer accesses stored data only
  when needed to keep the service running or when you ask for help.
- **Deleting your data.** In the mobile web app, choose **Turn off Plus Sync**
  and tick **Also delete my library from Plus Sync**: this immediately erases
  your library, its pictures and every device's sign-in key from the service.
  Turning Plus Sync off without ticking it only disconnects that device, and
  you can also disconnect a device from your account page. Pictures you remove
  from your library are deleted from the service after the next sync. The
  copies on your own devices are never affected. To close your account as
  well, email <support@getcollectionsplus.com> from the address you signed up
  with, and your account and any Plus Sync data will be deleted.
- **How long it's kept.** Your Plus Sync data is kept while you use Plus Sync,
  until you delete it as described above or your account is closed.

## How permissions are used

- **Host access (`<all_urls>`)** is used to read the title and preview image of a
  page **you choose to save**, to capture a screenshot thumbnail of the page
  you're viewing when you save it, (if you enable caching) to fetch images you
  save, (when you click "Fetch missing images") to fetch a saved page and its
  preview image, (for pages you mark as watched) to fetch them to check for
  changes, and (if you enable AI chat) to send your request to the AI
  provider's API endpoint you configured. It is not used to monitor your
  browsing.
- **Tabs / scripting** are used to read the current page's title/URL and extract
  its preview image when you save it, and to read the visible text of a tab
  showing a page **you marked as watched**, to check it for changes. Other tabs
  are only matched by address against your watched pages and are never read.
- **Alarms** schedule the background checks (watched pages, and link checks if
  you turn on Auto-check links).
- **Storage / unlimited storage** hold your collections and cached images
  locally, and keep the lightweight recovery copy (see **Automatic recovery
  backup**) in your browser account's synced storage.

## Data sharing

The developer does **not** sell, share, or transmit your data to anyone. Unless
you use Plus Sync, no service run by the developer receives your collections.
Your data leaves your device only in these ways: automatically, the lightweight
recovery copy saved to your browser account's synced storage (see **Automatic
recovery backup**); and, when **you** enable them, your cloud provider's synced
folder (cross-device sync), your own Dropbox (mobile web app sync), the AI
provider whose key you entered (AI chat), or Plus Sync. In all but Plus Sync,
the data goes from your browser straight to that party (your browser vendor,
your cloud service, Dropbox, or your chosen AI provider), never through the
developer. Plus Sync data is handled only by the service providers named under
**Accounts and Plus Sync** (Clerk, Neon and Vercel), solely to run the service.

## Children's privacy

Collections Plus is a general-purpose productivity tool. It isn't directed at
children under 13, accounts aren't intended for them, and it doesn't knowingly
collect personal information from children.

## Changes to this policy

Any changes will be published in this file in the project's public repository.

## Contact

Questions about privacy or your data, or a request to delete your account?
Email <support@getcollectionsplus.com>.

For bugs and feature requests, open an issue at
<https://github.com/rod-trent/Collections-Plus/issues>.
