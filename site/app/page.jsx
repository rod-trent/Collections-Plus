import Link from 'next/link';
import { GITHUB_URL, PLUS_PRICE, STORE_URL } from '../lib/site.js';

const FEATURES = [
  {
    icon: '📥',
    title: 'Save anything in one click',
    body: 'Pages, images, notes and highlighted quotes, from the side panel, a right-click, a keyboard shortcut, or by dragging a link onto the panel.',
  },
  {
    icon: '🗂️',
    title: 'Organize your way',
    body: 'Folders, nested collections, tags, pins and custom covers. Open a whole collection at once as a named tab group.',
  },
  {
    icon: '🔎',
    title: 'Find it again',
    body: 'Search across every collection, including notes and tags, or ask the optional AI to search and tidy up with the provider you choose.',
  },
  {
    icon: '🛟',
    title: 'Survives link rot',
    body: 'Spot dead links before they bite, and keep page snapshots so a vanished site doesn’t take your research with it.',
  },
  {
    icon: '📖',
    title: 'A built-in reading list',
    body: 'Saved pages start unread and gather in one place, so “read it later” actually happens.',
  },
  {
    icon: '↩️',
    title: 'Bring your Edge Collections',
    body: 'Import an Edge Collections export, or recover the collections Edge left on disk after it retired the feature.',
  },
];

export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="wrap">
          <div>
            <h1>Your collections, wherever you browse.</h1>
            <p className="lede">
              Collections Plus is the open, local-first replacement for Microsoft Edge Collections.
              Save the web into collections on your computer, and take them with you on your phone.
            </p>
            <div className="ctas">
              <a className="btn btn-primary" href={STORE_URL}>Add to Chrome, it’s free</a>
              <a className="btn btn-ghost" href="/app/">Open the mobile app</a>
            </div>
            <p className="note">Works in Chrome, Edge, Brave and other Chromium browsers. No account needed.</p>
          </div>
          <img
            src="/img/shot-collections.png"
            alt="The Collections Plus side panel with collections, folders and tags"
            width="1280"
            height="800"
          />
        </div>
      </section>

      <section className="block" id="features">
        <div className="wrap">
          <h2>Everything Edge Collections did, and more</h2>
          <p className="sub">A side panel that feels familiar on day one, with the tools a big library needs.</p>
          <div className="grid grid-3">
            {FEATURES.map((f) => (
              <div className="card" key={f.title}>
                <div className="icon" aria-hidden="true">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="block">
        <div className="wrap">
          <div className="gallery" tabIndex={0} aria-label="Screenshots">
            <img src="/img/shot-nested.png" alt="Nested collections" width="1280" height="800" loading="lazy" />
            <img src="/img/shot-ai.png" alt="AI search across collections" width="1280" height="800" loading="lazy" />
            <img src="/img/shot-linkrot.png" alt="Dead-link detection and snapshots" width="1280" height="800" loading="lazy" />
            <img src="/img/shot-reading.png" alt="The reading list" width="1280" height="800" loading="lazy" />
          </div>
        </div>
      </section>

      <section className="block" id="sync">
        <div className="wrap">
          <h2>On your phone, in sync with your desktop</h2>
          <p className="sub">
            The mobile app installs from your browser, with no app store. Choose how your devices stay in step.
          </p>
          <div className="grid grid-2">
            <div className="card plan">
              <span className="tag">Free</span>
              <h3>Sync with your own Dropbox</h3>
              <div className="price">$0</div>
              <ul>
                <li>Your library lives in your Dropbox, never on our servers</li>
                <li>No Collections Plus account</li>
                <li>Edits on every device merge, so nothing is overwritten</li>
              </ul>
              <a className="btn btn-brand" href="/app/">Open the mobile app</a>
            </div>
            <div className="card plan featured">
              <span className="tag">Plus Sync</span>
              <h3>We handle sync for you</h3>
              <div className="price">
                {PLUS_PRICE ? (
                  <>
                    {PLUS_PRICE.amount} <small>{PLUS_PRICE.period}</small>
                  </>
                ) : (
                  <>Coming soon</>
                )}
              </div>
              <ul>
                <li>Sign in on any device and you’re synced, no cloud setup</li>
                <li>Faster sync and support from a real person</li>
                <li>Supports ongoing development of Collections Plus</li>
              </ul>
              <Link className="btn btn-brand" href="/account">Your account</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="block">
        <div className="wrap">
          <div className="privacy-band">
            <h2>Your data stays yours</h2>
            <p className="sub" style={{ marginBottom: '1rem' }}>
              No analytics, no tracking, and nothing sent to us unless you choose Plus Sync. The extension is
              open source, so you don’t have to take our word for it.
            </p>
            <p style={{ margin: 0 }}>
              <Link href="/privacy">Read the privacy policy</Link> · <a href={GITHUB_URL}>View the source on GitHub</a>
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
