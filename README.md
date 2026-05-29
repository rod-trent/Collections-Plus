# Collections

An open, local-first replacement for **Microsoft Edge Collections**, which is
being retired in Edge 149 (~June 2026). It's a small Manifest V3 browser
extension for **Chromium-based browsers** — no account, no server, no build
step. Your data stays in your browser.

![icon](icons/icon128.png)

## What it does

- **Side panel** that mirrors the original Collections pane.
- Save the **current page** (with thumbnail, favicon and title) with one click.
- **Right-click** any page, link, or image → *Save to Collections ▸ pick a collection*
  (or create a new one on the spot). Select text → *Save selection as note*.
- Add free-form **notes**, **reorder** items by drag-and-drop, and **Open all**
  pages in a collection at once.
- **Import your Edge export** (`collections_export.csv`) so your existing
  collections carry over on day one.
- **Export / import a JSON backup** (high fidelity — keeps notes and images,
  which the Edge CSV does not).

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
4. Pin the **Collections** icon to the toolbar and click it to open the panel.

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

## Data & privacy

Everything is stored locally via `chrome.storage.local` on your machine.
Nothing is sent anywhere. Images are stored as references to their original
URLs (not copied), so they display as long as the source stays online.

## Project layout

```
manifest.json        MV3 manifest
background.js        service worker: side panel + context menus
sidepanel/           panel.html / panel.css / panel.js (the UI)
lib/store.js         data layer (chrome.storage.local) + import/export
lib/csv.js           tolerant CSV parser + Edge-export mapper (pure, testable)
icons/               generated PNG icons
tools/make_icons.py  regenerate the icons
fixtures/            sample Edge CSV for testing the importer
```

## Development

- No build step — edit files and hit reload on the extension card.
- Test the CSV importer without a browser:
  ```
  node tools/test_csv.mjs
  ```
- Regenerate icons:
  ```
  python tools/make_icons.py
  ```

## Roadmap ideas

- Optional image caching (store blobs so saved images survive link rot).
- Search across collections.
- Cross-device sync via your own storage (e.g. a synced file or `storage.sync`).
