// What every route answers with (worker/http.js, worker/worker.js): bodies
// read only so far, and a crash still answered with CORS.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bodyText } from '../worker/http.js';

const worker = (await import('../worker/worker.js')).default;
const ctx = { waitUntil() {}, passThroughOnException() {} };
const ORIGIN = 'https://jaypengx.github.io';

test('bodyText: the body up to its limit; past it null, read no further', async () => {
  const post = (body, headers = {}) => new Request('https://w/x', { method: 'POST', body, headers });
  assert.equal(await bodyText(post('{"a":"漢字"}'), 100), '{"a":"漢字"}');
  assert.equal(await bodyText(new Request('https://w/x'), 100), '');
  assert.equal(await bodyText(post('x'.repeat(101)), 100), null);
  let pulled = 0;
  const endless = new ReadableStream({ pull: c => (pulled++, c.enqueue(new Uint8Array(64))) });
  assert.equal(await bodyText(new Request('https://w/x', { method: 'POST', body: endless, duplex: 'half' }), 1000), null);
  assert.ok(pulled < 40, 'stopped at the limit');
  assert.equal(await bodyText({ headers: new Headers({ 'Content-Length': '999999' }), body: null }, 100), null);
});

test('/pass: a body past 4 MB is refused before anything reads it', async () => {
  const big = JSON.stringify({ op: 'login', app: 'odds', pad: 'x'.repeat(4_100_000) });
  const res = await worker.fetch(new Request('https://longshot.test/pass', { method: 'POST', headers: { Origin: ORIGIN }, body: big }), { STORE: {}, TOKEN_SECRET: 's' }, ctx);
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, 'INVALID_JSON');
});

test('a route that throws answers 500 with the CORS headers, not a blocked request', async () => {
  const STORE = { prepare: () => { throw new Error('D1 down'); } };
  const res = await worker.fetch(new Request('https://longshot.test/kambi?qt=x.y', { headers: { Origin: ORIGIN } }), { STORE }, ctx);
  assert.equal(res.status, 500);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal((await res.json()).error.code, 'WORKER_FAILED');
});

test('an unknown path: 404 NOT_FOUND; OPTIONS: 204 with CORS; a stranger origin is not allowed', async () => {
  const res = await worker.fetch(new Request('https://longshot.test/config', { headers: { Origin: ORIGIN } }), {}, ctx);
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error.code, 'NOT_FOUND');
  const pre = await worker.fetch(new Request('https://longshot.test/pass', { method: 'OPTIONS', headers: { Origin: 'http://localhost:8000' } }), {}, ctx);
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('Access-Control-Allow-Origin'), 'http://localhost:8000');
  const other = await worker.fetch(new Request('https://longshot.test/pass', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }), {}, ctx);
  assert.notEqual(other.headers.get('Access-Control-Allow-Origin'), 'https://evil.example');
});
