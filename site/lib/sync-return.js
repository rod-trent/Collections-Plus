// Where /api/sync/connect sends someone when it's done. Pure, so it's tested in
// tools/test_plus_connect.mjs.
//
// The mobile app is the default. The extension asks for its own page and passes
// a random `state`, which comes back beside the token so the extension can tell
// the return belongs to a connect it started (see lib/plus-connect.js).

const STATE_RE = /^[\w-]{16,128}$/;

export function syncReturnFor(searchParams) {
  const state = searchParams.get('state');
  if (searchParams.get('client') === 'extension' && STATE_RE.test(state || '')) {
    return {
      path: '/sync-connected.html',
      suffix: `&state=${state}`,
      connectPath: `/api/sync/connect?client=extension&state=${state}`,
    };
  }
  return { path: '/app/', suffix: '', connectPath: '/api/sync/connect' };
}
