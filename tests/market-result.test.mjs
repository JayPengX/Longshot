import test from 'node:test';
import assert from 'node:assert/strict';
import { resultByMarket } from '../public/lib/account.mjs';

test('resultByMarket: settled slips by sport, open ones left out, lottery and scratch apart', () => {
  const account = {
    slips: [
      { id: 'a', status: 'settled', legs: [{ sport: 'nba' }] },
      { id: 'b', status: 'settled', legs: [{ sport: 'nba' }, { sport: 'mlb' }] },
      { id: 'c', status: 'open', legs: [{ sport: 'mlb' }] },
      { id: 'd', status: 'settled', legs: [], recovered: true }
    ],
    tickets: [
      { id: 't1', game: 'lotto649', status: 'settled' },
      { id: 't2', game: 'scratch:gold', status: 'settled' },
      { id: 't3', game: 'daily539', status: 'open' }
    ],
    ledger: [
      { id: 'start', kind: 'start', amount: 10000 },
      { id: 'stake-a', kind: 'stake', amount: -100, slipId: 'a' },
      { id: 'payout-a', kind: 'payout', amount: 180, slipId: 'a' },
      { id: 'plus-a', kind: 'plusboost', amount: 5, slipId: 'a' },
      { id: 'stake-b', kind: 'stake', amount: -50, slipId: 'b' },
      { id: 'payout-b', kind: 'payout', amount: 0, slipId: 'b' },
      { id: 'stake-c', kind: 'stake', amount: -70, slipId: 'c' },
      { id: 'stake-d', kind: 'stake', amount: -20 },
      { id: 'lotto-t1', kind: 'lottery', amount: -50 },
      { id: 'prize-t1', kind: 'prize', amount: 400 },
      { id: 'lotto-t2', kind: 'lottery', amount: -100 },
      { id: 'lotto-t3', kind: 'lottery', amount: -50 }
    ]
  };
  assert.deepEqual(resultByMarket(account), { nba: 85, mixed: -50, other: -20, lottery: 350, scratch: -100 });
});

test('taxPaid: what the government withheld from slips and lottery prizes, never a free bet’s stake', async () => {
  const { taxPaid } = await import('../public/lib/account.mjs');
  const account = {
    slips: [
      { status: 'settled', gross: 60_000, payout: 48_010, stake: 100 },
      // A free bet: gross counts the stake it never paid back; no tax on a small win.
      { status: 'settled', gross: 300, payout: 100, stake: 200, free: true, freeValue: 200 },
      { status: 'open', gross: 90_000, payout: 0 },
      { status: 'settled', gross: 0, payout: 0 }
    ],
    tickets: [
      { status: 'settled', gross: 10_000, prize: 7_960 },
      { status: 'settled', gross: 400, prize: 400 },
      { status: 'open', gross: 10_000 }
    ]
  };
  assert.deepEqual(taxPaid(account), { sports: 11_990, lottery: 2_040 });
  assert.deepEqual(taxPaid({}), { sports: 0, lottery: 0 });
});
