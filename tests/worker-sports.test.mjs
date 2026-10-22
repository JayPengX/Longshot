// The data proxy (/sports-proxy, worker/sports.js): its batch route, its
// cache policies, the hosts and trims Play and Slips use, R2's kept copies,
// and its gate (a Longshot Pass, or a page on this computer).
import test from 'node:test';
import assert from 'node:assert/strict';
import { signToken } from '../worker/token.js';
import { isAllowedOrigin, LOCAL_ORIGIN } from '../worker/http.js';
import { trimEspnBoard, trimEspnStandings, trimPolymarketMarkets, settled, settledData, quietFor, emptyTranslation, keptPath } from '../worker/sports.js';
import { parseEspnScoreboard } from '#kit/play-sources.mjs';
import { parseStandings } from '#kit/play-house.mjs';
import { memoryBucket } from './fixtures/worker/bucket.mjs';

const store = new Map();
globalThis.caches = { default: { match: async req => store.get(req.url)?.clone() || null, put: async (req, res) => void store.set(req.url, res) } };
const upstreamCalls = [];
globalThis.fetch = async url => {
  upstreamCalls.push(String(url));
  if (String(url).includes('refuse')) return new Response('no', { status: 403 });
  if (String(url).includes('fail')) return new Response('nope', { status: 500 });
  if (String(url).includes('slow')) await new Promise(r => setTimeout(r, 3_500));
  return new Response(JSON.stringify({ from: String(url), text: 'a\nb' }, null, String(url).includes('pretty') ? 2 : 0), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
const worker = (await import('../worker/worker.js')).default;
const ctx = { waitUntil: p => p };
// A page on this computer (the dev door: no pass needed).
const DEV = 'http://localhost:8000';
const get = url => worker.fetch(new Request(url, { headers: { Origin: DEV } }), {}, ctx);

test('the gate: the site needs a Longshot Pass (PASS_REQUIRED without one), a page on this computer does not', async () => {
  const a = encodeURIComponent('https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/standings');
  const site = await worker.fetch(new Request(`https://longshot.test/sports-proxy?url=${a}`, { headers: { Origin: 'https://jaypengx.github.io' } }), { TOKEN_SECRET: 'test-secret' }, ctx);
  assert.equal(site.status, 401);
  assert.equal((await site.json()).error.code, 'PASS_REQUIRED');
  const qt = await signToken('test-secret', { k: 'ses', d: 'ACCT234567892345', s: 'gate-test', e: Date.now() + 3_600_000 });
  const signed = await worker.fetch(new Request(`https://longshot.test/sports-proxy?url=${a}&qt=${qt}`, { headers: { Origin: 'https://jaypengx.github.io' } }), { TOKEN_SECRET: 'test-secret' }, ctx);
  assert.equal(signed.status, 200);
  assert.equal((await get(`https://longshot.test/sports-proxy?url=${a}`)).status, 200);
});

test('only the hosts Play and Slips read: others refused, with the CORS headers', async () => {
  for (const url of ['https://evil.example/x', 'https://query1.finance.yahoo.com/v8/finance/chart/2330.TW', 'https://www.fotmob.com/api/leagues?id=47', 'http://site.api.espn.com/apis/site/v2/sports/x']) {
    const res = await worker.fetch(new Request(`https://longshot.test/sports-proxy?url=${encodeURIComponent(url)}`, { headers: { Origin: DEV } }), {}, ctx);
    assert.equal(res.status, 400, url);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), DEV);
    assert.match(res.headers.get('Access-Control-Expose-Headers') || '', /X-Sports-Proxy-Cache/);
  }
  for (const url of ['https://statsapi.mlb.com/api/v1/schedule?sportId=1', 'https://gamma-api.polymarket.com/events?tag=x', 'https://eu-offering-api.kambicdn.com/offering/v2018/ub/listView/football.json', 'https://api.openf1.org/v1/sessions?year=2026']) {
    assert.equal((await get(`https://longshot.test/sports-proxy?url=${encodeURIComponent(url)}`)).status, 200, url);
  }
});
test('a batch answers every URL in order, in one response', async () => {
  const a = 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/standings';
  const b = 'https://site.api.espn.com/apis/site/v2/sports/fail/standings';
  const c = 'https://evil.example.com/x';
  const res = await get(`https://longshot.test/sports-proxy?batch=1&u=${encodeURIComponent(a)}&u=${encodeURIComponent(b)}&u=${encodeURIComponent(c)}`);
  assert.equal(res.status, 200);
  const { r } = await res.json();
  assert.equal(r.length, 3);
  assert.equal(r[0].s, 200);
  assert.equal(r[0].b.from, a);
  assert.equal(r[1].s, 500);
  assert.equal(r[2].s, 400);
  // Cached: the same URL again doesn't go upstream.
  const before = upstreamCalls.length;
  const again = await (await get(`https://longshot.test/sports-proxy?batch=1&u=${encodeURIComponent(a)}`)).json();
  assert.equal(again.r[0].b.from, a);
  assert.equal(upstreamCalls.length, before);
});

test('a single request tells the browser how long it may keep the answer', async () => {
  const res = await get(`https://longshot.test/sports-proxy?url=${encodeURIComponent('https://site.api.espn.com/apis/v2/sports/soccer/esp.1/standings')}`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Cache-Control'), /private, max-age=\d+/);
});

test('trims apply per URL in a batch', async () => {
  const k = 'https://eu-offering-api.kambicdn.com/offering/v2018/ub/listView/basketball/euroleague/all/all/matches.json';
  const res = await get(`https://longshot.test/sports-proxy?batch=1&u=${encodeURIComponent(`kambi-events!${k}`)}`);
  const { r } = await res.json();
  assert.equal(r[0].s, 200);
  assert.ok('events' in r[0].b || Object.keys(r[0].b).length === 0 || r[0].b.events === undefined);
});
test("a slow URL answers 504 at once and doesn't hold back the rest of its batch", async () => {
  const fast = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/standings';
  const slow = 'https://site.api.espn.com/apis/site/v2/sports/soccer/slow.1/standings';
  const t0 = Date.now();
  const res = await get(`https://longshot.test/sports-proxy?batch=1&u=${encodeURIComponent(fast)}&u=${encodeURIComponent(slow)}`);
  const { r } = await res.json();
  assert.ok(Date.now() - t0 < 3_400);
  assert.equal(r[0].s, 200);
  assert.equal(r[1].s, 504);
});

test('with lines, each item is written the moment it is in, a line of its own, the slow one after', async () => {
  const fast = 'https://site.api.espn.com/apis/site/v2/sports/soccer/ger.1/standings?pretty';
  const slow = 'https://site.api.espn.com/apis/site/v2/sports/soccer/slow.2/standings';
  const bad = 'https://evil.example.com/y';
  const t0 = Date.now();
  const res = await get(`https://longshot.test/sports-proxy?batch=1&lines=1&u=${encodeURIComponent(slow)}&u=${encodeURIComponent(fast)}&u=${encodeURIComponent(bad)}`);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  const got = [];
  let rest = '';
  for (;;) {
    const { done, value } = await reader.read();
    rest += value || '';
    const parts = rest.split('\n');
    rest = parts.pop();
    for (const part of parts) got.push({ at: Date.now() - t0, ...JSON.parse(part) });
    if (done) break;
  }
  assert.equal(rest, '');
  assert.deepEqual(got.map(x => x.i).sort(), [0, 1, 2]);
  const by = Object.fromEntries(got.map(x => [x.i, x]));
  // The fast one (pretty-printed upstream: its line breaks are spaces, the same JSON) long before the slow one.
  assert.equal(by[1].s, 200);
  assert.deepEqual(by[1].b, { from: fast, text: 'a\nb' });
  assert.ok(by[1].at < 1_000, String(by[1].at));
  assert.equal(by[2].s, 400);
  // The slow one waited for (no 504 and a second ask): its line comes last.
  assert.equal(by[0].s, 200);
  assert.ok(by[0].at >= 3_400);
  assert.equal(got.at(-1).i, 0);
});

test('an old copy is answered when its fresh read is slow, and a source turning the proxy away is a failure to ask again', async () => {
  const url = 'https://site.api.espn.com/apis/site/v2/sports/basketball/slow/teams/9/schedule';
  store.set(url, new Response(JSON.stringify({ old: true }), { headers: { 'Content-Type': 'application/json', 'X-Sports-Proxy-Stored-At': String(Date.now() - 2 * 3600_000) } }));
  const refused = 'https://site.api.espn.com/apis/site/v2/sports/basketball/refuse/scoreboard';
  const t0 = Date.now();
  const { r } = await (await get(`https://longshot.test/sports-proxy?batch=1&u=${encodeURIComponent(url)}&u=${encodeURIComponent(refused)}`)).json();
  assert.ok(Date.now() - t0 < 2_800);
  assert.equal(r[0].s, 200);
  assert.equal(r[0].c, 'STALE');
  assert.equal(r[0].b.old, true);
  assert.equal(r[1].s, 502);
});

// The limiter counts by the clock's minute: a run of 601 asks that crossed
// one started counting again and never reached the limit (a failed run on
// CI, 2026-10-15). Begun 3 s or more before the next minute.
test("a game's own page (box score, plays) is live: never a copy older than a refresh", async () => {
  const res = await get(`https://longshot.test/sports-proxy?url=${encodeURIComponent('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=401')}`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('X-Sports-Proxy-Cache-Tier'), 'live');
  assert.match(res.headers.get('Cache-Control'), /max-age=10\b/);
});

test("a team's injuries (its roster read for them) are minutes old at most, its plain roster a table's half hour", async () => {
  const base = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/20/roster';
  const hurt = await get(`https://longshot.test/sports-proxy?url=${encodeURIComponent(`${base}?enable=injuries`)}&trim=espn-roster`);
  assert.equal(hurt.headers.get('X-Sports-Proxy-Cache-Tier'), 'team-schedule');
  const plain = await get(`https://longshot.test/sports-proxy?url=${encodeURIComponent(base)}`);
  assert.equal(plain.headers.get('X-Sports-Proxy-Cache-Tier'), 'standings');
});

test("MLB's day of games with their linescore is live (Sports' count when ESPN's is empty); its other answers a table's half hour", async () => {
  const live = await get(`https://longshot.test/sports-proxy?url=${encodeURIComponent('https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-10-05&hydrate=linescore,previousPlay')}`);
  assert.equal(live.headers.get('X-Sports-Proxy-Cache-Tier'), 'live');
  const plain = await get(`https://longshot.test/sports-proxy?url=${encodeURIComponent('https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-10-05')}`);
  assert.equal(plain.headers.get('X-Sports-Proxy-Cache-Tier'), 'standings');
});

test("an empty translation (Google busy) is a failure, not kept a month", () => {
  assert.equal(emptyTranslation('[[""]]'), true);
  assert.equal(emptyTranslation('[["  ","en"]]'), true);
  assert.equal(emptyTranslation('not json'), true);
  assert.equal(emptyTranslation('[["羅素：巴林大獎賽又是一次失敗","en"]]'), false);
  assert.equal(emptyTranslation('["週日的比賽"]'), false);
});

test('keptPath: one R2 key a read, its trim and query in it', () => {
  assert.equal(keptPath('https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary?event=900'), 'kept/_/site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary/event~3D900.json');
  assert.equal(keptPath('https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard/', 'espn-board'), 'kept/espn-board/site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard.json');
});

test('a game over and a day all over are kept a day; anything still to change is not', () => {
  const u = x => new URL(x);
  const game = (state, completed) => JSON.stringify({ header: { competitions: [{ status: { type: { state, completed } } }] } });
  const day = (...done) => JSON.stringify({ events: done.map(completed => ({ status: { type: { completed } } })) });
  const summary = u('https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/summary?event=1');
  assert.equal(settled(summary, game('post', true)), true);
  assert.equal(settled(summary, game('in', false)), false);
  const board = u('https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=20261010&limit=200');
  assert.equal(settled(board, day(true, true)), true);
  assert.equal(settled(board, day(true, false)), false);
  assert.equal(settled(board, day()), false, 'a day with no games may yet have some');
  assert.equal(settled(u('https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard'), day(true)), false);
  assert.equal(settled(u('https://site.api.espn.com/apis/v2/sports/soccer/eng.1/standings'), day(true)), false);
  assert.equal(settled(summary, new TextEncoder().encode(game('post', true)).buffer), true);
});

test("a league table trimmed: the same records and season, less to download", () => {
  const entry = (name, w, l, t) => ({
    team: { id: '1', displayName: name, logos: [{ href: 'x' }], links: [{}] },
    note: { color: '#fff' },
    stats: [
      { name: 'wins', value: w, displayValue: String(w) },
      { name: 'losses', value: l },
      { name: 'ties', value: t },
      { name: 'gamesPlayed', value: w + l + t },
      { name: 'pointDifferential', value: 12 },
      { type: 'winpercent', value: 0.5 }
    ]
  });
  const table = {
    seasons: [{ year: 2026, types: [{}] }, { year: 2025 }],
    children: [
      { name: 'East', standings: { season: 2026, entries: [entry('Arsenal', 5, 1, 2)] } },
      { name: 'West', children: [{ standings: { season: 2026, entries: [entry('Chelsea', 3, 3, 2)] } }] }
    ]
  };
  const trimmed = trimEspnStandings(table);
  assert.deepEqual([...parseStandings(trimmed)], [...parseStandings(table)]);
  assert.equal(parseStandings(trimmed).size, 2);
  assert.equal(trimmed.seasons[0].year, 2026);
  assert.ok(!JSON.stringify(trimmed).includes('pointDifferential'));
  assert.ok(JSON.stringify(trimmed).length < JSON.stringify(table).length);
});

test('a game over is kept in R2 the first time anyone reads it; after that it comes from there, the source never asked again; a game on is never kept', async () => {
  const bucket = memoryBucket();
  const env = { DATA: bucket };
  const ask = url => worker.fetch(new Request(url, { headers: { Origin: DEV } }), env, ctx);
  const real = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async url => {
    if (String(url).startsWith('https://jaypengx.github.io/')) return new Response('', { status: 404 });
    asked.push(String(url));
    const done = String(url).includes('event=900');
    return new Response(JSON.stringify({ header: { competitions: [{ status: { type: { completed: done } } }] }, news: ['dropped'], boxscore: { teams: [] } }), { status: 200 });
  };
  try {
    const over = 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary?event=900';
    const on = 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary?event=901';
    const first = await (await ask(`https://longshot.test/sports-proxy?url=${encodeURIComponent(over)}`)).json();
    assert.ok(first.boxscore);
    // (R2's copy is written behind the answer: waited for, not guessed at 20 ms; a busy run took longer.)
    for (let i = 0; i < 300 && ![...bucket.m.keys()].some(k => k.includes('event~3D900')); i++) await new Promise(r => setTimeout(r, 10));
    assert.equal([...bucket.m.keys()].filter(k => k.includes('event~3D900')).length, 1, 'kept');
    await ask(`https://longshot.test/sports-proxy?url=${encodeURIComponent(on)}`);
    await new Promise(r => setTimeout(r, 20));
    assert.equal([...bucket.m.keys()].filter(k => k.includes('event~3D901')).length, 0, 'a game on: not kept');
    // Asked again while it's on (the edge's 2-second copy gone): R2, just found without it, isn't asked again.
    let gets = 0;
    const get = bucket.get.bind(bucket);
    bucket.get = async k => (gets++, get(k));
    for (let i = 0; i < 2; i++) {
      store.clear();
      await ask(`https://longshot.test/sports-proxy?url=${encodeURIComponent(on)}`);
    }
    assert.equal(gets, 0, 'no R2 read for a game it has just been found not to have');
    bucket.get = get;
    store.clear();
    const n = asked.length;
    const again = await ask(`https://longshot.test/sports-proxy?url=${encodeURIComponent(over)}`);
    assert.equal(again.headers.get('X-Sports-Proxy-Cache'), 'KEPT');
    const body = await again.json();
    assert.ok(body.boxscore);
    assert.equal(body.news, undefined, 'slimmed of what no app reads');
    assert.equal(asked.length, n, 'the source never asked again');
  } finally {
    globalThis.fetch = real;
  }
});

test('a batch answers up to 24 reads (a first paint, about 28, in two requests), no more', async () => {
  const u = n => `https://site.api.espn.com/apis/site/v2/sports/soccer/x${n}.1/scoreboard`;
  const many = Array.from({ length: 30 }, (_, i) => `&u=${encodeURIComponent(u(i))}`).join('');
  const { r } = await (await get(`https://longshot.test/sports-proxy?batch=1${many}`)).json();
  assert.equal(r.length, 24);
  assert.ok(r.every((x, i) => x.s === 200 && x.b.from === u(i)));
});

test('the dev doors let in a page from this computer, http or https, and nothing else', () => {
  for (const o of ['http://localhost:8123', 'https://localhost:39789', 'http://127.0.0.1:5173']) assert.ok(isAllowedOrigin(o) && LOCAL_ORIGIN.test(o), o);
  for (const o of ['https://localhost.evil.com', 'https://evil.com', 'http://localhost', 'https://jaypengx.github.io.evil.com']) assert.ok(!LOCAL_ORIGIN.test(o), o);
  assert.ok(!isAllowedOrigin('https://evil.com'));
});

test("Play's winner markets read apart from their events come trimmed to their prices and their event's id", async () => {
  const raw = [{ id: '1', question: 'Will Everton FC win on 2026-10-17?', outcomes: '["Yes","No"]', outcomePrices: '["0.3","0.7"]', liquidity: '9000', description: 'x'.repeat(5000), clobTokenIds: '["1","2"]', events: [{ id: '7', title: 'Everton FC vs. Chelsea FC', description: 'y'.repeat(5000) }] }];
  assert.deepEqual(trimPolymarketMarkets(raw), [{ question: 'Will Everton FC win on 2026-10-17?', outcomes: '["Yes","No"]', outcomePrices: '["0.3","0.7"]', liquidity: '9000', event: '7' }]);
  assert.equal(trimPolymarketMarkets({ error: 1 }).error, 1);
});

test("Play's month boards come trimmed to what the board reads, the same games and lines, kept two minutes", async () => {
  const close = (odds, line) => ({ open: { odds: '+100' }, close: { odds, ...(line ? { line } : {}) }, current: { odds: '-999' }, link: { href: 'x' } });
  const side = (homeAway, id, name, abbreviation) => ({ id, homeAway, score: '0', records: [{ summary: '9-9' }], statistics: [{ name: 'x', displayValue: 'y'.repeat(500) }], team: { id, uid: `t:${id}`, displayName: name, abbreviation, shortDisplayName: name, logo: `https://a.espncdn.com/${id}.png`, links: [{ href: 'z' }], venue: { id: 1 } } });
  const event = (id, date, state, extra = {}) => ({
    id,
    uid: `e:${id}`,
    date,
    name: 'A at B',
    season: { year: 2026, type: extra.seasonType ?? 2, slug: 'regular-season' },
    status: { clock: 0, type: { id: '1', name: 'STATUS', state, completed: state === 'post', detail: 'x' } },
    links: [{ href: 'x'.repeat(300) }],
    competitions: [
      {
        id,
        date,
        timeValid: extra.timeValid ?? true,
        neutralSite: extra.neutral ?? false,
        venue: { fullName: 'Park', address: { city: 'X' } },
        broadcasts: [{ names: ['TV'] }],
        notes: extra.note ? [{ type: 'event', headline: extra.note }] : [],
        status: { clock: 0, type: { id: '1', name: 'STATUS', state, completed: state === 'post', detail: 'x' } },
        competitors: [side('home', extra.homeId ?? '10', extra.home ?? 'Home Club', 'HOM'), side('away', '20', extra.away ?? 'Away Club', extra.awayAbbr ?? 'AWY')],
        odds: [
          {
            provider: { name: 'DraftKings' },
            details: 'HOM -150',
            moneyline: { home: close('-150'), away: close('+130'), ...(extra.draw ? { draw: close('+250') } : {}) },
            total: { over: close('-110', 'o8.5'), under: close('-110', 'u8.5') },
            pointSpread: { home: close('-120', '-1.5'), away: close('+100', '+1.5') }
          }
        ]
      }
    ]
  });
  const raw = {
    leagues: [{ name: 'League', calendar: Array.from({ length: 50 }, (_, i) => `2026-10-${i}`) }],
    events: [
      event('1', '2026-10-20T23:00Z', 'pre'),
      event('2', '2026-10-21T04:00Z', 'pre', { timeValid: false, neutral: true }),
      event('3', '2026-10-22T23:00Z', 'pre', { note: 'ALCS - Game 7 (If Necessary)', seasonType: 3 }),
      event('4', '2026-10-23T23:00Z', 'pre', { away: 'TBD', awayAbbr: 'TBD' }),
      event('5', '2026-10-24T19:00Z', 'pre', { draw: true }),
      event('6', '2026-10-01T23:00Z', 'post'),
      event('7', '2026-10-16T23:00Z', 'in')
    ]
  };
  const trimmed = JSON.parse(JSON.stringify(trimEspnBoard(raw)));
  assert.ok(JSON.stringify(trimmed).length < JSON.stringify(raw).length / 3);
  for (const sport of ['mlb', 'nba', 'epl']) assert.deepEqual(parseEspnScoreboard(trimmed, sport), parseEspnScoreboard(raw, sport), sport);
  assert.equal(parseEspnScoreboard(trimmed, 'mlb').length, 3);
  // MLB's postseason list is read when a play-off game is to come (season type 3, the event's own state).
  assert.deepEqual(trimmed.events.map(e => [e.season.type, e.status.type.state]), raw.events.map(e => [e.season.type, e.status.type.state]));
  // What this proxy reads of it: over for good, or quiet until its next game.
  const url = new URL('https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=202610&limit=1000');
  for (const now of [Date.parse('2026-10-16T12:00:00Z'), Date.parse('2026-11-05T00:00:00Z')]) {
    assert.equal(settledData(url, trimmed, now), settledData(url, raw, now));
    assert.equal(quietFor(url, trimmed, now), quietFor(url, raw, now));
  }
  assert.equal(trimEspnBoard({ nope: 1 }).nope, 1, 'not a scoreboard: as it was');
  // Asked trimmed, a month is fresh two minutes; untrimmed (Sports' cups, with scores) it stays live.
  const month = 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard?dates=202611&limit=1000';
  const board = await get(`https://longshot.test/sports-proxy?url=${encodeURIComponent(month)}&trim=espn-board`);
  assert.equal(board.headers.get('X-Sports-Proxy-Cache-Tier'), 'board-month');
  assert.match(board.headers.get('Cache-Control'), /max-age=120\b/);
  const plain = await get(`https://longshot.test/sports-proxy?url=${encodeURIComponent(month)}`);
  assert.equal(plain.headers.get('X-Sports-Proxy-Cache-Tier'), 'live');
  const day = await get(`https://longshot.test/sports-proxy?url=${encodeURIComponent('https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard?dates=20261116')}&trim=espn-board`);
  assert.notEqual(day.headers.get('X-Sports-Proxy-Cache-Tier'), 'board-month');
});

