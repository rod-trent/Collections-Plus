title: Collections Plus 2.0: link rot, sharing, and an AI that actually does the work

subtitle: The biggest update yet to my free, local-first replacement for the retiring Edge Collections — thirteen new features, from dead-link snapshots and shareable pages to AI search, a reading list, highlights, and a Ctrl+K command palette. Still no account, still no server.

---

When Microsoft announced it's retiring **Edge Collections** (around Edge 149, mid-2026), I built **Collections Plus** to keep mine — a small, open, local-first browser extension that brings Collections back and then keeps going. Version 2.0 is the biggest leap so far: **thirteen** new features. This is the release where Collections Plus stops being "a nicer place to drop links" and becomes a genuinely capable place to *keep, find, and use* what you save.

Here's everything that's new.

## Beat link rot

The web forgets. Pages you save today go 404 tomorrow, and a bookmark to a dead page is worse than useless — it's a little lie about something you thought you had.

So Collections Plus now fights back:

- **Check links** (in a collection's ⋯ menu, or **Check all links** in the main menu) probes your saved pages and flags the dead ones with a clear **⚠ dead link** badge.
- **Auto-check links** does it quietly in the background, on a schedule, so you find out *before* you need the page.
- The **📄 snapshot** button on any page saves a clean, readable copy of the article text — so even if the original vanishes, the words survive. Click **Saved snapshot** to read it back anytime.

This is the feature I think about most, because it defends the whole point of saving something: that it'll still be there later.

## Share a collection as a web page

Collections were always *yours*. Now they can be **theirs** too. **Share as web page…** (in a collection's ⋯ menu) turns any collection into a clean, self-contained HTML page — a responsive card layout with your thumbnails, links, notes, and tags — that you can send to anyone or host anywhere. One portable file. No account, no link-shortener, no tracking.

## Put your AI to work — not just to chat

1.5 let you *chat* with your collections. 2.0 lets the AI *do things* (using your own key — same bring-your-own-provider model as before):

- **Summarize (AI)** turns a saved page's snapshot into a one- or two-line TL;DR, saved right onto the item.
- **Suggest tags (AI)** proposes topical tags for a collection — you approve which ones get added.
- **Organize this collection (AI)** suggests groupings, duplicates to merge, and a clearer title.
- **AI search (✨)** — this is a big one. Type a query, hit the sparkle button, and it finds items by *meaning*, not just keywords. "Where should I eat on my trip" can surface a saved ramen guide that shares no words with your query. Each result comes with a one-line reason and a jump to its collection.
- **Weekly digest (AI)** recaps everything you saved in the last seven days — a friendly, grouped summary you can then ask follow-up questions about.

All of it is **off until you connect a provider** (Claude, OpenAI, Grok, Gemini, Azure AI Foundry, or a fully local Ollama model), and your key never leaves your browser.

## A real reading list

Pages you save now start as **unread** and collect in a new **📖 Reading list** (with an unread count right in the toolbar). Open one and it's marked read automatically — or mark items read yourself, or clear the whole list at once. Collections Plus quietly doubles as a read-it-later app now. (Bulk imports stay "read" so they don't flood the list.)

## Highlights & annotations

Select text on any page, right-click → **Save selection as highlight**, and the quote is saved with a link back to its source page *and* a note field for your own thoughts. Highlights show up as tidy quote blocks and flow through search, exports, and shared pages — turning Collections Plus into a lightweight research tool.

## Get around faster

- **Command palette (Ctrl+K / ⌘K):** jump to any collection or run any command — new collection, exports, imports, link checks, AI actions, theme — from one keyboard-driven, fuzzy-filtered list.
- **Address-bar search:** type `col` then a space in the browser's address bar to search your saved pages and jump straight to one, without even opening the panel.

## Bring your bookmarks in

New to Collections Plus, or have years of bookmarks? **Import browser bookmarks…** pulls in your Chrome/Edge bookmarks, turning each bookmark folder into a collection. Day-one migration just got easier.

## Auto-file rules

Set up rules (⋯ → **Auto-file rules…**) so quick-saves land in the right place automatically. Match by **domain**, **URL**, or **title**, and when you press **Ctrl+Shift+S**, the first matching rule files the page into its collection for you. Rules sync and back up with the rest of your data.

## The little things

- **Sort & compact view:** sort a collection's items by Newest, Oldest, or A–Z (or keep your manual drag order), sort the collection list too, and toggle a compact density to fit more on screen. It's display-only — your saved order is never disturbed.
- **System theme:** alongside Light and Dark, a **System** theme follows your OS / Chrome light-dark setting and switches live, so the panel dims at sunset with the rest of your desktop.
- **A tidier settings menu:** the ⋯ menu is now organized into categories — Export, Import, AI, Tools, Sync — that fly out as submenus, so it's short and easy to scan no matter how much it grows.

## The promise hasn't changed

Everything above is built on the same foundation:

- **Your data stays in your browser.** No account, no telemetry, no developer backend.
- **Every networked or AI feature is opt-in** and off until you turn it on — link checking, sync, image caching, and all the AI features.
- **Your AI key is stored locally**, never synced, never written into exports, and never seen by me. When you use an AI feature, the relevant collection data goes straight from your browser to *your* chosen provider under *their* terms — or to a local Ollama model, in which case nothing leaves your machine at all.

## Get it

It's free and open source (MIT).

**👉 [Install Collections Plus from the Chrome Web Store](https://chromewebstore.google.com/detail/collections-plus/eekpoobgfoollcmobjeeahonpbjjghia)** — one click, and it auto-updates from there. Works in Chrome and Edge.

Migrating from Edge takes one click: export your Collections in Edge, then use **Import Edge CSV…** — or just pull in your bookmarks with the new importer.

Source, issues, and ideas live on **[GitHub](https://github.com/rod-trent/Collections-Plus)**. Almost every feature in this release started as something someone asked for. Tell me what you want next.

Edge Collections is going away. Yours doesn't have to — and now it can survive link rot, be shared, search by meaning, and remind you what's still on your list.
