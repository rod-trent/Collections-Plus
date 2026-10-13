# AI search

Regular search finds the words you type. **AI search** finds what you *mean*. Search for "places to eat in Osaka" and it can turn up a page called "Best takoyaki stands in Dotonbori", even though none of those words match. Each result comes with a short reason it was picked.

AI search is optional and off until you set it up. It uses **your own account** with an AI provider, so there's no Collections Plus AI service and nothing to subscribe to from us.

## What you'll need

An API key from one of these providers:

| Provider | Where to get a key |
|---|---|
| **Claude (Anthropic)** | console.anthropic.com |
| **OpenAI** | platform.openai.com |
| **Grok (xAI)** | console.x.ai |
| **Gemini (Google)** | aistudio.google.com |

An API key is different from a chat subscription such as ChatGPT Plus or Claude Pro: it's a pay-as-you-go developer account. A search uses a small amount, usually well under a cent, but check your provider's pricing.

On a computer, the extension also works with **Azure AI Foundry**, a local **Ollama** model, or any **OpenAI-compatible** service.

## Set it up in the extension

1. Choose **⋯ → AI → AI settings…**
2. Pick your provider and paste your API key. The model is filled in for you; change it if you like.
3. Click **Save**. **Test connection** checks that it works.

Then type in the search box at the top of the panel and click **✨** to search by meaning.

With AI set up, the extension can do more: **Chat with collections** to ask questions about what you've saved, a **Weekly digest** of recent saves, **Suggest tags**, and **Organize this collection**.

## Set it up on your phone

Your key isn't synced, so each device needs it entered once.

1. In the app, tap **⋯ → AI settings**.
2. Pick **Claude**, **OpenAI**, **Grok** or **Gemini** (or **Other (OpenAI-compatible)**) and paste your API key.
3. Tap **Save**.

To search, tap **🔍**, type what you're looking for, and tap **✨ Search by meaning**. The results appear under **By meaning**, each with its reason and the collection it's in. Tap **Cancel** to stop a search.

## What gets sent, and where

When you run an AI search, your search and a list of your saved items go **straight from your device to the provider you picked**, using your key. For each item, that's its title, web address, note and custom fields. Searches cover up to 250 items.

- Nothing is sent until you tap or click the AI search button.
- It goes directly to your provider, never through Collections Plus.
- Your provider handles it under **its own** privacy policy and terms, so it's worth reading them.
- **Your key stays on the device** where you entered it. It's never synced, never included in backups, and we never see it.

To remove your key, use **Remove key** in the app's AI settings, or clear the key field in the extension's AI settings and save.
