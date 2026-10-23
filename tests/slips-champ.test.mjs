// 冠軍 on a ticket (champ.mjs): Play's market as a game, read again from
// Polymarket (chances now, a club knocked out, the winner), and graded.
import test from 'node:test';
import assert from 'node:assert/strict';
import { champGame, champRead, champGuess, gradeChamp, champLegView, CHAMP_MARKETS } from '../public/slips/lib/champ.mjs';
import { slipView } from '../public/slips/lib/ticket.mjs';
import { pickText, matchText } from '../public/slips/lib/words.mjs';

const market = { key: 'epl', sport: 'epl', slug: 'epl-2027-champion', season: '2026/27', ends: '2027-05-30T00:00:00Z', teams: [{ name: { en: 'Arsenal', zh: '兵工廠' }, fair: 0.6 }, { name: { en: 'Chelsea', zh: '切爾西' }, fair: 0.1 }, { name: { en: 'Fulham', zh: '富勒姆' }, fair: 0.3 }] };
const m = (name, yes, closed = false) => ({ groupItemTitle: name, outcomes: '["Yes","No"]', outcomePrices: JSON.stringify([String(yes), String(1 - yes)]), closed });

test('every 運彩 championship Play sells, F1 aside', () => {
  const keys = CHAMP_MARKETS.map(x => x.key);
  for (const k of ['ws', 'epl', 'nba', 'nfl', 'nhl', 'ucl', 'laliga']) assert.ok(keys.includes(k), k);
  assert.ok(!keys.some(k => k.startsWith('f1')));
});

test('a market as a game, its contenders by chance, priced as Play does', () => {
  const g = champGame(market, (sport, name) => `logo:${name}`);
  assert.equal(g.session, 'champ');
  assert.equal(g.league, 'epl');
  assert.equal(g.start, '2027-05-30T00:00:00.000Z');
  assert.equal(g.field[0].logo, 'logo:Arsenal');
  assert.ok(champGuess(g, 'Chelsea') > champGuess(g, 'Arsenal'));
  assert.equal(matchText(g), '2026/27 英超冠軍');
});

test('read again: placeholders left out, a club knocked out is lost early, the winner settles it', () => {
  const g = champGame(market);
  const now = champRead(g, [{ closed: false, markets: [m('Arsenal', 0.5), m('Chelsea', 0, true), m('Fulham', 0.5), m('Team A', 0.5), m('Other', 0.5)] }]);
  assert.equal(now.field.find(t => t.name === 'Arsenal').fair, 0.5);
  assert.equal(now.field.find(t => t.name === 'Chelsea').out, true);
  const leg = { id: 'l1', kind: 'future', team: 'Chelsea', teamZh: '切爾西', fair: 0.1, odds: 6, game: now };
  assert.equal(pickText(leg), '切爾西 奪冠');
  const v = champLegView(leg);
  assert.equal(v.result, null);
  assert.equal(v.early, 'lost');
  assert.equal(slipView({ id: 's', mode: 'single', legs: [leg], sizes: [1], stake: 100 }).status, 'lost');

  const done = champRead(g, [{ closed: true, markets: [m('Arsenal', 0), m('Chelsea', 0), m('Fulham', 1)] }]);
  assert.equal(done.state, 'post');
  assert.equal(gradeChamp({ team: 'Fulham', game: done }), 'won');
  assert.equal(gradeChamp({ team: 'Arsenal', game: done }), 'lost');
});

test('a 冠軍 pick read from a ticket photo: its club in its league’s championship, MLB’s by the event', async () => {
  const { champPickLeg } = await import('../public/slips/lib/champ.mjs');
  const epl = champGame(market);
  const mk = (key, en, zh) => champGame({ key, sport: 'mlb', slug: key, season: '2026', teams: [{ name: { en, zh }, fair: 0.5 }, { name: { en: 'Seattle Mariners', zh: '西雅圖水手' }, fair: 0.5 }] });
  const games = [epl, mk('ws', 'Los Angeles Dodgers', '洛杉磯道奇'), mk('al', 'Toronto Blue Jays', '多倫多藍鳥'), mk('nl', 'Los Angeles Dodgers', '洛杉磯道奇')];
  const id = () => 'l1';
  const leg = champPickLeg({ kind: 'future', league: 'epl', teams: ['兵工廠'], teamsEn: ['Arsenal FC'], pick: '兵工廠', odds: 2.1 }, games, id);
  assert.deepEqual([leg.team, leg.teamZh, leg.odds, leg.game.id, leg.est], ['Arsenal', '兵工廠', 2.1, epl.id, undefined]);
  assert.equal(champPickLeg({ kind: 'future', league: 'mlb', teams: ['道奇'], teamsEn: [''], pick: '道奇', odds: 3 }, games, id).game.market, 'ws', 'a short Chinese name; the World Series by default');
  assert.equal(champPickLeg({ kind: 'future', league: 'mlb', event: '國聯冠軍', teams: ['道奇'], teamsEn: ['Los Angeles Dodgers'], pick: '道奇', odds: 2 }, games, id).game.market, 'nl');
  assert.equal(champPickLeg({ kind: 'future', league: 'mlb', event: 'American League', teams: ['水手'], teamsEn: ['Seattle Mariners'], pick: '水手', odds: 2 }, games, id).game.market, 'al');
  const guessed = champPickLeg({ kind: 'future', league: 'epl', teams: ['切爾西'], teamsEn: ['Chelsea'], pick: '切爾西', odds: null }, games, id);
  assert.equal(guessed.est, true, 'no odds printed: Play’s estimate, marked');
  assert.equal(champPickLeg({ kind: 'future', league: 'nba', teams: ['兵工廠'], teamsEn: ['Arsenal'], pick: '兵工廠', odds: 2 }, games, id), null, 'another league’s championship never');
  assert.equal(champPickLeg({ kind: 'ml', league: 'epl', teams: ['兵工廠'], pick: '兵工廠', odds: 2 }, games, id), null);
});
