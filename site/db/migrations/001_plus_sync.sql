-- Plus Sync storage (Neon Postgres). Applied by `npm run db:setup`
-- (scripts/db-setup.mjs); every statement is safe to run again.

-- One sync doc per user: the library with its images swapped for
-- `cpimg:<sha256>` references. Stored as the client sent it (gzip or plain)
-- and never read by the server, so it can be end-to-end encrypted later.
CREATE TABLE IF NOT EXISTS sync_docs (
  user_id     text PRIMARY KEY,
  rev         bigint NOT NULL,
  doc         bytea NOT NULL,
  encoding    text NOT NULL DEFAULT 'identity',
  size_bytes  integer NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Images referenced by a doc, keyed by the SHA-256 of their bytes.
-- touched_at moves whenever a device uploads an image or asks whether it is
-- missing, so a clean-up never deletes one that a push is about to reference.
CREATE TABLE IF NOT EXISTS sync_images (
  user_id     text NOT NULL,
  hash        text NOT NULL,
  mime        text NOT NULL,
  bytes       bytea NOT NULL,
  size_bytes  integer NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  touched_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, hash)
);

-- Device tokens: what the app sends instead of a Clerk session. Only the
-- SHA-256 of each token is kept.
CREATE TABLE IF NOT EXISTS sync_devices (
  token_hash    text PRIMARY KEY,
  user_id       text NOT NULL,
  label         text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sync_devices_user_idx ON sync_devices (user_id);
