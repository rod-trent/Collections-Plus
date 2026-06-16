// ai.js — Generative-AI provider adapters + collection context builder for the
// in-panel chat. The request-shaping and response-parsing functions are pure
// and dependency-free (tested under Node in tools/test_ai.mjs); only chat() and
// the get/set config helpers touch the browser (fetch + chrome.storage.local).
//
// This is a no-build MV3 extension, so we call provider REST endpoints directly
// with fetch rather than bundling a vendor SDK. Extension pages with the host
// permissions in manifest.json are exempt from CORS, so cross-origin calls to
// the provider APIs work without a proxy.

import { toMarkdown, collectionToMarkdown } from './render.js';

const AI_CONFIG_KEY = 'collectionsAiConfig'; // local-only; never synced or exported

// Provider presets. `kind` selects the wire format (anthropic | openai | gemini);
// the OpenAI kind covers OpenAI, xAI/Grok, Azure AI Foundry, Ollama and any other
// OpenAI-compatible endpoint, varying only by base URL and auth scheme.
export const AI_PROVIDERS = {
  anthropic: {
    label: 'Claude (Anthropic)',
    kind: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-opus-4-8',
    keyHint: 'sk-ant-…',
  },
  openai: {
    label: 'OpenAI',
    kind: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    keyHint: 'sk-…',
  },
  grok: {
    label: 'Grok (xAI)',
    kind: 'openai',
    baseUrl: 'https://api.x.ai/v1',
    model: 'grok-2-latest',
    keyHint: 'xai-…',
  },
  gemini: {
    label: 'Gemini (Google)',
    kind: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    model: 'gemini-1.5-flash',
    keyHint: 'AIza…',
  },
  azure: {
    label: 'Azure AI Foundry',
    kind: 'openai',
    baseUrl: '',
    model: '',
    auth: 'api-key',
    needsBase: true,
    baseHint: 'https://<resource>.services.ai.azure.com/models',
  },
  ollama: {
    label: 'Ollama (local)',
    kind: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.1',
    noKey: true,
  },
  custom: {
    label: 'Other (OpenAI-compatible)',
    kind: 'openai',
    baseUrl: '',
    model: '',
    needsBase: true,
    baseHint: 'https://api.example.com/v1',
  },
};

const DEFAULT_CONFIG = {
  provider: 'anthropic',
  baseUrl: '',
  model: '',
  apiKey: '',
  auth: '', // '' → preset default; 'bearer' | 'api-key' for OpenAI-kind
  maxTokens: 4096,
};

export async function getAiConfig() {
  const r = await chrome.storage.local.get(AI_CONFIG_KEY);
  return { ...DEFAULT_CONFIG, ...(r[AI_CONFIG_KEY] || {}) };
}

export async function setAiConfig(patch) {
  const next = { ...(await getAiConfig()), ...patch };
  await chrome.storage.local.set({ [AI_CONFIG_KEY]: next });
  return next;
}

/** Resolve a config against its preset, filling blanks with preset defaults. */
export function resolveConfig(config) {
  const preset = AI_PROVIDERS[config.provider] || AI_PROVIDERS.anthropic;
  return {
    provider: config.provider,
    kind: preset.kind,
    baseUrl: (config.baseUrl || preset.baseUrl || '').replace(/\/+$/, ''),
    model: config.model || preset.model || '',
    apiKey: config.apiKey || '',
    auth: config.auth || preset.auth || 'bearer',
    noKey: !!preset.noKey,
    maxTokens: config.maxTokens || DEFAULT_CONFIG.maxTokens,
  };
}

/** True when the config has enough filled in to attempt a request. */
export function isConfigured(config) {
  const r = resolveConfig(config);
  if (!r.baseUrl || !r.model) return false;
  if (!r.noKey && !r.apiKey) return false;
  return true;
}

/**
 * Build the system prompt that grounds the model in the user's collections.
 * `collections` is the array to expose; `scopeLabel` names the scope for the
 * model. Output is truncated to `maxChars` so a huge library can't blow past
 * context limits — a note is appended when truncation happens.
 */
export function buildSystemPrompt(collections, { scopeLabel = 'all collections', maxChars = 120000 } = {}) {
  let body =
    collections.length === 1
      ? collectionToMarkdown(collections[0])
      : toMarkdown(collections);
  let truncated = false;
  if (body.length > maxChars) {
    body = body.slice(0, maxChars);
    truncated = true;
  }
  return [
    'You are a helpful assistant built into "Collections Plus", a browser extension',
    'that saves web pages, images and notes into organized collections.',
    `The user\'s saved data (scope: ${scopeLabel}) is provided below as Markdown.`,
    'Use it as your primary source when answering questions, writing summaries,',
    'building reports, or finding items. When the answer is not contained in the',
    'data, say so plainly rather than inventing details. Cite item titles and URLs',
    'where helpful.',
    truncated
      ? '\n(Note: the collection data was truncated to fit; some items may be missing.)'
      : '',
    '\n--- COLLECTIONS DATA ---\n',
    body,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Shape a provider request from a resolved config, a system prompt, and the
 * chat history (`[{role:'user'|'assistant', content}]`). Pure — returns
 * `{ url, headers, body }` ready for fetch. Exported for testing.
 */
export function buildRequest(resolved, system, messages) {
  const { kind, baseUrl, model, apiKey, auth, maxTokens } = resolved;

  if (kind === 'anthropic') {
    return {
      url: `${baseUrl}/v1/messages`,
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        // Required for requests originating from a browser/extension context.
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: {
        model,
        max_tokens: maxTokens,
        ...(system ? { system } : {}),
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      },
    };
  }

  if (kind === 'gemini') {
    return {
      url: `${baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      headers: { 'content-type': 'application/json' },
      body: {
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents: messages.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
      },
    };
  }

  // openai-compatible (OpenAI, Grok, Azure AI Foundry, Ollama, …)
  const headers = { 'content-type': 'application/json' };
  if (auth === 'api-key') headers['api-key'] = apiKey;
  else headers['Authorization'] = `Bearer ${apiKey}`;
  const msgs = system ? [{ role: 'system', content: system }, ...messages] : messages.slice();
  return {
    url: `${baseUrl}/chat/completions`,
    headers,
    body: { model, messages: msgs, max_tokens: maxTokens },
  };
}

/** Extract the assistant text from a provider response body. Pure. */
export function parseResponse(kind, data) {
  if (kind === 'anthropic') {
    return (data.content || [])
      .filter((b) => b && b.type === 'text')
      .map((b) => b.text)
      .join('');
  }
  if (kind === 'gemini') {
    const parts = data.candidates?.[0]?.content?.parts || [];
    return parts.map((p) => p.text).filter(Boolean).join('');
  }
  return data.choices?.[0]?.message?.content || '';
}

/** Pull a human-readable error string out of a provider error body. Pure. */
export function parseError(kind, data) {
  if (!data) return '';
  if (typeof data === 'string') return data;
  return (
    data.error?.message ||
    (typeof data.error === 'string' ? data.error : '') ||
    data.message ||
    ''
  );
}

/**
 * Send a chat request and return the assistant's reply text. Throws an Error
 * with a readable message on failure (HTTP error, network error, empty reply).
 */
export async function chat({ config, system, messages, signal }) {
  const resolved = resolveConfig(config);
  if (!resolved.baseUrl || !resolved.model) {
    throw new Error('AI is not configured — set a provider, model and key in AI settings.');
  }
  const { url, headers, body } = buildRequest(resolved, system, messages);

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new Error(`Could not reach the AI provider (${err.message}).`);
  }

  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const msg = parseError(resolved.kind, data) || `HTTP ${res.status}`;
    throw new Error(`AI request failed: ${msg}`);
  }

  const reply = parseResponse(resolved.kind, data);
  if (!reply) throw new Error('The AI returned an empty response.');
  return reply;
}
