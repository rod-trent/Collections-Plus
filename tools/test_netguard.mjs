// Tests for lib/netguard.js — runnable with `node tools/test_netguard.mjs`.
// No test framework; exits non-zero if any assertion failed.
import { isPrivateHost, isPrivateUrl, isPublicHttpUrl, checkAiBaseUrl } from '../lib/netguard.js';

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
}

console.log('isPublicHttpUrl — blocks internal targets:');
for (const url of [
  'http://169.254.169.254/latest/meta-data/',
  'http://metadata.google.internal/computeMetadata/v1/',
  'http://localhost:8080/',
  'http://app.localhost/',
  'http://127.0.0.1/',
  'http://2130706433/', // decimal 127.0.0.1
  'http://0x7f.1/', // hex/short 127.0.0.1
  'http://0.0.0.0/',
  'http://10.1.2.3/',
  'http://172.16.0.1/',
  'http://192.168.1.1/admin',
  'http://100.64.0.1/',
  'http://[::1]/',
  'http://[::ffff:127.0.0.1]/',
  'http://[::ffff:169.254.169.254]/',
  'http://[fd00::1]/',
  'http://[fe80::1]/',
  'http://intranet/',
  'http://nas.local/',
  'http://printer.lan/',
  'https://user:pw@example.com/a.jpg',
  'file:///etc/passwd',
  'chrome-extension://abc/x.png',
  'ftp://example.com/a.jpg',
  'not a url',
]) {
  assert(!isPublicHttpUrl(url), `rejects ${url}`);
}

console.log('isPublicHttpUrl — allows public targets:');
for (const url of [
  'https://cdn.example.com/a.jpg',
  'http://example.com/a.jpg',
  'https://8.8.8.8/x',
  'https://172.32.0.1/x', // just outside 172.16/12
  'https://[2606:4700::1111]/x',
]) {
  assert(isPublicHttpUrl(url), `allows ${url}`);
}

console.log('isPrivateUrl / isPrivateHost:');
assert(isPrivateUrl('http://wiki.corp/page'), 'intranet page is private');
assert(!isPrivateUrl('https://example.com/'), 'public page is not private');
assert(!isPrivateUrl('file:///x'), 'non-http is not a private *http* URL');
assert(isPrivateHost(''), 'empty host treated as private');

console.log('checkAiBaseUrl:');
assert(checkAiBaseUrl('https://api.anthropic.com') === '', 'https provider ok');
assert(checkAiBaseUrl('http://localhost:11434/v1') === '', 'local Ollama over http ok');
assert(checkAiBaseUrl('http://192.168.1.20:11434/v1') === '', 'LAN Ollama over http ok');
assert(checkAiBaseUrl('http://api.example.com/v1') !== '', 'public http rejected');
assert(checkAiBaseUrl('https://u:p@api.example.com/v1') !== '', 'credentials rejected');
assert(checkAiBaseUrl('file:///x') !== '', 'file: rejected');
assert(checkAiBaseUrl('javascript:alert(1)') !== '', 'javascript: rejected');
assert(checkAiBaseUrl('') !== '', 'empty rejected');

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nAll netguard tests passed.');
