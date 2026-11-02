// POST { hashes: [...] } → { missing: [...] }: the images a push still has to
// upload. Hashes the server already has count as "touched", so a clean-up
// running at the same time keeps them.
import { q } from '../../../../../lib/db.js';
import { missingImages } from '../../../../../lib/plus-sync-db.js';
import { withUser, fail, json, HASH_RE } from '../../../../../lib/plus-sync.js';

const MAX_HASHES = 2000;

export const POST = withUser(async (req, { userId }) => {
  const body = await req.json().catch(() => null);
  const hashes = body?.hashes;
  if (!Array.isArray(hashes) || hashes.length > MAX_HASHES || !hashes.every((h) => HASH_RE.test(h))) {
    return fail(400, 'bad-hashes', `Send up to ${MAX_HASHES} SHA-256 hex hashes.`);
  }
  return json(200, { missing: hashes.length ? await missingImages(q, userId, hashes) : [] });
});
