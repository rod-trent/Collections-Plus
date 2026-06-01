title: Collections Plus 1.1 — It Grew Into a Power Tool (and Still Keeps Your Data on Your Machine)

subtitle: My open replacement for the retiring Microsoft Edge Collections now has folders, search, checklists, real Excel export, offline image caching, cross-device sync, and a lot more.

---

If you've been following along, you know the backstory: Microsoft is **retiring Edge Collections** in Edge 149 (around June 2026). I *use* Collections — it's the quiet little feature I lean on for research, shopping lists, trip planning, and the eleven tabs I swear I'll read later. So when I heard it was going away, I built my own open replacement and gave it away.

That project is **Collections Plus** — a small, local-first browser extension for Chrome and Edge. No account. No server. No build step. Your data lives in your browser, full stop.

The first release covered the basics plus Excel export, custom covers, and cross-device sync. Since then it's grown into something genuinely more capable than the thing it replaces. Here's the whole tour.

## Find and organize anything

Once you have more than a handful of collections, finding things matters.

- **Search** across everything — titles, URLs, notes, and tags — from one box at the top.
- **Folders** group related collections under collapsible headers. Hit **+📁**, then use each card's **📁** button to file it away.
- **Pin** your favorites so they float to the top of the list.
- **Tags** label collections, and clicking a tag instantly filters the list to it.

Drag-and-drop works on both the items inside a collection *and* the collections themselves — grab the **⠿** handle and drop where it belongs.

## Turn any collection into a real list

This is my favorite addition, because it changes what a collection *is*.

- **Checkboxes** — every item has one. Suddenly a collection is a shopping list, a reading list, a packing list, a parts list you can tick off.
- **Custom fields** — add your own columns like **Price**, **Qty**, or **SKU** to any saved page or image. They're not just notes; they're structured data…

…which matters because of the next part.

## Get your data out — properly

- **Real Excel (`.xlsx`)** export now, not just CSV. One sheet per collection, a bold header row, and **clickable links**. Those custom fields you added? They become columns. I wrote the `.xlsx` writer from scratch so it stays dependency-free — no bloat.
- **CSV** is still there for quick sorting and totaling.
- **Markdown** and **HTML** export, too — drop a collection straight into your notes, a blog post, or a wiki. (The Markdown uses real task-list checkboxes.)
- **Copy links** puts a clean "Title — URL" list on your clipboard in one click.

A collection is often secretly a list or a dataset. Now you can treat it like one.

## Capture faster

- **Keyboard shortcut** — `Ctrl+Shift+S` saves the current page without touching the mouse (rebindable in your browser's shortcuts page).
- **Add all open tabs** — corral an entire window of "I'll read this later" into a collection at once.
- **Drag a link or image** straight onto the panel to save it.
- **No more duplicates** — saving a page that's already in the collection is skipped.
- **Local screenshots** — when a page has no preview image, Collections Plus grabs a screenshot for the thumbnail, so your list still looks like something.

## Never lose anything

- **Offline image caching** (optional) — turn it on and saved images are downscaled and stored *inside* the extension, so they survive the original page going offline. This was the one genuinely fragile thing in the old version; now it's a switch.
- **Undo** — deleted a collection or item by mistake? The toast has an **Undo** button.
- **Version history** — Collections Plus quietly keeps recent snapshots you can roll back to from ⋯ → *Version history…*.
- **JSON backup** — a complete, high-fidelity export whenever you want one.

## A couple of nice touches

- **Custom covers** — upload your own image or promote any saved thumbnail with **★**. A wall of well-chosen covers makes a big list actually scannable.
- **Light or dark theme** — your call.

## Cross-device sync — without handing your data to anyone

This is the feature I'm proudest of, because of *how* it works. Most sync wants you to log into someone's cloud. I didn't want to build that, and I didn't want to *be* that — another company holding your bookmarks.

So Collections Plus syncs a different way: **provider-agnostic and account-free.** Instead of integrating with OneDrive *or* Google Drive *or* Dropbox, it reads and writes a **single file** — `collections-sync.json` — that *you* drop into a folder your computer already keeps synced. Your existing cloud client does the actual syncing; the extension just keeps that one file current.

Setting it up:

1. First device: ⋯ → **Create sync file…** and save `collections-sync.json` in your synced folder.
2. Other devices: ⋯ → **Use existing sync file…** and open that same file once the cloud has downloaded it.

From there it's hands-off — your edits write out automatically, and an open panel pulls in changes from your other devices on focus and every ~20 seconds. It reconciles with a simple **last-edit-wins** rule, judged by the file's timestamp *as each device sees it locally*, so mismatched computer clocks can't make a real change look "old" and skip it.

And it's gotten smarter since launch:

- A **conflict guard** — if a device has un-pushed edits when the file changes elsewhere, it won't silently overwrite your work. It keeps your changes and offers *"Use file instead."*
- The menu shows **when you last synced**, and version history is your rollback net.

The best part: **I never see your data, and neither does any server I run. There is no server I run.** The sync file lives in a folder you chose, touched only by a cloud client you already trust.

> Sync uses the browser's File System Access API (Chrome and Edge have it). If your browser doesn't, the menu says so and everything else works unchanged.

## Still local-first, still yours

None of this changes the core promise. Everything is stored locally in your browser. Nothing is sent to me. Sync and image caching are both **off until you turn them on**, and sync points at a file *you* control. No account, no telemetry, no nonsense.

## How to get it

It's free and open source (MIT). Load it as an unpacked extension:

1. Open `edge://extensions` (or `chrome://extensions`).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select the project folder.
4. Pin the **Collections Plus** icon and click it.

Migrating from Edge is one click: export your Collections data in Edge, then in Collections Plus use **Import Edge CSV…**.

> Running it on more than one computer? After any update, hit **reload ↻** on the extension card on *each* device — unpacked extensions don't auto-update.

## What's next

- **Bulk multi-select** — move, copy, or delete several items at once.
- Eventually, a **Web Store / Add-ons** listing so updates land automatically.

If something here would make your day better — or you want a feature I haven't built — tell me. I build the things people actually ask for.

Edge Collections is going away. Yours doesn't have to.

*Collections Plus is open source on GitHub. Fork it, file issues, send ideas.*
