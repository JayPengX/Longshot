// Kambi's leagues (歐洲籃球, 韓K聯): its list as games, a match over from
// its live data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseKambi, LEAGUES } from '../public/slips/lib/feed.mjs';

const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/slips/${name}`, import.meta.url)));
const NOW = Date.parse('2026-10-20T08:55:00Z');

test('EuroLeague from Kambi: the winner, the point spread and the total', () => {
  const [g] = parseKambi(fixture('kambi-euroleague.json'), 'euroleague', NOW);
  assert.equal(g.state, 'pre');
  assert.equal(g.market.spread.line, -8.5);
  assert.equal(g.market.total.line, 173.5);
  assert.equal(LEAGUES.euroleague.zh, '歐洲籃球');
});

test('only what Longshot follows well: no tennis, volleyball, badminton or table tennis', () => {
  for (const k of ['tennis', 'volleyball', 'badminton', 'tabletennis']) assert.equal(LEAGUES[k], undefined);
  assert.ok(LEAGUES.communityshield && LEAGUES.kleague && LEAGUES.euroleague);
});
