# Using the extension

The extension lives in your browser's side panel. Click the Collections Plus icon in the toolbar to open it, and press **Esc** to close it.

## Saving

There are several ways to save, so use whichever is closest to hand:

- **The current page:** open a collection and click **＋ Add current page**, or press **Ctrl+Shift+S** to save it to the collection you used last.
- **Straight from the list:** hover any collection and click its **＋** to save the page you're on into it, without opening it first.
- **Right-click:** right-click a page, a link or an image and choose **Save to Collections Plus**, then pick a collection (or make a new one).
- **Selected text:** select text on a page, right-click, and choose **Save selection as note**, or **Save selection as highlight** to keep the quote with a link back to where it came from.
- **Drag and drop:** drag a link or an image onto the panel.
- **All your tabs:** inside a collection, **⋯ → Add → Add all open tabs** saves every tab in the window at once.

If a page is already in the collection, it isn't saved twice.

**Auto-file rules** can do the sorting for you: under **⋯ → Tools → Auto-file rules…**, send pages to a collection automatically by website, address or title. They apply to **Ctrl+Shift+S** saves, and to links you share to the mobile app.

## Organizing

- **Folders** group collections. Create one with the **＋📁** button next to **＋ New**, then drag collections into it.
- **Collections inside collections:** inside a collection, **⋯ → Add → New collection inside this one…**, or move an existing collection inside another.
- **Pin** a collection to keep it at the top, and add **tags** to it. Click a tag to see everything with that tag.
- **Reorder** anything by dragging its **⠿** handle.
- **Sort** collections and items by newest, oldest or A–Z, or keep your own order. Sorting only changes the view; it never rearranges your saved order.
- **Checklists:** tick items off with their checkboxes, handy for shopping or packing lists.
- **Custom fields** like price or quantity can be added to any page or image, and they come along when you export.
- **Covers:** every collection gets a picture. Click **★** on any saved page to use its image as the cover, or upload your own.

When you're tidying a big list, click **⇅** next to the search box to switch to **organize mode**: the drag handles and the move, archive, pin and delete buttons appear. Click **Done** to go back. Inside a collection, use **Ctrl+K → Organize collections** instead, then drag the **⠿** handles to put its collections in order.

## Opening a collection

Hover a collection and click **▶ Open all** to open every page in it at once, gathered into a **tab group** named after the collection. Collections with more pages than your limit ask first; you can change that limit under **⋯ → Tools → Opening**.

## Finding things

- **Search** at the top of the panel looks through every collection: titles, addresses, notes, tags and custom fields.
- **AI search (✨)** finds things by meaning rather than exact words. It's optional. See [AI search](/help/ai).
- **Ctrl+K** opens the command palette, to jump to any collection or run any command.
- In the address bar, type **col**, a space, and a few words to search your saved pages.

## The Reading list

Pages you save start out **unread** and gather in **⋯ → Reading list**, newest first. Drag the **⠿** handles to put them in the order you want to read them; anything you save later appears at the top. Opening a page marks it read. **Mark all read** clears the list. Don't use read-it-later? Turn off **Show Reading list** under **⋯ → Tools**.

## Archive and Trash

- **Archive** keeps a collection out of your main list without deleting it. Find it again under **⋯ → Archive**, and **Restore** it any time. Drag the **⠿** handles to put the Archive in the order you want, and click an archived collection to look inside it without restoring it. You can't edit it there, but you can drag its pages and the collections inside it into order, ready for when you restore it.
- **Trash:** deleting a collection or folder moves it to **⋯ → Trash**, with **Undo** right away. Anything in the Trash is deleted for good after **30 days**, unless you restore it first. Click a deleted collection to look inside it before deciding; you can drag its pages and collections into order there too.

## Keeping pages from disappearing

Websites change and disappear. A few tools help:

- **Check links** finds saved pages that no longer load and marks them dead. Turn on **Auto-check links** to have it run in the background.
- **📄 Snapshot** saves a readable copy of a page's text, so you can still read it if the site goes away.
- **Fetch missing images** fills in pictures for pages that don't have one, such as pages imported from a spreadsheet.

## Backups and exporting

Under **⋯ → Export**:

- **Export backup (JSON)** saves everything: collections, folders, notes, images and fields. Keep one somewhere safe now and then.
- **Export to Excel (.xlsx)**, **Export as CSV**, **Markdown** and **HTML** are for using your collections elsewhere.

**⋯ → Tools → Version history…** keeps recent snapshots of your library on this computer, so you can roll back a mistake.

## Coming from Edge Collections

Microsoft retired Edge Collections, but your collections are probably still on your computer.

**If you never exported them** (most people), Edge left its database behind:

1. In Collections Plus, choose **⋯ → Import → Import Edge database (SQLite)…**
2. Browse to `%LOCALAPPDATA%\Microsoft\Edge\User Data\Default\Collections\` and choose the file named **collectionsSQLite**. It has no file extension, so set the file picker to show **All files**. If you used a different Edge profile, replace `Default` with that profile's folder, such as `Profile 1`.

Your collections come back, with their page pictures.

**If you did export them** to `collections_export.csv`, choose **⋯ → Import → Import Edge CSV…** instead. That file only holds the pages themselves, so use **Fetch missing images** afterwards to fill in the pictures.

You can also bring in your browser bookmarks with **Import browser bookmarks…**: each bookmark folder becomes a collection.
