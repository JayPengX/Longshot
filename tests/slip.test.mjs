// The slip in numbers (lib/slip.mjs): the slip being made is judged as the
// Worker will judge it (price.js checkSlip), and its bar says what the slip
// says; a slip bought shows what it has locked in, can pay and where it stands.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as kitOdds from '../public/lib/odds.mjs';
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
  const q = slipQuote({ bets: legs, mode: 'system', chosen: new Set([2, 'all']), stake: 100 });
  assert.deepEqual(q.sizes, [2, 3]);
  // 3 doubles and the treble: NT$400 (the bar once showed a parlay's NT$100).
  assert.equal(q.cost, 400);
  assert.equal(q.cost, comboCount(q.legs, q.sizes) * 100);
  // All three won: the three doubles' 3 × 400 and the treble's 800.
  assert.equal(Math.round(quoteAllPays(q)), 3 * 400 + 800);
  // A system needs two games (台灣運彩's 過關組合); 'all' follows the number of picks.
  assert.ok(slipQuote({ bets: legs.slice(0, 1), mode: 'system', chosen: ['all'], stake: 100 }).errors.includes('systemNeedsTwo'));
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
  // capped at NT$20M and taxed on its own ticket (as the kit taxes it). The bar
  // once capped the two together, as one ticket: NT$15.92M for both.
  const legs = [bet('f1', 500, { kind: 'future' }), bet('f2', 500, { kind: 'future' })];
  const q = slipQuote({ bets: legs, mode: 'single', stake: 100_000 });
  assert.deepEqual(q.errors, []);
  const each = Math.round(kitOdds.afterTax(SLIP_RULES.maxPayout, 100_000));
  assert.deepEqual(singlesPays(q).map(Math.round), [each, each]);
  assert.equal(Math.round(quoteAllPays(q)), 2 * each);
  // Under the cap, the same as before: 2 × afterTax(100 × 2).
  assert.equal(Math.round(quoteAllPays(slipQuote({ bets: [bet('g1', 2), bet('g2', 2)], mode: 'single', stake: 100 }))), 400);
});

test('every problem the ticket rules can name has its words in Chinese and English', async () => {
  const { readFile } = await import('node:fs/promises');
  const { STRINGS } = await import('../public/lib/i18n.mjs');
  const src = await readFile(new URL('../public/kit/play-odds.mjs', import.meta.url), 'utf8');
  const codes = new Set([...src.matchAll(/errors\.push\('(\w+)'\)/g)].map(m => m[1]));
  codes.add('empty');
  assert.ok(codes.has('ticketMax'));
  for (const lang of ['zh', 'en']) for (const code of codes) assert.ok(STRINGS[lang][`slipError_${code}`], `${lang} slipError_${code}`);
});

import { dropPicks } from '../public/lib/slip.mjs';
test('dropPicks takes picks off the slip and forgets their picked odds', () => {
  const r = dropPicks({ parlay: ['a', 'b', 'c'], pickedOdds: { a: 1.5, b: 2, c: 3, z: 9 } }, ['a', 'c']);
  assert.deepEqual(r.parlay, ['b']);
  assert.deepEqual(r.pickedOdds, { b: 2, z: 9 });
  const same = { parlay: ['a'], pickedOdds: { a: 1 } };
  assert.deepEqual(dropPicks(same, []), same);
});

test("the pay box's totals: a parlay's tax, singles as their own tickets", async () => {
  const { payoutTotals } = await import('../public/lib/slip.mjs');
  const leg = (gameId, odds) => ({ gameId, odds, kind: 'ml' });
  // A treble at 10 × 10 × 2 for NT$1,000: 200,000 before tax.
  const treble = payoutTotals({ legs: [leg('a', 10), leg('b', 10), leg('c', 2)], sizes: [3], stake: 1000, mode: 'parlay' });
  assert.equal(treble.combos, 1);
  assert.equal(treble.cost, 1000);
  // Taxed as the kit taxes it (台灣運彩's: only past NT$5,000 a NT$10 bet, so not this one).
  assert.equal(treble.taxed, kitOdds.afterTax(treble.allGross, 1000) < treble.allGross - 0.5);
  assert.equal(treble.allNet < treble.allGross, treble.taxed);
  // Two NT$100,000 singles at 500.00: each its own NT$20M cap, so 40M before tax.
  const singles = payoutTotals({ legs: [leg('a', 500), leg('b', 500)], sizes: [1], stake: 100000, mode: 'single' });
  assert.equal(singles.allGross, 40_000_000);
  assert.equal(singles.least, Math.min(...singles.each));
  assert.equal(singles.allTaxed, singles.each[0] + singles.each[1]);
});

// 台灣運彩 (投注規範 第 34 條): a void pick's odds are 1 in a parlay; every pick void, the stake back.
test('parlayOdds counts a void pick at 1; allVoid only when every pick is void', async () => {
  const { parlayOdds, allVoid } = await import('../public/lib/slip.mjs');
  const legs = [{ odds: 2, result: 'won' }, { odds: 3, result: 'void' }, { odds: 1.5 }];
  assert.equal(parlayOdds({ legs }), 3);
  assert.equal(allVoid({ legs }), false);
  assert.equal(allVoid({ legs: [{ odds: 2, result: 'void' }, { odds: 3, result: 'void' }] }), true);
  assert.equal(allVoid({ legs: [] }), false);
});

// 台灣運彩 (投注規範 第 20、32 條, https://article.sportslottery.com.tw/zh-tw/about-us/135):
// betting closes at the listed start; a game postponed or cancelled has its
// picks void. Past its listed start, a pick isn't 'live' unless the game is.
test('legState: a called-off game is off, one not begun past its start is late', () => {
  const now = Date.parse('2026-10-18T12:00:00Z');
  const leg = { start: '2026-10-18T11:00:00Z' };
  assert.equal(legState(leg, now, { status: 'void' }), 'off');
  assert.equal(legState(leg, now, { status: 'pending', state: 'pre' }), 'late');
  assert.equal(legState(leg, now, { status: 'pending', state: 'in' }), 'live');
  assert.equal(legState(leg, now, null), 'live');
  assert.equal(legState({ ...leg, result: 'won' }, now, { status: 'void' }), 'won');
  assert.equal(legState({ start: '2026-10-18T13:00:00Z' }, now, { status: 'void' }), 'waiting');
  const s = { id: 's', status: 'open', mode: 'parlay', sizes: [2], stake: 100, legs: [{ gameId: 'a', odds: 2, ...leg, id: 'x' }, { gameId: 'b', odds: 2, start: '2026-10-19T11:00:00Z', id: 'y' }] };
  assert.equal(slipGroupKey(s, now), 'live');
  assert.equal(slipGroupKey(s, now, id => (id === 'x' ? { status: 'void' } : null)), 'waiting');
});
