# Privacy Policy — Collections Plus

_Last updated: 2026-06-01_

Collections Plus is a **local-first** browser extension. It is designed so that
your data stays on your own devices. This policy explains exactly what the
extension does and does not do with your information.

## The short version

- **We collect nothing.** There is no account, no server operated by the
  developer, no analytics, and no telemetry.
- **Your data stays on your machine**, in the browser's local extension storage.
- **Nothing is transmitted to the developer or any third party.**

## What data the extension stores

When you save items, Collections Plus stores the following **locally** on your
device via `chrome.storage.local`:

- Pages you save (URL, title, favicon, and an optional preview thumbnail).
- Images and notes you save.
- Collections, folders, tags, custom fields, and your settings.

This data never leaves your device unless **you** explicitly export it or turn
on optional sync (see below).

## Optional features that touch the network or filesystem

These are **off by default** and only do anything if you turn them on:

- **Cross-device sync.** If you enable it, the extension reads and writes a
  single JSON file that **you** place in a folder your own cloud client
  (OneDrive, Google Drive, Dropbox, iCloud Drive, etc.) already syncs. The
  extension uses the browser's File System Access API to read/write that one
  file on your disk. The developer never sees this file; only your chosen cloud
  service handles it, under that service's own privacy policy.
- **Offline image caching.** If you enable it, the extension downloads images
  you save (from the page they came from) so they survive the source going
  offline, and stores a downscaled copy locally. These requests go directly from
  your browser to the image's origin server — not to the developer.

## How permissions are used

- **Host access (`<all_urls>`)** is used only to read the title and preview
  image of a page **you choose to save**, to capture a screenshot thumbnail of
  the page you're viewing when you save it, and (if you enable caching) to fetch
  images you save. It is not used to monitor your browsing.
- **Tabs / scripting** are used to read the current page's title/URL and extract
  its preview image when you save it.
- **Storage / unlimited storage** hold your collections and cached images
  locally.

## Data sharing

The developer does **not** sell, share, or transmit your data to anyone. There
is no backend service.

## Children's privacy

The extension is a general-purpose productivity tool and does not knowingly
collect any personal information from anyone, including children.

## Changes to this policy

Any changes will be published in this file in the project's public repository.

## Contact

Questions? Open an issue at
<https://github.com/rod-trent/Collections-Plus/issues>.
