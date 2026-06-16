// Tests for lib/ai.js pure helpers — `node tools/test_ai.mjs`.
import {
  AI_PROVIDERS,
  resolveConfig,
  isConfigured,
  buildSystemPrompt,
  buildRequest,
  parseResponse,
  parseError,
} from '../lib/ai.js';

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
}

const sample = [
  {
    title: 'Recipes',
    tags: ['food'],
    items: [
      { type: 'page', title: 'Best Pancakes', url: 'https://ex.com/p', note: 'fluffy' },
      { type: 'note', text: 'buy syrup' },
    ],
  },
];

console.log('resolveConfig:');
{
  const r = resolveConfig({ provider: 'anthropic', apiKey: 'k' });
  assert(r.kind === 'anthropic', 'anthropic kind');
  assert(r.baseUrl === 'https://api.anthropic.com', 'fills preset base url');
  assert(r.model === 'claude-opus-4-8', 'fills preset model (Opus 4.8 default)');
  assert(r.auth === 'bearer', 'default auth bearer');

  const az = resolveConfig({ provider: 'azure', baseUrl: 'https://x/models/', model: 'gpt-4o', apiKey: 'k' });
  assert(az.kind === 'openai', 'azure uses openai kind');
  assert(az.auth === 'api-key', 'azure auth api-key from preset');
  assert(az.baseUrl === 'https://x/models', 'trailing slash trimmed');

  const ol = resolveConfig({ provider: 'ollama' });
  assert(ol.noKey === true, 'ollama needs no key');
}

console.log('isConfigured:');
{
  assert(!isConfigured({ provider: 'anthropic' }), 'no key → not configured');
  assert(isConfigured({ provider: 'anthropic', apiKey: 'k' }), 'key + preset → configured');
  assert(isConfigured({ provider: 'ollama' }), 'ollama configured without key');
  assert(!isConfigured({ provider: 'custom', apiKey: 'k' }), 'custom without base url → not configured');
}

console.log('buildSystemPrompt:');
{
  const sys = buildSystemPrompt(sample, { scopeLabel: 'all collections' });
  assert(sys.includes('Collections Plus'), 'mentions product');
  assert(sys.includes('Best Pancakes'), 'embeds item titles');
  assert(sys.includes('all collections'), 'mentions scope');

  const one = buildSystemPrompt([sample[0]], { scopeLabel: 'Recipes' });
  assert(one.includes('## Recipes'), 'single collection uses collection markdown');

  const trunc = buildSystemPrompt(sample, { maxChars: 50 });
  assert(trunc.includes('truncated'), 'notes truncation when over budget');
}

console.log('buildRequest — anthropic:');
{
  const r = resolveConfig({ provider: 'anthropic', apiKey: 'sk-ant-x' });
  const req = buildRequest(r, 'SYS', [{ role: 'user', content: 'hi' }]);
  assert(req.url === 'https://api.anthropic.com/v1/messages', 'messages endpoint');
  assert(req.headers['x-api-key'] === 'sk-ant-x', 'x-api-key header');
  assert(req.headers['anthropic-version'] === '2023-06-01', 'version header');
  assert(req.headers['anthropic-dangerous-direct-browser-access'] === 'true', 'browser-access header');
  assert(req.body.model === 'claude-opus-4-8', 'model in body');
  assert(req.body.system === 'SYS', 'system top-level');
  assert(req.body.messages[0].content === 'hi', 'message passed through');
}

console.log('buildRequest — openai/grok:');
{
  const r = resolveConfig({ provider: 'grok', apiKey: 'xai-x' });
  const req = buildRequest(r, 'SYS', [{ role: 'user', content: 'hi' }]);
  assert(req.url === 'https://api.x.ai/v1/chat/completions', 'chat/completions endpoint');
  assert(req.headers['Authorization'] === 'Bearer xai-x', 'bearer auth');
  assert(req.body.messages[0].role === 'system', 'system prepended as message');
  assert(req.body.messages[1].content === 'hi', 'user message follows system');
}

console.log('buildRequest — azure (api-key auth):');
{
  const r = resolveConfig({ provider: 'azure', baseUrl: 'https://x/models', model: 'gpt-4o', apiKey: 'azk' });
  const req = buildRequest(r, '', [{ role: 'user', content: 'hi' }]);
  assert(req.headers['api-key'] === 'azk', 'api-key header used');
  assert(!req.headers['Authorization'], 'no bearer header');
  assert(req.body.messages[0].role === 'user', 'no system message when empty');
}

console.log('buildRequest — gemini:');
{
  const r = resolveConfig({ provider: 'gemini', apiKey: 'AIza-x' });
  const req = buildRequest(r, 'SYS', [
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: 'yo' },
  ]);
  assert(req.url.includes(':generateContent?key=AIza-x'), 'generateContent with key');
  assert(req.body.systemInstruction.parts[0].text === 'SYS', 'system instruction');
  assert(req.body.contents[1].role === 'model', 'assistant mapped to model role');
}

console.log('parseResponse:');
{
  assert(
    parseResponse('anthropic', { content: [{ type: 'text', text: 'A' }, { type: 'thinking', thinking: 'x' }] }) === 'A',
    'anthropic text blocks only'
  );
  assert(parseResponse('openai', { choices: [{ message: { content: 'B' } }] }) === 'B', 'openai choice content');
  assert(
    parseResponse('gemini', { candidates: [{ content: { parts: [{ text: 'C' }] } }] }) === 'C',
    'gemini parts'
  );
}

console.log('parseError:');
{
  assert(parseError('anthropic', { error: { message: 'bad key' } }) === 'bad key', 'anthropic error message');
  assert(parseError('openai', { error: { message: 'rate limited' } }) === 'rate limited', 'openai error message');
  assert(parseError('gemini', { error: { message: 'quota' } }) === 'quota', 'gemini error message');
}

console.log('AI_PROVIDERS:');
{
  assert(Object.keys(AI_PROVIDERS).length >= 6, 'has the documented providers');
  assert(AI_PROVIDERS.anthropic.model === 'claude-opus-4-8', 'anthropic default model is Opus 4.8');
}

if (failures) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('\nAll ai.js tests passed.');
