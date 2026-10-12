import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newAccount, placeSlip, applyResults, recoverFromWallet, poolEntries, balance } from '../public/lib/account.mjs';
import { slipSpec } from '../public/lib/settled.mjs';

// The Worker (Shared-Proxy settle.js) settles a slip and pays the wallet
// `odds:payout-<slip>`; Play then applies the Worker's record. Money is paid once.
const leg = { id: 'mlb|a-b|ml|home', kind: 'ml', side: 'home', sport: 'mlb', away: 'A', home: 'B', start: '2026-10-10T23:10:00Z', odds: 1.8, gameId: 'g1' };
const now = new Date('2026-10-11T04:00:00Z');

test('a slip the Worker settled and paid is applied without paying it again', () => {
  const placed = placeSlip(newAccount(new Date('2026-10-10T20:00:00Z')), { id: 'slipwin01', mode: 'single', sizes: [1], stake: 100, cost: 100, legs: [leg] }, new Date('2026-10-10T20:00:00Z')).account;
  const wallet = { entries: [...poolEntries(placed), { id: 'odds:payout-slipwin01', t: now.getTime(), app: 'odds', kind: 'payout', amount: 180 }] };
  // The next sync brings the Worker's payout into the ledger first…
  const recovered = recoverFromWallet(placed, wallet);
  assert.equal(balance(recovered), balance(placed) + 180);
  // …then its record settles the slip: no second payout.
  const settled = applyResults(recovered, 'slipwin01', ['won'], now, [{ away: 2, home: 5 }]);
  const slip = settled.slips.find(s => s.id === 'slipwin01');
  assert.equal(slip.status, 'settled');
  assert.equal(slip.payout, 180);
  assert.deepEqual(slip.legs[0].final, { away: 2, home: 5 });
  assert.equal(settled.ledger.filter(e => e.id === 'payout-slipwin01').length, 1);
  assert.equal(balance(settled), balance(placed) + 180);
  // The same record again changes nothing.
  assert.equal(applyResults(settled, 'slipwin01', ['won'], now), settled);
});

test('what the Worker is handed of a slip', () => {
  const spec = slipSpec({ id: 'slipwin01', t: 't', mode: 'parlay', sizes: [2], stake: 100, cost: 100, legs: [leg, leg], status: 'open', boost: 1.1, free: 'fb1', freeValue: 200, settledAt: 'x' });
  assert.deepEqual(Object.keys(spec), ['id', 't', 'status', 'mode', 'sizes', 'stake', 'cost', 'legs', 'boost', 'free', 'freeValue']);
});

test('a slip the Worker cashed out (on another device) shows cashed out, paid once', async () => {
  const { cashOut } = await import('../public/lib/account.mjs');
  const placed = placeSlip(newAccount(new Date('2026-10-10T20:00:00Z')), { id: 'slipco0001', mode: 'single', sizes: [1], stake: 100, cost: 100, legs: [leg] }, new Date('2026-10-10T20:00:00Z')).account;
  const wallet = { entries: [...poolEntries(placed), { id: 'odds:payout-slipco0001', t: now.getTime(), app: 'odds', kind: 'cashout', amount: 120 }] };
  const recovered = recoverFromWallet(placed, wallet);
  const cashed = cashOut(recovered, 'slipco0001', 120, now);
  const slip = cashed.slips.find(s => s.id === 'slipco0001');
  assert.equal(slip.status, 'settled');
  assert.equal(slip.cashedOut, true);
  assert.equal(cashed.ledger.filter(e => e.id === 'payout-slipco0001').length, 1);
  assert.equal(balance(cashed), balance(placed) + 120);
});
