// POST { rev, keep: [...] } → { deleted, freedBytes }: delete stored images the
// doc at `rev` no longer references. The client sends the list because the
// server never reads the doc. 409 when `rev` isn't current any more.
import { q } from '../../../../../lib/db.js';
import { pruneImages } from '../../../../../lib/plus-sync-db.js';
import { withUser, fail, json, HASH_RE } from '../../../../../lib/plus-sync.js';

const MAX_KEEP = 50000;

export const POST = withUser(async (req, { userId }) => {
  const body = await req.json().catch(() => null);
  const rev = String(body?.rev ?? '');
  const keep = body?.keep;
  if (!/^\d{1,18}$/.test(rev)) return fail(400, 'bad-rev', 'Bad rev.');
  if (!Array.isArray(keep) || keep.length > MAX_KEEP || !keep.every((h) => HASH_RE.test(h))) {
    return fail(400, 'bad-hashes', 'Bad keep list.');
  }
  const out = await pruneImages(q, userId, { rev, keep });
  if (!out) return fail(409, 'conflict', 'The doc changed; pull and try again.');
  return json(200, out);
});
