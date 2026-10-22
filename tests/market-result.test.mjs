import test from 'node:test';
import assert from 'node:assert/strict';

test('taxPaid: what the government withheld from slips and lottery prizes, never a free bet’s stake', async () => {
  const { taxPaid } = await import('../public/lib/account.mjs');
  const account = {
    slips: [
      { id: 'a', status: 'settled', gross: 60_000, payout: 48_010, stake: 100 },
      // A free bet: gross counts the stake it never paid back; no tax on a small win.
      { id: 'b', status: 'settled', gross: 300, payout: 100, stake: 200, free: true, freeValue: 200 },
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

