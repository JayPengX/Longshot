// Why a pick is sold only in a parlay, as the slip says it (a Mac tester's
// 1.06 on 單場 said only "needs a parlay of 3+ games"): its short odds, with
// them, or its game's own 限關 (the kit's eventMinLegs, 投注規範 §21).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as rules from '../public/lib/rules.mjs';
import { minLegsWhy } from '../public/lib/slip.mjs';
import { STRINGS, makeT } from '../public/lib/i18n.mjs';


test("a short price's 限關 says it comes from the odds, with them", () => {
  const bet = rules.withRules({ kind: 'ml', estOdds: 1.2 });
  assert.equal(minLegsWhy(rules.withRules({ kind: 'ml', estOdds: 1.9 })), null);
  assert.equal(bet.minLegs, 2);
  assert.deepEqual(minLegsWhy(bet), { from: 'odds', n: 2, odds: 1.2 });
  const zh = makeT('zh');
  assert.equal(zh('minLegsNote', { n: 3, odds: '1.06' }), '賠率 1.06 偏低：只能串 3 關以上');
  assert.equal(zh('slipError_minLegsOdds', { need: 3, odds: '1.06', pick: '' }), '賠率 1.06 偏低：只能串 3 關以上');
  assert.match(makeT('en')('slipError_minLegsOdds', { need: 3, odds: '1.06', pick: '' }), /1\.06.*3\+/);
});

test("a game's own minimum says it comes from the game, whatever its price", () => {
  const zh = makeT('zh');
  assert.equal(zh('minLegsNoteEvent', { n: 2 }), '這場比賽限串 2 關以上');
  assert.equal(zh('slipError_minLegsEvent', { need: 3, pick: '' }), '這場比賽限串 3 關以上');
  // A game sold 限3關 at 1.90 (no price band would limit it), and 限2關 at 1.06 (the game's minimum wins).
  const at = (odds, minLegs) => rules.withRules({ kind: 'ml', estOdds: odds, game: { minLegs } });
  assert.deepEqual(minLegsWhy(at(1.9, 3)), { from: 'event', n: 3 });
  assert.deepEqual(minLegsWhy(at(1.06, 2)), { from: 'event', n: 2 });
  assert.equal(at(1.06, 2).minLegs, 2);
  assert.deepEqual(rules.houseRule('ml', 1.9, { event: 3 }), { lock: null, minLegs: 3 });
});

test('every minimum message is in both languages and says 關 in Chinese', () => {
  for (const k of ['minLegsNote', 'minLegsNoteEvent', 'slipError_minLegsOdds', 'slipError_minLegsEvent']) {
    assert.ok(STRINGS.zh[k] && STRINGS.en[k], k);
    assert.match(STRINGS.zh[k], /關/, k);
  }
  assert.doesNotMatch(STRINGS.zh.minLegsNoteEvent, /賠率/);
});

// 運彩's boards on 2026-10-26 at 10:47 Taipei (the owner's screenshots): each game's badge.
test("運彩's usual 限關 is read off its boards: second division 3, play-offs 1, top leagues by the favourite, the rest by the day", () => {
  const now = Date.parse('2026-10-26T02:47:00Z');
  const est = o => rules.estimatedMinLegs({ kind: 'ml', ...o }, now) ?? 1;
  const serieA = [[1.95, 1], [1.6, 1], [1.25, 2], [1.5, 2], [1.24, 2], [2.2, 1], [1.65, 1], [1.55, 2]];
  for (const [fav, n] of serieA) assert.equal(est({ sport: 'seriea', favOdds: fav, start: '2026-10-28T19:30:00Z' }), n, `義甲 ${fav}`);
  assert.equal(est({ sport: 'laliga', favOdds: 1.75, start: '2026-10-26T20:00:00Z' }), 1);
  assert.equal(est({ sport: 'ligue1', favOdds: 1.26, start: '2026-10-26T19:30:00Z' }), 2);
  assert.equal(est({ sport: 'championship', favOdds: 1.85, start: '2026-10-26T20:00:00Z' }), 3);
  assert.equal(est({ sport: 'mlb', start: '2026-10-27T00:00:00Z', game: { postseason: true } }), 1);
  assert.equal(est({ sport: 'nba', start: '2026-10-26T23:00:00Z' }), 2);
  assert.equal(est({ sport: 'nba', start: '2026-10-26T09:00:00Z' }), 1);
  assert.equal(est({ id: 'live|x', sport: 'mls', start: '2026-10-26T01:00:00Z' }), 1);
});

test("a play-off game read off ESPN keeps its flag through the merge, so its win bets sell as singles", async () => {
  const { mergeGames } = await import('../public/kit/play-sources.mjs');
  const espn = { sport: 'mlb', startUtc: '2099-10-27T00:00:00.000Z', away: 'Milwaukee Brewers', home: 'Tampa Bay Rays', outcomes: { away: 0.45, home: 0.55 }, total: null, spread: null, postseason: true };
  const [g] = mergeGames([espn], []);
  assert.equal(g.postseason, true);
  assert.equal(rules.estimatedMinLegs({ kind: 'ml', sport: 'mlb', start: g.startUtc, game: g }), null);
  assert.equal(rules.estimatedMinLegs({ kind: 'ml', sport: 'mlb', start: g.startUtc, game: { ...g, postseason: undefined } }), 2);
});

// Every game on 運彩 at 11:05 Taipei 2026-10-26 (the owner's screenshots), the leagues Longshot sells.
test("the second board agrees: 義甲 by its favourite on other days, MLS 2, and a soccer game is no single on its own day", () => {
  const now = Date.parse('2026-10-26T03:05:00Z');
  const est = o => rules.estimatedMinLegs({ kind: 'ml', ...o }, now) ?? 1;
  const serieA = [['2026-10-27T17:30:00Z', 1.95, 1], ['2026-10-27T19:45:00Z', 1.6, 1], ['2026-10-27T19:45:00Z', 1.26, 2], ['2026-10-28T17:30:00Z', 1.24, 2], ['2026-10-28T17:30:00Z', 1.5, 2], ['2026-10-28T17:30:00Z', 2.2, 1], ['2026-10-28T19:45:00Z', 1.65, 1], ['2026-10-28T19:45:00Z', 1.55, 2]];
  for (const [start, fav, n] of serieA) assert.equal(est({ sport: 'seriea', favOdds: fav, start }), n, `義甲 ${fav}`);
  assert.equal(est({ sport: 'ligue1', favOdds: 1.26, start: '2026-10-26T19:30:00Z' }), 2);
  for (const fav of [1.4, 1.8, 1.45, 1.75, 1.65, 1.5]) assert.equal(est({ sport: 'mls', favOdds: fav, start: '2026-10-28T23:30:00Z' }), 2);
  // On its own day (Taipei) a soccer game keeps its 限關 (an MLS game tonight: 2, not a single).
  assert.equal(est({ sport: 'mls', favOdds: 1.7, start: '2026-10-26T12:00:00Z' }), 2);
  assert.equal(est({ sport: 'championship', favOdds: 2.1, start: '2026-10-26T12:00:00Z' }), 3);
  assert.equal(est({ sport: 'nhl', start: '2026-10-26T12:00:00Z' }), 1);
});
