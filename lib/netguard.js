// netguard.js — URL checks for outbound fetches (CWE-918 / SSRF hardening).
// Pure and dependency-free (tested under Node in tools/test_netguard.mjs).
//
// The extension holds <all_urls>, so a fetch it makes bypasses CORS and the
// browser's Private Network Access checks. That is fine for URLs the user chose,
// but a URL that came from third-party content (e.g. a web page's og:image) must
// not be able to steer the extension at the user's LAN, localhost services or a
// cloud metadata endpoint. Note: this checks the URL as written — it cannot see
// DNS answers, so a public hostname that resolves to a private IP isn't caught.

/** Parse into a URL, or null. */
function parse(url) {
  try {
    return new URL(String(url));
  } catch {
    return null;
  }
}

// Dotted-quad → [a,b,c,d], or null. WHATWG URL already normalizes the odd IPv4
// spellings (decimal "2130706433", hex "0x7f.1", short "127.1") to dotted form.
function ipv4Parts(host) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const p = m.slice(1).map(Number);
  return p.every((n) => n <= 255) ? p : null;
}

function isPrivateIPv4([a, b]) {
  return (
    a === 0 || // "this" network
    a === 10 ||
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local, incl. 169.254.169.254 metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a >= 224 // multicast + reserved + broadcast
  );
}

function isPrivateIPv6(host) {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (h === '::' || h === '::1') return true;
  // IPv4-mapped / -compatible (URL normalizes to hex, e.g. ::ffff:7f00:1).
  const mapped = /^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(h);
  if (mapped) {
    const hi = parseInt(mapped[1], 16);
    const lo = parseInt(mapped[2], 16);
    return isPrivateIPv4([hi >> 8, hi & 255, lo >> 8, lo & 255]);
  }
  return (
    /^f[cd][0-9a-f]{0,2}:/.test(h) || // fc00::/7 unique-local
    /^fe[89ab][0-9a-f]?:/.test(h) || // fe80::/10 link-local
    /^ff[0-9a-f]{0,2}:/.test(h) // multicast
  );
}

/**
 * True when `hostname` names this machine or a private/internal network:
 * loopback, RFC 1918, link-local (cloud metadata), CGNAT, unique-local IPv6,
 * single-label intranet names, and localhost / .local / .internal / .lan etc.
 */
export function isPrivateHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
  if (!host) return true;
  if (host.startsWith('[') || host.includes(':')) return isPrivateIPv6(host);
  const v4 = ipv4Parts(host);
  if (v4) return isPrivateIPv4(v4);
  if (!host.includes('.')) return true; // "localhost", "intranet", "nas"…
  return /\.(localhost|local|internal|intranet|lan|home|corp|home\.arpa)$/.test(host);
}

/** True when `url` parses as http(s) and points at a private/internal host. */
export function isPrivateUrl(url) {
  const u = parse(url);
  return !!u && /^https?:$/.test(u.protocol) && isPrivateHost(u.hostname);
}

/**
 * True when `url` is safe to fetch on behalf of third-party content: http(s),
 * no embedded credentials, and a public host.
 */
export function isPublicHttpUrl(url) {
  const u = parse(url);
  if (!u || !/^https?:$/.test(u.protocol)) return false;
  if (u.username || u.password) return false;
  return !isPrivateHost(u.hostname);
}

/**
 * Validate a user-configured AI provider base URL. Returns '' when acceptable,
 * otherwise a readable reason. Local endpoints (e.g. Ollama) are allowed —
 * the user chose them — but plain http is only allowed for local hosts so an
 * API key is never sent unencrypted over the internet.
 */
export function checkAiBaseUrl(url) {
  const u = parse(url);
  if (!u) return 'The AI base URL is not a valid URL.';
  if (!/^https?:$/.test(u.protocol)) return 'The AI base URL must start with https://.';
  if (u.username || u.password) return 'The AI base URL must not contain a username or password.';
  if (u.protocol === 'http:' && !isPrivateHost(u.hostname)) {
    return 'The AI base URL must use https:// (plain http is only allowed for local servers).';
  }
  return '';
}
