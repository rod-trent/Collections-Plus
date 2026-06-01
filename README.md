# Collections Plus

An open, local-first replacement for **Microsoft Edge Collections**, which is
being retired in Edge 149 (~June 2026). It's a small Manifest V3 browser
extension for **Chromium-based browsers** — no account, no server, no build
step. Your data stays in your browser.

![icon](icons/icon128.png)

## What it does

- **Side panel** that mirrors the original Collections pane.
- Save the **current page** (with thumbnail, favicon and title) with one click.
- **Right-click** any page, link, or image → *Save to Collections Plus ▸ pick a collection*
  (or create a new one on the spot). Select text → *Save selection as note*.
- Add free-form **notes**, **reorder** items by drag-and-drop, and **Open all**
  pages in a collection at once.
- **Reorder collections** themselves by dragging the ⠿ handle on each card.
- **Customize the cover** of a collection — upload your own image, or promote
  any saved page thumbnail / image to the cover with its ★ button.
- **Export to Excel** — dump all collections (or just one) to a CSV that opens
  straight in Excel / Google Sheets / Numbers. Handy for part lists, shopping
  lists, or anything you want to sort and total in a spreadsheet.
- **Import your Edge export** (`collections_export.csv`) so your existing
  collections carry over on day one.
- **Export / import a JSON backup** (high fidelity — keeps notes and images,
  which the Edge CSV does not).
- **Optional cross-device sync** through a single file you keep in any
  cloud-synced folder — see [Syncing across devices](#syncing-across-devices).

## Browser support

This is a standard Chromium Manifest V3 extension, so the core (context-menu
saving, storage, page capture, import/export) runs on any modern Chromium
browser. The catch is the **Side Panel API** (`chrome.sidePanel`), which hosts
the whole UI — its support varies:

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

## Install (Load unpacked)

1. Open **`edge://extensions`** (or **`chrome://extensions`**).
2. Turn on **Developer mode** (toggle, usually bottom-left or top-right).
3. Click **Load unpacked** and select this folder (`C:\Code\Collections`).
4. Pin the **Collections Plus** icon to the toolbar and click it to open the panel.

To update after pulling changes, click the **reload** ↻ button on the
extension's card in `edge://extensions`.

## Migrating from Edge Collections

Before Collections is removed, open the Collections pane in Edge and click
**Export Your Data**. Edge writes `collections_export.csv` to your Documents
folder. Then in this extension:

> ⋯ (top-right) → **Import Edge CSV…** → choose `collections_export.csv`

The CSV only contains saved pages (Edge's export drops images and notes), so
the import is pages-only. Going forward, use **Export backup (JSON)** for a
complete backup.

## Organizing & exporting

### Reorder collections and items

Drag the **⠿ handle** on a collection card to reorder your list, and the handle
on an item to reorder it within a collection. The new order is saved instantly.

### Custom covers

Every collection has a cover thumbnail (the first saved item by default). To
change it:

- Open a collection and click **Change cover…** to upload your own image — it's
  downscaled and stored inline, so it always renders even if the original page
  goes offline.
- Or hover any saved page/image and click its **★** to promote that thumbnail to
  the cover.
- ⋯ → **Remove cover** clears it back to the default.

### Export to Excel (CSV)

- ⋯ (top-right) → **Export to Excel (CSV)** exports *every* collection.
- Inside a collection, ⋯ → **Export to Excel (CSV)** exports *just that one*.

The file opens straight in Excel / Google Sheets / Numbers — one row per item,
with columns **Collection, Type, Title, URL, Note, Added**. It's a UTF-8 CSV
(with a BOM) so accented characters and emoji survive. Handy for part lists,
shopping lists, research sources, or anything you want to sort, filter, or total
in a spreadsheet.

## Syncing across devices

Sync is **optional and provider-agnostic** — there's no account and no API keys.
Instead of integrating with one cloud (OneDrive vs. Google Drive vs. …), the
extension reads and writes a single `collections-sync.json` file that **you**
place inside a folder your computer already keeps synced — OneDrive, Google
Drive, Dropbox, iCloud Drive, etc. Your cloud client does the actual syncing;
the extension just keeps that one file up to date.

**On your first device:**

> ⋯ (top-right) → **Create sync file…** → save `collections-sync.json` inside
> your synced folder.

**On every other device:**

> ⋯ (top-right) → **Use existing sync file…** → open the *same*
> `collections-sync.json` once your cloud has finished downloading it.

The second step opens a normal **Open** dialog (not a save/overwrite prompt) and
that device adopts the synced data, then asks for permission to write so its own
future edits sync too. From then on:

- Local edits are written to the file automatically (a moment after you change
  something).
- The extension pulls newer changes when the panel opens or regains focus.
- **Sync now** / **Pull from sync file** force a push / pull on demand.

Reconciliation is **last-write-wins** based on the sync file's modification
time as each device sees it locally (so it doesn't depend on your computers'
clocks agreeing). An open panel checks for changes on focus and every ~20
seconds. This is ideal for one person across several machines. If you edit on
two devices while both are offline, the device that syncs its file *last* wins —
so let the cloud catch up before editing elsewhere. For a guaranteed-complete
snapshot, keep using **Export backup (JSON)**.

> Requires a Chromium browser with the **File System Access API** (Chrome/Edge
> have it). If it's unavailable, the sync menu says so and the rest of the
> extension works unchanged.

## Data & privacy

Everything is stored locally via `chrome.storage.local` on your machine.
Nothing is sent to us or any server — the optional sync file lives in a folder
*you* chose, and only your own cloud client touches it. Saved page/image
thumbnails are stored as references to their original URLs (not copied), so they
display as long as the source stays online; **uploaded covers** are downscaled
and stored inline so they always render.

## Project layout

```
manifest.json        MV3 manifest
background.js        service worker: side panel + context menus
sidepanel/           panel.html / panel.css / panel.js (the UI)
lib/store.js         data layer (chrome.storage.local) + import/export
lib/csv.js           tolerant CSV parser + Edge-export mapper (pure, testable)
lib/export.js        collections → spreadsheet-friendly CSV (pure, testable)
lib/image.js         downscale an uploaded cover image to a small data URL
lib/sync.js          optional synced-file sync (File System Access API)
icons/               generated PNG icons
tools/make_icons.py  regenerate the icons
fixtures/            sample Edge CSV for testing the importer
```

## Development

- No build step — edit files and hit reload on the extension card.
- Run the pure-logic tests without a browser:
  ```
  npm test            # CSV importer + CSV exporter
  ```
- Regenerate icons:
  ```
  python tools/make_icons.py
  ```

## License

[MIT](LICENSE) © Rod Trent. Use it, fork it, improve it.

## Roadmap ideas

- Optional image caching (store blobs so saved images survive link rot).
- Search across collections.
- Tags / folders for grouping many collections.
- Custom item fields (e.g. price, quantity) that flow into the Excel export.
- True `.xlsx` export (multiple sheets, clickable hyperlinks) alongside CSV.
