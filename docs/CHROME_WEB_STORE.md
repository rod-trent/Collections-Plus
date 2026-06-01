# Chrome Web Store submission guide

Everything you need to publish **Collections Plus** to the Chrome Web Store
(and Microsoft Edge Add-ons, which uses the same package).

## 1. Build the package

```
npm run package
```

This writes `dist/collections-plus-<version>.zip` containing only the runtime
files (manifest, background worker, side panel, `lib/`, icons, LICENSE) — no
tests, fixtures, docs, or dev files. Upload that ZIP in the Developer Dashboard.

> Bump `"version"` in `manifest.json` before each new upload — the store rejects
> a re-used version number.

## 2. Store listing copy

**Name:** Collections Plus

**Summary (132 char max):**
> Save pages, images and notes into organized collections — an open replacement for the retired Microsoft Edge Collections.

**Category:** Productivity → Workflow & Planning

**Language:** English

**Detailed description:**

> Collections Plus is a local-first replacement for Microsoft Edge Collections,
> which is being retired. Save pages, images, and notes into organized
> collections — no account, no server, no tracking. Your data stays in your
> browser.
>
> SAVING
> • One-click save of the current page, a keyboard shortcut (Ctrl+Shift+S), or
>   right-click any page, link, or image.
> • Add all open tabs at once, or drag a link/image onto the panel.
> • Skips duplicates; captures a screenshot thumbnail when a page has no preview.
>
> ORGANIZING
> • Search across everything; group collections into folders; pin favorites; tag
>   and filter.
> • Checkboxes turn a collection into a checklist; custom fields (price, qty…)
>   add structured data.
> • Move/copy items between collections, reorder by drag-and-drop, undo deletes,
>   custom covers, and a light/dark theme.
>
> EXPORTING & BACKUP
> • Export to Excel (.xlsx) with clickable links, or CSV, Markdown, or HTML.
> • Import your Edge Collections CSV. Full JSON backup and local version history.
>
> PRIVACY
> • Everything is stored locally. Optional cross-device sync uses a single file
>   in your own cloud folder (OneDrive/Drive/Dropbox/iCloud) — the developer
>   never sees your data and runs no server.

**Privacy policy URL:**
> https://github.com/rod-trent/Collections/blob/main/PRIVACY.md

**Homepage / support URL:**
> https://github.com/rod-trent/Collections

## 3. Permission justifications (the dashboard asks for each)

| Permission | Why it's needed |
|---|---|
| `storage`, `unlimitedStorage` | Store your collections, settings, and (optionally) cached images locally. Unlimited because cached images/covers can exceed the default quota. |
| `sidePanel` | The entire UI is a Chrome side panel. |
| `contextMenus` | Right-click "Save to Collections Plus" on pages, links, and images. |
| `tabs` | Read the current tab's title/URL when you save it, open saved pages, and add all open tabs. |
| `scripting` | Read the page's preview image (og:image) when you save it. |
| `commands` | The Ctrl+Shift+S "save current page" shortcut. |
| **Host access** `<all_urls>` | Read the title/preview image of a page **you choose to save**, capture a screenshot thumbnail, and (only if you enable caching) fetch images you save. Not used to monitor browsing. |

**Single purpose statement:**
> Save and organize web pages, images, and notes into collections.

**Data usage disclosure (Privacy practices tab):**
- Does it collect user data? **Yes — but only stored locally; nothing is
  transmitted.** Select the categories that match what users save (e.g.
  "Website content"), and certify:
  - Not sold to third parties.
  - Not used/transferred for purposes unrelated to the single purpose.
  - Not used/transferred to determine creditworthiness or for lending.

## 4. Graphics to prepare (not in the repo — create before submitting)

- **Store icon:** 128×128 PNG — already shipped (`icons/icon128.png`).
- **Screenshots:** 1280×800 (or 640×400), 1–5 images. Suggested shots:
  1. The collection list with folders, pins, and covers.
  2. A collection with checkboxes and custom fields.
  3. The Excel/CSV/Markdown export menu.
  4. The sync menu ("Synced to … · just now").
- **Small promo tile (optional):** 440×280 PNG.

## 5. Pre-submit checklist

- [ ] `npm test` passes.
- [ ] `npm run package` produces `dist/collections-plus-<version>.zip`.
- [ ] Version bumped in `manifest.json`.
- [ ] Privacy policy committed and the URL resolves.
- [ ] Screenshots captured at the required resolution.
- [ ] Loaded the ZIP as an unpacked extension once to smoke-test it.
