// The Worker's store on D1 (worker/doc-store.js), run on SQLite itself (D1 is SQLite).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeD1 as fakeD1Of } from './fixtures/worker/fake-d1.mjs';
import { d1Store, docStore, storeReady, changeDoc, parseDoc, countDay, forgetDays, twDay, SCHEMA } from '../worker/doc-store.js';

const fakeD1 = () => fakeD1Of(SCHEMA);

test('D1: a write only if it is still what was read; a create only if new; a race lost says so', async () => {
  const s = d1Store(fakeD1());
  assert.deepEqual(await s.get('wallets', 'a'), { exists: false, updateTime: '', payload: '' });
  const first = await s.write('wallets', 'a', '{"n":1}', { exists: false });
  await assert.rejects(s.write('wallets', 'a', '{"n":9}', { exists: false }), e => e.precondition);
  const read = await s.get('wallets', 'a');
  assert.equal(read.updateTime, first.updateTime);
  const second = await s.write('wallets', 'a', '{"n":2}', { updateTime: read.updateTime });
  await assert.rejects(s.write('wallets', 'a', '{"n":3}', { updateTime: read.updateTime }), e => e.precondition, 'the old updateTime: lost the race');
  assert.equal((await s.get('wallets', 'a')).payload, '{"n":2}');
  assert.notEqual(second.updateTime, first.updateTime);
  await s.write('wallets', 'b', 'x');
  assert.deepEqual((await s.list('wallets')).map(d => d.id), ['a', 'b']);
  const r = await s.batch([{ update: ['wallets', 'a', 'y'], updateTime: 'stale' }, { delete: ['wallets', 'b'] }]);
  assert.equal(r.status[0].code, 9);
  assert.deepEqual(r.status[1], {});
  assert.equal((await s.get('wallets', 'b')).exists, false);
});

test('the store: every call (env, …) on D1; batches each write on its own; ready only with D1 bound', async () => {
  const env = { STORE: fakeD1() };
  const store = docStore();
  const w = await store.write(env, 'wallets', 'a', 'one');
  await store.write(env, 'play', 'b', 'two');
  const r = await store.batch(env, [{ update: ['wallets', 'a', 'three'], updateTime: w.updateTime }, { update: ['wallets', 'a', 'four'], updateTime: w.updateTime }, { delete: ['play', 'b'] }]);
  assert.deepEqual(r.status.map(x => x.code || 0), [0, 9, 0]);
  assert.equal((await store.get(env, 'wallets', 'a')).payload, 'three');
  assert.deepEqual((await store.list(env, 'wallets')).map(d => d.id), ['a']);
  assert.ok(storeReady(env));
  assert.ok(!storeReady({}));
});

test('a new version never repeats the one it replaces', async () => {
  const s = d1Store(fakeD1());
  const w = await s.write('c', 'a', 'one');
  const again = await s.write('c', 'a', 'two', { updateTime: w.updateTime }, w.updateTime);
  assert.notEqual(again.updateTime, w.updateTime);
  await assert.rejects(s.write('c', 'a', 'three', { updateTime: w.updateTime }), e => e.precondition);
});

test('changeDoc: read, changed and written over the version read; a lost race changed again; unchanged, nothing written; null, deleted', async () => {
  const s = d1Store(fakeD1());
  let writes = 0;
  const deps = { fsGet: (env, c, id) => s.get(c, id), fsWrite: (env, c, id, p, pre) => (writes++, s.write(c, id, p, pre)), fsDelete: (env, c, id) => s.delete(c, id) };
  const read = v => v || { n: 0 };
  assert.deepEqual(await changeDoc({}, deps, 'c', 'd', v => ({ n: v.n + 1 }), { read }), { n: 1 });
  const doc = await s.get('c', 'd');
  let raced = false;
  const racing = { ...deps, fsGet: async (env, c, id) => {
    const got = await s.get(c, id);
    if (!raced) {
      raced = true;
      await s.write(c, id, JSON.stringify({ n: 10 }), { updateTime: doc.updateTime });
    }
    return got;
  } };
  assert.deepEqual(await changeDoc({}, racing, 'c', 'd', v => ({ n: v.n + 1 }), { read }), { n: 11 }, 'changed again on the newer copy');
  assert.deepEqual(parseDoc(await s.get('c', 'd')), { n: 11 });
  writes = 0;
  assert.deepEqual(await changeDoc({}, deps, 'c', 'd', v => v, { read }), { n: 11 });
  assert.equal(writes, 0);
  await changeDoc({}, deps, 'c', 'd', () => ({ n: 0 }), { read, write: v => (v.n ? v : null) });
  assert.equal((await s.get('c', 'd')).exists, false);
  const always = { ...deps, fsWrite: async () => Promise.reject(Object.assign(new Error('lost'), { precondition: true })) };
  assert.equal(await changeDoc({}, always, 'c', 'e', v => ({ n: v.n + 1 }), { read, attempts: 3 }), undefined);
  const broken = { ...deps, fsWrite: async () => Promise.reject(new Error('D1 down')) };
  await assert.rejects(changeDoc({}, broken, 'c', 'e', v => ({ n: v.n + 1 }), { read }), /D1 down/);
  await s.write('c', 'bad', '{nope');
  assert.equal(parseDoc(await s.get('c', 'bad')), null);
  assert.equal(parseDoc({ exists: false }), null);
  assert.equal(parseDoc(null), null);
});

test('countDay: a count a key, kept in D1 (or in memory with none); a D1 failure counts as over every limit', async () => {
  const env = { STORE: fakeD1() };
  assert.equal(await countDay(env, 'create:2026-10-22'), 1);
  assert.equal(await countDay(env, 'create:2026-10-22'), 2);
  assert.equal(await countDay(env, 'create:2026-10-23'), 1);
  forgetDays();
  assert.equal(await countDay({}, 'x'), 1);
  assert.equal(await countDay({}, 'x'), 2);
  forgetDays();
  assert.equal(await countDay({}, 'x'), 1);
  const broken = { STORE: { prepare: () => { throw new Error('D1 down'); } } };
  assert.equal(await countDay(broken, 'x'), Infinity);
  // Taiwan's day: 16:00 UTC is already the next day there.
  assert.equal(twDay(Date.UTC(2026, 9, 22, 15, 59)), '2026-10-22');
  assert.equal(twDay(Date.UTC(2026, 9, 22, 16, 0)), '2026-10-23');
});
