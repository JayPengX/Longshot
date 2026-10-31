import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playsOf, recordOf, runsOf } from '../public/lib/stats.mjs';

const leg = (result, extra = {}) => ({ result, sport: 'soccer', label: 'A', ...extra });
const slip = (id, over = {}) => ({ id, t: '2026-01-01T00:00:00Z', settledAt: `2026-01-0${id}T00:00:00Z`, status: 'settled', stake: 100, cost: 100, payout: 0, legs: [leg('lost')], ...over });
const acct = (slips = [], tickets = []) => ({ slips, tickets });

test('every decided slip and ticket counts, losses included; open ones do not', () => {
  const a = acct(
    [slip(1, { payout: 300, legs: [leg('won'), leg('won')] }), slip(2), slip(3, { status: 'open' })],
    [{ status: 'settled', prize: 0, cost: 50, t: '2026-01-05T00:00:00Z', game: 'bingo' }, { status: 'settled', prize: 500, cost: 100, t: '2026-01-06T00:00:00Z', card: 'x' }]
  );
  const p = playsOf(a);
  assert.equal(p.length, 4);
  assert.deepEqual(p.map(x => x.result), ['won', 'lost', 'lost', 'won']);
  const r = recordOf(p);
  assert.equal(r.spent, 350);
  assert.equal(r.back, 800);
  assert.equal(r.net, 450);
  assert.equal(r.won, 2);
  assert.equal(r.lost, 2);
  assert.equal(r.hit, 0.5);
  assert.equal(r.biggestLoss.net, -100);
  assert.equal(r.biggestWin.net, 400);
  assert.deepEqual(r.bySport.map(g => [g.key, g.net]), [['scratch', 400], ['soccer', 100], ['lottery', -50]]);
});

test('a losing record shows as a loss, never trimmed to the wins', () => {
  const r = recordOf(playsOf(acct([slip(1, { payout: 150 }), slip(2), slip(3), slip(4)])));
  assert.equal(r.net, -250);
  assert.equal(r.returned, 150 / 400);
  assert.deepEqual([r.runs.won, r.runs.lost, r.runs.now.won, r.runs.now.n], [1, 3, false, 3]);
});

test('a paid slip that came back with less than it cost is a loss', () => {
  const [p] = playsOf(acct([slip(1, { cost: 100, payout: 80, legs: [leg('won')] })]));
  assert.equal(p.result, 'lost');
});

test('refunds are even: in the money, out of the hit rate and runs', () => {
  const s = [slip(1, { payout: 300 }), slip(2, { payout: 100, legs: [leg('void')] }), slip(3, { payout: 300 }), slip(4, { refunded: true, payout: 100, legs: [] })];
  const p = playsOf(acct(s));
  const r = recordOf(p);
  assert.equal(p.filter(x => x.result === 'even').length, 2);
  assert.equal(r.hit, 1);
  assert.equal(r.runs.won, 2);
  assert.equal(r.net, 400);
});

test('since filters by when it was decided; empty account is empty', () => {
  const a = acct([slip(1), slip(3)]);
  assert.equal(playsOf(a, Date.parse('2026-01-02T00:00:00Z')).length, 1);
  assert.deepEqual(playsOf(null), []);
  const r = recordOf([]);
  assert.equal(r.hit, null);
  assert.equal(r.returned, null);
  assert.deepEqual(runsOf([]), { won: 0, lost: 0, now: { won: false, n: 0 } });
});

test('void picks are not counted as picks', () => {
  const [p] = playsOf(acct([slip(1, { payout: 250, legs: [leg('won'), leg('void'), leg('void')] })]));
  assert.equal(p.legs, 1);
});
