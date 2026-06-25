# Changelog

Release notes for Collections Plus. The summaries here double as the
"What's new" copy used in the Chrome Web Store listing.

## Unreleased

**Reading list (read-it-later).** Pages you save now start as **unread** and
collect in a new **📖 Reading list** (with an unread count badge in the toolbar).
Open one and it's automatically marked read — or use the unread dot on an item,
or **Mark all read**. Turns Collections Plus into a tidy read-later queue
without changing how anything else works (bulk imports stay read, so they don't
flood the list).

**Command palette.** Press **Ctrl+K** (⌘K on Mac) anywhere to jump straight to
a collection or run any command — new collection, exports, imports, link
checks, AI actions, theme, archive/trash and more — all from one fuzzy-filtered
list, keyboard-driven. The fastest way to get around.

**Search by meaning, not just keywords.** Type a query and hit the new **✨**
button in the search bar to run an **AI search** across everything you've saved —
it finds items by what they're *about*, so "where to eat on my trip" can surface
a saved ramen guide even without a word in common. Results list the matching
items with a one-line reason and a jump to their collection. Uses your
configured AI provider; the instant keyword search is unchanged.

**Let the AI do the busywork.** If you've connected an AI provider, three new
helpers put it to work on your collections (all in a collection's ⋯ menu, plus
the snapshot reader): **Summarize (AI)** turns a saved page snapshot into a 1–2
sentence TL;DR saved to the item's note; **Suggest tags (AI)** proposes topical
tags and adds the ones you approve; and **Organize this collection (AI)** opens
a grounded chat with suggestions for grouping, duplicates, a clearer title and
tags. Your key stays local, and these stay off until you set up a provider.

**Share a collection as a web page.** A new **Share as web page…** option (in a
collection's ⋯ menu) builds a clean, self-contained HTML page — a responsive
card layout with your thumbnails, links, notes and tags — that you can send to
anyone or host anywhere. It saves the file and offers a one-click preview. No
account, no server, no tracking: just one portable file.

**Beat link rot.** Collections Plus can now tell you when a saved page has gone
dead and help you keep its content. Use **Check links** (in a collection's ⋯
menu, or **Check all links** in the main menu) to probe your saved pages —
broken ones get a clear **⚠ dead link** badge. And the new **📄 snapshot** button
on any page saves a clean, readable copy of the article text so the words
survive even if the original disappears; click **Saved snapshot** to read it
back anytime. Prefer it hands-off? Turn on **Auto-check links** and the
extension quietly re-checks your links in the background.

## 1.5.0

Two big additions. **Search got smarter:** it now looks inside custom fields too,
each result shows which items matched, and opening a collection gives you a new
filter box to narrow down its items instantly. **And Collections Plus can now
chat with your collections** — connect your own generative-AI key (Claude,
OpenAI, Grok, Gemini, Azure AI Foundry, or a local Ollama model) and ask for
summaries, reports, or "what did I save about X?" across all your collections or
just one. Your API key is stored locally and never synced; the chat is entirely
optional and off until you set it up. Replies come back as cleanly formatted
text. As always — keep the feedback coming!

## 1.4.0

Item thumbnails are now much larger — matched to the size of the collection
cover — so your saved pages and images are easier to recognize at a glance. The
"done" checkbox now tucks neatly into the corner of each thumbnail instead of
taking up its own column, and site icons for pages without a preview image are
rendered larger and crisper. Based directly on user feedback — keep the
suggestions coming!

## 1.3.0

One click opens an entire collection straight into a named browser tab group,
on top of folders, search, checklists, real Excel export, offline image
caching, cross-device sync, and a recoverable Trash and Archive. Full tour:
[docs/collections-plus-update.md](docs/collections-plus-update.md).
