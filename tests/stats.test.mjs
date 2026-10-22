import { test } from 'node:test';
import assert from 'node:assert/strict';
import { winsOf, longestRun, achievementsOf } from '../public/lib/stats.mjs';

const leg = (result, extra = {}) => ({ result, sport: 'soccer', label: 'A', ...extra });
const slip = (id, over = {}) => ({ id, t: '2026-01-01T00:00:00Z', settledAt: `2026-01-0${id}T00:00:00Z`, status: 'settled', stake: 100, cost: 100, payout: 0, legs: [leg('lost')], ...over });
const acct = (slips = [], tickets = []) => ({ slips, tickets });

test('winsOf lists paying slips and prizes, newest first, filtered by since', () => {
  const a = acct([slip(1, { payout: 300, legs: [leg('won'), leg('won')] }), slip(2, { payout: 0 }), slip(3, { payout: 200, refunded: true })], [{ status: 'settled', prize: 50, cost: 10, t: '2026-01-05T00:00:00Z', game: 'bingo' }]);
  const w = winsOf(a);
  assert.deepEqual(w.map(x => x.kind), ['lotto', 'slip']);
  assert.equal(w[1].full, true);
  assert.equal(w[1].cost, 100);
  assert.equal(winsOf(a, Date.parse('2026-01-03T00:00:00Z')).length, 1);
  assert.deepEqual(winsOf(null), []);
});

test('longestRun counts consecutive paying slips, skipping recovered ones', () => {
  const s = [1, 2, 3, 4, 5].map(i => slip(i, { payout: i === 4 ? 0 : 10 }));
  assert.equal(longestRun(s), 3);
  assert.equal(longestRun([...s, slip(6, { recovered: true })]), 3);
  assert.equal(longestRun([]), 0);
});

test('achievementsOf: first win, ten-bagger, progress', () => {
  const a = acct([slip(1, { payout: 1000 })]);
  const by = Object.fromEntries(achievementsOf(a).map(x => [x.key, x]));
  assert.equal(by.first.done, true);
  assert.equal(by.x10.done, true);
  assert.equal(by.run3.done, false);
  assert.equal(by.run3.progress, 1 / 3);
  assert.equal(by['10k'].progress, 0.1);
});

test('a slip with every pick void is a refund: not a win, not a run', () => {
  const refund = slip(2, { payout: 100, legs: [leg('void'), leg('void'), leg('void')] });
  assert.deepEqual(winsOf(acct([refund])), []);
  const s = [slip(1, { payout: 300, legs: [leg('won')] }), refund, slip(3, { payout: 300, legs: [leg('won')] })];
  assert.equal(longestRun(s), 2);
});

test('a parlay won with void picks counts the picks won, not the voids', () => {
  const w = winsOf(acct([slip(1, { payout: 250, legs: [leg('won'), leg('void'), leg('void')] })]));
  assert.equal(w.length, 1);
  assert.equal(w[0].legs, 1);
  assert.equal(w[0].full, false);
  const by = Object.fromEntries(achievementsOf(acct([slip(1, { payout: 900, legs: [leg('won'), leg('won'), leg('void')] })])).map(x => [x.key, x]));
  assert.equal(by.parlay3.done, false);
});
