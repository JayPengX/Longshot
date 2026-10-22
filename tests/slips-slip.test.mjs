// The ticket's rules and payouts (Taiwan Sports Lottery's).
import test from 'node:test';
import assert from 'node:assert/strict';
import { canPay, comboCount, decidedEarly, evaluate, grade, modeName, settle, slipErrors, slipSizes } from '../public/slips/lib/slip.mjs';

const leg = (id, odds, win, push = 0) => ({ gameId: id, odds, chance: { win, push } });

test('3串4 buys every two and the three; a single buys each pick alone', () => {
  const legs = [leg('a', 2, 0.5), leg('b', 2, 0.5), leg('c', 2, 0.5)];
  assert.deepEqual(slipSizes('system', 3, [2, 3]), [2, 3]);
  assert.equal(comboCount(legs, [2, 3]), 4);
  assert.equal(modeName('system', legs, [2, 3]), '3串4');
  assert.equal(modeName('parlay', legs, [3]), '3串1');
  assert.equal(modeName('single', legs, [1]), '單場 ×3');
});

test('two picks of one game never share a combination', () => {
  const legs = [leg('a', 2, 0.5), leg('a', 2, 0.5)];
  assert.deepEqual(slipErrors({ mode: 'parlay', legs, sizes: [2], stake: 100 }), ['sameGame']);
  assert.deepEqual(slipErrors({ mode: 'single', legs, sizes: [1], stake: 100 }), []);
});

test('a ticket costs at least NT$100 in NT$10 units', () => {
  const legs = [leg('a', 2, 0.5)];
  assert.ok(slipErrors({ mode: 'single', legs, sizes: [1], stake: 50 }).includes('ticketMin'));
  assert.ok(slipErrors({ mode: 'single', legs, sizes: [1], stake: 105 }).includes('stakeUnit'));
});

test("a parlay's average return is each pick's own, multiplied", () => {
  const legs = [leg('a', 1.75, 0.5), leg('b', 1.8, 0.5)];
  const v = evaluate({ legs, sizes: [2], stake: 100 });
  assert.equal(v.cost, 100);
  assert.ok(Math.abs(v.gross - 100 * 1.75 * 0.5 * 1.8 * 0.5) < 1e-9);
  assert.ok(Math.abs(v.take - (1 - 0.7875)) < 1e-9);
  assert.ok(Math.abs(v.any - 0.25) < 1e-9);
  assert.equal(v.best.gross, 315);
});

test('a void pick counts at 1.00: the parlay goes on without it', () => {
  const legs = [
    { gameId: 'a', odds: 2, result: 'won' },
    { gameId: 'b', odds: 3, result: 'void' }
  ];
  assert.equal(settle({ legs, sizes: [2], stake: 100 }).gross, 200);
  // …and a pick that may push is counted that way before it's decided.
  const v = evaluate({ legs: [leg('a', 2, 1), leg('b', 3, 0, 1)], sizes: [2], stake: 100 });
  assert.ok(Math.abs(v.gross - 200) < 1e-9);
});

test('a big parlay is taxed combination by combination', () => {
  const legs = [
    { gameId: 'a', odds: 25, result: 'won' },
    { gameId: 'b', odds: 25, result: 'won' }
  ];
  const r = settle({ legs, sizes: [2], stake: 100 });
  assert.equal(r.gross, 62500);
  assert.equal(r.net, 62500 - 12500);
});

test('a pick is graded on the final score: whole lines landing exactly are void', () => {
  assert.equal(grade({ kind: 'spread', side: 'home', line: -3 }, 24, 21), 'void');
  assert.equal(grade({ kind: 'spread', side: 'away', line: 3.5 }, 24, 21), 'won');
  assert.equal(grade({ kind: 'total', side: 'over', line: 7.5 }, 4, 4), 'won');
  assert.equal(grade({ kind: 'ml', side: 'draw' }, 1, 1), 'won');
  assert.equal(grade({ kind: 'oddeven', side: 'odd' }, 2, 1), 'won');
});

test('a ticket is over only when no combination it bought can still pay', () => {
  const l = (id, result = null) => ({ gameId: id, odds: 2, result });
  // A parlay with a pick lost: over.
  assert.equal(canPay({ legs: [l('a', 'lost'), l('b')], sizes: [2] }), false);
  // 3串4 with one lost: the other two's 2串1 can still pay.
  assert.equal(canPay({ legs: [l('a', 'lost'), l('b'), l('c')], sizes: [2, 3] }), true);
  // 3串1 only (system [3]) with one lost: over.
  assert.equal(canPay({ legs: [l('a', 'lost'), l('b'), l('c')], sizes: [3] }), false);
  // Singles: one lost, the other on.
  assert.equal(canPay({ legs: [l('a', 'lost'), l('b')], sizes: [1] }), true);
  assert.equal(canPay({ legs: [l('a', 'void'), l('b', 'void')], sizes: [2] }), true);
  assert.equal(canPay({ legs: [], sizes: [1] }), false);
});

test('a pick already decided by the score while the game is on (a total passed)', () => {
  assert.equal(decidedEarly({ kind: 'total', side: 'under', line: 2.5 }, 2, 1), 'lost');
  assert.equal(decidedEarly({ kind: 'total', side: 'over', line: 2.5 }, 2, 1), 'won');
  assert.equal(decidedEarly({ kind: 'total', side: 'over', line: 3 }, 2, 1), null, 'a whole line reached can still push or go over');
  assert.equal(decidedEarly({ kind: 'total', side: 'under', line: 3.5 }, 2, 1), null);
  assert.equal(decidedEarly({ kind: 'ml', side: 'home' }, 9, 0), null);
  assert.equal(decidedEarly({ kind: 'spread', side: 'home', line: -1.5 }, 9, 0), null);
  assert.equal(decidedEarly({ kind: 'oddeven', side: 'odd' }, 1, 0), null);
});

test('2串1 pays the two odds multiplied; 3串4 costs four combinations', () => {
  const legs = [
    { gameId: 'a', odds: 1.8, result: 'won' },
    { gameId: 'b', odds: 2.5, result: 'won' },
    { gameId: 'c', odds: 3, result: 'lost' }
  ];
  assert.ok(Math.abs(settle({ legs: legs.slice(0, 2), sizes: [2], stake: 100 }).gross - 450) < 1e-9);
  assert.equal(comboCount(legs, [2, 3]), 4);
  // 3串4 with the third lost: only the 2串1 of the first two pays.
  assert.ok(Math.abs(settle({ legs, sizes: [2, 3], stake: 100 }).gross - 450) < 1e-9);
  // All three won: three doubles and the treble.
  const all = legs.map(l => ({ ...l, result: 'won' }));
  assert.ok(Math.abs(settle({ legs: all, sizes: [2, 3], stake: 100 }).gross - (450 + 540 + 750 + 1350)) < 1e-9);
});

test('tax is per combination: which are taxed, counted', () => {
  const legs = [
    { gameId: 'a', odds: 25, result: 'won' },
    { gameId: 'b', odds: 25, result: 'won' },
    { gameId: 'c', odds: 1.5, result: 'won' }
  ];
  const r = settle({ legs, sizes: [2], stake: 10 });
  // a×b pays 6,250 a NT$10 (taxed), a×c and b×c 375 each (not).
  assert.equal(r.taxed, 1);
  assert.equal(r.gross, 7000);
  assert.equal(r.net, 5000 + 750);
});

test('a ticket pays at most NT$20 million, its tax scaled with it', () => {
  const legs = Array.from({ length: 6 }, (_, i) => ({ gameId: String(i), odds: 20, result: 'won' }));
  const r = settle({ legs, sizes: [6], stake: 1000 });
  assert.equal(r.gross, 20_000_000);
  assert.equal(r.net, 16_000_000);
});

test('two picks of one game: singles yes, never in one combination', () => {
  const legs = [
    { gameId: 'a', odds: 2, result: 'won' },
    { gameId: 'a', odds: 2, result: 'won' },
    { gameId: 'b', odds: 2, result: 'won' }
  ];
  // 2串1 combinations: a1×b and a2×b only.
  assert.equal(comboCount(legs, [2]), 2);
  assert.equal(settle({ legs, sizes: [2], stake: 100 }).gross, 800);
  assert.equal(settle({ legs, sizes: [1], stake: 100 }).gross, 600);
  assert.ok(slipErrors({ mode: 'parlay', legs, sizes: [3], stake: 100 }).includes('sameGame'));
});

test("a ticket's problems, each its code", () => {
  const legs = n => Array.from({ length: n }, (_, i) => ({ gameId: String(i), odds: 2 }));
  assert.deepEqual(slipErrors({ mode: 'single', legs: [], sizes: [], stake: 100 }), ['empty']);
  assert.ok(slipErrors({ mode: 'single', legs: legs(13), sizes: [1], stake: 10 }).includes('tooManyLegs'));
  assert.ok(slipErrors({ mode: 'parlay', legs: legs(1), sizes: [], stake: 100 }).includes('parlayNeedsTwo'));
  // 過關組合 takes 2 to 12 games (過1關 to 過12關), as 台灣運彩 sells it.
  assert.ok(slipErrors({ mode: 'system', legs: legs(1), sizes: [], stake: 100 }).includes('systemNeedsTwo'));
  assert.ok(slipErrors({ mode: 'system', legs: legs(2), sizes: [], stake: 100 }).includes('noSizes'));
  assert.ok(slipErrors({ mode: 'system', legs: legs(3), sizes: [], stake: 100 }).includes('noSizes'));
  assert.ok(slipErrors({ mode: 'single', legs: legs(2), sizes: [1], stake: 60_000 }).includes('ticketMax'));
  assert.ok(slipErrors({ mode: 'single', legs: [{ gameId: 'a', odds: 1 }], sizes: [1], stake: 100 }).includes('odds'));
  assert.ok(slipErrors({ mode: 'single', legs: [{ gameId: 'a' }], sizes: [1], stake: 100 }).includes('odds'));
  assert.ok(slipErrors({ mode: 'single', legs: legs(1), sizes: [1], stake: 0 }).includes('stakeUnit'));
  // 單場 ×10 at NT$10: NT$100, fine.
  assert.deepEqual(slipErrors({ mode: 'single', legs: legs(10), sizes: [1], stake: 10 }), []);
  assert.deepEqual(slipErrors({ mode: 'system', legs: legs(4), sizes: [2, 3], stake: 10 }), []);
});

test("the sizes each kind buys; the ticket's name in English", () => {
  assert.deepEqual(slipSizes('single', 3), [1]);
  assert.deepEqual(slipSizes('single', 0), []);
  assert.deepEqual(slipSizes('parlay', 4), [4]);
  assert.deepEqual(slipSizes('parlay', 1), []);
  assert.deepEqual(slipSizes('system', 4, [3, 2, 2, 5, 1, 0]), [1, 2, 3]);
  const legs = [{ gameId: 'a' }, { gameId: 'b' }, { gameId: 'c' }];
  assert.equal(modeName('system', legs, [2, 3], true), '3 legs · 4 bets');
  assert.equal(modeName('parlay', legs, [3], true), '3 legs · 1 bet');
  assert.equal(modeName('single', legs.slice(0, 1), [1], true), 'Single');
  assert.equal(modeName('single', legs, [1], true), 'Singles ×3');
});

test('every way a ticket lands: chances add up; a sure single; a pick that may push', () => {
  // A single at 1.9, a coin: half the time 190 back.
  const v = evaluate({ legs: [leg('a', 1.9, 0.5)], sizes: [1], stake: 100 });
  assert.ok(Math.abs(v.gross - 95) < 1e-9);
  assert.ok(Math.abs(v.any - 0.5) < 1e-9);
  assert.ok(Math.abs(v.profit - 0.5) < 1e-9);
  assert.ok(Math.abs(v.take - 0.05) < 1e-9);
  assert.equal(v.tax, 0);
  // A push gives the stake back: something paid, no profit.
  const p = evaluate({ legs: [leg('a', 1.9, 0, 1)], sizes: [1], stake: 100 });
  assert.equal(p.any, 1);
  assert.equal(p.profit, 0);
  assert.equal(p.gross, 100);
  // Nothing on it: nothing to divide by.
  const e = evaluate({ legs: [], sizes: [1], stake: 100 });
  assert.deepEqual([e.cost, e.take, e.tax, e.back, e.any], [0, 0, 0, 0, 0]);
  // A big parlay's tax comes off its average.
  const big = evaluate({ legs: [leg('a', 25, 1), leg('b', 25, 1)], sizes: [2], stake: 10 });
  assert.ok(Math.abs(big.tax - (6250 - 5000) / 10) < 1e-9);
  assert.equal(big.best.taxed, 1);
});

test('grading: every market, both sides, the edges', () => {
  assert.equal(grade({ kind: 'ml', side: 'away' }, 1, 2), 'won');
  assert.equal(grade({ kind: 'ml', side: 'home' }, 1, 1), 'lost');
  assert.equal(grade({ kind: 'ml', side: 'draw' }, 2, 1), 'lost');
  assert.equal(grade({ kind: 'spread', side: 'away', line: 3 }, 24, 21), 'void');
  assert.equal(grade({ kind: 'spread', side: 'away', line: 2.5 }, 24, 21), 'lost');
  assert.equal(grade({ kind: 'spread', side: 'home', line: 1.5 }, 3, 4), 'won');
  assert.equal(grade({ kind: 'total', side: 'under', line: 8 }, 5, 3), 'void');
  assert.equal(grade({ kind: 'total', side: 'under', line: 8.5 }, 5, 3), 'won');
  assert.equal(grade({ kind: 'oddeven', side: 'even' }, 0, 0), 'won');
  assert.equal(grade({ kind: 'oddeven', side: 'odd' }, 0, 0), 'lost');
  assert.equal(grade({ kind: 'ml', side: 'home' }, NaN, 1), null);
  assert.equal(grade({ kind: 'corners', side: 'home' }, 1, 1), null);
});

// 台灣運彩 投注規範: 單注 is NT$10, and only a 單注 paying over NT$5,000 (odds over
// 500) has 20% income tax withheld, in whole NT$ (no stamp duty); prizes are rounded to the NT$.
test('tax is per NT$10 單注: a combination is taxed only when its odds multiply past 500', () => {
  const won = (...odds) => odds.map((o, i) => ({ gameId: String(i), odds: o, result: 'won' }));
  // NT$100 on 10 × 10: NT$10,000 back, but each NT$10 pays 1,000: no tax.
  assert.deepEqual(settle({ legs: won(10, 10), sizes: [2], stake: 100 }), { gross: 10000, net: 10000, taxed: 0 });
  // NT$30,000 at 275 (the 2021 NT$16.5 million ticket): no tax.
  assert.equal(settle({ legs: won(275), sizes: [1], stake: 30000 }).net, 8_250_000);
  // Exactly 500: each NT$10 pays 5,000, not over it.
  assert.equal(settle({ legs: won(20, 25), sizes: [2], stake: 10 }).taxed, 0);
  // 25 × 25 = 625: NT$10 pays 6,250, less 1,250.
  assert.deepEqual(settle({ legs: won(25, 25), sizes: [2], stake: 10 }), { gross: 6250, net: 5000, taxed: 1 });
  assert.deepEqual(settle({ legs: won(25, 25), sizes: [2], stake: 100 }), { gross: 62500, net: 50000, taxed: 1 });
});

test('payouts are whole NT$, rounded half up, with no float drift', () => {
  const won = (...odds) => odds.map((o, i) => ({ gameId: String(i), odds: o, result: 'won' }));
  // 10 × 1.14 × 2.50 is 28.5 exactly: 29 (floats make it 28.4999…).
  assert.equal(settle({ legs: won(1.14, 2.5), sizes: [2], stake: 10 }).gross, 29);
  assert.equal(settle({ legs: won(1.15), sizes: [1], stake: 100 }).gross, 115);
  // Each combination rounded on its own: 10 × 1.05 × 1.05 = 11.025 → 11, three times, + 10 × 1.05³ = 11.57625 → 12.
  assert.equal(settle({ legs: won(1.05, 1.05, 1.05), sizes: [2, 3], stake: 10 }).gross, 45);
  // A 12-leg parlay stays exact past 2^53.
  const r = settle({ legs: won(...Array(12).fill(3.5)), sizes: [12], stake: 10 });
  assert.equal(r.gross, 20_000_000);
  assert.ok(Number.isInteger(r.net) && r.net === 20_000_000 - 4_000_000);
  // The best case, worked out the same way.
  const v = evaluate({ legs: [leg('a', 25, 1), leg('b', 25, 1)], sizes: [2], stake: 10 });
  assert.equal(v.best.net, 5000);
});

test('odds of 1 or less: one problem, said once', () => {
  assert.deepEqual(slipErrors({ mode: 'single', legs: [{ gameId: 'a', odds: 1 }], sizes: [1], stake: 100 }), ['odds']);
});

test('a 不讓分 pick on a tied Asian baseball game is void (stake back); a tie elsewhere still loses', async () => {
  const { grade } = await import('../public/slips/lib/slip.mjs');
  for (const league of ['cpbl', 'npb', 'kbo']) {
    assert.equal(grade({ kind: 'ml', side: 'home', game: { league } }, 3, 3), 'void');
    assert.equal(grade({ kind: 'ml', side: 'away', game: { league } }, 3, 3), 'void');
    assert.equal(grade({ kind: 'ml', side: 'home', game: { league } }, 4, 3), 'won');
  }
  assert.equal(grade({ kind: 'ml', side: 'home', game: { league: 'epl' } }, 1, 1), 'lost');
  assert.equal(grade({ kind: 'ml', side: 'draw', game: { league: 'epl' } }, 1, 1), 'won');
  assert.equal(grade({ kind: 'ml', side: 'home', game: { league: 'mlb' } }, 2, 2), 'lost');
});

test('4串15 buys the singles too: 4 + 6 + 4 + 1 combinations, NT$1,500 at NT$100', () => {
  const legs = [leg('a', 2, 0.5), leg('b', 2, 0.5), leg('c', 2, 0.5), leg('d', 2, 0.5)];
  assert.deepEqual(slipSizes('system', 4, [4, 3, 2, 1]), [1, 2, 3, 4]);
  assert.equal(comboCount(legs, [1, 2, 3, 4]), 15);
  assert.equal(modeName('system', legs, [1, 2, 3, 4]), '4串15');
  assert.deepEqual(slipErrors({ mode: 'system', legs, sizes: [1, 2, 3, 4], stake: 100 }), []);
  assert.equal(evaluate({ legs, sizes: [1, 2, 3, 4], stake: 100 }).cost, 1500);
  // All four win at 2.0: 4×200 + 6×400 + 4×800 + 1×1600.
  assert.equal(settle({ legs: legs.map(l => ({ ...l, result: 'won' })), sizes: [1, 2, 3, 4], stake: 100 }).gross, 800 + 2400 + 3200 + 1600);
  // One lost: its singles and every combination holding it are out; 3 singles, 3 doubles, 1 treble pay.
  const one = legs.map((l, i) => ({ ...l, result: i === 0 ? 'lost' : 'won' }));
  assert.equal(settle({ legs: one, sizes: [1, 2, 3, 4], stake: 100 }).gross, 600 + 1200 + 800);
  assert.equal(canPay({ legs: one, sizes: [1, 2, 3, 4] }), true);
});

test('a single is taxed alone, only where NT$10 pays over NT$5,000 (odds past 500)', () => {
  const legs = [leg('a', 600, 0.5), leg('b', 2, 0.5)];
  const r = settle({ legs: legs.map(l => ({ ...l, result: 'won' })), sizes: [1, 2], stake: 100 });
  // 100×600 = 60,000 (taxed) + 100×2 + parlay 100×1200 (taxed) = 120,200 gross.
  assert.equal(r.gross, 60_000 + 200 + 120_000);
  assert.equal(r.taxed, 2);
});

test('with 過1關 two games make a 組合 (2串3); 過1關 alone is just 單場', () => {
  const legs = n => Array.from({ length: n }, (_, i) => ({ gameId: String(i), odds: 2 }));
  assert.deepEqual(slipErrors({ mode: 'system', legs: legs(2), sizes: [1, 2], stake: 100 }), []);
  assert.equal(modeName('system', legs(2), [1, 2]), '2串3');
  assert.ok(slipErrors({ mode: 'system', legs: legs(1), sizes: [1], stake: 100 }).includes('systemNeedsTwo'));
  assert.ok(slipErrors({ mode: 'system', legs: legs(4), sizes: [1], stake: 100 }).includes('noSizes'));
  assert.ok(slipErrors({ mode: 'system', legs: legs(2), sizes: [], stake: 100 }).length > 0);
});

test("tax goes by the 單注's prize rounded to the NT$, as the kit settles: 3.00 × 11.40 × 14.62 (500.004) pays NT$10 just NT$5,000, untaxed", () => {
  const legs = [3, 11.4, 14.62].map((odds, i) => ({ odds, gameId: `g${i}`, result: 'won' }));
  assert.deepEqual(settle({ legs, sizes: [3], stake: 100 }), { gross: 50000, net: 50000, taxed: 0 });
  // Just past: 3.00 × 11.40 × 14.63 (500.346) pays NT$10 NT$5,003, taxed.
  const over = [3, 11.4, 14.63].map((odds, i) => ({ odds, gameId: `g${i}`, result: 'won' }));
  assert.deepEqual(settle({ legs: over, sizes: [3], stake: 100 }), { gross: 50035, net: 40028, taxed: 1 });
});

test("soccer's 讓分 on a whole goal is three ways: on the line it's 讓分和, never a refund", () => {
  const epl = { league: 'epl' };
  // Home gives one (主 -1): 2-0 home, 1-0 讓分和, 1-1 away.
  assert.equal(grade({ kind: 'spread', side: 'home', line: -1, game: epl }, 2, 0), 'won');
  assert.equal(grade({ kind: 'spread', side: 'home', line: -1, game: epl }, 1, 0), 'lost');
  assert.equal(grade({ kind: 'spread', side: 'away', line: 1, game: epl }, 1, 0), 'lost');
  assert.equal(grade({ kind: 'spread', side: 'draw', line: -1, game: epl }, 1, 0), 'won');
  assert.equal(grade({ kind: 'spread', side: 'draw', line: -1, game: epl }, 1, 1), 'lost');
  assert.equal(grade({ kind: 'spread', side: 'away', line: 1, game: epl }, 1, 1), 'won');
  // Other sports keep the push on a whole line.
  assert.equal(grade({ kind: 'spread', side: 'home', line: -4, game: { league: 'nba' } }, 104, 100), 'void');
});
