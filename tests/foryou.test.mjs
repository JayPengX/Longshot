// 為你推薦: the person's own slips and liked leagues lead; held games don't repeat.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tasteOf, forYouPicks, gameInterest, spreadLeagues } from '../public/lib/foryou.mjs';

const now = Date.parse('2026-10-02T00:00:00Z');
const game = (id, sport, home, away, h = 6) => ({ id, sport, home: { en: home }, away: { en: away }, startUtc: new Date(now + h * 3_600_000).toISOString() });
const ml = (g, side, fair) => ({ id: `${g.id}|ml|${side}`, gameId: g.id, kind: 'ml', side, sport: g.sport, fairChance: fair, estOdds: 0.9 / fair });

test('backed teams point at their next game; a game already bet on is left out', () => {
  const games = [game('x', 'nba', 'Los Angeles Lakers', 'Denver Nuggets'), game('y', 'nba', 'Golden State Warriors', 'Los Angeles Lakers', 30)];
  const bets = games.flatMap(g => [ml(g, 'home', 0.5), ml(g, 'away', 0.5)]);
  const slips = [{ t: now - 86_400_000, status: 'open', legs: [{ gameId: 'x', sport: 'nba', kind: 'ml', side: 'home', home: 'Los Angeles Lakers', away: 'Denver Nuggets' }] }];
  const taste = tasteOf({ slips, now });
  assert.ok(taste.held.has('x'));
  const picks = forYouPicks({ games, bets, taste, now });
  assert.deepEqual(picks.map(p => [p.game.id, p.why, p.bet.side]), [['y', 'backed', 'away']]);
  assert.ok(gameInterest(games[1], taste).score > 0.4);
});

test('a night of many games in a league nobody follows fills two cards, not the row', () => {
  const nhl = Array.from({ length: 8 }, (_, i) => game(`h${i}`, 'nhl', `Home ${i}`, `Away ${i}`, 2 + i / 10));
  const mlb = game('m', 'mlb', 'Los Angeles Dodgers', 'San Diego Padres', 20);
  const bets = [...nhl, mlb].flatMap(g => [ml(g, 'home', 0.55), ml(g, 'away', 0.45)]);
  const recs = new Map(bets.map(b => [b.id, { tag: 'value' }]));
  const taste = tasteOf({ aff: { 'league:mlb': 1 }, now });
  const picks = forYouPicks({ games: [...nhl, mlb], bets, recs, taste, now });
  assert.equal(picks[0].game.id, 'm');
  assert.equal(picks.filter(p => p.game.sport === 'nhl').length, 2);
  assert.equal(spreadLeagues(nhl.map(g => ({ game: g })), taste, { n: 4 }).length, 1);
});

test('a backed team a few days away is picked, on its side; sports take turns', async () => {
  const { interleave } = await import('../public/lib/foryou.mjs');
  const nfl = game('k', 'nfl', 'Kansas City Chiefs', 'Denver Broncos', 4 * 24);
  const nbas = Array.from({ length: 5 }, (_, i) => game(`n${i}`, 'nba', `H${i}`, `A${i}`, 3 + i));
  const wnba = game('w', 'wnba', 'Las Vegas Aces', 'New York Liberty', 4);
  const epl = game('e', 'epl', 'Arsenal', 'Chelsea', 5);
  const games = [nfl, ...nbas, wnba, epl];
  const bets = games.flatMap(g => [ml(g, 'home', 0.55), ml(g, 'away', 0.45)]);
  const recs = new Map(bets.map(b => [b.id, { tag: 'value' }]));
  const slips = [{ t: now - 86_400_000, status: 'settled', legs: [{ gameId: 'old', sport: 'nfl', kind: 'ml', side: 'home', home: 'Kansas City Chiefs', away: 'Las Vegas Raiders' }] }];
  const taste = tasteOf({ aff: { 'league:nba': 1, 'league:wnba': 1, 'league:epl': 1 }, slips, now });
  const picks = forYouPicks({ games, bets, recs, taste, now });
  const k = picks.find(p => p.game.id === 'k');
  assert.equal(k?.why, 'backed');
  assert.equal(k.bet.side, 'home');
  const basketball = picks.filter(p => ['nba', 'wnba'].includes(p.game.sport));
  assert.ok(basketball.length <= 4, String(basketball.length));
  assert.deepEqual(interleave(['a1', 'a2', 'b1'], x => x[0]), ['a1', 'b1', 'a2']);
});

test('each game\'s pick is its best return at a followable price; the strongest leads', () => {
  const a = game('a', 'nba', 'Boston Celtics', 'New York Knicks', 5);
  const b = game('b', 'nba', 'Miami Heat', 'Orlando Magic', 6);
  // Game a: the away win at a thin cut beats the home win; a 1.10 favourite is never the pick.
  const bets = [
    { ...ml(a, 'home', 0.55), estOdds: 1.5 },
    { ...ml(a, 'away', 0.45), estOdds: 2.05 },
    { ...ml(b, 'home', 0.88), estOdds: 1.1 },
    { ...ml(b, 'away', 0.12), estOdds: 7 },
    ...Array.from({ length: 10 }, (_, i) => ({ id: `z${i}`, gameId: 'zz', kind: 'ml', side: 'home', sport: 'nba', fairChance: 0.5, estOdds: 1.7 }))
  ];
  const picks = forYouPicks({ games: [a, b], bets, taste: tasteOf({ now }), now });
  assert.deepEqual(picks.map(p => [p.game.id, p.bet.side]), [['a', 'away']]);
  assert.ok(picks[0].merit > 0.9);
});
