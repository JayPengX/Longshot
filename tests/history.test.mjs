// 紀錄's account card and the pure helpers around it, pushed at their edges:
// empty accounts, slips with no picks, odd shapes, the saves' codec and the
// recommendations' tags.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accountRecord, slipAtStake } from '../public/lib/history.mjs';
import { recommend, RECOMMEND, backOf } from '../public/lib/recommend.mjs';
import { pack, unpack } from '../public/lib/codec.mjs';
import { interleave, spreadLeagues, leagueTaste, tasteOf } from '../public/lib/foryou.mjs';
import { revealPending, slipSpec } from '../public/lib/settled.mjs';
import { isAccount, newAccount as emptyAccount, placeSlip, compactLeg } from '../public/lib/account.mjs';

const START_BALANCE = 10_000;
// An account with NT$10,000 of its own to bet with (the wallet's money, in the app).
const newAccount = (now, { start = true } = {}) => {
  const a = emptyAccount(now);
  return start ? { ...a, ledger: [{ id: 'start', t: a.created, kind: 'start', amount: START_BALANCE }] } : a;
};

const recovered = { id: 'r', t: '2026-10-01T00:00:00.000Z', status: 'settled', mode: 'single', sizes: [1], stake: 300, cost: 300, payout: 0, legs: [], recovered: true };

test('an account with nothing, or only a slip with no picks, never breaks the account card', () => {
  // The account card: a slip settled, lost, net as it is.
  assert.deepEqual(accountRecord({ slips: [recovered] }), { open: 0, openCount: 0, spent: 300, won: 0, decided: 1, net: -300, back: 0 });
  assert.deepEqual(accountRecord(null), { open: 0, openCount: 0, spent: 0, won: 0, decided: 0, net: null, back: null });
});

test('recommendations: a small or locked lot gets none; each tag by its rule', () => {
  const pick = (id, fairChance, estOdds, extra = {}) => ({ id, fairChance, estOdds, ...extra });
  assert.equal(recommend(Array.from({ length: RECOMMEND.minPool - 1 }, (_, i) => pick(i, 0.5, 1.9))).size, 0);
  // Locked, capped, near-certain or near-hopeless picks are never in the lot.
  const noise = [pick('lock', 0.5, 3, { lock: 'low' }), pick('cap', 0.5, 3, { cap: 'prop' }), pick('sure', 0.9, 1.2), pick('hopeless', 0.03, 40)];
  const lot = [...Array.from({ length: 10 }, (_, i) => pick(`p${i}`, 0.5, 1.8 + i * 0.01)), pick('best', 0.5, 2.2), pick('steady', 0.7, 1.33), pick('shot', 0.2, 4.6), ...noise];
  const tags = recommend(lot);
  for (const id of ['lock', 'cap', 'sure', 'hopeless']) assert.ok(!tags.has(id), id);
  assert.equal(tags.get('best').tag, 'value');
  assert.equal(backOf(pick('x', 0.5, 2)), 100);
  for (const [, v] of tags) assert.ok(v.beats >= 0 && v.beats <= 1);
});

test('saves round-trip through gzip, Chinese and all; anything unreadable is null, never a throw', async () => {
  const account = { v: 1, created: 'c', ledger: [{ id: 'start', amount: 1 }], slips: [{ id: 's', legs: [{ shortLabel: '洛杉磯道奇 · Ñúñez 🎫' }] }] };
  const text = await pack(account);
  assert.ok(text.startsWith('gz1:'));
  assert.deepEqual(await unpack(text), account);
  // Large saves too (base64 in chunks).
  const big = { list: Array.from({ length: 20000 }, (_, i) => ({ i, s: Math.random().toString(36) })) };
  assert.deepEqual(await unpack(await pack(big)), big);
  for (const bad of ['gz1:@@@', 'gz1:AAAA', '{nope', '', null, undefined, 42]) assert.equal(await unpack(bad), null);
  assert.deepEqual(await unpack('{"v":1}'), { v: 1 });
  assert.equal(isAccount(await unpack('{"v":1}')), false);
  assert.equal(isAccount({ v: 1, created: 'x', ledger: [], slips: [] }), true);
  assert.equal(isAccount({ v: 2, created: 'x', ledger: [], slips: [] }), false);
});

test("為你推薦's helpers: sports take turns, a league the person likes gets two", () => {
  const kind = x => x.k;
  assert.deepEqual(interleave([{ k: 'a', n: 1 }, { k: 'a', n: 2 }, { k: 'b', n: 3 }, { k: 'a', n: 4 }], kind).map(x => x.n), [1, 3, 2, 4]);
  assert.deepEqual(interleave([], kind), []);
  const taste = tasteOf({ aff: { 'league:nba': 5, 'team:mlb:new york yankees': 5 }, now: 0 });
  assert.equal(leagueTaste('nba', taste), 1);
  // A team seen only in the affinity ('like') doesn't make its league liked.
  assert.equal(leagueTaste('mlb', taste), 0);
  const items = ['nba', 'nba', 'nba', 'mlb', 'mlb', 'epl'].map((sport, i) => ({ i, game: { sport } }));
  assert.deepEqual(spreadLeagues(items, taste, { n: 5 }).map(x => x.i).sort(), [0, 1, 3, 5]);
});

test("a scratched card's prize the pass doesn't have yet is asked for again, five at most, a failure never thrown", async () => {
  const calls = [];
  const realFetch = globalThis.fetch;
  const { useSettleToken } = await import('../public/lib/settled.mjs');
  useSettleToken(() => 'tok');
  globalThis.fetch = async (url, init) => {
    calls.push(JSON.parse(init.body).id);
    if (calls.length === 2) throw new Error('offline');
    return { ok: true, json: async () => ({}) };
  };
  try {
    const card = (id, extra = {}) => ({ id, card: 'gold', status: 'settled', prize: 500, ...extra });
    const account = { tickets: [card('a'), card('b'), card('c', { prize: 0 }), card('d', { status: 'open' }), card('e'), card('f'), card('g'), card('h'), card('paid')] };
    await revealPending(account, { entries: [{ id: 'odds:prize-paid' }] });
    assert.deepEqual(calls, ['a', 'b', 'e', 'f', 'g']);
  } finally {
    globalThis.fetch = realFetch;
    useSettleToken(() => '');
  }
});

test('saved picks drop their empty fields', () => {
  const t0 = new Date('2026-10-10T00:00:00Z');
  const placed = placeSlip(newAccount(t0), { id: 'c', mode: 'single', sizes: [1], stake: 100, cost: 100, legs: [{ id: 'x', odds: 2, line: null, inning: undefined }] }, t0).account;
  assert.deepEqual(Object.keys(placed.slips[0].legs[0]), ['id', 'odds', 'result']);
  assert.deepEqual(compactLeg({ a: null, b: 0, result: null }), { b: 0, result: null });
});

