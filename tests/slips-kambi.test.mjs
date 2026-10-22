// Kambi's leagues and the set sports (歐洲籃球, 韓K聯, 網球, 排球, 羽球, 桌球):
// its list as games, a match over from its live data, a set sport's picks
// graded on its sets.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseKambi, kambiState, LEAGUES } from '../public/slips/lib/feed.mjs';
import { legView } from '../public/slips/lib/ticket.mjs';
import { pickText, statusOf } from '../public/slips/lib/words.mjs';

const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/slips/${name}`, import.meta.url)));
const NOW = Date.parse('2026-10-20T08:55:00Z');

test("Kambi's tennis: the tours 運彩 sells (no ITF), a match to come priced, one on in sets", () => {
  const games = parseKambi(fixture('kambi-tennis.json'), 'tennis', NOW);
  assert.equal(games.length, 2);
  const [on, pre] = games;
  assert.equal(pre.state, 'pre');
  assert.equal(pre.home.en, 'Tallon Griekspoor');
  assert.ok(Math.abs(pre.market.win.home + pre.market.win.away - 1) < 1e-9);
  assert.equal(pre.market.spread, undefined, 'a game handicap is not a whole-match line');
  assert.equal(on.state, 'in');
  // 4-6, 6-0, 0-0: a set each, the third on.
  assert.deepEqual(on.score, { home: 1, away: 1 });
  assert.equal(on.period, 3);
  assert.deepEqual(statusOf(on), { text: '第3盤', live: true });
  assert.ok(on.id.startsWith('tennis:k'));
});

test('EuroLeague from Kambi: the winner, the point spread and the total', () => {
  const [g] = parseKambi(fixture('kambi-euroleague.json'), 'euroleague', NOW);
  assert.equal(g.state, 'pre');
  assert.equal(g.market.spread.line, -8.5);
  assert.equal(g.market.total.line, 173.5);
  assert.equal(LEAGUES.euroleague.zh, '歐洲籃球');
});

test('a match over once its sets are won; graded on the sets, its games or points', () => {
  const pre = parseKambi(fixture('kambi-tennis.json'), 'tennis', NOW)[1];
  const live = (home, away) => ({ score: { home: 0, away: 0 }, periods: { home: [], away: [] }, sets: { home, away }, changedAt: null, clock: null });
  const over = kambiState(pre, live([6, 3, 6], [4, 6, 2]), NOW);
  assert.equal(over.state, 'post');
  assert.deepEqual(over.score, { home: 2, away: 1 });
  const leg = (kind, side, more = {}) => ({ id: 'l', game: over, kind, side, odds: 1.9, ...more });
  assert.equal(legView(leg('ml', 'home')).result, 'won');
  assert.equal(legView(leg('sethcap', 'away', { line: 1.5 })).result, 'won');
  assert.equal(legView(leg('gamehcap', 'home', { line: -2.5 })).result, 'won', '15 games to 12');
  assert.equal(legView(leg('gametotal', 'over', { line: 27.5 })).result, 'lost');
  assert.equal(legView(leg('set1', 'home')).result, 'won');
  // Its winner priced by the market before.
  assert.equal(legView({ ...leg('ml', 'home'), game: pre }).estimated, false);
  // On: the first set decided as soon as the second starts.
  const on = kambiState(pre, live([6, 1, -1], [4, 0, -1]), NOW);
  assert.equal(on.state, 'in');
  assert.equal(legView({ ...leg('set1', 'home'), game: on }).early, 'won');
  assert.equal(pickText({ ...leg('gamehcap', 'home', { line: -3.5 }), game: over }), '格里克斯普爾 -3.5');
});
