// Reading ESPN's and TheSportsDB's games.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { grade } from '../public/slips/lib/slip.mjs';
import { parseEspn, parseTsdbDay, parseAsia, twDay, shiftDay, gamesOn } from '../public/slips/lib/feed.mjs';

const fixture = async name => JSON.parse(await readFile(new URL(`./fixtures/slips/${name}`, import.meta.url)));

test('a game to come: its sides in Chinese and its closing lines with the margin out', async () => {
  const [g] = parseEspn(await fixture('epl-pre.json'), 'epl');
  assert.equal(g.state, 'pre');
  assert.equal(g.score, null);
  assert.equal(g.home.zh, '艾佛頓');
  assert.equal(g.away.zh, '切爾西');
  const w = g.market.win;
  assert.ok(Math.abs(w.home + w.draw + w.away - 1) < 1e-9);
  assert.equal(g.market.total.line, 2.5);
});

test('a game over: its final score, overtime included', async () => {
  const games = parseEspn(await fixture('nba-final.json'), 'nba');
  const ot = games.find(g => /OT/.test(g.detail));
  assert.equal(ot.state, 'post');
  assert.deepEqual(ot.score, { home: 120, away: 125 });
  assert.equal(ot.home.short, '76 人');
});

test("Taiwan's day is UTC+8", () => {
  assert.equal(twDay(Date.parse('2026-10-17T16:30:00Z')), '2026-10-18');
  assert.equal(twDay(Date.parse('2026-10-17T15:59:00Z')), '2026-10-17');
});

test('CPBL from TheSportsDB: a side held scoreless still has its 0', () => {
  const [g] = parseTsdbDay({ events: [{ idEvent: '1', strTimestamp: '2026-10-11T09:05:00', strHomeTeam: 'CTBC Brothers', strAwayTeam: 'Uni-President 7-Eleven Lions', intHomeScore: '', intAwayScore: '3', strStatus: 'FT' }] });
  assert.equal(g.state, 'post');
  assert.equal(g.homeScore, 0);
  const [x] = parseAsia([g], 'cpbl');
  assert.equal(x.home.zh, '中信兄弟');
  assert.equal(x.away.short, '統一獅');
});

test('a game with no date is left out, never the whole board', () => {
  const good = { id: '1', date: '2026-10-17T23:00Z', competitions: [{ competitors: [{ homeAway: 'home', team: { displayName: 'Boston Celtics' } }, { homeAway: 'away', team: { displayName: 'New York Knicks' } }], status: { type: { state: 'pre' } } }] };
  const bad = { id: '2', competitions: [{ competitors: good.competitions[0].competitors, status: { type: { state: 'pre' } } }] };
  assert.deepEqual(parseEspn({ events: [bad, good] }, 'nba').map(g => g.id), ['nba:1']);
  assert.deepEqual(parseAsia([{ id: 'x', start: 'nope' }, { id: 'y', start: '2026-10-17T10:35:00Z', home: { en: 'CTBC Brothers' }, away: { en: 'Fubon Guardians' } }], 'cpbl').map(g => g.id), ['cpbl:y']);
});

const ev = (id, type, extra = {}) => ({
  id,
  date: '2026-10-17T19:00Z',
  competitions: [{ competitors: [{ homeAway: 'home', score: '2', team: { displayName: 'Arsenal' }, linescores: [{ value: 1 }, { value: 0 }, { value: 1 }] }, { homeAway: 'away', score: '1', team: { displayName: 'Chelsea' }, linescores: [{ value: 0 }, { value: 1 }, { value: 0 }] }], status: { type, period: 2, displayClock: "67'" }, ...extra }]
});

test("ESPN's states: called off is void at once, put off or stopped waits (off), a final not yet completed is still on", () => {
  const [v] = parseEspn({ events: [ev('1', { name: 'STATUS_POSTPONED', state: 'post', completed: false })] }, 'epl');
  assert.deepEqual([v.state, v.score, v.off], ['pre', null, 'postponed']);
  const [s] = parseEspn({ events: [ev('1s', { name: 'STATUS_SUSPENDED', state: 'post', completed: false })] }, 'mlb');
  assert.deepEqual([s.state, s.score, s.off], ['in', { home: 2, away: 1 }, 'suspended']);
  const [c] = parseEspn({ events: [ev('2', { name: 'STATUS_CANCELED', state: 'pre' })] }, 'epl');
  assert.deepEqual([c.state, c.score, c.off], ['void', null, undefined]);
  // Abandoned part way: void, its score so far kept for the picks it decided.
  const [a] = parseEspn({ events: [ev('2a', { name: 'STATUS_ABANDONED', state: 'in' })] }, 'epl');
  assert.deepEqual([a.state, a.score], ['void', { home: 2, away: 1 }]);
  const [i] = parseEspn({ events: [ev('3', { name: 'STATUS_FINAL', state: 'post', completed: false })] }, 'epl');
  assert.deepEqual([i.state, i.score], ['in', { home: 2, away: 1 }]);
  const [l] = parseEspn({ events: [ev('4', { name: 'STATUS_SECOND_HALF', state: 'in', shortDetail: "67'" })] }, 'epl');
  assert.deepEqual([l.state, l.clock, l.period, l.home.zh, l.away.zh], ['in', "67'", 2, '兵工廠', '切爾西']);
  assert.deepEqual(parseEspn(null, 'epl'), []);
  assert.deepEqual(parseEspn({ events: [{ id: 'x' }] }, 'epl'), []);
});

test("soccer settles on 90 minutes: extra time's goals don't count", () => {
  const [g] = parseEspn({ events: [ev('5', { name: 'STATUS_FINAL_AET', state: 'post', completed: true })] }, 'ucl');
  assert.deepEqual(g.score, { home: 1, away: 1 });
  // Not soccer: the whole score.
  const [b] = parseEspn({ events: [ev('6', { name: 'STATUS_FINAL_AET', state: 'post', completed: true })] }, 'nba');
  assert.deepEqual(b.score, { home: 2, away: 1 });
});

test("the Asian leagues' games: states kept, a game to come has no score, nonsense is to come", () => {
  const list = [
    { id: 1, start: '2026-10-17T09:05:00Z', state: 'post', homeScore: 3, awayScore: 0, home: { en: 'Fubon Guardians' }, away: { en: 'Rakuten Monkeys' } },
    { id: 2, start: '2026-10-17T09:05:00Z', state: 'pre', homeScore: 0, awayScore: 0, home: { zh: '味全龍' }, away: { zh: '台鋼雄鷹' } },
    { id: 3, start: '2026-10-17T09:05:00Z', state: 'weird' },
    { id: 4, start: '2026-10-17T09:05:00Z', state: 'in', homeScore: null }
  ];
  const [a, b, c, d] = parseAsia(list, 'cpbl');
  assert.deepEqual([a.state, a.score, a.home.zh], ['post', { home: 3, away: 0 }, '富邦悍將']);
  assert.deepEqual([b.score, b.home.zh, b.home.short], [null, '味全龍', '味全龍']);
  assert.equal(c.state, 'pre');
  assert.equal(d.score, null);
  assert.deepEqual(parseAsia(null, 'npb'), []);
});

test("TheSportsDB's CPBL: the id this app always kept; called off, final, on by the clock", () => {
  const now = Date.parse('2026-10-11T10:00:00Z');
  const e = (idEvent, extra) => ({ idEvent, strTimestamp: '2026-10-11T09:05:00', strHomeTeam: 'CTBC Brothers', strAwayTeam: 'Fubon Guardians', ...extra });
  const games = parseTsdbDay({ events: [e('1', { strStatus: 'PPD' }), e('2', { strStatus: 'FT', intHomeScore: '4', intAwayScore: '2' }), e('3', {}), e('4', { strTimestamp: '2026-10-11T12:05:00' })] }, now);
  assert.deepEqual(games.map(g => [g.id, g.state]), [['tsdb-1', 'void'], ['tsdb-2', 'post'], ['tsdb-3', 'in'], ['tsdb-4', 'pre']]);
  assert.deepEqual(parseTsdbDay(null), []);
});

test('days: a day either side, over months and years; an unknown league has no games', async () => {
  assert.equal(shiftDay('2026-10-31', 1), '2026-11-01');
  assert.equal(shiftDay('2026-01-01', -1), '2025-12-31');
  assert.equal(shiftDay('2028-02-28', 1), '2028-02-29');
  assert.deepEqual(await gamesOn('nope', '2026-10-18'), []);
});

test('hockey settles on 60 minutes: an overtime win is a tie after three periods (a real NHL game, 2026-04-12)', async () => {
  // Devils 4, Senators 3 in overtime; 3-3 after 60.
  const [g] = parseEspn(await fixture('nhl-ot.json'), 'nhl');
  assert.equal(g.state, 'post');
  assert.deepEqual(g.score, { home: 3, away: 3 });
  const leg = (kind, side, line) => ({ kind, side, line, game: g });
  assert.equal(grade(leg('ml', 'home'), 3, 3), 'lost', '不讓分 has a draw: the overtime winner loses');
  assert.equal(grade(leg('ml', 'draw'), 3, 3), 'won');
  assert.equal(grade(leg('total', 'under', 6.5), 3, 3), 'won', 'the overtime goal not counted');
});

test("a league's days around today: ESPN's month boards, each game on its Taipei day", async () => {
  const { gamesAround, useReader } = await import('../public/slips/lib/feed.mjs');
  const data = JSON.parse(await (await import('node:fs/promises')).readFile(new URL('./fixtures/slips/nba-final.json', import.meta.url)));
  const urls = [];
  useReader(async url => (urls.push(url), data));
  try {
    const all = await gamesAround('nba', '2026-10-30', '2026-11-05');
    assert.deepEqual(urls.map(u => /dates=(\d+)/.exec(u)[1]), ['202610', '202611']);
    assert.ok(Array.isArray(all));
    assert.ok((await gamesAround('nba', '2000-01-01', '2040-12-31')).length >= 1);
    assert.equal((await gamesAround('nba', '2000-01-01', '2000-01-02')).length, 0, 'none outside the days');
  } finally {
    useReader(null);
  }
});
