# Changelog

Release notes for Collections Plus. The summaries here double as the
"What's new" copy used in the Chrome Web Store listing.

## 2.3.0

Three requested improvements for organizing — and protecting — a large library:

**Drag a collection straight into a folder.** You no longer need the 📁 menu to
file a collection. Grab a card by its handle and drop it onto a folder header to
move it in; drop it onto a top-level card to pull it back out. The folder header
highlights as you drag over it. The menu still works for keyboard/precision
moves.

**Cover colors.** Instead of hunting for or uploading an image, give a
collection a solid-color cover from a preset palette — click **🎨** next to
"Change cover…". Folders get colors too: hover a folder header and click **🎨**
to tag it with an accent stripe and colored label. It's the same quick,
consistent approach Edge offers for Workspaces. Colors sync and export like any
other data.

**Automatic Chrome-account backup (survives an extension reset).** After the
recent Edge/Windows update that corrupted extensions and forced a reset — wiping
some users' collections — Collections Plus now keeps a lightweight recovery copy
of your library (titles, links, notes, tags, folders & colors) in your Chrome
account's synced storage. It updates automatically in the background, needs no
setup or permissions, and is restored automatically if the extension is ever
reset or reinstalled and your local data is gone. It's a safety net, not a
replacement for full Sync: heavy items (cached images, readable snapshots) are
left out to fit Chrome's size limit, and very large libraries keep only their
most-recent collections (you'll be told if so). For a complete cross-device
backup, set up file **Sync** — and the panel now nudges you to resume Sync if a
browser restart left it paused. Thanks to the users who reported all three.

## 2.2.0

**Rename saved pages.** Every saved page now has a **✎ Rename** button (hover a
row to reveal it, next to Move and Remove) that lets you give it a friendlier
name than the raw tab title it was captured with. Saved images can be renamed
too — the new name becomes their display text. The rename is stored like any
other edit, so it travels with your sync and shows up on every device. Thanks to
Gianpaolo for the suggestion — previously the only way to get a "nice name" was
to hand-edit the sync file.

## 2.1.1

Two bug fixes:

**Links with a `%` now work.** Saved page links that contained a percent sign
(most commonly Microsoft SharePoint URLs, where spaces show up as `%20`) were
being double-encoded when rendered — `%20` became `%2520` — so the link opened
to the wrong place or a dead page. Links are now escaped correctly and open
exactly as saved. Affects the link rendered for every saved page, image and
highlight.

**Snapshot reader buttons fit the panel.** In the readable-snapshot view the
action buttons could get pushed past the edge of the popup at narrow side-panel
widths, hiding part of the **Open original** button. The buttons are now
labelled **Open ↗**, **Summarize (AI)** and **Refresh**, and wrap cleanly if
space is truly tight — so they always stay inside the window. Thanks to
Gianpaolo for both reports.

## 2.1.0

**Close the panel after Open all.** A new opt-in setting (⋯ → **Tools** →
**Close panel after Open all**) makes the side panel close itself the moment
you open a collection with **▶ Open all pages** — so opening a saved project is
a single click with nothing left to dismiss. It's off by default; turn it on if
you'd rather the panel step out of the way once your tabs are up. Thanks to
Gianpaolo for the suggestion.

## 2.0.0

The biggest release yet — a baker's dozen of new features that make Collections
Plus far more than a place to drop links. Beat link rot with dead-link checking
and readable snapshots, share any collection as a web page, put your own AI to
work (summarize, tag, organize, search by meaning, weekly digest), keep a
reading list, save highlights with annotations, import your browser bookmarks,
auto-file saves by rule, fly around with a Ctrl+K command palette and address-bar
search, sort and compact your lists, follow your system light/dark theme, and
find it all in a tidier, categorized settings menu. Still local-first: no
account, no server, and every networked or AI feature stays off until you turn
it on.

**Tidier settings menu.** The ⋯ menu is now organized into categories —
**Export**, **Import**, **AI**, **Tools & settings**, and **Sync** — that open
as fly-out submenus, with the theme toggle still one click away. Much shorter
and easier to scan.

**Address-bar search.** Type **`col`** then a space in the browser's address bar
and search your saved pages without opening the panel — pick a result to jump
straight to it. A fast way to re-find that thing you saved.

**Weekly digest (AI).** One click (⋯ → **Weekly digest (AI)…**) recaps
everything you saved in the last 7 days — a friendly, grouped summary with a
one-line note per item — rendered right in the chat so you can ask follow-ups.

**Sort & compact view.** Sort the items in a collection by **Newest**,
**Oldest** or **A–Z** (or keep your **Manual** drag order), and sort the
collection list by **Newest** or **A–Z**. A new compact-density toggle tightens
the item list when you want to see more at once. Sorting is display-only — it
never disturbs your saved order — and your choices are remembered.

**Auto-file rules.** Set up rules (⋯ → **Auto-file rules…**) so quick-saves land
in the right place automatically: when you press **Ctrl+Shift+S**, the first
matching rule files the page into its collection — match by **domain**, **URL
contains**, or **title contains**. Rules sync and back up with your data.

**Import your browser bookmarks.** New **Import browser bookmarks…** option (in
the ⋯ menu) brings your Chrome/Edge bookmarks straight in — each bookmark folder
becomes a collection. A fast way to get your existing links into Collections
Plus on day one.

**Highlights & annotations.** Select text on any page, right-click → **Save
selection as highlight**, and the quote is saved with a link back to its source
page and title — plus a note field for your own annotation. Highlights show as
tidy quote blocks in the collection and flow through search, exports and shared
pages, turning Collections Plus into a lightweight research tool.

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

**System theme.** Alongside Light and Dark, a new **System** theme follows your
OS / Chrome light-dark setting and switches live — so the panel dims at sunset
with the rest of your desktop. Cycle it from the ⋯ menu.

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
