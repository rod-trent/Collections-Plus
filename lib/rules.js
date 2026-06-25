// rules.js — match a page being saved against auto-file rules, returning the
// collection it should route into. Pure and dependency-free (unit-tested in
// tools/test_rules.mjs); the service worker uses it to route quick-saves.
//
// Rule shape: { id, type: 'domain'|'urlContains'|'titleContains', value, collectionId }
//   domain        — host equals value, or is a subdomain of it (case-insensitive)
//   urlContains   — the full URL contains value (case-insensitive)
//   titleContains — the page title contains value (case-insensitive)

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

/** Does a single rule match this page? */
export function ruleMatches(rule, { url = '', title = '' } = {}) {
  if (!rule || !rule.value) return false;
  const value = String(rule.value).trim().toLowerCase();
  if (!value) return false;
  if (rule.type === 'domain') {
    const host = hostOf(url);
    const want = value.replace(/^www\./, '');
    return host === want || host.endsWith(`.${want}`);
  }
  if (rule.type === 'urlContains') return String(url).toLowerCase().includes(value);
  if (rule.type === 'titleContains') return String(title).toLowerCase().includes(value);
  return false;
}

/**
 * Return the collectionId of the first rule that matches the page, or null.
 * @param {Array} rules
 * @param {{url?:string, title?:string}} page
 */
export function matchRule(rules, page) {
  if (!Array.isArray(rules)) return null;
  for (const rule of rules) {
    if (ruleMatches(rule, page)) return rule.collectionId;
  }
  return null;
}

/** Human-readable description of a rule's condition (for the rules list UI). */
export function ruleLabel(rule) {
  const v = rule?.value || '';
  if (rule?.type === 'domain') return `Domain is ${v}`;
  if (rule?.type === 'urlContains') return `URL contains "${v}"`;
  if (rule?.type === 'titleContains') return `Title contains "${v}"`;
  return v;
}
