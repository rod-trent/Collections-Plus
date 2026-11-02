// The user's sync doc. GET/HEAD return it with its rev (204: none yet); PUT
// replaces it only if X-Sync-Prev-Rev still matches (409 otherwise). The body
// is opaque to the server: stored and returned byte for byte.
import { q } from '../../../../lib/db.js';
import { getDoc, getRev, putDoc } from '../../../../lib/plus-sync-db.js';
import { withUser, fail, json, MAX_DOC_BYTES } from '../../../../lib/plus-sync.js';

const ENCODINGS = new Set(['identity', 'gzip']);

export const GET = withUser(async (req, { userId }) => {
  const d = await getDoc(q, userId);
  if (!d) return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  return new Response(d.doc, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Sync-Rev': d.rev,
      'X-Doc-Encoding': d.encoding,
    },
  });
});

export const HEAD = withUser(async (req, { userId }) => {
  const rev = await getRev(q, userId);
  return new Response(null, {
    status: rev == null ? 204 : 200,
    headers: { 'Cache-Control': 'no-store', ...(rev == null ? {} : { 'X-Sync-Rev': rev }) },
  });
});

export const PUT = withUser(async (req, { userId }) => {
  const encoding = req.headers.get('x-doc-encoding') || 'identity';
  if (!ENCODINGS.has(encoding)) return fail(400, 'bad-encoding', 'Unknown X-Doc-Encoding.');
  const prevRaw = req.headers.get('x-sync-prev-rev') || '';
  if (prevRaw && !/^\d{1,18}$/.test(prevRaw)) return fail(400, 'bad-rev', 'Bad X-Sync-Prev-Rev.');
  if (Number(req.headers.get('content-length') || 0) > MAX_DOC_BYTES) {
    return fail(413, 'too-large', 'Your library is too large for Plus Sync.');
  }
  const doc = new Uint8Array(await req.arrayBuffer());
  if (!doc.byteLength) return fail(400, 'empty', 'Empty doc.');
  if (doc.byteLength > MAX_DOC_BYTES) return fail(413, 'too-large', 'Your library is too large for Plus Sync.');

  const rev = await putDoc(q, userId, { prevRev: prevRaw || null, doc, encoding });
  if (rev == null) return fail(409, 'conflict', 'Another device synced first.');
  return json(200, { rev });
});
