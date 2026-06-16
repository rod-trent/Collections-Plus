title: Collections Plus 1.5: Find anything you saved — and chat with it

subtitle: My free, local-first replacement for the retiring Edge Collections now searches inside everything you saved, and can talk to your collections using your own AI key. Still no account, still no server.

---

A collection is only useful if you can get back to what you put in it. Version 1.5 of **Collections Plus** — my open, local-first replacement for Microsoft Edge Collections (which Microsoft is retiring in Edge 149, around June 2026) — is about exactly that: **finding your stuff, and asking questions about it.**

Two headline features this release.

## 1. Search that actually finds your items

Search used to match collection titles, URLs, notes, and tags. That's fine until the thing you remember is *inside* an item — a price you jotted in a custom field, a product name buried in a long list. So search got smarter:

- **It now looks inside custom fields too**, not just titles and notes. If you saved a part with a SKU or a price, you can search for it.
- **Results show which items matched.** When a collection surfaces in the list, the card now shows the matching item names underneath — so you can see *why* it matched without opening it.
- **Open a collection and you get a filter box.** Inside any collection with more than a couple of items, a "Filter items in this collection…" box lets you narrow a long list instantly. Type, and the items that don't match disappear.

Small change, big day-to-day difference: the bigger your library gets, the more it matters.

## 2. Chat with your collections — using your own AI key

This is the one I'm most excited about. **Collections Plus can now chat with the things you saved.**

Connect a generative-AI provider, open a chat, and ask:

- *"Summarize everything in my Research collection."*
- *"Build a comparison table of the laptops I saved."*
- *"What did I save about RAG pipelines?"*
- *"Turn my Trip Planning collection into a day-by-day itinerary."*

The extension takes the collection(s) you're chatting about — titles, URLs, notes, tags, custom fields — and sends them along with your question to the AI, then shows the answer as cleanly formatted text. You can scope a chat to **one collection** (from inside it) or to **all of them**.

### Bring your own provider

There's no "Collections Plus AI service." You use a key you already have, from whichever provider you like:

- **Claude (Anthropic)**
- **OpenAI**
- **Grok (xAI)**
- **Gemini (Google)**
- **Azure AI Foundry**
- **Ollama** — a model running locally on your own machine, no key and no cloud at all
- …or any other OpenAI-compatible endpoint

Setup is one screen: **⋯ → AI settings…**, pick a provider, paste your key, hit **Test connection**. Then **⋯ → Chat with collections (AI)…**, or open a collection and choose **Chat about this collection (AI)…**.

### …without giving up the privacy promise

This is optional, and it's **off until you set it up**. And the core promise is unchanged:

- **Your API key is stored locally**, in the browser's extension storage. It is **never synced and never written into your exports or backups.**
- **I never see any of it** — not your key, not your messages, not your collections. There's no developer server in the loop; the request goes straight from your browser to the provider you chose.
- **Nothing is sent anywhere until you send a chat message.** If you never open AI settings, nothing changes.

The one honest caveat, stated plainly: when you *do* use the chat, the collection data you're asking about is sent to **your** chosen AI provider, and they handle it under **their** privacy policy and terms. That's true of any "bring your own key" tool — so pick a provider you trust, and if you want a fully offline option, point it at a local **Ollama** model and nothing leaves your machine at all.

## If you're new here: what Collections Plus actually is

A small browser extension for **Chrome and Edge** that brings Edge Collections back — and then some:

- Save the **current page**, a **right-clicked link or image**, **selected text as a note**, or **all your open tabs** at once.
- **Open a whole collection in one click** into a named browser tab group.
- **Folders, tags, pinning, and search** (now sharper, see above) to keep big libraries manageable.
- **Checkboxes and custom fields** turn any collection into a shopping list, packing list, or parts list.
- **Real Excel (.xlsx) export**, plus CSV, Markdown, HTML, and copy-links.
- **A recoverable Trash and an Archive**, so nothing vanishes by accident.
- **Optional cross-device sync** — no account, no server — through a single file in a folder you already keep synced.

And the whole promise stays intact: **everything is stored locally in your browser.** No account, no telemetry, no developer backend. Sync, offline image caching, and the new AI chat are all off until *you* turn them on.

## Get it

It's free and open source (MIT).

**👉 [Install Collections Plus from the Chrome Web Store](https://chromewebstore.google.com/detail/collections-plus/eekpoobgfoollcmobjeeahonpbjjghia)** — one click, and it auto-updates from there.

Migrating from Edge is one click too: export your Collections data in Edge, then in Collections Plus use **Import Edge CSV…**.

Source, issues, and ideas live on **[GitHub](https://github.com/rod-trent/Collections-Plus)**. If there's a feature you want, tell me — I build the things people actually ask for. (This release is two of them.)

Edge Collections is going away. Yours doesn't have to — and now it can answer questions, too.
