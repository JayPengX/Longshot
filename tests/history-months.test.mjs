import test from 'node:test';
import assert from 'node:assert/strict';
import { monthsOf, monthKey } from '../public/lib/history.mjs';

test('紀錄 months: slips by the Taiwan day their last game ended, tickets by their draw, at least three bars', () => {
  const now = Date.parse('2026-10-21T03:00:00Z');
  const slip = (id, end, cost, payout) => ({ id, status: 'settled', t: end, settledAt: end, cost, payout, legs: [{ start: end }] });
  const account = {
    slips: [slip('a', '2026-09-30T17:00:00Z', 100, 300), slip('b', '2026-10-02T01:00:00Z', 500, 0), { id: 'o', status: 'open', t: '2026-10-20T00:00:00Z', cost: 900, legs: [] }],
    tickets: [{ id: 'x', status: 'settled', cost: 50, prize: 0, draw: { at: Date.parse('2026-10-10T12:30:00Z') } }]
  };
  // 2026-09-30 17:00Z is 10/1 01:00 in Taipei: October's.
  assert.equal(monthKey('2026-09-30T17:00:00Z'), '2026-10');
  const months = monthsOf(account, { now });
  assert.deepEqual(months.map(m => m.key), ['2026-08', '2026-09', '2026-10']);
  assert.deepEqual(months.at(-1), { key: '2026-10', spent: 650, paid: 300, net: -350, n: 3 });
  assert.equal(months[0].n, 0);
  assert.deepEqual(monthsOf({ slips: [], tickets: [] }, { now }), []);
  // A long history: the last six months only.
  const old = { slips: [slip('c', '2025-01-05T00:00:00Z', 100, 0)] };
  assert.equal(monthsOf(old, { now }).length, 6);
});
