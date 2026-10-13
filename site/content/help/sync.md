# Sync with Dropbox

Sync keeps one library on all your devices: your phone and any number of computers. Save a page on your phone and it shows up in the extension; tidy up on your laptop and your phone follows.

It works through **your own Dropbox**. Your library is kept in a single file, `collections-sync.json`, in a Collections Plus folder in your Dropbox. Every device reads and writes that one file. There's no Collections Plus account, and your collections never pass through our servers.

## Before you start

You'll need:

- **A Dropbox account.** A free one is plenty.
- **The Dropbox desktop app** on each computer you want to sync, signed in to that account, so your Dropbox files appear in a folder on your computer.
- **Collections Plus 2.10 or later** on every computer. Check the version at `chrome://extensions` (or `edge://extensions`). Older versions don't merge edits; see [Why every computer needs 2.10](#why-every-computer-needs-2-10).

## Set it up

Do these steps **in this order**. Connecting the phone first, while it's still empty, means your computer's library becomes the shared one and nothing gets replaced.

### 1. Connect your phone

1. Open the mobile app. (Not installed yet? See [The mobile app](/help/mobile#install-it).)
2. Tap **Sync with your computer** at the top (or **⋯ → Connect Dropbox**).
3. Sign in to Dropbox on Dropbox's own page and tap **Allow**.

You're taken back to the app, which creates the sync file in your Dropbox:

`Dropbox` → `Apps` → `Collections Plus` → `collections-sync.json`

The app can only ever see that **Collections Plus** folder, never the rest of your Dropbox.

### 2. Connect the computer with your collections

1. Wait for the Dropbox desktop app to download the new file. You'll see `Apps\Collections Plus\collections-sync.json` inside your Dropbox folder.
2. Open Collections Plus in your browser and choose **⋯ → Sync → Use existing sync file…**
3. Browse to `Dropbox` → `Apps` → `Collections Plus` and open **collections-sync.json**.
4. Because the file is still empty, the extension asks whether to use it anyway and upload your current data. Choose **Use it**.
5. If your browser asks to let the extension save changes to the file, allow it.

Your whole library is now in the sync file.

> **Already syncing to another file?** If **⋯ → Sync** shows **Sync now** and **Disconnect sync** instead, this computer is connected to an older sync file. Choose **Disconnect sync** first (your collections stay put), then **Use existing sync file…**.

### 3. Check your phone

Open the app again, or tap the sync line at the top. Your collections appear. That's it: from now on, changes on either side show up on the other.

### 4. Add your other computers

On each extra computer, choose **⋯ → Sync → Use existing sync file…** and open the same `collections-sync.json`.

That computer now shows the shared library. **Anything it had before is replaced**, so if it has collections you want to keep, bring them along first:

1. On that computer, before connecting, choose **⋯ → Export → Export backup (JSON)** and save the file.
2. Connect it with **Use existing sync file…** as above.
3. Choose **⋯ → Import → Import backup (JSON)…**, pick the backup, and choose **Merge**. Its collections are added to the shared library and sync everywhere.

## Already added things on your phone?

If you saved things in the app before connecting your computer, step 2 is different: the sync file isn't empty, so the extension **loads it instead**, replacing what's on that computer. To keep both:

1. On your computer, choose **⋯ → Export → Export backup (JSON)** first.
2. Connect it with **Use existing sync file…**. It now shows what's on your phone.
3. Choose **⋯ → Import → Import backup (JSON)…**, pick your backup, and choose **Merge**.

Both sets of collections are now in the shared library.

## How it works day to day

You don't need to do anything. Each device keeps the file up to date on its own:

- **Your phone** syncs when you open the app, when you come back to it, a moment after each change, and every 30 seconds or so while it's open. The line at the top shows the last sync, like *Synced just now with Dropbox*.
- **The extension** saves a moment after each change, and checks for changes from your other devices whenever you open the panel and every 20 seconds while it's open. **⋯ → Sync** shows when it last synced.
- The Dropbox desktop app carries the file between your computer and Dropbox, usually within seconds.

**Edits from different devices are merged**, never overwritten:

- Pages, notes and collections added anywhere are all kept.
- If the same page was edited in two places, the most recent edit wins.
- Something moved to another collection ends up in one place, not two.
- **Deletes sync too**, so something you deleted on one device doesn't come back from another.
- Archive, Trash, folders, tags, checklist ticks and custom fields all sync. So do your auto-file rules.

Some things stay on each device, because they're about how *you* like to see things there: sort order, collapsed folders, the Checklist switch, theme and text size. Your AI key never syncs.

## Syncing computers without Dropbox

If you only want to sync **computers** and don't use the mobile app, you can use any cloud storage that keeps a folder on your computer in sync: **OneDrive**, **Google Drive**, **iCloud Drive** or Dropbox.

1. On the first computer: **⋯ → Sync → Create sync file…** and save `collections-sync.json` in your cloud folder.
2. On each other computer: once the file has synced there, **⋯ → Sync → Use existing sync file…** and open it.

The mobile app only works with Dropbox, so if you'd like your phone in sync later, put the file in Dropbox as described above.

## Why every computer needs 2.10

Version 2.10 introduced merging. Older versions sync the old way, where whichever device saves last wins: they can overwrite changes from your other devices, and things you delete elsewhere can come back. The extension updates itself from the Chrome Web Store, so this usually takes care of itself. If you loaded it manually, update it on every computer.

## Stop syncing

- **On your phone:** **⋯ → Disconnect Dropbox**. Your collections stay on the phone. To also revoke the app's access in Dropbox, go to Dropbox's settings, **Connected apps**, and remove Collections Plus.
- **On a computer:** **⋯ → Sync → Disconnect sync**. Your collections stay on that computer.

The sync file stays in your Dropbox either way, so you can reconnect later.

Something not working? See [Troubleshooting](/help/troubleshooting#sync).
