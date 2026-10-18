// The slip in numbers (lib/slip.mjs): the slip being made is judged as the
// Worker will judge it (price.js checkSlip), and its bar says what the slip
// says; a slip bought shows what it has locked in, can pay and where it stands.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slipQuote, quoteAllPays, singlesPays, ticketErrors, ruleLeg, slipRange, slipsMost, legState, slipEndedAt, slipGroupKey } from '../public/lib/slip.mjs';
import { slipErrors, SLIP_RULES, comboCount } from '../public/lib/odds.mjs';

const bet = (gameId, odds, extra = {}) => ({ id: `${gameId}|ml|home`, gameId, kind: 'ml', side: 'home', estOdds: odds, fairChance: 0.9 / odds, ...extra });

test("a capped pick (a player's, a house-priced game's) caps the ticket on the slip, as the Worker refuses it", () => {
  const legs = [bet('g1', 2.1, { cap: 'prop', kind: 'prop' }), bet('g2', 1.9)];
  // NT$2,000 on a parlay with a player's pick: over the NT$1,000 cap. The
  // slip once left `cap` out of its legs and showed no problem; the Worker,
  // reading the house's own bets, refused it (這張沒有下注).
  const q = slipQuote({ bets: legs, mode: 'parlay', stake: 2000 });
  assert.ok(q.errors.includes('ticketCapped'));
  assert.deepEqual(q.legs.map(l => l.cap), ['prop', null]);
  // The Worker's own check on the same legs says the same.
  assert.ok(slipErrors({ mode: 'parlay', legs: q.legs, sizes: q.sizes, stake: 2000 }).includes('ticketCapped'));
  assert.deepEqual(slipQuote({ bets: legs, mode: 'parlay', stake: SLIP_RULES.capped }).errors, []);
  // A house-priced single too.
  assert.ok(slipQuote({ bets: [bet('g3', 2, { cap: 'house' })], mode: 'single', stake: 1500 }).errors.includes('ticketCapped'));
});

test('singles are judged one slip a pick, as each is placed', () => {
  const legs = [bet('g1', 2), bet('g2', 2.4)];
  // NT$50 a single: two NT$50 slips, each under the NT$100 minimum (the slip
  // added them up to NT$100 and let it through; the Worker refused each).
  assert.ok(slipQuote({ bets: legs, mode: 'single', stake: 50 }).errors.includes('ticketMin'));
  assert.deepEqual(slipQuote({ bets: [bet('g1', 2)], mode: 'single', stake: 50 }).errors, ['ticketMin']);
  // Twelve singles of NT$10,000: twelve tickets within the NT$100,000 a ticket.
  const twelve = Array.from({ length: 12 }, (_, i) => bet(`g${i}`, 1.8));
  const q = slipQuote({ bets: twelve, mode: 'single', stake: 10_000 });
  assert.deepEqual(q.errors, []);
  assert.equal(q.cost, 120_000);
  // One capped pick among singles caps only its own slip.
  const mixed = [bet('g1', 2, { cap: 'prop' }), bet('g2', 2)];
  assert.deepEqual(slipQuote({ bets: mixed, mode: 'single', stake: 1000 }).errors, []);
  assert.deepEqual(slipQuote({ bets: mixed, mode: 'single', stake: 1200 }).errors, ['ticketCapped']);
  // Thirteen picks is too many however they're bought; an empty slip is empty.
  assert.ok(slipQuote({ bets: [...twelve, bet('gx', 2)], mode: 'single', stake: 100 }).errors.includes('tooManyLegs'));
  assert.deepEqual(slipQuote({ bets: [], mode: 'single', stake: 100 }).errors, ['empty']);
  // A locked pick or a parlay-only one stops its own single.
  assert.ok(ticketErrors({ mode: 'single', legs: [ruleLeg(bet('g1', 1.1, { minLegs: 3 })), ruleLeg(bet('g2', 2))], sizes: [1], stake: 100 }).includes('minLegs'));
});

test('the slip bar and the slip agree: a system bet costs every combination', () => {
  const legs = [bet('g1', 2), bet('g2', 2), bet('g3', 2)];
  const q = slipQuote({ bets: legs, mode: 'system', chosen: new Set([2, 'all']), stake: 100, boost: 1 });
  assert.deepEqual(q.sizes, [2, 3]);
  // 3 doubles and the treble: NT$400 (the bar once showed a parlay's NT$100).
  assert.equal(q.cost, 400);
  assert.equal(q.cost, comboCount(q.legs, q.sizes) * 100);
  // All three won: 3 × 400 + 800 × 1.05 (the treble's boost on its winnings).
  assert.equal(Math.round(quoteAllPays(q)), 3 * 400 + Math.round(100 + 700 * 1.05));
  // A system needs three; 'all' follows the number of picks.
  assert.ok(slipQuote({ bets: legs.slice(0, 2), mode: 'system', chosen: ['all'], stake: 100 }).errors.includes('systemNeedsThree'));
  // Singles take no boost.
  assert.equal(slipQuote({ bets: legs, mode: 'single', stake: 100, boost: 1.5 }).boost, 0);
});

test('a free bet on the slip: one single or one parlay, odds long enough, the rest paid from the balance', () => {
  const free = { id: 'eco:fb:w1', value: 200 };
  // A parlay at 1.3 × 1.3 = 1.69: on; the stake never below the free bet.
  const q = slipQuote({ bets: [bet('g1', 1.3), bet('g2', 1.3)], mode: 'parlay', stake: 100, free });
  assert.equal(q.freeOn, true);
  assert.equal(q.stake, 200);
  assert.equal(q.cost, 0);
  assert.equal(q.free, free);
  // More than the free bet: the rest from the balance.
  assert.equal(slipQuote({ bets: [bet('g1', 2)], mode: 'single', stake: 500, free }).cost, 300);
  // All correct pays the winnings only: 200 × 1.69 − 200.
  assert.equal(Math.round(quoteAllPays(q)), Math.round(200 * 1.69 - 200));
  // Too short (1.2 × 1.2 = 1.44): off, and the slip is an ordinary one.
  const short = slipQuote({ bets: [bet('g1', 1.2), bet('g2', 1.2)], mode: 'parlay', stake: 100, free });
  assert.deepEqual([short.freeShape, short.freeOn, short.cost, short.free], [true, false, 100, null]);
  // Two singles are two slips: no free bet on them.
  const two = slipQuote({ bets: [bet('g1', 2), bet('g2', 2)], mode: 'single', stake: 100, free });
  assert.deepEqual([two.freeShape, two.freeOn, two.cost], [false, false, 200]);
  // A free bet's value isn't held to the stake unit or the minimum (the Worker's rule too).
  const odd = slipQuote({ bets: [bet('g1', 2)], mode: 'single', stake: 0, free: { id: 'x', value: 55 } });
  assert.deepEqual(odd.errors, []);
});

test('a slip bought: what it has locked in and can still pay, free bets their winnings only', () => {
  const slip = { mode: 'system', sizes: [2], stake: 100, legs: [{ gameId: 'a', odds: 2, result: 'won' }, { gameId: 'b', odds: 3, result: null }, { gameId: 'c', odds: 1.5, result: 'lost' }] };
  const r = slipRange(slip);
  // Locked in: nothing (a×b lost with b, a×c lost, b×c lost); most: a×b = 600.
  assert.equal(r.locked, 0);
  assert.equal(Math.round(r.most), 600);
  const free = { mode: 'single', sizes: [1], stake: 200, free: 'fb', freeValue: 200, legs: [{ gameId: 'a', odds: 2.5, result: null }] };
  assert.deepEqual(slipRange(free), { locked: 0, most: 300 });
  assert.equal(Math.round(slipsMost([slip, free])), 900);
  // A dead parlay can pay nothing.
  assert.equal(slipRange({ mode: 'parlay', sizes: [2], stake: 100, legs: [{ gameId: 'a', odds: 2, result: 'lost' }, { gameId: 'b', odds: 2, result: null }] }).most, 0);
});

test("where a pick and a slip stand, and the day a settled slip is filed under (Taiwan's)", () => {
  const now = Date.parse('2026-10-18T12:00:00Z');
  assert.equal(legState({ result: 'void' }, now), 'void');
  assert.equal(legState({ start: '2026-10-18T11:00:00Z' }, now), 'live');
  assert.equal(legState({ start: '2026-10-18T13:00:00Z' }, now), 'waiting');
  assert.equal(legState({ kind: 'future' }, now), 'waiting');
  const open = (legs, extra = {}) => ({ id: 's', status: 'open', mode: 'parlay', sizes: [legs.length], stake: 100, legs, ...extra });
  assert.equal(slipGroupKey(open([{ gameId: 'a', odds: 2, start: '2026-10-18T11:00:00Z' }, { gameId: 'b', odds: 2, start: '2026-10-19T11:00:00Z' }]), now), 'live');
  assert.equal(slipGroupKey(open([{ gameId: 'a', odds: 2, start: '2026-10-19T11:00:00Z' }, { gameId: 'b', odds: 2, start: '2026-10-19T11:00:00Z' }]), now), 'waiting');
  assert.equal(slipGroupKey(open([{ gameId: 'a', odds: 2, result: 'lost' }, { gameId: 'b', odds: 2, start: '2026-10-19T11:00:00Z' }]), now), 'dead');
  assert.equal(slipGroupKey({ id: 'r', status: 'settled', recovered: true, legs: [] }, now), 'recovered');
  // Its last game at 23:30 Taiwan on the 17th (15:30Z), settled the next
  // morning: filed under the 17th, by Taiwan's day, not UTC's or the settling.
  const settled = { status: 'settled', t: '2026-10-17T01:00:00Z', settledAt: '2026-10-18T02:00:00Z', legs: [{ start: '2026-10-17T10:00:00Z' }, { start: '2026-10-17T15:30:00Z' }] };
  assert.equal(slipEndedAt(settled), '2026-10-17T15:30:00Z');
  assert.equal(slipGroupKey(settled, now), 'day|2026-10-17');
  // A game at 00:30 Taiwan (16:30Z the day before) is that Taiwan day's.
  assert.equal(slipGroupKey({ ...settled, legs: [{ start: '2026-10-17T16:30:00Z' }] }, now), 'day|2026-10-18');
  // Settled before its listed start (a postponed game, a cash out): the settling's day.
  assert.equal(slipEndedAt({ ...settled, settledAt: '2026-10-17T05:00:00Z' }), '2026-10-17T05:00:00Z');
  // No settling time: when it was bought.
  assert.equal(slipEndedAt({ t: '2026-10-01T00:00:00Z', legs: [] }), '2026-10-01T00:00:00Z');
});

test('singles are paid one ticket each: each its own NT$20M cap, the bar adds them up', () => {
  // Two championship picks at 500.00, NT$100,000 a single: each NT$50M,
  // capped at NT$20M and taxed (20.4%) on its own ticket. The bar once
  // capped the two together, as one ticket: NT$15.92M for both.
  const legs = [bet('f1', 500, { kind: 'future' }), bet('f2', 500, { kind: 'future' })];
  const q = slipQuote({ bets: legs, mode: 'single', stake: 100_000 });
  assert.deepEqual(q.errors, []);
  const each = SLIP_RULES.maxPayout * (1 - SLIP_RULES.taxRate - SLIP_RULES.stampRate);
  assert.deepEqual(singlesPays(q).map(Math.round), [each, each]);
  assert.equal(Math.round(quoteAllPays(q)), 2 * each);
  // Under the cap, the same as before: 2 × afterTax(100 × 2).
  assert.equal(Math.round(quoteAllPays(slipQuote({ bets: [bet('g1', 2), bet('g2', 2)], mode: 'single', stake: 100 }))), 400);
});

test('every problem the ticket rules can name has its words in Chinese and English', async () => {
  const { readFile } = await import('node:fs/promises');
  const { STRINGS } = await import('../public/lib/i18n.mjs');
  const src = await readFile(new URL('../.kit/play-odds.mjs', import.meta.url), 'utf8');
  const codes = new Set([...src.matchAll(/errors\.push\('(\w+)'\)/g)].map(m => m[1]));
  codes.add('empty');
  assert.ok(codes.has('ticketMax'));
  for (const lang of ['zh', 'en']) for (const code of codes) assert.ok(STRINGS[lang][`slipError_${code}`], `${lang} slipError_${code}`);
});
