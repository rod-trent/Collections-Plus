# Collections Plus

An open, local-first replacement for **Microsoft Edge Collections**, which is
being retired in Edge 149 (~June 2026). It's a small Manifest V3 browser
extension for **Chromium-based browsers**: no account, no server, no build
step. Your data stays in your browser.

![icon](icons/icon128.png)

## What it does

**Saving**

- **Side panel** that mirrors the original Collections pane.
- Save the **current page** (with thumbnail, favicon and title) with one click,
  or with the **`Ctrl+Shift+S`** keyboard shortcut (rebindable).
- **Right-click** any page, link, or image → *Save to Collections Plus ▸ pick a collection*
  (or create a new one on the spot). Select text → *Save selection as note*, or
  *Save selection as highlight* to keep the quote with a link back to its source
  and your own annotation.
- **Add all open tabs** in the window to a collection at once.
- **Drag a link or image** straight onto the panel to save it.
- **Duplicate-aware:** saving a page already in the collection is skipped.
- When a page has no preview image, a **local screenshot** is captured as the
  thumbnail.

**Organizing**

- **Open a whole collection in one click:** the **▶** button on a collection
  card opens every saved page at once, gathered into a named browser **tab
  group** (the collection's name — the old Edge Collections behavior). Also
  available via ⋯ → *Open all pages* inside a collection.
- Free-form **notes**; **drag-and-drop reorder** of both items and collections.
- **Search** across every collection (titles, URLs, notes, tags, and custom
  fields); results show which items matched, and an open collection gets its own
  **filter box** to narrow its items instantly.
- **Folders** to group collections, **pin** favorites to the top, and **tags**
  (click a tag to filter).
- **Checkboxes** turn any collection into a checklist; **custom fields**
  (price, qty, SKU…) add structured data that flows into exports.
- **Move or copy** items between collections; **undo** deletes.
- **Trash & Archive:** deleting a collection or folder moves it to the **Trash**
  (restorable, and auto-emptied after 30 days), and you can **Archive** old
  collections to keep your main list uncluttered. Both are in the ⋯ menu.
- **Custom covers:** upload an image or promote a saved thumbnail with ★.
- **Reading list (read-it-later):** saved pages start **unread** and gather in
  the **📖 Reading list** (with a toolbar count); opening one marks it read, or
  use **Mark all read**. Bulk imports stay read so they don't flood it.
- **Light / dark / system theme:** cycle in the ⋯ menu. **System** follows your
  OS / Chrome light-dark setting and switches live (e.g. at sunrise/sunset).
- **Command palette (`Ctrl+K` / `⌘K`):** jump to any collection or run any
  command from one keyboard-driven, fuzzy-filtered list.

**Exporting & backup**

- **Export to Excel** as a real **`.xlsx`** workbook (one sheet per collection,
  clickable links) or as **CSV**, great for part lists, shopping lists, or
  anything you want to sort and total.
- **Export to Markdown or HTML**, or **copy a collection's links** to the
  clipboard.
- **Share as a web page:** turn any collection into a clean, self-contained HTML
  page (responsive cards with thumbnails, links, notes and tags) you can send to
  anyone or host anywhere — saved as one portable file, with a one-click preview.
- **Import your Edge export** (`collections_export.csv`) so your existing
  collections carry over on day one.
- **JSON backup** (high fidelity: keeps notes, images, fields) and a local
  **version history** you can roll back to.
- **Optional offline image caching** so saved images survive link rot.
- **Dead-link checking & content snapshots:** *Check links* (per collection or
  all at once) probes your saved pages and badges any that have gone **⚠ dead**;
  turn on **Auto-check links** to have it run quietly in the background. The
  **📄 snapshot** button on a page saves a readable copy of the article text so
  the content survives even if the original goes offline — read it back anytime.
- **Optional cross-device sync** through a single file you keep in any
  cloud-synced folder (see [Syncing across devices](#syncing-across-devices)).

**Ask your collections (optional AI)**

- **Chat with your saved data.** Connect **your own** generative-AI key and ask
  for summaries, reports, comparisons, or "what did I save about X?" — answered
  from the collections you saved.
- **Bring any provider:** Claude (Anthropic), OpenAI, Grok (xAI), Gemini
  (Google), Azure AI Foundry, or a local **Ollama** model. Scope the chat to a
  single collection or all of them.
- **Put the AI to work, not just to chat:** **Summarize (AI)** a saved page
  snapshot into a TL;DR note, **Suggest tags (AI)** for a collection (you approve
  what's added), or **Organize this collection (AI)** for grouping, duplicate and
  title suggestions.
- **AI search (✨):** find items by *meaning* across everything you've saved —
  not just keyword matches — with a one-line reason and a jump to each item's
  collection. The instant keyword search stays available alongside it.
- **Your key stays local** (`chrome.storage.local`), is **never synced or
  exported**, and the whole feature is **off until you set it up**. See
  [Ask your collections](#ask-your-collections-ai) and the
  [Privacy Policy](PRIVACY.md).

## Browser support

This is a standard Chromium Manifest V3 extension, so the core (context-menu
saving, storage, page capture, import/export) runs on any modern Chromium
browser. The catch is the **Side Panel API** (`chrome.sidePanel`), which hosts
the whole UI; its support varies:

| Browser | Side panel UI | Notes |
|---|---|---|
| **Google Chrome** (114+) | ✅ Full | Verified. |
| **Microsoft Edge** (114+) | ✅ Full | Verified. |
| **Brave** | ⚠️ Partial | Panel opens but a known bug can dismiss it after ~1s. |
| **Vivaldi** | ⚠️ Broken | Ships its own "Web Panels"; the standard API doesn't work. |
| **Opera** | ❌ No | Doesn't implement the extension Side Panel API. |
| **Arc / other Chromium** | ➖ Likely | Should work if built on Chromium 114+ with the Side Panel API. |

In short: **Chrome and Edge are the recommended, fully-tested targets.** Other
Chromium browsers may work depending on their Side Panel API support.

## Install

### From the Chrome Web Store

Collections Plus is **live on the Chrome Web Store**. Install it in one click and
it auto-updates, with no manual reloading.

> 🛈 **[Install Collections Plus from the Chrome Web Store →](https://chromewebstore.google.com/detail/collections-plus/eekpoobgfoollcmobjeeahonpbjjghia)**

### Load unpacked (available now)

1. Clone or download the repo from
   <https://github.com/rod-trent/Collections-Plus>.
2. Open **`edge://extensions`** (or **`chrome://extensions`**).
3. Turn on **Developer mode** (toggle, usually bottom-left or top-right).
4. Click **Load unpacked** and select the project folder you just cloned.
5. Pin the **Collections Plus** icon to the toolbar and click it to open the panel.

To update after pulling changes, click the **reload** ↻ button on the
extension's card in `edge://extensions`.

### Keyboard shortcut

`Ctrl+Shift+S` saves the current page to the active collection. To change it,
open **`edge://extensions/shortcuts`** (or **`chrome://extensions/shortcuts`**)
and rebind *"Save the current page to Collections Plus."*

### Updating across devices

An unpacked extension does **not** auto-update; each browser keeps running the
code it last loaded until you hit **reload ↻** on its card. So whenever you pull
new code (or apply a fix), **reload the extension on _every_ device**, not just
one. This matters especially for sync: a device still running older code can not
only miss changes but also **push** with the old logic, so reload all of your
devices around the same time after an update. Reloading only reloads the *code*:
your collections and the sync file are untouched. (Publishing to the Chrome Web
Store / Edge Add-ons would enable background auto-updates; until then, reloading
per device is just how unpacked extensions work.)

## Migrating from Edge Collections

Before Collections is removed, open the Collections pane in Edge and click
**Export Your Data**. Edge writes `collections_export.csv` to your Documents
folder. Then in this extension:

> ⋯ (top-right) → **Import Edge CSV…** → choose `collections_export.csv`

The CSV only contains saved pages (Edge's export drops images and notes), so
the import is pages-only. Going forward, use **Export backup (JSON)** for a
complete backup.

## Organizing & exporting

### Open all pages (tab groups)

A collection exists to be opened, so opening one is a single click. Each
collection card has a **▶** button (it appears when you hover the card) that
opens **every saved page** in that collection at once. The same action lives
inside a collection at ⋯ → **Open all pages**.

The opened pages are gathered into a **browser tab group named after the
collection** — the old Edge Collections behavior — so a whole project opens
together and stays collapsible and out of the way. If you open a large
collection (more than 8 pages), it asks for confirmation first. Tab grouping
needs a Chromium browser with the Tab Groups API (Chrome/Edge have it); where
it's unavailable, the pages still open as ordinary tabs.

### Reorder collections and items

Drag the **⠿ handle** on a collection card to reorder your list, and the handle
on an item to reorder it within a collection. The new order is saved instantly.

Each card's actions (**▶** open, **📁** move to folder, **📦** archive,
**📍** pin, **🗑** trash) stay hidden until you hover the card, so long
collection names get the full width and wrap in full instead of being clipped.
Pinned collections show a small **📌** badge at rest.

### Custom covers

Every collection has a cover thumbnail (the first saved item by default). To
change it:

- Open a collection and click **Change cover…** to upload your own image; it's
  downscaled and stored inline, so it always renders even if the original page
  goes offline.
- Or hover any saved page/image and click its **★** to promote that thumbnail to
  the cover.
- ⋯ → **Remove cover** clears it back to the default.

### Trash & Archive

Two holding areas keep your main list tidy without losing anything. Both are
reachable from the **📦 Archive** and **🗑 Trash** icons at the top of the panel
(each shows a small count badge when it has something in it).

- **Trash** is for things you've deleted. The 🗑 button on a collection card —
  or **⋯ → Move to Trash** inside a collection, or 🗑 on a folder header — moves
  it to the Trash instead of deleting it outright, with an **Undo** toast. From
  the Trash view you can **Restore** any entry, **delete one permanently**, or
  **Empty Trash**. Anything left in the Trash is permanently removed
  **30 days** after it was deleted.
- **Archive** is for collections you want out of the way but intact. The 📦
  button on a card (or **⋯ → Archive collection**) moves a collection to the
  Archive; nothing there is ever auto-deleted. **Restore** brings it back to the
  top of your list.
- Deleting a folder sends it to the Trash too, and **restoring it re-adopts its
  original collections** (which fall back to the top level while it's trashed).
- Both Trash and Archive **sync across devices** and are included in JSON
  backups, just like your collections.

### Export to Excel (CSV)

- ⋯ (top-right) → **Export to Excel (CSV)** exports *every* collection.
- Inside a collection, ⋯ → **Export to Excel (CSV)** exports *just that one*.

The file opens straight in Excel / Google Sheets / Numbers: one row per item,
with columns **Collection, Type, Title, URL, Note, Added**. It's a UTF-8 CSV
(with a BOM) so accented characters and emoji survive. Handy for part lists,
shopping lists, research sources, or anything you want to sort, filter, or total
in a spreadsheet.

## Ask your collections (AI)

Collections Plus can chat with your saved data using a generative-AI provider
**you** bring. It's optional, **off until you set it up**, and uses **your own
API key** — there's no shared service and no developer-run backend.

**Set it up:**

> ⋯ (top-right) → **AI settings…** → pick a provider, paste your API key, and
> (optionally) adjust the base URL or model → **Save**. Use **Test connection**
> to confirm it works.

Supported providers (pick whichever you already have):

| Provider | Notes |
|---|---|
| **Claude (Anthropic)** | Defaults to a current Claude model. |
| **OpenAI** | Standard `chat/completions` API. |
| **Grok (xAI)** | OpenAI-compatible. |
| **Gemini (Google)** | Google Generative Language API. |
| **Azure AI Foundry** | Set your resource base URL; uses an `api-key` header. |
| **Ollama (local)** | Runs against `http://localhost:11434` — no key needed. |
| **Other (OpenAI-compatible)** | Any endpoint that speaks the OpenAI chat API. |

**Chat:**

> ⋯ → **Chat with collections (AI)…** for all collections, or inside a
> collection ⋯ → **Chat about this collection (AI)…** to scope the context to
> just that one.

When you send a message, the extension builds a snapshot of the in-scope
collection(s) — titles, URLs, notes, tags and custom fields — and sends it,
along with your message, **straight from your browser to the provider you
chose**. Ask for summaries, reports, comparisons, or to find what you saved.
Replies are rendered as formatted text.

**What stays private:** your **API key is stored locally** and is **never synced
and never written into exports or backups**. The developer never sees your key,
your messages, or your collections. The data you send goes to your selected AI
provider and is handled under **that provider's** privacy policy and terms —
review them before enabling this. Nothing is sent anywhere until you actively
send a chat message. Full details in the [Privacy Policy](PRIVACY.md).

## Syncing across devices

Sync is **optional and provider-agnostic**: there's no account and no API keys.
Instead of integrating with one cloud (OneDrive vs. Google Drive vs. …), the
extension reads and writes a single `collections-sync.json` file that **you**
place inside a folder your computer already keeps synced: OneDrive, Google
Drive, Dropbox, iCloud Drive, etc. Your cloud client does the actual syncing;
the extension just keeps that one file up to date.

**On your first device:**

> ⋯ (top-right) → **Create sync file…** → save `collections-sync.json` inside
> your synced folder.

**On every other device:**

> ⋯ (top-right) → **Use existing sync file…** → open the *same*
> `collections-sync.json` once your cloud has finished downloading it.

The second step opens a normal **Open** dialog (not a save/overwrite prompt),
the device adopts the synced data, and it asks for permission to write so its own
future edits sync too.

### How it stays in sync

Two simple operations run against that one file:

- **Push:** when you change anything, a moment later the extension writes your
  collections to the file. Your cloud client carries the file to your other
  devices.
- **Pull:** the extension reads the file back and adopts it if it changed.
  An open panel checks **on focus, when it becomes visible again, and every ~20
  seconds**, so changes from another device show up on their own. **Sync now**
  and **Pull from sync file** force a push / pull immediately.

"Did the file change?" is decided by the file's **modification time as this
device sees it locally**: the timestamp your own filesystem records when the
cloud client drops in a new copy. Crucially, this does **not** depend on your two
computers' clocks agreeing, so a change made on one machine can't be mistaken for
"older" and skipped on another. (Earlier builds compared a clock value embedded
by the writing device, which could silently drop changes when clocks drifted;
that's fixed.)

### Conflicts & safety

Reconciliation is **last-write-wins**: whichever device writes the file *last*
is the version everyone converges on. That's exactly right for one person moving
between a laptop and a desktop. It is **not** built for two people (or two
offline devices) editing the *same* collection at once: if you edit on two
devices while both are offline, the one whose file syncs last wins and the
other's un-synced edits are overwritten. So let the cloud catch up before editing
elsewhere, and keep **Export backup (JSON)** as a guaranteed-complete snapshot.

When you connect a device to a file that already has data, it asks before doing
anything destructive: load the file (replace this device's data) or overwrite
the file with this device's data, so you can't accidentally clobber the good
copy. And if a device has **un-pushed local edits** when the file changes
elsewhere, it won't silently overwrite them; it keeps your changes and offers
*"Use file instead."* The sync menu shows when you last synced, and a local
**version history** (⋯ → *Version history…*) lets you roll back recent states.

### Resuming after a browser restart

Browsers don't keep the file's **write** permission across a restart or an
extension reload (a security rule of the File System Access API). When that
happens, Collections Plus pauses background saving instead of erroring: the sync
menu shows **Sync paused**, and a toast offers **Resume**. Click **Resume**
(or ⋯ → **Resume sync** / **Sync now**) once, approve the prompt, and your
pending changes are written immediately and sync continues. Your data is never
lost in the meantime; it's just held locally until you resume.

> Requires a Chromium browser with the **File System Access API** (Chrome/Edge
> have it). If it's unavailable, the sync menu says so and the rest of the
> extension works unchanged.

## Data & privacy

Everything is stored locally via `chrome.storage.local` on your machine.
Nothing is sent to us or any server; the optional sync file lives in a folder
*you* chose, and only your own cloud client touches it. Saved page/image
thumbnails are stored as references to their original URLs (not copied), so they
display as long as the source stays online; **uploaded covers**, **captured
screenshots**, and **cached images** are downscaled and stored inline so they
always render. Offline image caching, cross-device sync, and the AI chat are all
**off until you turn them on**. The AI chat is the only feature that can send your
collection contents off-device, and only to the provider whose key **you**
entered — your key is stored locally and never synced or exported. See the
[Privacy Policy](PRIVACY.md) for the full breakdown.

## Project layout

```
manifest.json        MV3 manifest (+ keyboard command)
background.js        service worker: side panel, context menus, shortcut
sidepanel/           panel.html / panel.css / panel.js (the UI)
lib/store.js         data layer (chrome.storage.local), schema, settings, history
lib/csv.js           tolerant CSV parser + Edge-export mapper (pure, testable)
lib/export.js        collections → CSV + .xlsx sheet structures (pure, testable)
lib/render.js        collections → Markdown / HTML / link list (pure, testable)
lib/ai.js            generative-AI provider adapters + context builder (pure parts testable)
lib/xlsx.js          dependency-free .xlsx writer (pure, testable)
lib/image.js         downscale a file/URL/screenshot into a small data URL
lib/sync.js          optional synced-file sync (File System Access API)
icons/               generated PNG icons
tools/make_icons.py  regenerate the icons
tools/test_*.mjs     pure-logic test harnesses (no browser needed)
fixtures/            sample Edge CSV for testing the importer
```

## Development

- No build step: edit files and hit reload on the extension card.
- Run the pure-logic tests without a browser:
  ```
  npm test            # csv import, csv/xlsx export, render, store/migrate
  ```
- Regenerate icons:
  ```
  python tools/make_icons.py
  ```
- Build a Chrome Web Store / Edge Add-ons upload ZIP (runtime files only):
  ```
  npm run package     # → dist/collections-plus-<version>.zip
  ```

## License

[MIT](LICENSE) © Rod Trent. Use it, fork it, improve it.

## Roadmap ideas

- Bulk multi-select of items (move/copy/delete several at once).
- Full-text search ranking.
- Streaming AI replies and saving a chat result straight into a collection.
- An Edge Add-ons listing (already live on the Chrome Web Store).
