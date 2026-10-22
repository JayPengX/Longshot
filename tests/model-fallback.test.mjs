// Play's own model fills every market Kambi leaves out: players' picks from
// their season numbers, and soccer's corners.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoster, parseAthletes, totalsOf, blendTotals } from '../public/lib/players.mjs';
import { gameOptions } from '../public/lib/board.mjs';

test('rosters and season lists become players with the board\'s stat names', () => {
  const roster = { athletes: [{ position: 'x', items: [{ id: 7, displayName: 'Matt Olson', position: { abbreviation: '1B' }, headshot: { href: 'https://a.espncdn.com/i/headshots/mlb/players/full/7.png' } }] }] };
  const [p] = parseRoster(roster, 'mlb');
  assert.equal(p.name, 'Matt Olson');
  assert.ok(p.photo.includes('combiner') && p.photo.includes('/7.png'));
  const list = parseAthletes({ categories: [{ name: 'batting', names: ['gamesPlayed', 'atBats', 'runs', 'hits', 'homeRuns', 'RBIs'] }], athletes: [{ athlete: { id: '7', displayName: 'Matt Olson', teamId: '15' }, categories: [{ name: 'batting', values: [160, 600, 90, 160, 41, 93] }] }] });
  const t = totalsOf('baseball', list.get('7').raw);
  assert.deepEqual([t.gp, t.ab, t.hr, t.rbi], [160, 600, 41, 93]);
  assert.deepEqual(blendTotals({ gp: 2, goals: 1 }, { gp: 30, goals: 10 }), { gp: 17, goals: 6 });
});

test('the board falls back to the model: corners for soccer, never players', () => {
  const soccer = { id: 's', sport: 'epl', startUtc: '2026-10-10T11:30:00.000Z', home: { en: 'A' }, away: { en: 'B' }, draftKings: { home: 0.5, draw: 0.27, away: 0.23 }, polymarket: null, house: null, total: { line: 2.5, overFair: 0.5 }, spread: null };
  const kinds = new Set(gameOptions(soccer).map(o => o.kind));
  for (const k of ['corners', 'btts', 'dc', 'score']) assert.ok(kinds.has(k), k);
  // 和局退款 isn't on 運彩's list.
  assert.equal(kinds.has('dnb'), false);
  // No players' markets: 台灣運彩 sells none, read players or Kambi's or not.
  const withPlayers = { ...soccer, players: [{ name: 'Striker', side: 'home', pos: 'F', gp: 10, photo: 'x.png', totals: { gp: 10, subIns: 0, goals: 7, assists: 2, sot: 15 } }], offers: { markets: [], props: [{ stat: 'goals', line: 1, side: 'yes', player: 'Striker', fair: 0.3 }] } };
  assert.equal(gameOptions(withPlayers).filter(o => o.kind === 'prop').length, 0);
});
