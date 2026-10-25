import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mlbSeriesList, seriesMarkets, seriesOutcome, seriesResults, gameChance, seriesChance, isSeriesKey } from '../public/kit/play-series.mjs';
import { legResult, readOutcomes } from '../public/kit/settle.mjs';
import { futureBets, legOf } from '../public/kit/play-bets.mjs';
import { parseFutures, EXTRA_FUTURES } from '../public/kit/play-sources.mjs';
import { estimateFuturesOdds, FUTURES_OVERROUND } from '../public/kit/play-odds.mjs';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);

// One MLB postseason game as statsapi lists it.
const game = (description, n, of, away, home, date, { winner = null, state = winner ? 'Final' : 'Preview', detailed } = {}) => ({
  gameType: /World/.test(description) ? 'W' : /CS/.test(description) ? 'L' : /DS/.test(description) ? 'D' : 'F',
  season: '2026',
  description: `${description} Game ${n}`,
  gamesInSeries: of,
  seriesGameNumber: n,
  gameDate: date,
  status: { abstractGameState: state, detailedState: detailed ?? state },
  teams: { away: { team: away, isWinner: winner ? winner === away : undefined }, home: { team: home, isWinner: winner ? winner === home : undefined } }
});
const MIL = { id: 158, name: 'Milwaukee Brewers' };
const TB = { id: 139, name: 'Tampa Bay Rays' };
const NYY = { id: 147, name: 'New York Yankees' };
const BOS = { id: 111, name: 'Boston Red Sox' };
const CHW = { id: 145, name: 'Chicago White Sox' };
const TBD = { id: 0, name: 'TBD' };
const sched = games => ({ dates: [{ games }] });
const ws = [
  game('World Series', 1, 7, TB, MIL, '2026-10-24T00:00:00Z', { winner: MIL }),
  game('World Series', 2, 7, TB, MIL, '2026-10-25T00:00:00Z', { winner: MIL }),
  game('World Series', 3, 7, MIL, TB, '2026-10-27T00:00:00Z')
];
const wsMarket = { key: 'ws', sport: 'mlb', teams: [{ name: { en: 'Milwaukee Brewers' }, fair: 0.84 }, { name: { en: 'Tampa Bay Rays' }, fair: 0.16 }] };
const NOW = new Date('2026-10-26T00:00:00Z');

test('series: one game chance gives back the series chance, and the exact results add up to 1 with the impossible ones left out', () => {
  const q = gameChance(0.84, 2, 4);
  close(seriesChance(q, 2, 4), 0.84, 1e-9);
  const r = seriesResults(q, 4, [2, 0]);
  // Brewers 4-0..4-3, Rays only 4-2 and 4-3 (4-0, 4-1 out of reach at 0-2).
  assert.deepEqual(r.map(x => `${x.side}:${x.lost}`), ['0:0', '0:1', '0:2', '0:3', '1:2', '1:3']);
  close(r.reduce((s, x) => s + x.fair, 0), 1, 1e-9);
});

test('series: the World Series board is priced like 運彩 (6 results, about 1.39) and every round with both clubs known is sold', () => {
  const ds = [
    game('ALDS', 1, 5, BOS, NYY, '2026-10-04T00:00:00Z', { winner: NYY }),
    // The other ALDS: its opponent not known yet.
    game('ALDS', 1, 5, TBD, CHW, '2026-10-04T00:00:00Z')
  ];
  const s = sched([...ws, ...ds]);
  const markets = seriesMarkets(s, [wsMarket], NOW, { zh: en => ({ 'Milwaukee Brewers': '密爾瓦基釀酒人' })[en] ?? en, nextGame: (a, b) => (a === 'New York Yankees' && b === 'Boston Red Sox' ? 0.55 : null) });
  assert.deepEqual(markets.map(m => m.key).sort(), ['series-2026-alds-111-147', 'series-2026-ws-139-158']);
  const m = markets.find(x => x.round === 'WS');
  assert.equal(m.teams.length, 6);
  assert.ok(m.teams.some(t => t.name.zh === '密爾瓦基釀酒人4比1勝出'));
  const bets = futureBets([m]);
  const implied = bets.reduce((n, b) => n + 1 / b.estOdds, 0);
  assert.ok(Math.abs(implied - FUTURES_OVERROUND.series) < 0.03, String(implied));
  assert.equal(bets[0].clubEn, 'Milwaukee Brewers');
  // 運彩's own board that day (Brewers 2-0 up): each price within 25%.
  const real = { 'Milwaukee Brewers 4-0': 3.35, 'Milwaukee Brewers 4-1': 2.6, 'Milwaukee Brewers 4-2': 3.8, 'Milwaukee Brewers 4-3': 5.15, 'Tampa Bay Rays 4-2': 10, 'Tampa Bay Rays 4-3': 6.75 };
  for (const b of bets) assert.ok(Math.abs(b.estOdds / real[b.teamEn] - 1) < 0.25, `${b.teamEn} ${b.estOdds}`);
  // The division series (no pennant market for it): its next game's moneyline, best of 5.
  const alds = markets.find(x => x.round === 'ALDS');
  // (Yankees 1-0: Yankees 3-0, 3-1, 3-2; Red Sox 3-1, 3-2.)
  assert.equal(alds.teams.length, 5);
});

test('series: off sale from just before a game starts until it is final, and gone once decided', () => {
  const s = sched(ws);
  assert.equal(seriesMarkets(s, [wsMarket], new Date('2026-10-26T23:55:00Z')).length, 0);
  const live = sched([...ws.slice(0, 2), { ...ws[2], status: { abstractGameState: 'Live', detailedState: 'In Progress' } }]);
  assert.equal(seriesMarkets(live, [wsMarket], new Date('2026-10-27T02:00:00Z')).length, 0);
  // A postponed game doesn't hold the board shut.
  const off = sched([...ws.slice(0, 2), { ...ws[2], gameDate: '2026-10-25T20:00:00Z', status: { abstractGameState: 'Final', detailedState: 'Postponed' } }]);
  assert.equal(seriesMarkets(off, [wsMarket], NOW).length, 1);
});

test('series: settles from MLB list to the exact result, through readOutcomes and legResult', async () => {
  const won = sched([
    ...ws.slice(0, 2),
    game('World Series', 3, 7, MIL, TB, '2026-10-27T00:00:00Z', { winner: TB }),
    game('World Series', 4, 7, MIL, TB, '2026-10-28T00:00:00Z', { winner: MIL }),
    game('World Series', 5, 7, MIL, TB, '2026-10-29T00:00:00Z', { winner: MIL })
  ]);
  const key = 'series-2026-ws-139-158';
  assert.ok(isSeriesKey(key));
  assert.deepEqual(seriesOutcome(sched(ws), key), { status: 'pending' });
  assert.deepEqual(seriesOutcome(won, key), { status: 'final', winner: 'Milwaukee Brewers 4-1' });
  const [b41, b40] = ['Milwaukee Brewers 4-1', 'Milwaukee Brewers 4-0'].map(team => futureBets([seriesMarkets(sched(ws), [wsMarket], NOW)[0]]).find(b => b.teamEn === team));
  const legs = [legOf(b41), legOf(b40)];
  assert.equal(legs[0].market, key);
  const reads = [];
  const out = await readOutcomes(legs, { read: url => (reads.push(url), won) });
  assert.equal(reads.length, 1);
  assert.match(reads[0], /statsapi\.mlb\.com.*season=2026/);
  assert.equal(legResult(legs[0], out.get(legs[0].id)), 'won');
  assert.equal(legResult(legs[1], out.get(legs[1].id)), 'lost');
});

test('series: two series of one round (the wild card) are told apart by their clubs', () => {
  const s = sched([game('AL Wild Card', 1, 3, BOS, NYY, '2026-09-30T00:00:00Z', { winner: NYY }), game('AL Wild Card', 1, 3, CHW, TB, '2026-09-30T00:00:00Z', { winner: CHW })]);
  const list = mlbSeriesList(s, NOW);
  assert.equal(list.length, 2);
  assert.equal(list[0].need, 2);
});

test('conference champions: 運彩 sells NBA and NHL West/East and the NFL conferences, parsed from Polymarket and priced fat', () => {
  for (const key of ['nbaw', 'nbae', 'nhlw', 'nhle', 'afc', 'nfc']) assert.ok(EXTRA_FUTURES.some(f => f.key === key), key);
  const nbaw = EXTRA_FUTURES.find(f => f.key === 'nbaw');
  const events = [
    {
      title: 'NBA: 2027 Western Conference Champion',
      slug: 'nba-2027-west',
      markets: [
        { groupItemTitle: 'Oklahoma City Thunder', outcomes: '["Yes","No"]', outcomePrices: '["0.345","0.655"]' },
        { groupItemTitle: 'San Antonio Spurs', outcomes: '["Yes","No"]', outcomePrices: '["0.325","0.675"]' },
        { groupItemTitle: 'Denver Nuggets', outcomes: '["Yes","No"]', outcomePrices: '["0.055","0.945"]' },
        { groupItemTitle: 'Team A', outcomes: '["Yes","No"]', outcomePrices: '["0.5","0.5"]' }
      ]
    }
  ];
  const [m] = parseFutures(events, 'nba', [nbaw]);
  assert.equal(m.key, 'nbaw');
  assert.equal(m.season, '2026/27');
  assert.equal(m.teams.length, 3);
  const odds = estimateFuturesOdds(m.teams.map(t => t.fair), FUTURES_OVERROUND.nbaw);
  // (Short boards: a favourite's chance goes no more than halfway to certain.)
  const implied = odds.reduce((n, o) => n + 1 / o, 0);
  assert.ok(implied > 1.6 && implied <= 1.76, String(implied));
  // A trailing space in Polymarket's title ("Pro Football: 2027 AFC Champion ").
  assert.ok(EXTRA_FUTURES.find(f => f.key === 'afc').title.test('Pro Football: 2027 AFC Champion '));
});
