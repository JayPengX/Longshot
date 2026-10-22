// The ticket scan (/slip-scan, worker/slip.js) and the relay in Taiwan
// (worker/gemini.js): its origin, its limits, and a clear 503 when Gemini
// isn't set up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { relay } from '../worker/gemini.js';
import { SCAN_LIMITS, SCAN_MODELS, forgetScans } from '../worker/slip.js';
import { signToken } from '../worker/token.js';

const worker = (await import('../worker/worker.js')).default;
const ctx = { waitUntil: p => p };

// Gemini itself, faked: what was asked, and a ticket with no picks.
const gemini = [];
const google = async (url, init) => {
  gemini.push({ url: String(url), key: init.headers['x-goog-api-key'], body: JSON.parse(await new Response(init.body).text()) });
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"isSlip":true,"picks":[],"combos":[]}' }] } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
// The service binding: the relay, with or without its key.
const binding = (key = 'k') => ({ fetch: (url, init) => relay(new Request(url, init), key ? { GEMINI_API_KEY: key } : {}, google) });

const scan = ({ origin = 'https://jaypengx.github.io', ip = '203.0.113.1', image = { mime_type: 'image/jpeg', data: 'AAAA' }, env = { GEMINI: binding() }, qt } = {}) =>
  worker.fetch(new Request('https://longshot.test/slip-scan', { method: 'POST', headers: { Origin: origin, 'CF-Connecting-IP': ip, 'Content-Type': 'application/json' }, body: JSON.stringify({ image, qt }) }), env, ctx);

test('a ticket photo goes to Gemini through the relay with the fixed prompt, from the page only', async () => {
  const before = gemini.length;
  assert.equal((await scan({ origin: 'https://evil.example', ip: '203.0.113.2' })).status, 403);
  assert.equal((await scan({ ip: '203.0.113.3', image: { mime_type: 'application/pdf', data: 'AAAA' } })).status, 400);
  assert.equal((await scan({ ip: '203.0.113.4', image: { mime_type: 'image/jpeg', data: 'A'.repeat(SCAN_LIMITS.maxBase64 + 1) } })).status, 413);
  assert.equal(gemini.length, before);
  const ok = await scan({ ip: '203.0.113.5', origin: 'http://localhost:8000' });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).candidates.length, 1);
  const sent = gemini.at(-1);
  assert.equal(sent.key, 'k');
  assert.ok(sent.url.endsWith(`/models/${SCAN_MODELS[0]}:generateContent`));
  assert.match(sent.body.contents[0].parts[0].text, /台灣運彩/);
  assert.equal(sent.body.contents[0].parts[1].inline_data.data, 'AAAA');
  assert.equal(sent.body.generationConfig.response_mime_type, 'application/json');
});

test('not set up: no relay bound is 503 NOT_SET_UP; a relay without its key is 503 MISSING_API_KEY', async () => {
  const none = await scan({ ip: '203.0.113.30', env: {} });
  assert.equal(none.status, 503);
  assert.equal((await none.json()).error.code, 'NOT_SET_UP');
  const keyless = await scan({ ip: '203.0.113.31', env: { GEMINI: binding('') } });
  assert.equal(keyless.status, 503);
  assert.equal((await keyless.json()).error.code, 'MISSING_API_KEY');
});

test('the relay: POST only, a known model only', async () => {
  assert.equal((await relay(new Request('https://r/?model=gemini-3.5-flash-lite'), { GEMINI_API_KEY: 'k' }, google)).status, 405);
  assert.equal((await relay(new Request('https://r/?model=gemini-ultra', { method: 'POST', body: '{}' }), { GEMINI_API_KEY: 'k' }, google)).status, 400);
});

test('an address gets 2 scans a minute', async () => {
  const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await scan({ ip: '203.0.113.6' })).status);
  assert.deepEqual(codes, [200, 200, 429, 429]);
});

test('with a Longshot Pass, scans count per account (3 a minute), whatever the address; a bad pass is PASS_REQUIRED', async () => {
  const env = { GEMINI: binding(), TOKEN_SECRET: 'test-secret' };
  const qt = await signToken('test-secret', { k: 'ses', s: 'sess1', d: 'ACCTSCAN23456789', e: Date.now() + 60_000 });
  const forged = await scan({ ip: '203.0.113.20', env, qt: 'forged.token' });
  assert.equal(forged.status, 401);
  assert.equal((await forged.json()).error.code, 'PASS_REQUIRED');
  const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await scan({ ip: `203.0.113.${21 + i}`, env, qt })).status);
  assert.deepEqual(codes, [200, 200, 200, 429]);
});

test('past the day’s scans in all, nobody scans until tomorrow; a failed count turns the ask away', async () => {
  forgetScans();
  const full = { GEMINI: binding(), STORE: { prepare: () => ({ run: async () => ({}), bind: () => ({ first: async () => ({ n: SCAN_LIMITS.dayCap + 1 }) }) }) } };
  assert.equal((await scan({ ip: '203.0.113.7', env: full })).status, 503);
  const broken = { GEMINI: binding(), STORE: { prepare: () => ({ run: async () => { throw new Error('down'); } }) } };
  assert.equal((await scan({ ip: '203.0.113.8', env: broken })).status, 503);
  forgetScans();
});
