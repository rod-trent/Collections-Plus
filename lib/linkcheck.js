// linkcheck.js — classify the result of probing a saved page URL into a
// link-rot status. Pure logic (no network) so it's unit-testable; the actual
// fetch lives in the service worker (background.js), which feeds its outcome
// here.

/**
 * Map a probe outcome to a link status:
 *   'ok'      — the page still resolves (2xx/3xx), or exists-but-gated
 *               (401/403), or is alive-but-HEAD-averse (405).
 *   'dead'    — the page is gone (404/410) or the host no longer resolves
 *               (network/DNS error).
 *   'unknown' — ambiguous (429, 5xx, timeouts). We don't cry wolf: callers
 *               should leave the item's prior status untouched.
 *
 * @param {{status?: number, networkError?: boolean, timedOut?: boolean}} outcome
 * @returns {'ok'|'dead'|'unknown'}
 */
export function classifyStatus({ status = 0, networkError = false, timedOut = false } = {}) {
  if (timedOut) return 'unknown'; // slow ≠ dead
  if (networkError) return 'dead'; // DNS gone / connection refused
  if (status >= 200 && status < 400) return 'ok';
  if (status === 401 || status === 403 || status === 405) return 'ok';
  if (status === 404 || status === 410) return 'dead';
  return 'unknown'; // 429, 5xx, anything else — don't guess
}
