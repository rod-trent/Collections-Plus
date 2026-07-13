title: Collections Plus 2.3: color your collections, drag them into folders, and never lose them again

subtitle: Four updates to my free, local-first replacement for the retiring Edge Collections, including an automatic backup that survives a browser reset, color-coded collections and folders, and drag-and-drop organizing. Still no account, still no server.

---

When Microsoft announced it's retiring **Edge Collections** (around Edge 149, mid-2026), I built **Collections Plus** to keep mine: a small, open, local-first browser extension that brings Collections back and then keeps going. Version 2.0 was the big leap, thirteen features in one release. Since then I've shipped a steady run of improvements, almost all of them straight from what people asked for, and 2.3 pulls the best of them together.

This one is a little different in spirit. Alongside the usual "make it nicer to use" features, there's a change here about **not losing your stuff**, and it came from a story I didn't want to hear.

## Never lose your collections again

A reader wrote in after a rough week. A recent Edge update, bundled with Windows updates, had corrupted their extensions. Every extension threw an error and had to be manually reset, and resetting Collections Plus wiped their collections and folders. They'd only been using it about a month, but in that time they'd done a lot of deep research and saved a large pile of material. All of it, gone.

That's the kind of thing that shouldn't be able to happen, so in 2.3 it can't, at least not the way it did.

Collections Plus now keeps an **automatic recovery backup** of your library. It's a lightweight copy of your collections (titles, links, notes, tags, folders, and their colors) stored in your browser account's built-in synced storage, which lives **separately from the extension itself**. When a browser reset wipes the extension's local data, that backup survives, and if you reopen the panel and your collections are gone, they're **restored automatically**.

The important part: it needs nothing from you. No setup, no button to remember, no extra permissions. It updates quietly in the background as you work.

A few honest details, because I'd rather you know exactly what it is:

- It's a **safety net, not a full clone**. To keep it small and reliable, it leaves out heavy items like cached images and saved page snapshots. Your links and research (the irreplaceable part) are what it protects.
- Your browser caps this storage at roughly 100 KB, so if you have a very large library it keeps your **most-recent collections** and tells you when that limit is reached.
- For a complete, no-compromise backup across devices, the file-based **Sync** is still the best option. It backs up everything. And because browsers drop Sync's write permission after a restart, the panel now **nudges you to resume Sync** when it notices it's paused, so that protection doesn't quietly lapse.

Between the two, even if you never touch a setting, your collections now have a floor under them.

## Give your collections a color

Sometimes you don't want to go find a picture. You just want the "recipes" collection to be green and the "work" one to be blue.

So covers can now be a **solid color from a preset palette**. Open a collection and click the **🎨** button next to "Change cover," and pick a swatch. No hunting for an image, no uploading, just a clean, consistent look in a click.

**Folders got colors too.** Hover a folder, click its **🎨**, and it picks up a colored accent stripe and label, so groups are easy to tell apart at a glance when you're scanning a long list. It's the same quick approach Edge offers when you create a Workspace, and it was a direct request. Colors sync and export like any other part of your data.

## Drag a collection into a folder

Folders have been in Collections Plus for a while, and moving a collection into one worked through a menu. But once you're organizing a lot of collections, a menu is friction.

Now you can just **drag**. Grab a collection by its handle and drop it onto a folder to file it there. The folder highlights as you drag over it, so you always know where it's about to land. Want it back out? Drop it onto a top-level collection and it leaves the folder again. The old menu is still there for precise or keyboard-driven moves, but for everyday tidying, drag-and-drop is faster and more obvious.

## Rename your saved pages

Saved tabs come in with whatever the page's title happened to be, which isn't always the name you'd choose. Every saved page now has a **✎ Rename** button (hover a row to reveal it, right next to Move and Remove) so you can give it a friendlier name. Saved images can be renamed the same way. The new name is stored like any other edit, so it travels with your sync and shows up on every device.

Before this, the only way to get a "nice name" was to hand-edit your sync file, which is exactly the kind of thing you shouldn't have to do.

## The smaller stuff

A handful of quality-of-life fixes and polish rounded out these releases:

- **Bigger, clearer folders.** Folder rows used to sit a bit thin next to the larger collection cards. The folder icon and label are now sized up so folders read clearly at a glance.
- **Close the panel after "Open all."** An opt-in setting (⋯ → Tools → **Close panel after Open all**) makes the side panel step out of the way the moment you open a collection's pages into a tab group, so launching a saved project is a single click with nothing left to dismiss.
- **Links with a `%` in them now work.** Saved links containing a percent sign (common in Microsoft SharePoint URLs, where a space shows up as `%20`) were being double-encoded and opening to the wrong place. They now open exactly as saved.
- **Snapshot reader buttons stay on screen.** In the readable-snapshot view, the action buttons could get pushed past the edge of the panel at narrow widths. They're relabeled and wrap cleanly now, so they always stay inside the window.

## A quick note on privacy

The recovery backup is worth being upfront about, because it's the one thing here that's automatic rather than opt-in.

That backup goes into **your own browser account's synced storage** (Google's for Chrome, Microsoft's for Edge), handled by your browser under its privacy policy. It is **never** sent to me. I still run no server, collect nothing, and receive nothing. Your settings and, importantly, your **AI API key are not included** in the backup. Everything else remains exactly as it's always been: your data lives in your browser, and every networked or AI feature is off until you turn it on. I've updated the privacy policy to describe the backup in full.

## Get it

It's free and open source (MIT).

**👉 [Install Collections Plus from the Chrome Web Store](https://chromewebstore.google.com/detail/collections-plus/eekpoobgfoollcmobjeeahonpbjjghia)**, one click, and it auto-updates from there. Works in Chrome and Edge.

Migrating from Edge takes one click: export your Collections in Edge, then use **Import Edge CSV…**, or just pull in your bookmarks with the built-in importer.

Source, issues, and ideas live on **[GitHub](https://github.com/rod-trent/Collections-Plus)**. Every feature in this release started as something someone asked for, including the one that started with a lost library. Tell me what you want next, and if something ever goes wrong, tell me that too. It's how this thing keeps getting better.

Edge Collections is going away. Yours doesn't have to, and now it's harder to lose, easier to organize, and a little more colorful.
