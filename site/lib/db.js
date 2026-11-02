// Neon Postgres, through Vercel's Neon integration (it sets DATABASE_URL).
// Only Plus Sync uses the database; without the variable the site runs and
// /api/sync answers 503.
import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
export const dbEnabled = Boolean(url);

let sql = null;

/** Run one parameterized statement over Neon's HTTP driver; returns rows. */
export function q(text, params = []) {
  sql ||= neon(url);
  return sql.query(text, params);
}
