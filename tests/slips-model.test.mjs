// The chance each pick lands, before and during the game.
import test from 'node:test';
import assert from 'node:assert/strict';
import { americanChance, devig, fitGame, leftOf, marketChance, marketOf, marketOfPickcenter, pickChance, SPORT, lotteryOdds, chanceFromOdds } from '../public/slips/lib/model.mjs';

const near = (a, b, e = 0.01) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);

test("American odds' margin comes out", () => {
  near(americanChance('+140'), 100 / 240, 1e-9);
  near(americanChance('-170'), 170 / 270, 1e-9);
  const [a, b] = devig([americanChance('-110'), americanChance('-110')]);
  near(a, 0.5, 1e-9);
  near(b, 0.5, 1e-9);
});

test('how much of a game is left, sport by sport', () => {
  near(leftOf(SPORT.nba, { state: 'in', period: 4, clock: '6:00' }), 6 / 48, 1e-9);
  // (The bottom of the 7th under way: its half of it, the 8th and the 9th.)
  near(leftOf(SPORT.mlb, { state: 'in', detail: 'Bot 7th' }), 4.5 / 18, 1e-9);
  near(leftOf(SPORT.mlb, { state: 'in', detail: 'Mid 3rd' }), 13 / 18, 1e-9);
  near(leftOf(SPORT.soccer, { state: 'in', clock: "67'" }), 23 / 90, 1e-9);
  near(leftOf(SPORT.soccer, { state: 'in', detail: 'HT', clock: "45'" }), 0.5, 1e-9);
  assert.equal(leftOf(SPORT.nhl, { state: 'pre' }), 1);
  assert.equal(leftOf(SPORT.nhl, { state: 'post' }), 0);
});

test("a game's model reproduces the market it was fitted to", () => {
  const market = { spread: { line: -4.5, home: 0.5 }, total: { line: 228.5, over: 0.5 } };
  const m = fitGame('nba', 'basketball', market);
  near(pickChance({ kind: 'spread', side: 'home', line: -4.5 }, m).win, 0.5);
  near(pickChance({ kind: 'total', side: 'over', line: 228.5 }, m).win, 0.5);
  const s = fitGame('epl', 'soccer', { win: { home: 0.45, draw: 0.27, away: 0.28 }, total: { line: 2.5, over: 0.55 } });
  near(pickChance({ kind: 'total', side: 'over', line: 2.5 }, s).win, 0.55);
  const h = pickChance({ kind: 'ml', side: 'home' }, s).win;
  const a = pickChance({ kind: 'ml', side: 'away' }, s).win;
  near(h / (h + a), 0.45 / 0.73, 0.02);
});

test('before the game the market prices its own lines exactly', () => {
  const market = { win: { home: 0.6, away: 0.4 }, spread: { line: -1.5, home: 0.42 } };
  assert.deepEqual(marketChance({ kind: 'ml', side: 'away' }, market), { win: 0.4, push: 0 });
  near(marketChance({ kind: 'spread', side: 'away', line: 1.5 }, market).win, 0.58, 1e-9);
  assert.equal(marketChance({ kind: 'spread', side: 'home', line: -2.5 }, market), null);
});

test('a big lead late is nearly safe; level at the start is the pregame chance', () => {
  const m = fitGame('nba', 'basketball', { spread: { line: 0, home: 0.5 } });
  const late = pickChance({ kind: 'ml', side: 'home' }, m, { home: 110, away: 95 }, 3 / 48);
  assert.ok(late.win > 0.99);
  near(pickChance({ kind: 'ml', side: 'home' }, m, { home: 0, away: 0 }, 1).win, 0.5);
});

test('a whole line can push, and the push is counted', () => {
  const m = fitGame('nfl', 'football', { spread: { line: -3, home: 0.5 } });
  const r = pickChance({ kind: 'spread', side: 'home', line: -3 }, m);
  assert.ok(r.push > 0.02);
  near(r.win + r.push + pickChance({ kind: 'spread', side: 'away', line: 3 }, m).win, 1, 1e-6);
});

test('soccer in play: one goal up with ten minutes left wins most of the time', () => {
  const s = fitGame('epl', 'soccer', { win: { home: 0.4, draw: 0.28, away: 0.32 }, total: { line: 2.5, over: 0.5 } });
  const r = pickChance({ kind: 'ml', side: 'home' }, s, { home: 1, away: 0 }, 10 / 90);
  assert.ok(r.win > 0.8 && r.win < 0.97, String(r.win));
});

test("with no market, a pick's fair chance is its odds less the lottery's cut", () => {
  near(chanceFromOdds(1.75), 1 / (1.75 * 1.158), 1e-9);
  const m = fitGame('cpbl', 'baseball', null, [{ kind: 'ml', side: 'home', odds: 1.6 }]);
  near(pickChance({ kind: 'ml', side: 'home' }, m).win, chanceFromOdds(1.6), 0.01);
  // …and the board's price for an even game is about the lottery's.
  near(lotteryOdds(0.5), 1.73, 0.011);
});

test("the last minute of a quarter: ESPN's clock in seconds is seconds, not minutes", () => {
  // (Under a minute ESPN shows "45.2"; read as 45 minutes, the game had almost all of it left.)
  near(leftOf(SPORT.nba, { state: 'in', period: 4, clock: '45.2' }), 45.2 / 60 / 48, 1e-9);
  near(leftOf(SPORT.nba, { state: 'in', period: 2, clock: '0.0' }), 24 / 48, 1e-9);
});

test("ESPN's EVEN is +100", () => {
  assert.equal(americanChance('EVEN'), 0.5);
  assert.equal(americanChance('even'), 0.5);
});

test('more of how much is left: innings, the Asian leagues by the clock, stoppage time, overtime', () => {
  near(leftOf(SPORT.mlb, { state: 'in', detail: 'Top 1st' }), 17.5 / 18, 1e-9);
  near(leftOf(SPORT.mlb, { state: 'in', detail: 'End 9th' }), 0.02, 1e-9);
  near(leftOf(SPORT.mlb, { state: 'in', detail: 'Top 10th' }), 0.02, 1e-9);
  const start = '2026-10-18T09:00:00Z';
  near(leftOf(SPORT.cpbl, { state: 'in', start }, Date.parse(start) + 95 * 60_000), 0.5, 1e-9);
  assert.equal(leftOf(SPORT.cpbl, { state: 'in' }), 0.5);
  near(leftOf(SPORT.soccer, { state: 'in', clock: "90'+3'" }), 0.01, 1e-9);
  near(leftOf(SPORT.soccer, { state: 'in', clock: "45'+2'" }), 0.5, 1e-9);
  near(leftOf(SPORT.nhl, { state: 'in', period: 4, clock: '2:30' }), 2.5 / 60, 1e-9);
  assert.equal(leftOf(SPORT.nba, null), 1);
});

test("ESPN's odds object read: the closing line, else the opening; the margin out", () => {
  const odds = {
    moneyline: { home: { close: { odds: '-150' } }, away: { close: { odds: '+130' } } },
    pointSpread: { home: { close: { line: '-3.5', odds: '-110' } }, away: { open: { line: '+3.5', odds: '-110' } } },
    total: { over: { close: { line: 'o215.5', odds: '-105' } }, under: { close: { line: 'u215.5', odds: '-115' } } }
  };
  const m = marketOf(odds);
  near(m.win.home + m.win.away, 1, 1e-9);
  assert.equal(m.win.draw, undefined);
  assert.deepEqual([m.spread.line, m.spread.home], [-3.5, 0.5]);
  assert.equal(m.total.line, 215.5);
  assert.ok(m.total.over < 0.5);
  assert.equal(marketOf(null), null);
  assert.equal(marketOf({}), null);
  assert.equal(marketOf({ moneyline: { home: { close: { odds: 'OFF' } }, away: { close: { odds: '+100' } } } }), null);
  assert.equal(americanChance('+50'), null);
  assert.equal(americanChance(null), null);
});

test('chances that must add up do: odd and even, a soccer game three ways, a whole total', () => {
  const m = fitGame('nba', 'basketball', { spread: { line: -5.5, home: 0.5 }, total: { line: 221.5, over: 0.5 } });
  near(pickChance({ kind: 'oddeven', side: 'odd' }, m).win + pickChance({ kind: 'oddeven', side: 'even' }, m).win, 1, 1e-9);
  // Late in the game too.
  const late = side => pickChance({ kind: 'oddeven', side }, m, { home: 100, away: 100 }, 0.001).win;
  near(late('odd') + late('even'), 1, 1e-9);
  const s = fitGame('epl', 'soccer', { win: { home: 0.45, draw: 0.27, away: 0.28 }, total: { line: 2.5, over: 0.5 } });
  const sum = ['home', 'draw', 'away'].reduce((t, side) => t + pickChance({ kind: 'ml', side }, s).win, 0);
  near(sum, 1, 1e-6);
  const o = pickChance({ kind: 'total', side: 'over', line: 3 }, s);
  const u = pickChance({ kind: 'total', side: 'under', line: 3 }, s);
  near(o.win + u.win + o.push, 1, 1e-6);
  near(o.push, u.push, 1e-12);
  // Hockey on 60 minutes: home, the draw and away add up to one, the draw about a fifth.
  const h = fitGame('nhl', 'hockey', { win: { home: 0.55, away: 0.45 } });
  const [hh, hd, ha] = ['home', 'draw', 'away'].map(side => pickChance({ kind: 'ml', side }, h).win);
  near(hh + hd + ha, 1, 1e-5);
  assert.ok(hd > 0.15 && hd < 0.3, `draw ${hd}`);
  // The market's two-way price (overtime in) is the fit's, never the 60-minute pick's.
  assert.equal(marketChance({ kind: 'ml', side: 'home', game: { league: 'nhl' } }, { win: { home: 0.55, away: 0.45 } }), null);
  // Fitted from the ticket's own three-way price: the overtime-in chance no longer than it.
  const t = fitGame('nhl', 'hockey', null, [{ kind: 'ml', side: 'home', odds: 2.1 }]);
  near(pickChance({ kind: 'ml', side: 'home' }, t).win, chanceFromOdds(2.1, true), 0.02);
});

test("with nothing to fit, a game is the league's usual one (said so)", () => {
  assert.equal(fitGame('nba', 'basketball', null).from, 'none');
  assert.equal(fitGame('epl', 'soccer', null).from, 'none');
  assert.equal(fitGame('epl', 'soccer', null, [{ kind: 'total', side: 'over', line: 2.5, odds: 1.9 }]).from, 'odds');
  assert.equal(fitGame('nba', 'basketball', { win: { home: 0.5, away: 0.5 } }).from, 'market');
  // A draw on the ticket says nothing of who wins.
  assert.equal(fitGame('epl', 'soccer', null, [{ kind: 'ml', side: 'draw', odds: 3.2 }]).from, 'none');
  assert.equal(lotteryOdds(0.99), 1.01);
  assert.ok(chanceFromOdds(1.01) <= 0.97);
});

test("a game over: its closing lines from the summary's pickcenter (the 2026 Community Shield)", () => {
  const pc = { spread: 0.5, overUnder: 2.5, overOdds: -135, underOdds: 105, awayTeamOdds: { moneyLine: 155, spreadOdds: 145 }, homeTeamOdds: { moneyLine: 170, spreadOdds: -205 }, drawOdds: { moneyLine: 220 } };
  const m = marketOfPickcenter(pc);
  near(m.win.home + m.win.draw + m.win.away, 1, 1e-9);
  assert.ok(m.win.away > m.win.home && m.win.home > m.win.draw, 'City the favourite, then Arsenal, then the draw');
  assert.equal(m.spread.line, 0.5);
  assert.ok(m.spread.home > 0.5);
  assert.equal(m.total.line, 2.5);
  assert.ok(m.total.over > 0.5);
  assert.equal(marketOfPickcenter(null), null);
  assert.equal(marketOfPickcenter({}), null);
});
