// DELETE → erase everything Plus Sync stores for the user: the doc, its
// images and every device token.
import { q } from '../../../lib/db.js';
import { deleteAll } from '../../../lib/plus-sync-db.js';
import { withUser, json } from '../../../lib/plus-sync.js';

export const DELETE = withUser(async (req, { userId }) => {
  await deleteAll(q, userId);
  return json(200, { ok: true });
});
