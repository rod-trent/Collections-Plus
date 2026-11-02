// plus-sync-db.js — every Plus Sync query, in one place.
//
// Each function takes `q(text, params) → rows`, so the same code runs on Neon
// (lib/db.js) and on a test database. Binary values cross the wire as base64
// text (encode/decode in SQL), which keeps the driver out of bytea parsing.

/** The user's doc: { rev, encoding, doc (Buffer) } or null. */
export async function getDoc(q, userId) {
  const [r] = await q(
    `SELECT rev::text AS rev, encoding, encode(doc, 'base64') AS doc FROM sync_docs WHERE user_id = $1`,
    [userId]
  );
  return r ? { rev: r.rev, encoding: r.encoding, doc: Buffer.from(r.doc, 'base64') } : null;
}

/** Just the rev, for change polling. */
export async function getRev(q, userId) {
  const [r] = await q(`SELECT rev::text AS rev FROM sync_docs WHERE user_id = $1`, [userId]);
  return r?.rev ?? null;
}

/**
 * Write the doc if the stored rev is still `prevRev` (null: only if there is
 * no doc yet). Returns the new rev, or null when another device wrote first.
 */
export async function putDoc(q, userId, { prevRev, doc, encoding }) {
  const b64 = Buffer.from(doc).toString('base64');
  const rows =
    prevRev == null
      ? await q(
          `INSERT INTO sync_docs (user_id, rev, doc, encoding, size_bytes)
           VALUES ($1, 1, decode($2, 'base64'), $3, $4)
           ON CONFLICT (user_id) DO NOTHING
           RETURNING rev::text AS rev`,
          [userId, b64, encoding, doc.byteLength]
        )
      : await q(
          `UPDATE sync_docs
              SET rev = rev + 1, doc = decode($2, 'base64'), encoding = $3,
                  size_bytes = $4, updated_at = now()
            WHERE user_id = $1 AND rev = $5::bigint
           RETURNING rev::text AS rev`,
          [userId, b64, encoding, doc.byteLength, String(prevRev)]
        );
  return rows[0]?.rev ?? null;
}

/**
 * Which of `hashes` the server lacks. The ones it has are marked as touched,
 * so a clean-up running meanwhile leaves them alone.
 */
export async function missingImages(q, userId, hashes) {
  const rows = await q(
    `WITH wanted AS (SELECT DISTINCT value AS hash FROM json_array_elements_text($2::json)),
          touched AS (
            UPDATE sync_images i SET touched_at = now()
              FROM wanted w
             WHERE i.user_id = $1 AND i.hash = w.hash
            RETURNING i.hash)
     SELECT hash FROM wanted WHERE hash NOT IN (SELECT hash FROM touched)`,
    [userId, JSON.stringify(hashes)]
  );
  return rows.map((r) => r.hash);
}

/** Total stored image bytes for the user. */
export async function imageBytes(q, userId) {
  const [r] = await q(`SELECT coalesce(sum(size_bytes), 0)::bigint::text AS n FROM sync_images WHERE user_id = $1`, [
    userId,
  ]);
  return Number(r.n);
}

export async function putImage(q, userId, { hash, mime, bytes }) {
  await q(
    `INSERT INTO sync_images (user_id, hash, mime, bytes, size_bytes)
     VALUES ($1, $2, $3, decode($4, 'base64'), $5)
     ON CONFLICT (user_id, hash) DO UPDATE SET touched_at = now()`,
    [userId, hash, mime, Buffer.from(bytes).toString('base64'), bytes.byteLength]
  );
}

/** { mime, bytes (Buffer) } or null. */
export async function getImage(q, userId, hash) {
  const [r] = await q(
    `SELECT mime, encode(bytes, 'base64') AS b FROM sync_images WHERE user_id = $1 AND hash = $2`,
    [userId, hash]
  );
  return r ? { mime: r.mime, bytes: Buffer.from(r.b, 'base64') } : null;
}

/**
 * Delete images not in `keep`, but only while `rev` is still the current doc
 * (a stale device must not prune for a doc it hasn't seen) and only images
 * nobody touched in the last `graceSeconds`. Returns null on a stale rev.
 */
export async function pruneImages(q, userId, { rev, keep, graceSeconds = 3600 }) {
  const cur = await getRev(q, userId);
  if (cur == null || cur !== String(rev)) return null;
  const rows = await q(
    `DELETE FROM sync_images
      WHERE user_id = $1
        AND touched_at < now() - make_interval(secs => $3)
        AND hash NOT IN (SELECT value FROM json_array_elements_text($2::json))
        AND EXISTS (SELECT 1 FROM sync_docs WHERE user_id = $1 AND rev = $4::bigint)
     RETURNING size_bytes`,
    [userId, JSON.stringify(keep), graceSeconds, String(rev)]
  );
  return { deleted: rows.length, freedBytes: rows.reduce((n, r) => n + Number(r.size_bytes), 0) };
}

/** Storage and last-sync numbers for the account page and /status. */
export async function usage(q, userId) {
  const [r] = await q(
    `SELECT d.rev::text AS rev, d.updated_at, d.size_bytes AS doc_bytes,
            (SELECT count(*) FROM sync_images WHERE user_id = $1)::int AS image_count,
            (SELECT coalesce(sum(size_bytes), 0) FROM sync_images WHERE user_id = $1)::bigint::text AS image_bytes,
            (SELECT count(*) FROM sync_devices WHERE user_id = $1)::int AS device_count
       FROM (SELECT 1) one
       LEFT JOIN sync_docs d ON d.user_id = $1`,
    [userId]
  );
  return {
    rev: r.rev ?? null,
    updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
    docBytes: Number(r.doc_bytes || 0),
    imageCount: r.image_count,
    imageBytes: Number(r.image_bytes),
    deviceCount: r.device_count,
  };
}

// ---- Devices ---------------------------------------------------------------

export async function addDevice(q, userId, { tokenHash, label }) {
  await q(`INSERT INTO sync_devices (token_hash, user_id, label) VALUES ($1, $2, $3)`, [
    tokenHash,
    userId,
    label.slice(0, 120),
  ]);
}

/** The user a device token belongs to, or null. Bumps last_used_at now and then. */
export async function deviceUser(q, tokenHash) {
  const [r] = await q(
    `WITH bump AS (
       UPDATE sync_devices SET last_used_at = now()
        WHERE token_hash = $1 AND last_used_at < now() - interval '10 minutes')
     SELECT user_id FROM sync_devices WHERE token_hash = $1`,
    [tokenHash]
  );
  return r?.user_id ?? null;
}

export async function listDevices(q, userId) {
  const rows = await q(
    `SELECT token_hash, label, created_at, last_used_at FROM sync_devices
      WHERE user_id = $1 ORDER BY last_used_at DESC`,
    [userId]
  );
  return rows.map((r) => ({
    id: r.token_hash.slice(0, 16),
    label: r.label,
    createdAt: new Date(r.created_at).toISOString(),
    lastUsedAt: new Date(r.last_used_at).toISOString(),
  }));
}

/** Remove one device by its short id (from listDevices) or full token hash. */
export async function removeDevice(q, userId, id) {
  const rows = await q(
    `DELETE FROM sync_devices WHERE user_id = $1 AND (token_hash = $2 OR left(token_hash, 16) = $2) RETURNING 1`,
    [userId, id]
  );
  return rows.length;
}

/** Erase everything stored for the user. */
export async function deleteAll(q, userId) {
  await q(`DELETE FROM sync_images WHERE user_id = $1`, [userId]);
  await q(`DELETE FROM sync_docs WHERE user_id = $1`, [userId]);
  await q(`DELETE FROM sync_devices WHERE user_id = $1`, [userId]);
}
