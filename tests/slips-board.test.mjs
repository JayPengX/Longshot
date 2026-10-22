// The lottery's other bets (半場, [1-5局], 雙勝, 正確比數, 勝分差…): the kit's
// board for a game, by section; each graded as Play settles it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as board from '../public/kit/play-board.mjs';
import { LEAGUES as KIT_LEAGUES } from '../public/kit/play-teams.mjs';
import { sectionsFor, kitGame, gradeExtra, periodsDone, needsSummary } from '../public/slips/lib/board.mjs';
import { parseEspn } from '../public/slips/lib/feed.mjs';
import { legView, slipView, openLegs, nextRead } from '../public/slips/lib/ticket.mjs';
import { pickText, kindName } from '../public/slips/lib/words.mjs';

const team = (en, zh) => ({ en, zh, short: zh, abbr: '', logo: '' });
let n = 0;
const game = (league, extra = {}) => ({ id: `${league}:${++n}`, league, start: '2036-10-18T00:00:00Z', home: team('Home', '主隊'), away: team('Away', '客隊'), state: 'pre', score: null, period: 0, clock: '', detail: '', market: null, ...extra });
const leg = (g, kind, side, more = {}) => ({ id: `l${++n}`, game: g, kind, side, odds: 2, ...more });
const kinds = g => sectionsFor(g, board, KIT_LEAGUES).map(s => s.kind);

test("a game's other bets by the lottery's sections: baseball's innings, soccer's halves and scores, football's touchdowns", () => {
  const mlb = game('mlb', { market: { win: { home: 0.55, away: 0.45 }, total: { line: 8.5, over: 0.5 }, spread: { line: -1.5, home: 0.42 } } });
  const k = kinds(mlb);
  for (const x of ['teamtotal', 'f5', 'f5runline', 'f5total', 'inningml', 'inningtotal', 'nextrun', 'margin', 'inning']) assert.ok(k.includes(x), x);
  // One section an inning for 單局.
  const inning = sectionsFor(mlb, board, KIT_LEAGUES).find(s => s.kind === 'inningml');
  assert.match(inning.title, /^\[第\d局\]不讓分$/);
  const epl = game('epl', { market: { win: { home: 0.45, draw: 0.27, away: 0.28 }, total: { line: 2.5, over: 0.52 } } });
  for (const x of ['dc', 'btts', 'half', 'htotal', 'score', 'htft', 'goalbands', 'corners']) assert.ok(kinds(epl).includes(x), x);
  assert.ok(kinds(game('nfl')).includes('tdtotal'), 'no market: a guess, every bet still listed');
  // A cup the kit doesn't sell: priced as soccer.
  assert.ok(kinds(game('copadelrey')).includes('htft'));
  // Asian baseball (its final score alone read): nothing on a part of the game.
  const cpbl = kinds(game('cpbl'));
  assert.ok(cpbl.includes('margin') && !cpbl.includes('f5') && !cpbl.includes('inning'));
  // Never the four of the tabs (or players).
  assert.ok(!k.some(x => ['ml', 'total', 'runline', 'hcap3', 'prop'].includes(x)));
});

test('a Slips game in Play shape: the market as its book, the spread as the away line', () => {
  const g = kitGame(game('nba', { market: { win: { home: 0.6, away: 0.4 }, spread: { line: -4.5, home: 0.5 }, total: { line: 220.5, over: 0.5 } } }), KIT_LEAGUES);
  assert.deepEqual(g.draftKings, { home: 0.6, away: 0.4 });
  assert.deepEqual(g.spread, { awayLine: 4.5, awayFair: 0.5 });
  assert.equal(g.sport, 'nba');
  assert.equal(kitGame(game('copadelrey'), KIT_LEAGUES).sport, 'epl');
  assert.ok(kitGame(game('nba'), KIT_LEAGUES).house);
});

test('graded on the final as Play settles them, a part of the game as soon as it is played', () => {
  const periods = { away: [0, 1, 0, 0, 2, 0, 0, 0, 0], home: [1, 0, 0, 3, 0, 0, 0, 1, 0] };
  const final = game('mlb', { state: 'post', score: { away: 3, home: 5 }, periods });
  assert.equal(gradeExtra(leg(final, 'f5', 'home')), 'won');
  assert.equal(gradeExtra(leg(final, 'f5total', 'over', { line: 7.5 })), 'lost');
  assert.equal(gradeExtra(leg(final, 'inningml', 'home', { period: 4 })), 'won');
  assert.equal(gradeExtra(leg(final, 'margin', 'home', { team: 'home', lo: 2, hi: 2 })), 'won');
  assert.equal(gradeExtra(leg(final, 'teamtotal', 'under', { team: 'away', line: 3.5 })), 'won');
  assert.equal(gradeExtra(leg(final, 'inning', undefined, { inning: 3 })), 'won');
  // On: five innings played, [1-5局] decided; the inning under way not counted.
  const on = game('mlb', { state: 'in', score: { away: 3, home: 4 }, detail: 'Top 6th', periods: { away: [0, 1, 0, 0, 2, 0], home: [1, 0, 0, 3, 0] } });
  assert.equal(periodsDone(on), 5);
  assert.equal(gradeExtra(leg(on, 'f5', 'home')), 'won');
  assert.equal(gradeExtra(leg(on, 'inningml', 'away', { period: 6 })), null);
  // Soccer at half-time: the half decided.
  const ht = game('epl', { state: 'in', score: { away: 1, home: 0 }, detail: 'HT', periods: { away: [1], home: [0] } });
  assert.equal(gradeExtra(leg(ht, 'half', 'away')), 'won');
  assert.equal(gradeExtra(leg(ht, 'htft', undefined, { ht: 'away', ft: 'away' })), null);
  // Both scored already: 兩隊都進球 yes, before the end.
  assert.equal(gradeExtra(leg(game('epl', { state: 'in', score: { away: 1, home: 1 } }), 'btts', 'yes')), 'won');
  // Correct score, home-away; double chance; called off.
  const epl = game('epl', { state: 'post', score: { home: 2, away: 1 }, periods: { home: [0, 2], away: [1, 0] } });
  assert.equal(gradeExtra(leg(epl, 'score', undefined, { score: '2-1' })), 'won');
  assert.equal(gradeExtra(leg(epl, 'dc', 'away|draw')), 'lost');
  assert.equal(gradeExtra(leg(epl, 'htft', undefined, { ht: 'away', ft: 'home' })), 'won');
  assert.equal(gradeExtra(leg(game('epl', { state: 'void' }), 'dc', 'home|draw')), 'void');
});

test('corners, touchdowns and the first run wait for the summary; the ticket reads it, slowly', () => {
  const g = game('epl', { state: 'post', score: { home: 1, away: 1 } });
  const l = leg(g, 'corners', 'over', { line: 9.5 });
  assert.ok(needsSummary(l));
  assert.equal(legView(l).result, null);
  const slip = { id: 's', mode: 'single', sizes: [1], stake: 100, legs: [l] };
  assert.deepEqual(openLegs([slip], slipView, Date.parse(g.start) + 3_600_000), [l]);
  assert.equal(openLegs([slip], slipView, Date.parse(g.start) + 3 * 86_400_000).length, 0);
  assert.equal(nextRead([l]), 5 * 60_000);
  l.game = { ...g, extras: { corners: { home: 6, away: 5 } } };
  assert.ok(!needsSummary(l));
  assert.equal(legView(l).result, 'won');
  assert.equal(slipView(slip).paid.gross, 200);
});

test("a pick's chance before the game is the board's, its odds' when there was none", () => {
  const g = game('epl');
  assert.deepEqual(legView(leg(g, 'btts', 'yes', { fair: 0.55 })).pre, { win: 0.55, push: 0 });
  const e = legView(leg(g, 'btts', 'yes'));
  assert.equal(e.estimated, true);
  assert.ok(e.pre.win > 0.4 && e.pre.win < 0.5);
});

test('in words, as Play names them', () => {
  const g = game('mlb');
  assert.equal(pickText(leg(g, 'teamtotal', 'over', { team: 'home', line: 4.5 })), '主隊 大 4.5');
  assert.equal(pickText(leg(g, 'f5runline', 'away', { line: 0.5 })), '客隊 +0.5');
  assert.equal(pickText(leg(g, 'inningtotal', 'under', { period: 3, line: 0.5 })), '第3局 小 0.5');
  assert.equal(pickText(leg(g, 'inning', undefined, { inning: 9 })), '一樣多');
  const s = game('epl');
  assert.equal(pickText(leg(s, 'dc', 'home|draw')), '主隊勝或和局');
  assert.equal(pickText(leg(s, 'htft', undefined, { ht: 'draw', ft: 'home' })), '和/主');
  assert.equal(pickText(leg(s, 'score', undefined, { score: '2-1' })), '2:1');
  assert.equal(pickText(leg(s, 'goalbands', undefined, { lo: 4, hi: null })), '4+ 球');
  assert.equal(pickText(leg(s, 'margin', 'home', { team: 'home', lo: 1, hi: 2 })), '主隊 1-2');
  assert.equal(kindName('htft'), '半/全場');
  assert.equal(kindName('ml'), '不讓分');
});

test("ESPN's line scores kept as each side's periods", async () => {
  const data = JSON.parse(await readFile(new URL('./fixtures/slips/nhl-ot.json', import.meta.url)));
  const [g] = parseEspn(data, 'nhl');
  assert.equal(g.periods.home.length, 4);
  assert.equal(g.periods.home.slice(0, 3).reduce((a, b) => a + b), 3);
});

test("a photo's other bets read as picks: the team, the line, the band, the inning", async () => {
  const { legOf } = await import('../public/slips/lib/scan.mjs');
  const g = game('mlb', { away: team('New York Yankees', '洋基'), home: team('Los Angeles Dodgers', '道奇') });
  const p = (kind, pick, more = {}) => legOf({ sport: 'baseball', league: 'mlb', teams: ['洋基', '道奇'], teamsEn: ['New York Yankees', 'Los Angeles Dodgers'], kind, pick, odds: 2.1, ...more }, g, false);
  assert.deepEqual(['side', 'team', 'line'].map(k => p('teamtotal', 'over', { team: '道奇', line: 4.5 })[k]), ['over', 'home', 4.5]);
  assert.deepEqual(['side', 'line'].map(k => p('f5runline', '洋基', { line: -0.5 })[k]), ['away', -0.5]);
  assert.deepEqual(['side', 'period'].map(k => p('inningml', '道奇', { period: 7 })[k]), ['home', 7]);
  assert.equal(p('inningml', '道奇'), null, 'which inning unread: not guessed');
  assert.deepEqual(['team', 'lo', 'hi'].map(k => p('margin', '洋基', { band: '3-4' })[k]), ['away', 3, 4]);
  assert.equal(p('inning', 'tie').inning, 9);
  assert.equal(p('nextrun', '洋基').side, 'away');
  const s = game('epl');
  const q = (kind, pick, more = {}) => legOf({ sport: 'soccer', league: 'epl', teams: ['客隊', '主隊'], teamsEn: ['Away', 'Home'], kind, pick, odds: 3, ...more }, s, false);
  assert.equal(q('dc', 'draw|home').side, 'home|draw');
  assert.deepEqual([q('htft', 'draw/away').ht, q('htft', 'draw/away').ft], ['draw', 'away']);
  assert.equal(q('score', '2:1').score, '2-1');
  assert.equal(q('score', 'other').listed.length, 16);
  assert.deepEqual([q('goalbands', '7+').lo, q('goalbands', '7+').hi], [7, null]);
  assert.equal(q('btts', '是').side, 'yes');
  assert.equal(q('half', 'draw').side, 'draw');
});

test("運彩's newer bets: listed, named, read off a ticket and settled (goals' order, hits, a period, the combos)", async () => {
  const epl = game('epl', { market: { win: { home: 0.45, draw: 0.27, away: 0.28 }, total: { line: 2.5, over: 0.5 } } });
  const k = kinds(epl);
  for (const x of ['mltotal', 'mlbtts', 'hdc', 'hscore', 'teamgoals', 'firstgoal', 'lastgoal', 'higherhalf']) assert.ok(k.includes(x), x);
  const nba = game('nba', { market: { win: { home: 0.6, away: 0.4 }, total: { line: 224.5, over: 0.5 }, spread: { line: -4.5, home: 0.5 } } });
  for (const x of ['qrunline', 'qtotal', 'topperiod', 'raceto', 'mltotal']) assert.ok(kinds(nba).includes(x), x);
  const mlb = game('mlb', { market: { win: { home: 0.55, away: 0.45 }, total: { line: 8.5, over: 0.5 } } });
  for (const x of ['hits', 'teamhits', 'raceto']) assert.ok(kinds(mlb).includes(x), x);
  assert.equal(kindName('firstgoal'), '第一球');

  // Soccer over: 2-1 to the home side, its goals home, away, home (halves 1-0, 1-1).
  const done = { ...epl, state: 'post', score: { home: 2, away: 1 }, periods: { home: [1, 1], away: [0, 1] }, goalOrder: ['home', 'away', 'home'] };
  assert.equal(gradeExtra(leg(done, 'firstgoal', 'home')), 'won');
  assert.equal(gradeExtra(leg(done, 'lastgoal', 'away')), 'lost');
  assert.equal(gradeExtra(leg(done, 'hdc', 'home|draw')), 'won');
  assert.equal(gradeExtra(leg(done, 'hscore', '1-0', { score: '1-0' })), 'won');
  assert.equal(gradeExtra(leg(done, 'higherhalf', 'second')), 'won');
  assert.equal(gradeExtra(leg(done, 'mltotal', 'home|over', { line: 2.5 })), 'won');
  assert.equal(gradeExtra(leg(done, 'mlbtts', 'home|yes')), 'won');
  assert.equal(gradeExtra(leg(done, 'teamgoals', 'away|1', { team: 'away', lo: 1, hi: 1 })), 'won');
  assert.equal(pickText(leg(done, 'mltotal', 'home|over', { line: 2.5 })), '主隊 勝/大 2.5');
  // The first half settles at half-time-plus (one half played of two).
  const second = { ...epl, state: 'in', score: { home: 1, away: 0 }, periods: { home: [1, 0], away: [0, 0] }, detail: "55'" };
  assert.equal(gradeExtra(leg(second, 'hdc', 'draw|away')), 'lost');
  // Baseball's hits; basketball's first quarter.
  const mlbDone = { ...mlb, state: 'post', score: { home: 5, away: 3 }, periods: { home: [1, 0, 0, 2, 0, 0, 2, 0], away: [0, 0, 3, 0, 0, 0, 0, 0, 0] }, hits: { away: 7, home: 9 } };
  assert.equal(gradeExtra(leg(mlbDone, 'hits', 'over', { line: 15.5 })), 'won');
  assert.equal(gradeExtra(leg(mlbDone, 'teamhits', 'under', { team: 'away', line: 7.5 })), 'won');
  const nbaDone = { ...nba, state: 'post', score: { home: 110, away: 100 }, periods: { home: [30, 25, 32, 23], away: [20, 30, 25, 25] } };
  assert.equal(gradeExtra(leg(nbaDone, 'qtotal', 'over', { line: 48.5, period: 1 })), 'won');
  assert.equal(gradeExtra(leg(nbaDone, 'qrunline', 'away', { line: 5.5, period: 1 })), 'lost');
  assert.equal(gradeExtra(leg(nbaDone, 'topperiod', '1')), 'lost');
  assert.equal(gradeExtra(leg(nbaDone, 'topperiod', '3')), 'won');
  // 先得X分 waits on the scoring plays.
  assert.ok(needsSummary(leg(nbaDone, 'raceto', 'home', { line: 20 })));
});

test("a soccer scoreboard's halves and goals' order from its goals (ESPN gives no halves)", () => {
  const comp = (period, state, completed) => ({
    events: [{ id: '9', competitions: [{ date: '2026-10-18T14:00Z', status: { period, type: { state, completed, name: completed ? 'STATUS_FULL_TIME' : 'STATUS_SECOND_HALF' } },
      competitors: [{ homeAway: 'home', score: '2', team: { id: '1', displayName: 'Chelsea' } }, { homeAway: 'away', score: '1', team: { id: '2', displayName: 'Everton' } }],
      details: [{ scoringPlay: true, team: { id: '1' }, clock: { displayValue: "12'" } }, { scoringPlay: true, team: { id: '2' }, clock: { displayValue: "50'" } }, { scoringPlay: true, team: { id: '1' }, clock: { displayValue: "88'" } }] }] }]
  });
  const [g] = parseEspn(comp(2, 'post', true), 'epl');
  assert.deepEqual(g.periods, { home: [1, 1], away: [0, 1] });
  assert.deepEqual(g.goalOrder, ['home', 'away', 'home']);
  // In the first half: no halves yet (it isn't over).
  const [early] = parseEspn(comp(1, 'in', false), 'epl');
  assert.equal(early.periods, undefined);
});
