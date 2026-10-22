import { test } from 'node:test';
import assert from 'node:assert/strict';
import { record, curve, sinceOf, monthSpend } from '../public/slips/lib/stats.mjs';

const leg = (id, kind, league, odds = 1.8) => ({ id, kind, odds, game: { league } });
const t = (at, cost, net, mode, legs, results) => ({ slip: { settledAt: at, mode, legs }, cost, net, results });
const done = [
  t('2026-10-01T12:00:00Z', 100, 180, 'single', [leg('a', 'ml', 'nba', 1.8)], { a: 'won' }),
  t('2026-10-03T12:00:00Z', 200, 0, 'parlay', [leg('b', 'spread', 'nba'), leg('c', 'total', 'mlb')], { b: 'won', c: 'lost' }),
  t('2026-10-02T12:00:00Z', 100, 0, 'single', [leg('d', 'ml', 'epl', 2.1)], { d: 'lost' }),
  t('2026-10-04T12:00:00Z', 100, 100, 'single', [leg('e', 'total', 'mlb', 1.75)], { e: 'void' })
];

test('戰績: the totals, the running profit oldest first, the streak, each kind of pick', () => {
  const r = record(done);
  assert.equal(r.count, 4);
  // (The void single got its stake back: a refund, not a win.)
  assert.equal(r.won, 1);
  assert.equal(r.hit, 1 / 3);
  assert.equal(r.staked, 500);
  assert.equal(r.back, 280);
  assert.equal(r.profit, -220);
  assert.deepEqual(r.series.map(p => p.profit), [80, -20, -220, -220]);
  // (The latest, a refund, skipped: the two before it lost.)
  assert.deepEqual(r.streak, { won: false, n: 2 });
  assert.equal(r.best.cost, 100);
  assert.equal(r.worst.cost, 200);
  const ml = r.byKind.find(k => k.key === 'ml');
  assert.deepEqual([ml.legs, ml.won, ml.lost, ml.hit], [2, 1, 1, 0.5]);
  const total = r.byKind.find(k => k.key === 'total');
  assert.deepEqual([total.won, total.lost, total.void], [0, 1, 1]);
  // A ticket over more than one league counts as mixed.
  assert.deepEqual(r.byLeague.map(g => g.key).sort(), ['epl', 'mixed', 'mlb', 'nba']);
  assert.deepEqual(r.byMode.map(g => [g.key, g.count]), [['single', 3], ['parlay', 1]]);
});

test('戰績 since a day; nothing settled; the curve', () => {
  assert.equal(record(done, { since: Date.parse('2026-10-03T00:00:00Z') }).count, 2);
  const none = record([]);
  assert.deepEqual([none.count, none.roi, none.hit, none.best, none.streak.n], [0, 0, 0, null, 0]);
  const c = curve(record(done).series, 300, 120);
  assert.ok(c.line.startsWith('M'));
  assert.equal(c.up, false);
  assert.ok(c.zero > 0 && c.zero < 120);
});

test('戰績 with nothing staked divides by nothing; a run of losses; no best when none made money', () => {
  const lost = [t('2026-10-01T00:00:00Z', 100, 0, 'single', [leg('x', 'ml', 'nba')], { x: 'lost' }), t('2026-10-02T00:00:00Z', 100, 0, 'single', [leg('y', 'ml', 'nba')], { y: 'lost' })];
  const r = record(lost);
  assert.deepEqual([r.roi, r.hit, r.streak.won, r.streak.n, r.best, r.worst.cost], [0, 0, false, 2, null, 100]);
  const free = record([t('2026-10-01T00:00:00Z', 0, 0, undefined, [], {})]);
  assert.deepEqual([free.roi, free.byMode[0].key, free.byMode[0].roi, free.odds], [0, 'single', 0, 0]);
  // A pick with no result yet counts as a pick, neither won nor lost.
  const k = record([t('2026-10-01T00:00:00Z', 100, 0, 'parlay', [leg('p', 'ml', 'nba'), leg('q', 'ml', 'nba')], { p: 'lost' })]).byKind[0];
  assert.deepEqual([k.legs, k.won, k.lost, k.hit], [2, 0, 1, 0]);
  // A ticket with no date is outside any range.
  assert.equal(record([{ slip: { legs: [] }, cost: 100, net: 0 }], { since: 1 }).count, 0);
});

test('the curve: flat at nothing, all up, its zero line inside the box', () => {
  const flat = curve([]);
  assert.equal(flat.up, true);
  assert.equal(flat.line, 'M6.0 114.0');
  const up = curve([{ profit: 50 }, { profit: 100 }], 300, 120, 6);
  assert.equal(up.zero, 114);
  assert.deepEqual(up.last, [294, 6]);
  const down = curve([{ profit: -100 }], 300, 120, 6);
  assert.equal(down.zero, 6);
  assert.equal(down.up, false);
});

test('a ticket with every pick void is a refund: out of the hit rate and the streak', async () => {
  const { record, refunded } = await import('../public/slips/lib/stats.mjs');
  const t = (id, net, result, at) => ({ slip: { id, settledAt: at, legs: [{ id: 'a', kind: 'ml', odds: 2 }] }, cost: 100, net, results: { a: result } });
  const rows = [t('1', 200, 'won', '2026-10-01'), t('2', 0, 'lost', '2026-10-02'), t('3', 100, 'void', '2026-10-03')];
  assert.equal(refunded(rows[2]), true);
  const r = record(rows);
  assert.equal(r.won, 1);
  assert.equal(r.hit, 0.5);
  assert.deepEqual(r.streak, { won: false, n: 1 });
  assert.equal(r.byMode[0].hit, 0.5);
});

test('戰績 ranges are Taipei days: 7 days is today and the 6 before, from their midnight', () => {
  // 2026-10-18 01:00 in Taipei is 10-17 17:00Z.
  const now = Date.parse('2026-10-17T17:00:00Z');
  assert.equal(sinceOf('all', now), 0);
  assert.equal(sinceOf('7', now), Date.parse('2026-10-11T16:00:00Z'), 'Taipei 10/12 00:00');
  assert.equal(sinceOf('30', now), Date.parse('2026-09-18T16:00:00Z'), 'Taipei 9/19 00:00');
  const at = iso => ({ slip: { settledAt: iso, legs: [] }, cost: 1, net: 0 });
  const rows = [at('2026-10-11T15:59:00Z'), at('2026-10-11T16:00:00Z')];
  assert.equal(record(rows, { since: sinceOf('7', now) }).count, 1);
});

test('this month spent: every ticket saved in the Taipei month, open or settled, by Taipei day', () => {
  const now = Date.parse('2026-10-18T05:00:00Z');
  const s = (id, created) => ({ id, created });
  const cost = x => ({ a: 100, b: 250, c: 40, d: 70, e: 5 })[x.id];
  const slips = [
    s('a', '2026-10-01T00:00:00+08:00'), // the 1st, just after midnight: this month
    s('b', '2026-10-18T10:00:00Z'),
    s('c', '2026-09-30T16:00:00Z'), // 10/1 00:00 Taipei: this month though September in UTC
    s('d', '2026-09-30T15:59:00Z'), // 9/30 23:59 Taipei: last month
    s('e', 'nonsense')
  ];
  assert.deepEqual(monthSpend(slips, cost, now), { staked: 390, count: 3, month: '2026-10' });
  assert.deepEqual(monthSpend([], cost, now), { staked: 0, count: 0, month: '2026-10' });
});

test('戰績 by sport (a ticket over two sports: mixed) and by Taipei month', () => {
  const r = record([...done, t('2026-09-30T17:00:00Z', 100, 250, 'single', [leg('f', 'ml', 'nba')], { f: 'won' })]);
  assert.deepEqual(r.bySport.map(g => g.key).sort(), ['basketball', 'baseball', 'mixed', 'soccer'].sort());
  // (17:00 UTC on 9/30 is 10/1 in Taipei.)
  assert.deepEqual(r.byMonth.map(g => [g.key, g.count, g.profit]), [['2026-10', 5, -70]]);
});
