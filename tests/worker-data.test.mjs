// /data/<path> (worker/data.js): the files the Worker builds, read from R2.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanPath } from '../worker/data.js';

const worker = (await import('../worker/worker.js')).default;
const ctx = { waitUntil() {}, passThroughOnException() {} };
const enc = s => new TextEncoder().encode(s);
const ORIGIN = 'https://jaypengx.github.io';

// A fake R2 bucket.
function fakeR2() {
  const m = new Map();
  return {
    m,
    async get(k) {
      const v = m.get(k);
      return v ? { body: new Blob([v.bytes]).stream(), httpEtag: `"${v.etag}"` } : null;
    },
    async put(k, bytes) {
      m.set(k, { bytes: new Uint8Array(bytes), etag: `e${m.size}` });
    }
  };
}
const ask = (path, init = {}, env = {}) => worker.fetch(new Request(`https://longshot.test${path}`, { headers: { Origin: ORIGIN, ...(init.headers || {}) }, ...init }), env, ctx);

test('paths: no climbing out, no empty parts', () => {
  assert.equal(cleanPath('play/board.json'), 'play/board.json');
  for (const bad of ['../secret', 'a//b', '/abs', 'a/./b', '%2e%2e/x', '']) assert.equal(cleanPath(bad), null, bad);
});

test("Play's board: served with the Worker's CORS and an ETag, kept a minute (then stale while the next is read); anything else ten", async () => {
  const DATA = fakeR2();
  await DATA.put('play/board.json', enc('{"v":1,"built":"2026-10-19T08:08:00.000Z","games":[]}'));
  await DATA.put('play/other.json', enc('{"days":[]}'));
  const res = await ask('/data/play/board.json', {}, { DATA });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Content-Type'), 'application/json');
  assert.equal(res.headers.get('Cache-Control'), 'public, max-age=60, stale-while-revalidate=300');
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal((await res.json()).v, 1);
  const tag = res.headers.get('ETag');
  assert.ok(tag);
  assert.equal((await ask('/data/play/board.json', { headers: { 'If-None-Match': tag } }, { DATA })).status, 304);
  assert.equal((await ask('/data/play/other.json', {}, { DATA })).headers.get('Cache-Control'), 'public, max-age=600');
  // Not built yet: a 404 (Play reads its leagues itself).
  assert.equal((await ask('/data/play/board.json', {}, { DATA: fakeR2() })).status, 404);
});

test('reading only: no pushing, no listing; the proxy\'s kept copies are never served', async () => {
  const DATA = fakeR2();
  await DATA.put('kept/_/site.api.espn.com/x.json', enc('{}'));
  assert.equal((await ask('/data/push', { method: 'POST', body: 'x' }, { DATA })).status, 405);
  assert.equal((await ask('/data/_list', {}, { DATA })).status, 404);
  assert.equal((await ask('/data/kept/_/site.api.espn.com/x.json', {}, { DATA })).status, 404);
  assert.equal((await ask('/data/kept%2F_%2Fsite.api.espn.com%2Fx.json', {}, { DATA })).status, 404);
});

test('a file R2 doesn\'t hold: 404, noted at the edge so the next ask reads nothing', async () => {
  const had = globalThis.caches;
  const edge = new Map();
  const waits = [];
  globalThis.caches = { default: { match: async k => edge.get(k.url)?.clone(), put: async (k, r) => void edge.set(k.url, r), delete: async k => edge.delete(k.url) } };
  const local = { waitUntil: p => waits.push(p), passThroughOnException() {} };
  try {
    const DATA = fakeR2();
    let gets = 0;
    const get = DATA.get;
    DATA.get = k => (gets++, get(k));
    const read = () => worker.fetch(new Request('https://longshot.test/data/play/nowhere.json', { headers: { Origin: ORIGIN } }), { DATA }, local);
    assert.equal((await read()).status, 404);
    await Promise.all(waits);
    assert.equal((await read()).status, 404);
    assert.equal(gets, 1);
  } finally {
    globalThis.caches = had;
  }
});
