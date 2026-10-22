import test from 'node:test';
import assert from 'node:assert/strict';
import { decode, encode, merge, unreadable } from '../public/slips/lib/sync.mjs';

const slip = (id, extra = {}) => ({ id, created: `2026-10-1${id.length}T00:00:00Z`, mode: 'single', sizes: [1], stake: 100, legs: [{ id: `l${id}`, kind: 'ml', side: 'home', odds: 1.8, game: { id: `mlb:${id}`, state: 'pre' } }], ...extra });

test('tickets from the phone and the Pass are put together, each once', () => {
  const m = merge({ slips: [slip('a'), slip('bb')], gone: {} }, { slips: [slip('bb'), slip('ccc')], gone: {} });
  assert.deepEqual(m.slips.map(s => s.id), ['a', 'bb', 'ccc']);
});

test('a ticket deleted on one phone is gone from the other', () => {
  const now = Date.parse('2026-10-18T00:00:00Z');
  const m = merge({ slips: [slip('a'), slip('bb')], gone: {} }, { slips: [slip('a')], gone: { bb: now - 1000 } }, now);
  assert.deepEqual(m.slips.map(s => s.id), ['a']);
  assert.ok(m.gone.bb);
  // Forgotten after 120 days.
  assert.deepEqual(merge({ slips: [], gone: { x: now - 121 * 86_400_000 } }, { slips: [], gone: {} }, now).gone, {});
});

test('the same ticket: the one further on wins (the phone that watched it live)', () => {
  const live = slip('a');
  live.legs[0].game = { id: 'mlb:a', state: 'post', score: { home: 3, away: 1 } };
  assert.equal(merge({ slips: [slip('a')], gone: {} }, { slips: [live], gone: {} }).slips[0].legs[0].game.state, 'post');
  assert.equal(merge({ slips: [live], gone: {} }, { slips: [slip('a')], gone: {} }).slips[0].legs[0].game.state, 'post');
});

test('the payload reads back what it wrote, and nonsense as nothing', () => {
  const data = { slips: [slip('a')], gone: { z: 1 } };
  assert.deepEqual(decode(encode(data)), data);
  assert.deepEqual(decode('not json'), { slips: [], gone: {} });
  assert.deepEqual(decode('{"slips":[{"id":3}]}').slips, []);
});

test("the Pass's copy that can't be read is never saved over", () => {
  assert.equal(unreadable('garbage{'), true);
  assert.equal(unreadable('{"v":2,"slips":[]}'), true, 'a newer version than this page knows');
  assert.equal(unreadable('null'), true);
  assert.equal(unreadable(''), false);
  assert.equal(unreadable(undefined), false);
});

test('the same ticket edited on two phones: the later edit wins, whichever phone', () => {
  const a = slip('a', { edited: '2026-10-18T01:00:00Z', stake: 200 });
  const b = slip('a', { edited: '2026-10-18T02:00:00Z', stake: 300 });
  assert.equal(merge({ slips: [a], gone: {} }, { slips: [b], gone: {} }).slips[0].stake, 300);
  assert.equal(merge({ slips: [b], gone: {} }, { slips: [a], gone: {} }).slips[0].stake, 300);
  // Neither further on: this phone's.
  assert.equal(merge({ slips: [slip('a', { stake: 1 })], gone: {} }, { slips: [slip('a', { stake: 2 })], gone: {} }).slips[0].stake, 1);
});

test('deletions: the later time kept; oldest ticket first; junk in the payload dropped', () => {
  const now = Date.parse('2026-10-18T00:00:00Z');
  assert.deepEqual(merge({ slips: [], gone: { a: now - 5 } }, { slips: [], gone: { a: now - 1, b: 'x' } }, now).gone, { a: now - 1 });
  assert.deepEqual(merge({ slips: [slip('ccc'), slip('a')], gone: {} }, { slips: [], gone: {} }).slips.map(s => s.id), ['a', 'ccc']);
  assert.deepEqual(decode({ slips: [null, { id: 'a' }, { id: 'b', legs: [] }], gone: 'x' }), { slips: [{ id: 'b', legs: [] }], gone: {} });
  assert.deepEqual(decode(null), { slips: [], gone: {} });
  assert.equal(JSON.parse(encode({ slips: [], gone: {} })).v, 1);
});

// A fake of the kit's session: the Pass's payload, who is live, what was written.
function fakePass(payload = '') {
  const listeners = [];
  const q = {
    active: false,
    payload,
    writes: [],
    on: (name, fn) => name === 'active' && listeners.push(fn),
    live(on) {
      q.active = on;
      listeners.forEach(fn => fn(on));
    },
    read: async () => {
      return { payload: q.payload };
    },
    write: async ({ payload: p }) => {
      if (!q.active) throw new Error('not live');
      q.writes.push(p);
      q.payload = p;
    }
  };
  return q;
}
const ids = payload => decode(payload).slips.map(s => s.id).sort();

test("the kit's shared Pass sync, wired as the app does: tickets only on this phone, and a Pass copy behind, go up after the first reply", async () => {
  const { passSync } = await import('../public/kit/pass-sync.mjs');
  const q = fakePass(encode({ slips: [slip('bb')], gone: {} }));
  q.live(true);
  q.updateTime = 0;
  q.write = async ({ payload: p }) => (q.writes.push(p), (q.payload = p), { updateTime: String(++q.updateTime) });
  const state = { slips: [slip('a')], gone: {} };
  const sync = passSync(q, {
    decode: t => (unreadable(t) ? null : decode(t)),
    apply: theirs => {
      Object.assign(state, merge(state, theirs));
      if (encode(state) !== encode(theirs)) sync.changed();
    },
    encode: () => encode(state)
  });
  // The merge differs from the Pass copy: the kit writes it up at once, once.
  await sync.first({ payload: q.payload, updateTime: '0' }, { local: true });
  await sync.sync();
  assert.deepEqual(ids(q.payload), ['a', 'bb']);
  assert.equal(q.writes.length, 1);
  // A copy that can't be read is never written over.
  q.payload = 'junk';
  sync.stale();
  state.slips = [...state.slips, slip('cccc')];
  sync.changed();
  await sync.sync();
  assert.equal(q.payload, 'junk');
});
