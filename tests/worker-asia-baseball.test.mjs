// Asian baseball from the leagues' own sites (worker/asia-baseball.js), on saved pages.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseNpb, parseKbo, parseTsdbDay, asiaTarget, asiaBaseballResponse, ASIA_HOST } from '../worker/asia-baseball.js';

const fixture = name => readFileSync(new URL(`./fixtures/worker/${name}`, import.meta.url), 'utf8');
const now = Date.parse('2026-09-29T12:00:00Z');
const at = path => new URL(`https://${ASIA_HOST}${path}`);

test('NPB: home first, Japan time, finished once a winner is named', () => {
  const games = parseNpb(fixture('npb-2026-09.html'), 2026, now);
  assert.equal(games.length, 7);
  const giants = games[0];
  assert.deepEqual([giants.home.en, giants.away.en, giants.homeScore, giants.awayScore, giants.state], ['Yomiuri Giants', 'Tokyo Yakult Swallows', 11, 0, 'post']);
  assert.equal(giants.start, '2026-09-27T09:00:00.000Z');
  assert.equal(giants.home.zh, '讀賣巨人');
  const next = games.at(-1);
  assert.equal(next.state, 'pre');
  assert.equal(next.homeScore, null);
  // On after its start, until a winner is named.
  assert.equal(parseNpb(fixture('npb-2026-09.html'), 2026, Date.parse('2026-09-30T10:00:00Z')).at(-1).state, 'in');
});

test('KBO: away first in the list, rain-outs void', () => {
  const games = parseKbo(JSON.parse(fixture('kbo-2026-09.json')), 2026, now);
  assert.equal(games.length, 10);
  const [first] = games;
  assert.deepEqual([first.away.en, first.home.en, first.awayScore, first.homeScore, first.state], ['NC Dinos', 'Doosan Bears', 2, 5, 'post']);
  assert.equal(first.start, '2026-09-29T09:30:00.000Z');
  assert.ok(games.slice(5).every(g => g.state === 'pre' && g.homeScore == null));
  const rained = parseKbo({ rows: [{ row: [{ Class: 'day', Text: '09.03(수)' }, { Class: 'time', Text: '<b>18:30</b>' }, { Class: 'play', Text: '<span>LG</span><em><span>vs</span></em><span>두산</span>' }, { Class: 'relay', Text: '' }, { Class: null, Text: '잠실' }, { Class: null, Text: '우천취소' }] }] }, 2026, now);
  assert.equal(rained[0].state, 'void');
});

test("CPBL: TheSportsDB's day list", () => {
  const day = parseTsdbDay(JSON.parse(fixture('tsdb-cpbl-2026-09-28.json')), now);
  assert.equal(day.length, 3);
  assert.deepEqual([day[0].away.zh, day[0].awayScore, day[0].homeScore, day[0].home.zh, day[0].state], ['台鋼雄鷹', 10, 19, '中信兄弟', 'post']);
  assert.ok(day.some(g => g.away.en === 'Uni-President Lions'));
});
test('the address names a league and a month', () => {
  assert.deepEqual(asiaTarget(at('/kbo/2026-09.json')), { league: 'kbo', year: 2026, month: 9 });
  assert.equal(asiaTarget(at('/mlb/2026-09.json')), null);
  assert.equal(asiaTarget(at('/npb/2026-13.json')), null);
  assert.equal(asiaTarget(at('/cpbl/box/2026-290.json')), null, 'no box scores here');
});

test('CPBL: every source refusing is an error, never an empty month', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async url => new Response('no', { status: String(url).includes('thesportsdb') ? 403 : 404 });
  try {
    const r = await asiaBaseballResponse(at('/cpbl/2026-10.json'));
    assert.equal(r.status, 502);
    assert.match((await r.json()).error, /tsdb 403/);
  } finally {
    globalThis.fetch = real;
  }
});

test('CPBL: TheSportsDB refusing a day is not asked again (the phones read it); December asks nothing and is no games', async () => {
  const real = globalThis.fetch;
  const asked = new Map();
  globalThis.fetch = async url => {
    const u = String(url);
    if (!u.includes('thesportsdb')) return new Response('no', { status: 404 });
    asked.set(u, (asked.get(u) || 0) + 1);
    return new Response(JSON.stringify({ events: [{ idEvent: '9', strTimestamp: '2026-11-01T09:05:00', strHomeTeam: 'CTBC Brothers', strAwayTeam: 'Uni-President Lions', strStatus: 'NS' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const r = await asiaBaseballResponse(at('/cpbl/2026-11.json'));
    assert.equal(r.status, 200);
    assert.ok((await r.json()).games.length >= 1);
    assert.ok([...asked.values()].every(n => n === 1));
    asked.clear();
    const dec = await asiaBaseballResponse(at('/cpbl/2026-12.json'));
    assert.equal(dec.status, 200);
    assert.deepEqual((await dec.json()).games, []);
    assert.equal(asked.size, 0);
  } finally {
    globalThis.fetch = real;
  }
});


test('CPBL play-offs: TheSportsDB by round 0', () => {
  const tsdb = parseTsdbDay({ events: [{ idEvent: '1', strTimestamp: '2026-10-09T09:05:00', strHomeTeam: 'CTBC Brothers', strAwayTeam: 'Uni-President Lions', intRound: '0', strStatus: 'FT', intHomeScore: '4', intAwayScore: '1' }, { idEvent: '2', strTimestamp: '2026-10-01T09:05:00', strHomeTeam: 'TSG Hawks', strAwayTeam: 'Rakuten Monkeys', intRound: '21', strStatus: 'FT', intHomeScore: '1', intAwayScore: '2' }] });
  assert.deepEqual(tsdb.map(g => g.playoff), [true, undefined]);
});

test('TheSportsDB leaves a scoreless side empty: it is 0 once the other side has a score', () => {
  const [g] = parseTsdbDay({ events: [{ idEvent: '1', strTimestamp: '2026-10-10T09:05:00', strHomeTeam: 'Uni-President Lions', strAwayTeam: 'CTBC Brothers', intHomeScore: '1', intAwayScore: null, strStatus: 'FT', intRound: '0' }] }, Date.parse('2026-10-10T14:00:00Z'));
  assert.equal(g.awayScore, 0);
  assert.equal(g.homeScore, 1);
  const [pre] = parseTsdbDay({ events: [{ idEvent: '2', strTimestamp: '2026-10-11T09:05:00', strHomeTeam: 'Uni-President Lions', strAwayTeam: 'CTBC Brothers', intHomeScore: null, intAwayScore: null, strStatus: 'NS' }] }, Date.parse('2026-10-10T14:00:00Z'));
  assert.equal(pre.awayScore, null);
});

test('TheSportsDB time: UTC when bare, kept when it names its zone (+00:00, Z, +08:00)', () => {
  const at = strTimestamp => parseTsdbDay({ events: [{ idEvent: '1', strTimestamp, strHomeTeam: 'CTBC Brothers', strAwayTeam: 'Uni-President Lions', strStatus: 'NS' }] })[0].start;
  assert.equal(at('2026-10-11T09:05:00'), '2026-10-11T09:05:00.000Z');
  assert.equal(at('2026-10-11T09:05:00+00:00'), '2026-10-11T09:05:00.000Z');
  assert.equal(at('2026-10-11T09:05:00Z'), '2026-10-11T09:05:00.000Z');
  assert.equal(at('2026-10-11T17:05:00+08:00'), '2026-10-11T09:05:00.000Z');
});
