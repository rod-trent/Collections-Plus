// config.js — deployment settings for the PWA.
//
// DROPBOX_APP_KEY: the public "App key" of the Collections Plus app in the
// Dropbox App Console (https://www.dropbox.com/developers/apps). Create it with
// "Scoped access" + "App folder", grant files.content.read and
// files.content.write, and register this page's URL as a redirect URI (e.g.
// https://getcollectionsplus.com/app/ and http://localhost:8000/pwa/ for dev).
// The key is not a secret — PKCE means no client secret is ever shipped.
// Leave it empty and the app runs local-only with Dropbox sync hidden.
export const DROPBOX_APP_KEY = 'bbs7pmkemi4qgkq';
