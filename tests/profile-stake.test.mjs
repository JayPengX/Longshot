import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slipTicket } from '../public/lib/profile.mjs';

const legs = [{ odds: 2, result: 'won' }];
const base = { t: '2026-01-01T00:00:00Z', mode: 'single', legs, payout: 0 };

test('a free bet\'s ticket stake is its whole stake, not its NT$0 cost', () => {
  assert.equal(slipTicket({ ...base, stake: 100, cost: 0, free: 'fb1', freeValue: 100 }, Date.parse(base.t)).stake, 100);
});
test('a normal slip\'s ticket stake is its cost', () => {
  assert.equal(slipTicket({ ...base, stake: 50, cost: 50 }, Date.parse(base.t)).stake, 50);
});
