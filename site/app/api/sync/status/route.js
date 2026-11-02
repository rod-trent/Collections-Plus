// GET → usage for the signed-in user. Also the app's "is Plus Sync open to
// me?" probe: 503 not set up, 401 signed out, 403 not invited.
import { q } from '../../../../lib/db.js';
import { usage } from '../../../../lib/plus-sync-db.js';
import { withUser, json, QUOTA_BYTES } from '../../../../lib/plus-sync.js';

export const GET = withUser(async (req, { userId }) => json(200, { ...(await usage(q, userId)), quotaBytes: QUOTA_BYTES }));
