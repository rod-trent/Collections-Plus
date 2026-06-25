// ai-organize.js — prompt builders + parsers for the AI "do work" actions:
// summarize an item, suggest tags, and organize a collection. Pure and
// dependency-free (unit-tested in tools/test_ai_organize.mjs); the panel feeds
// the {system, messages} output straight to ai.chat().

import { collectionToMarkdown } from './render.js';

const MAX_SUMMARY_SOURCE = 12000;
const MAX_TAGS_SOURCE = 12000;

/** Chat request that yields a 1–2 sentence, plain-text TL;DR of some text. */
export function summaryRequest({ title = '', text = '' } = {}) {
  const source = String(text || '').slice(0, MAX_SUMMARY_SOURCE);
  return {
    system:
      "You write concise TL;DR summaries. Given a web page's text, reply with " +
      '1–2 plain sentences capturing the key point. No preamble, no markdown, ' +
      'no quotes — just the summary.',
    messages: [{ role: 'user', content: `Title: ${title}\n\n${source}`.trim() }],
  };
}

/** Chat request asking for topical tag suggestions for a whole collection. */
export function tagsRequest(collection, { max = 7 } = {}) {
  const body = collectionToMarkdown(collection || {}).slice(0, MAX_TAGS_SOURCE);
  return {
    system:
      'You suggest concise topical tags for a collection of saved web pages, ' +
      'images and notes. Reply with ONLY a comma-separated list of ' +
      `${max} or fewer short lowercase tags (single words or short phrases). ` +
      'No numbering, no explanation, no other text.',
    messages: [{ role: 'user', content: body }],
  };
}

/**
 * Normalize a model's tag reply into a clean array: split on commas/newlines,
 * strip bullets/numbering/quotes, lowercase, dedupe, and bound count + length.
 */
export function parseTagList(reply, { max = 7, maxLen = 30 } = {}) {
  const seen = new Set();
  const out = [];
  for (const raw of String(reply || '').split(/[,\n]/)) {
    const t = raw
      .trim()
      .replace(/^[-*•\d.)\s]+/, '') // leading bullets / numbering
      .replace(/^["'#]+|["'.]+$/g, '') // wrapping quotes / hashes / trailing dot
      .trim()
      .toLowerCase();
    if (!t || t.length > maxLen) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Build a chat request for a friendly digest of recently-saved items.
 * @param {Array<{title:string, collection:string, host?:string}>} items
 * @param {{days?:number}} [opts]
 */
export function digestRequest(items, { days = 7 } = {}) {
  const lines = (items || [])
    .map((it, i) => `${i + 1}. [${it.collection}] ${it.title}${it.host ? ` (${it.host})` : ''}`)
    .join('\n');
  return {
    system:
      'You write a short, friendly digest of items a user saved recently. Group ' +
      'them by collection (use the collection name as a Markdown heading), and ' +
      'under each give a one-line bullet per item noting what it likely is or why ' +
      'it might matter. Open with a one-sentence recap of how much was saved. Be ' +
      'concise — no preamble beyond that sentence.',
    messages: [
      {
        role: 'user',
        content: `Here are the ${(items || []).length} items I saved in the last ${days} days:\n\n${lines}`,
      },
    ],
  };
}

/** The preset prompt sent to the grounded chat for "Organize this collection". */
export function organizeQuestion() {
  return [
    'Review this collection and suggest how to organize it better. Cover:',
    '1. Logical groups or folders the items could be split into.',
    '2. Any likely duplicates or near-duplicates.',
    '3. A clearer collection title, if the current one could be improved.',
    '4. A few topical tags.',
    'Be concise — use short bullet lists.',
  ].join('\n');
}
