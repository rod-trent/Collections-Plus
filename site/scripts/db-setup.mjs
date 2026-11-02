// db-setup.mjs — create (or update) the Plus Sync tables in Neon.
//
//   vercel env pull .env.local      # brings down DATABASE_URL
//   npm run db:setup
//
// Runs every db/migrations/*.sql file in name order. Each statement is
// written to be safe to run again, so re-running this is always fine.
import { readdir, readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  console.error('db-setup: DATABASE_URL is not set (run `vercel env pull .env.local` first).');
  process.exit(1);
}
const sql = neon(url);
const dir = new URL('../db/migrations/', import.meta.url);

/** Split a migration into statements: drop `--` comments, cut at `;`. */
export function statements(text) {
  return text
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

for (const name of (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()) {
  const stmts = statements(await readFile(new URL(name, dir), 'utf8'));
  for (const s of stmts) await sql.query(s);
  console.log(`db-setup: ${name} (${stmts.length} statements)`);
}
console.log('db-setup: done');
