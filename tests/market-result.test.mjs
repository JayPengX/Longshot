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

test('taxPaid counts back: a slip settled before gross was kept has its tax worked out again', async () => {
  const { taxPaid } = await import('../public/lib/account.mjs');
  const { settleSlip } = await import('../public/lib/odds.mjs');
  const legs = [{ gameId: 'g1', odds: 600, result: 'won' }];
  const r = settleSlip({ legs, sizes: [1], stake: 10 });
  assert.ok(r.taxed > 0 && r.gross === 6_000);
  const old = { status: 'settled', legs, sizes: [1], stake: 10, cost: 10, payout: r.net };
  assert.deepEqual(taxPaid({ slips: [old] }), { sports: r.gross - r.net, lottery: 0 });
  // A small win, a loss or a cash out: no tax.
  assert.equal(taxPaid({ slips: [{ ...old, legs: [{ gameId: 'g1', odds: 2, result: 'won' }], payout: 20 }] }).sports, 0);
  assert.equal(taxPaid({ slips: [{ ...old, cashedOut: true }] }).sports, 0);
  // Recomputing gives the same total every time: nothing adds up twice.
  assert.deepEqual(taxPaid({ slips: [old, old] }).sports, 2 * (r.gross - r.net));
});

test('taxPaid counts the sports tax back charged on an old payout (the wallet’s odds:tax-<slip>)', async () => {
  const { taxPaid } = await import('../public/lib/account.mjs');
  const account = { slips: [], tickets: [], ledger: [{ id: 'payout-a', kind: 'payout', amount: 30_920, slipId: 'a' }, { id: 'tax-a', kind: 'tax', amount: -6_184, slipId: 'a' }] };
  assert.deepEqual(taxPaid(account), { sports: 6_184, lottery: 0 });
});

test('a back-charged sports tax shows on its slip: what it pays after, counted once in taxPaid', async () => {
  const { recoverFromWallet, taxPaid } = await import('../public/lib/account.mjs');
  const t = '2026-10-20T02:47:00.000Z';
  const slip = { id: 'a', t, mode: 'single', sizes: [1], stake: 28_630, cost: 28_630, legs: [{ odds: 1.08, result: 'won' }], status: 'settled', gross: 30_920, payout: 30_920 };
  const account = { v: 1, created: t, slips: [slip], tickets: [], ledger: [{ id: 'stake-a', t, kind: 'stake', amount: -28_630, slipId: 'a' }, { id: 'payout-a', t, kind: 'payout', amount: 30_920, slipId: 'a' }] };
  const wallet = { entries: [{ id: 'odds:tax-a', t: Date.parse('2026-10-20T04:43:00Z'), app: 'odds', kind: 'tax', amount: -6_184 }] };
  const after = recoverFromWallet(account, wallet);
  assert.equal(after.slips[0].payout, 24_736);
  assert.equal(after.slips[0].backTax, 6_184);
  assert.deepEqual(taxPaid(after), { sports: 6_184, lottery: 0 });
  // Again: nothing changes.
  assert.equal(recoverFromWallet(after, wallet), after);
});

test('a back charge taken back (eco:untax-<slip>) leaves the slip and the record as before it', async () => {
  const { recoverFromWallet, taxPaid } = await import('../public/lib/account.mjs');
  const t = '2026-10-20T02:47:00.000Z';
  const slip = { id: 'a', t, mode: 'single', sizes: [1], stake: 28_630, cost: 28_630, legs: [{ odds: 1.08, result: 'won' }], status: 'settled', gross: 30_920, payout: 24_736, backTax: 6_184 };
  const account = { v: 1, created: t, slips: [slip], tickets: [], ledger: [{ id: 'stake-a', t, kind: 'stake', amount: -28_630, slipId: 'a' }, { id: 'payout-a', t, kind: 'payout', amount: 30_920, slipId: 'a' }, { id: 'tax-a', t: '2026-10-20T04:43:00.000Z', kind: 'tax', amount: -6_184, slipId: 'a' }] };
  const wallet = { entries: [{ id: 'eco:untax-a', t: Date.parse('2026-10-20T05:00:00Z'), app: 'eco', kind: 'untax', amount: 0 }] };
  const after = recoverFromWallet(account, wallet);
  assert.equal(after.slips[0].payout, 30_920);
  assert.equal(after.slips[0].backTax, undefined);
  assert.ok(!after.ledger.some(e => e.kind === 'tax'));
  assert.deepEqual(taxPaid(after), { sports: 0, lottery: 0 });
  assert.equal(recoverFromWallet(after, wallet), after);
});
