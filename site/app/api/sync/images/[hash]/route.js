// One image, addressed by the SHA-256 of its bytes. PUT stores it (the hash
// must match the body); GET returns it.
import { createHash } from 'node:crypto';
import { q } from '../../../../../lib/db.js';
import { getImage, imageBytes, putImage } from '../../../../../lib/plus-sync-db.js';
import { withUser, fail, json, HASH_RE, MAX_IMAGE_BYTES, QUOTA_BYTES } from '../../../../../lib/plus-sync.js';

const MIME_RE = /^image\/[a-z0-9.+-]{1,40}$/;

export const GET = withUser(async (req, { userId }, { params }) => {
  const { hash } = await params;
  if (!HASH_RE.test(hash)) return fail(400, 'bad-hash', 'Bad image hash.');
  const img = await getImage(q, userId, hash);
  if (!img) return fail(404, 'not-found', 'No such image.');
  return new Response(img.bytes, {
    headers: {
      'Content-Type': img.mime,
      // Content-addressed, so it never changes; private: it's the user's data.
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
});

export const PUT = withUser(async (req, { userId }, { params }) => {
  const { hash } = await params;
  if (!HASH_RE.test(hash)) return fail(400, 'bad-hash', 'Bad image hash.');
  const mime = (req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!MIME_RE.test(mime)) return fail(415, 'bad-type', 'Images only.');
  if (Number(req.headers.get('content-length') || 0) > MAX_IMAGE_BYTES) {
    return fail(413, 'too-large', 'Image is too large.');
  }
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (!bytes.byteLength || bytes.byteLength > MAX_IMAGE_BYTES) return fail(413, 'too-large', 'Image is too large.');
  if (createHash('sha256').update(bytes).digest('hex') !== hash) {
    return fail(400, 'hash-mismatch', 'Image bytes don’t match the hash.');
  }
  if ((await imageBytes(q, userId)) + bytes.byteLength > QUOTA_BYTES) {
    return fail(507, 'quota', 'Plus Sync storage is full.');
  }
  await putImage(q, userId, { hash, mime, bytes });
  return json(200, { ok: true });
});
