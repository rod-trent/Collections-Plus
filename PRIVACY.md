# Privacy Policy — Collections Plus

_Last updated: 2026-07-13_

Collections Plus is a **local-first** browser extension. It is designed so that
your data stays on your own devices. This policy explains exactly what the
extension does and does not do with your information.

## The short version

- **We collect nothing.** There is no account, no server operated by the
  developer, no analytics, and no telemetry.
- **Your data lives in your browser's local storage** on your device.
- **Nothing is ever transmitted to the developer.**
- **One automatic exception:** a lightweight recovery copy of your collections
  is saved to your browser's built-in account-synced storage so your library can
  be restored if the extension is ever reset or reinstalled. This is handled by
  your browser (Google for Chrome, Microsoft for Edge) under its own privacy
  policy and tied to your browser account, never to the developer. See
  **Automatic recovery backup** below.
- Beyond that, data only leaves your device when **you** turn on an optional
  feature: cross-device sync (a file in your own cloud folder), offline image
  caching (fetching images you saved), or the **AI chat** (sending the
  collections you choose to the AI provider **you** configured). Each is **off
  until you enable it**, and none of them route through the developer.

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
  developer, who still runs no server and receives nothing.
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
  file on your disk. The developer never sees this file; only your chosen cloud
  service handles it, under that service's own privacy policy.
- **Offline image caching.** If you enable it, the extension downloads images
  you save (from the page they came from) so they survive the source going
  offline, and stores a downscaled copy locally. These requests go directly from
  your browser to the image's origin server — not to the developer.
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

## How permissions are used

- **Host access (`<all_urls>`)** is used to read the title and preview image of a
  page **you choose to save**, to capture a screenshot thumbnail of the page
  you're viewing when you save it, (if you enable caching) to fetch images you
  save, and (if you enable AI chat) to send your request to the AI provider's API
  endpoint you configured. It is not used to monitor your browsing.
- **Tabs / scripting** are used to read the current page's title/URL and extract
  its preview image when you save it.
- **Storage / unlimited storage** hold your collections and cached images
  locally, and keep the lightweight recovery copy (see **Automatic recovery
  backup**) in your browser account's synced storage.

## Data sharing

The developer does **not** sell, share, or transmit your data to anyone, and runs
no backend service. Your data leaves your device only in these ways, none of
which route through the developer: automatically, the lightweight recovery copy
saved to your browser account's synced storage (see **Automatic recovery
backup**); and, when **you** enable them, your cloud provider's synced folder
(cross-device sync) or the AI provider whose key you entered (AI chat). In each
case the data goes from your browser straight to that party — your browser
vendor, your cloud service, or your chosen AI provider — never through the
developer.

## Children's privacy

The extension is a general-purpose productivity tool and does not knowingly
collect any personal information from anyone, including children.

## Changes to this policy

Any changes will be published in this file in the project's public repository.

## Contact

Questions? Open an issue at
<https://github.com/rod-trent/Collections-Plus/issues>.
