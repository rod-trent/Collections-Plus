// DELETE → forget the device token this request carries ("Turn off Plus Sync"
// in the app). The library on the server stays.
import { q } from '../../../../lib/db.js';
import { removeDevice } from '../../../../lib/plus-sync-db.js';
import { withUser, fail, json } from '../../../../lib/plus-sync.js';

export const DELETE = withUser(async (req, { userId, tokenHash }) => {
  if (!tokenHash) return fail(400, 'no-device', 'This request isn’t from a device.');
  await removeDevice(q, userId, tokenHash);
  return json(200, { ok: true });
});
