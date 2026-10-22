import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combosBySize, comboCount, slipErrors, slipPayoutTable, settleSlip } from '../public/lib/odds.mjs';

const legs = [
  { gameId: 'g1', odds: 2, fairChance: 0.5 },
  { gameId: 'g1', odds: 2, fairChance: 0.5 },
  { gameId: 'g2', odds: 3, fairChance: 0.3 }
];

test('Picks of one game: every single, but never two in one combination', () => {
  assert.deepEqual(combosBySize(legs), [1, 3, 2]);
  assert.equal(comboCount(legs, [1]), 3);
  assert.equal(comboCount(legs, [2]), 2);
  assert.deepEqual(slipErrors({ mode: 'single', legs, sizes: [1], stake: 100 }).filter(e => e === 'sameGame'), []);
  assert.ok(slipErrors({ mode: 'parlay', legs, sizes: [3], stake: 100 }).includes('sameGame'));
  assert.deepEqual(slipErrors({ mode: 'system', legs, sizes: [2], stake: 100 }).filter(e => e === 'sameGame'), []);
  // All three won (can't happen for one game's both sides, but the table stays
  // right): the two 2-leg combinations g1a×g2 and g1b×g2, never g1a×g1b.
  const { gross } = slipPayoutTable({ legs, sizes: [2], stake: 100 });
  assert.equal(gross[0b111], 1200);
  assert.equal(settleSlip({ legs: legs.map((l, i) => ({ ...l, result: i === 1 ? 'lost' : 'won' })), sizes: [2], stake: 100 }).gross, 600);
});

test('Legs saved without a gameId: each its own game, as before', () => {
  const old = legs.map(({ odds }) => ({ odds }));
  assert.deepEqual(combosBySize(old), [1, 3, 3, 1]);
});

