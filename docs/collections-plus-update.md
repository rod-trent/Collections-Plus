title: Collections Plus Just Got a Major Update — Excel Export, Custom Covers, and Real Cross‑Device Sync

subtitle: My open replacement for the retiring Microsoft Edge Collections grows up — and it still keeps your data on your machine.

---

If you've been following along, you know I've been a little annoyed.

Microsoft is **retiring Edge Collections** in Edge 149 (around June 2026). I *use* Collections. It's the quiet little feature I lean on to corral research, shopping lists, trip planning, and the eleven browser tabs I swear I'll read later. So when I heard it was going away, I did the reasonable thing: I built my own open replacement and gave it away.

That project is **Collections Plus** — a small, local-first browser extension for Chrome and Edge. No account. No server. No build step. Your data lives in your browser, full stop.

And it just got its biggest update yet. Here's everything that's new.

## First, a quick rename

It started life simply called "Collections." That was always going to be confusing next to Edge's feature of the same name, so it's now **Collections Plus**. Same extension, clearer name, and a nod to the fact that it now does a few things the original never did. (If you already had it installed, nothing breaks — your collections are right where you left them.)

## 1. Export to Excel

This is the one I get asked about most, and it turns out to be the most useful in everyday life.

You can now export your collections straight to a spreadsheet:

- **Everything at once** — the ⋯ menu → *Export to Excel (CSV)*.
- **Just one collection** — open it, then ⋯ → *Export to Excel (CSV)*.

The file opens directly in Excel, Google Sheets, or Numbers, with one row per saved item and clean columns: **Collection, Type, Title, URL, Note, Added**.

Why does this matter? Because a collection is often secretly a *list*. A parts list for a project. A shopping list with links to the exact items. Research sources you need to cite. The moment you can pull that into a spreadsheet, you can sort it, filter it, add a price column, total it up, or share it with someone who lives in Excel. That's a genuinely different superpower than "a pretty panel of links."

## 2. Custom covers

Every collection shows a cover thumbnail. Until now, that was just whatever you happened to save first. Now you're in charge:

- **Upload your own image** with *Change cover…* — it's automatically downscaled and stored inside the extension, so it renders forever even if the original web page disappears.
- Or hover any saved page or image and click its **★** to promote that thumbnail to the cover.
- Don't like it? *Remove cover* puts it back to the default.

Small feature, surprisingly satisfying. A wall of well-chosen covers makes a big list of collections actually *scannable*.

## 3. Drag‑and‑drop organization

You could already drag items around inside a collection. Now you can **drag the collections themselves** into whatever order you want — grab the **⠿** handle on a card and drop it where it belongs. Your most-used collections go to the top where they belong. The order saves instantly.

## 4. Cross‑device sync — without handing your data to anyone

This is the big one, and it's the feature I'm proudest of because of *how* it works.

Most sync features want you to log into their cloud. I didn't want to build that, and frankly I didn't want to *be* that — another company holding your bookmarks. So Collections Plus syncs a different way: **it's provider‑agnostic and account‑free.**

Here's the trick. Instead of integrating with OneDrive *or* Google Drive *or* Dropbox, the extension reads and writes a **single file** — `collections-sync.json` — that *you* drop into a folder your computer already keeps synced. Your existing cloud client (OneDrive, Google Drive, Dropbox, iCloud Drive — your call) does the actual syncing. The extension just keeps that one file up to date and reads it back.

Setting it up:

1. On your first device: ⋯ → **Set up sync…** and save `collections-sync.json` inside your synced folder.
2. On your second device: once the cloud has finished downloading that file, run **Set up sync…**, point it at the same file, and choose **load** when asked.

From then on it's hands‑off:

- Your edits are written to the file automatically a moment after you make them.
- New changes are pulled in when you open the panel or click back into it.
- **Sync now** and **Pull from sync file** are there if you want to force the issue.

It reconciles with a simple, predictable rule — **last edit wins** — which is exactly right for one person across a laptop and a desktop. (It's not built for two people editing the same collection at the same instant; if that's you, let the cloud catch up before you bounce between machines. And the JSON backup export is always there as a belt‑and‑suspenders snapshot.)

The best part: **I never see your data, and neither does any server I run. There is no server I run.** The sync file sits in a folder you chose, touched only by a cloud client you already trust.

> Note: sync uses the browser's File System Access API, which Chrome and Edge support. If you're on a browser that doesn't have it, the menu tells you — and everything else still works exactly the same.

## Still local‑first, still yours

None of this changes the core promise. Collections Plus stores everything locally in your browser. Nothing is sent to me. The new sync is opt‑in and points at a file *you* control. Uploaded covers are stored inside the extension so they don't rot. It's still a no‑account, no‑telemetry, no‑nonsense tool.

## How to get it

It's free and open source (MIT). You load it as an unpacked extension today:

1. Open `edge://extensions` (or `chrome://extensions`).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select the project folder.
4. Pin the **Collections Plus** icon and click it.

Migrating from Edge is one click: in Edge, export your Collections data, then in Collections Plus use **Import Edge CSV…**. Your existing collections come right over.

## What's next

A few things I'm chewing on:

- **Search** across all your collections.
- **Tags or folders** for when you have a *lot* of collections.
- **Custom item fields** like price and quantity — which would flow right into that Excel export and make the part‑list use case sing.
- A true **.xlsx** export with multiple sheets and clickable links.

If one of those would change your life, tell me — I build the things people actually ask for.

Edge Collections is going away. Yours doesn't have to.

*Collections Plus is open source on GitHub. Fork it, file issues, send ideas.*
