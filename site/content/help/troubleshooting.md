# Troubleshooting & FAQ

## Sync

### A change on one device isn't showing up on another

1. **Give it a moment.** The extension saves a few seconds after each change, and the Dropbox desktop app then uploads the file, usually within seconds.
2. **Check the Dropbox desktop app is running** on your computer and has finished syncing. If it's paused or signed out, the file never leaves your computer.
3. **Nudge it.** On your phone, close the app and open it again, or tap the sync line at the top. In the extension, choose **⋯ → Sync → Sync now** (or **Pull from sync file** to fetch the latest).
4. **Make sure both devices use the same file:** `Dropbox` → `Apps` → `Collections Plus` → `collections-sync.json`. The mobile app can only see that file. If your computer is connected to a sync file anywhere else (say, one you created in OneDrive), your phone won't see its changes. Choose **⋯ → Sync → Disconnect sync**, then follow [Sync with Dropbox](/help/sync).

### The extension says "Sync paused — write access needed"

Browsers forget permission to save to the sync file when they restart. Your changes are safe; they're just waiting. Click **Resume** in the message (or **⋯ → Sync → Resume sync**) and allow the browser prompt.

### The app says "Dropbox access ended"

The app's connection to Dropbox was removed, usually because it was disconnected in Dropbox's **Connected apps** settings or the password was changed. Tap **Connect Dropbox** again; your collections on the phone are untouched.

### "Sync conflict — keeping your changes"

This appears when the sync file was last saved by a version of the extension older than 2.10, which can't merge. The extension keeps your changes. Update every computer to 2.10 or later and it won't happen again. See [Why every computer needs 2.10](/help/sync#why-every-computer-needs-2-10).

### I connected a computer and its collections disappeared

**Use existing sync file…** loads the shared library onto that computer, replacing what was there. If you exported a backup first, bring it back with **⋯ → Import → Import backup (JSON)…** and choose **Merge**.

If you didn't, **Version history** keeps recent snapshots on that computer. Follow these steps in order, because restoring while sync is on would replace the shared library on every device:

1. **⋯ → Sync → Disconnect sync.**
2. **⋯ → Tools → Version history…** and restore a snapshot from before you connected.
3. **⋯ → Export → Export backup (JSON).**
4. **⋯ → Sync → Use existing sync file…** to reconnect.
5. **⋯ → Import → Import backup (JSON)…**, pick the backup, and choose **Merge**.

### Something I deleted came back

Deletes sync between devices running 2.10 or later. If one of your computers runs an older version, it doesn't know about the delete and can put the item back. Update it, then delete the item again.

## The mobile app

### Chrome doesn't offer "Install app"

Use **⋮ → Add to Home screen** (or **Install app**) in Chrome's menu. Make sure you're on [getcollectionsplus.com/app](https://getcollectionsplus.com/app/), not the home page.

### Collections Plus isn't in my Share menu

- **On Android:** the app has to be installed first (see above). After installing, it can take a moment to appear. Restart your phone if it still doesn't.
- **On iPhone:** Apple doesn't let web apps into the Share menu yet. Copy the link and use the **＋** button instead.

### I don't see the latest features

The app updates itself. Close it completely (swipe it away from your recent apps) and open it again. If it still looks old, do it once more.

### Do I need to be online?

No. The app opens and shows your collections offline, and you can add and edit things. Changes sync when you're back online.

### Where are my collections stored on the phone?

In the browser storage for getcollectionsplus.com on that phone. If you clear that site's data, or uninstall the app, the phone's copy is removed. With Dropbox sync on, connecting again brings everything back.

## The extension

### Where are Archive and Trash?

In the **⋯** menu, along with the Reading list.

### My Edge collections didn't come over

See [Coming from Edge Collections](/help/extension#coming-from-edge-collections). If Edge's `collectionsSQLite` file is gone, for example because Edge's data was cleared, there's unfortunately nothing left to read.

### Imported pages have no pictures

Spreadsheet and bookmark imports don't include pictures. Choose **⋯ → Tools → Fetch all missing images** to fill them in.

## Still stuck?

Open an issue on [GitHub](https://github.com/rod-trent/Collections-Plus/issues) and describe what you see. Screenshots help.
