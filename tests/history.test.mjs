// 紀錄's numbers and the pure helpers around them, pushed at their edges:
// empty accounts, slips with no picks, odd shapes, the quantile tables, the
// saves' codec and the recommendations' tags.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { historyStats, funFacts, crowdPercentile, normalCdf, accountRecord, chanceOf, legsGroup } from '../public/lib/history.mjs';
import { accountTickets, ticketProfile } from '../public/lib/profile.mjs';
import { recommend, RECOMMEND, backOf } from '../public/lib/recommend.mjs';
import { pack, unpack } from '../public/lib/codec.mjs';
import { interleave, spreadLeagues, leagueTaste, fixturesTaste, tasteOf } from '../public/lib/foryou.mjs';
import { revealPending, slipSpec } from '../public/lib/settled.mjs';
import { isAccount, cashOut, newAccount, placeSlip, compactLeg } from '../public/lib/account.mjs';

const recovered = { id: 'r', t: '2026-10-01T00:00:00.000Z', status: 'settled', mode: 'single', sizes: [1], stake: 300, cost: 300, payout: 0, legs: [], recovered: true };

test('an account with nothing, or only a slip with no picks, never breaks the stats', () => {
  const empty = historyStats({ ledger: [], slips: [] });
  assert.deepEqual([empty.placed, empty.settled, empty.net, empty.back, empty.luckZ, empty.luckShare, empty.avgCost], [0, 0, 0, null, 0, 0.5, 0]);
  assert.deepEqual(funFacts({ slips: [] }), {});
  const one = historyStats({ ledger: [{ id: 'stake-r', t: recovered.t, kind: 'stake', amount: -300 }], slips: [recovered] });
  assert.deepEqual([one.settled, one.net, one.byMode.length, one.bySport.length], [1, -300, 0, 0]);
  assert.equal(one.timeline.at(-1).balance, -300);
  // How you bet: a slip with no picks says nothing (it read as an underdog single).
  assert.deepEqual(accountTickets({ slips: [recovered] }), []);
  assert.equal(ticketProfile(accountTickets({ slips: [recovered] })), null);
  // The account card: a slip settled, lost, net as it is.
  assert.deepEqual(accountRecord({ slips: [recovered] }), { open: 0, openCount: 0, won: 0, decided: 1, net: -300, back: 0 });
  assert.deepEqual(accountRecord(null), { open: 0, openCount: 0, won: 0, decided: 0, net: null, back: null });
});

test('the picks against their chances: bands, void picks apart, a chance saved without one read from its odds', () => {
  const leg = (result, fair, odds = 2, kind = 'ml', sport = 'mlb') => ({ gameId: `g${Math.random()}`, result, fairChance: fair, odds, kind, sport });
  const slip = (id, legs, payout) => ({ id, t: `2026-10-0${id}T00:00:00.000Z`, settledAt: `2026-10-0${id}T05:00:00.000Z`, status: 'settled', mode: legs.length > 1 ? 'parlay' : 'single', sizes: [legs.length], stake: 100, cost: 100, payout, legs });
  const s = historyStats({
    ledger: [],
    slips: [slip('1', [leg('won', 0.55), leg('won', 0.1)], 1000), slip('2', [leg('lost', 0.9, 1.1, 'total', 'nba')], 0), slip('3', [leg('void', 0.5)], 100), slip('4', [leg('won', undefined, 4)], 400)]
  });
  assert.deepEqual([s.picks.legs, s.picks.won, s.picks.lost, s.picks.void], [4, 3, 1, 1]);
  // 0.1 in the first band, 0.55 in the middle, 0.9 in the top, and 1/4 → 0.25.
  assert.deepEqual(s.bands.map(b => b.legs), [1, 1, 1, 0, 1]);
  assert.equal(chanceOf({ odds: 4 }), 0.25);
  assert.equal(chanceOf({ odds: 0.5 }), 1);
  assert.deepEqual(['1', '2', '3', '4', '5', '12'].map(Number).map(legsGroup), ['1', '2', '3-4', '3-4', '5+', '5+']);
  // A slip all of one sport counts there; a mixed one under 'mixed' (and its picks under their own).
  assert.ok(s.bySport.some(x => x.key === 'nba' && x.slips === 1));
  // Streaks of slips that made or lost money: won, lost, the void (break-even:
  // neither, the loss run stands), won.
  assert.deepEqual([s.streak.bestWin, s.streak.bestLoss, s.streak.current], [1, 1, 1]);
  // Weeks run Monday to Sunday, Taiwan time.
  assert.deepEqual(s.weeks.map(w => w.week), ['2026-09-28']);
});

test("fun facts: a parlay lost by one pick says what it would have paid; the busiest day is Taiwan's", () => {
  const legs = [{ gameId: 'a', odds: 2, result: 'won', kind: 'ml', shortLabel: '道奇' }, { gameId: 'b', odds: 3, result: 'lost', kind: 'ml', shortLabel: '洋基' }, { gameId: 'c', odds: 1.5, result: 'void', kind: 'ml', shortLabel: '道奇' }];
  // Bought Sunday 23:30 Taiwan (15:30Z Sunday): the busiest weekday is Sunday (0).
  const near = { id: 'n', t: '2026-10-18T15:30:00.000Z', status: 'settled', mode: 'parlay', sizes: [3], stake: 100, cost: 100, payout: 0, legs };
  const f = funFacts({ slips: [near, { ...near, id: 'n2' }, { ...near, id: 'n3', t: '2026-10-18T16:30:00.000Z' }] });
  assert.equal(f.nearMiss.count, 3);
  assert.equal(Math.round(f.nearMiss.missed), 3 * 600);
  assert.equal(f.team.name, '道奇');
  assert.equal(f.weekday.day, 0);
  assert.equal(f.weekday.slips, 2);
});

test('the crowd table and the normal curve at their edges', () => {
  assert.equal(crowdPercentile(null, 1), null);
  assert.equal(crowdPercentile([], 1), null);
  assert.equal(crowdPercentile([0, 10, 20], -5), 0);
  assert.equal(crowdPercentile([0, 10, 20], 99), 1);
  assert.equal(crowdPercentile([0, 10, 20], 5), 0.25);
  // A flat stretch (many people on the same figure) never divides by zero.
  assert.ok(Number.isFinite(crowdPercentile([0, 5, 5, 5, 10], 5)));
  assert.ok(Math.abs(normalCdf(0) - 0.5) < 1e-6);
  assert.ok(Math.abs(normalCdf(1.96) - 0.975) < 1e-3);
  assert.ok(Math.abs(normalCdf(-1.96) + normalCdf(1.96) - 1) < 1e-9);
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

test("為你推薦's helpers: sports take turns, a league the person likes gets two, follows read from either copy", () => {
  const kind = x => x.k;
  assert.deepEqual(interleave([{ k: 'a', n: 1 }, { k: 'a', n: 2 }, { k: 'b', n: 3 }, { k: 'a', n: 4 }], kind).map(x => x.n), [1, 3, 2, 4]);
  assert.deepEqual(interleave([], kind), []);
  const taste = tasteOf({ aff: { 'league:nba': 5, 'team:mlb:new york yankees': 5 }, now: 0 });
  assert.equal(leagueTaste('nba', taste), 1);
  // A team seen only in the affinity ('like') doesn't make its league liked.
  assert.equal(leagueTaste('mlb', taste), 0);
  const items = ['nba', 'nba', 'nba', 'mlb', 'mlb', 'epl'].map((sport, i) => ({ i, game: { sport } }));
  assert.deepEqual(spreadLeagues(items, taste, { n: 5 }).map(x => x.i).sort(), [0, 1, 3, 5]);
  // Orbit Sports' follows: the device's copy and the pass's, a broken copy ignored.
  assert.equal(fixturesTaste(() => '{broken'), null);
  const both = fixturesTaste(() => JSON.stringify({ leagues: ['epl'], follows: [{ league: 'nba', name: 'Boston Celtics' }] }), { settings: { 'follows:match': { value: { leagues: ['epl', 'mlb'], teams: [['mlb', 'Los Angeles Dodgers'], 'junk', ['nba']] } } } });
  assert.deepEqual(both.leagues, ['epl', 'mlb']);
  assert.deepEqual(both.follows.map(f => f.name), ['Boston Celtics', 'Los Angeles Dodgers']);
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

test('a cash out is paid once, never on a free bet or a settled slip; saved picks drop their empty fields', () => {
  const t0 = new Date('2026-10-10T00:00:00Z');
  const placed = placeSlip(newAccount(t0), { id: 'c', mode: 'single', sizes: [1], stake: 100, cost: 100, legs: [{ id: 'x', odds: 2, line: null, inning: undefined }] }, t0).account;
  assert.deepEqual(Object.keys(placed.slips[0].legs[0]), ['id', 'odds', 'result']);
  assert.deepEqual(compactLeg({ a: null, b: 0, result: null }), { b: 0, result: null });
  assert.equal(cashOut(placed, 'c', 0), placed);
  assert.equal(cashOut(placed, 'nope', 50), placed);
  const cashed = cashOut(placed, 'c', 150.9, t0);
  assert.equal(cashed.slips[0].payout, 150);
  assert.equal(cashOut(cashed, 'c', 150, t0), cashed);
  assert.equal(slipSpec(cashed.slips[0]).status, 'open');
});
