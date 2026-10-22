// ---- asia-baseball.js ----
// Asian baseball's schedules and scores from the leagues' own sites, as one
// shape for Play and the tickets followed. Kambi (Play's odds feed) only
// lists a game a day or so ahead and drops it after, and ESPN doesn't carry
// these leagues.
//
//   NPB   npb.jp's monthly schedule page (HTML)
//   KBO   koreabaseball.com's monthly schedule list (a POST answered in JSON rows)
//   CPBL  TheSportsDB's day lists (CPBL's own site turns addresses outside Taiwan away)
//
// Served by the sports proxy as if from the kit's ASIA_URL
// (`<ASIA_URL>/<league>/<YYYY-MM>.json`, a host that isn't real), so the app
// reads it through the proxy like any other list:
//   { league, month, games: [{ id, start, home: { en, zh }, away, homeScore,
//     awayScore, state: 'pre' | 'in' | 'post' | 'void', venue }] }
// `start` is UTC. A game "in" is one past its start and not yet marked over.

import { parseTsdbDay, TSDB_DAY, TSDB_CPBL, ASIA_URL } from '#kit/catalog.mjs';

// Whatever host the kit names (the app and this Worker must agree).
export const ASIA_HOST = new URL(ASIA_URL).hostname;

// Each club: the source's name -> English (the logo tables' spelling) and Taiwan's name.
const NPB_TEAMS = {
  巨人: ['Yomiuri Giants', '讀賣巨人'],
  ヤクルト: ['Tokyo Yakult Swallows', '東京養樂多燕子'],
  DeNA: ['Yokohama DeNA BayStars', '橫濱DeNA海灣之星'],
  中日: ['Chunichi Dragons', '中日龍'],
  阪神: ['Hanshin Tigers', '阪神虎'],
  広島: ['Hiroshima Toyo Carp', '廣島東洋鯉魚'],
  日本ハム: ['Hokkaido Nippon-Ham Fighters', '北海道日本火腿鬥士'],
  楽天: ['Tohoku Rakuten Golden Eagles', '東北樂天金鷲'],
  西武: ['Saitama Seibu Lions', '埼玉西武獅'],
  ロッテ: ['Chiba Lotte Marines', '千葉羅德海洋'],
  オリックス: ['Orix Buffaloes', '歐力士猛牛'],
  ソフトバンク: ['Fukuoka SoftBank Hawks', '福岡軟銀鷹']
};
const KBO_TEAMS = {
  LG: ['LG Twins', 'LG雙子'],
  두산: ['Doosan Bears', '斗山熊'],
  KIA: ['Kia Tigers', '起亞虎'],
  삼성: ['Samsung Lions', '三星獅'],
  롯데: ['Lotte Giants', '樂天巨人'],
  한화: ['Hanwha Eagles', '韓華鷹'],
  NC: ['NC Dinos', 'NC恐龍'],
  KT: ['KT Wiz', 'KT巫師'],
  SSG: ['SSG Landers', 'SSG登陸者'],
  키움: ['Kiwoom Heroes', '培證英雄']
};
const team = (table, name) => {
  const hit = table[String(name || '').trim()];
  return hit ? { en: hit[0], zh: hit[1] } : { en: String(name || '').trim(), zh: String(name || '').trim() };
};

const HOUR = 3_600_000;
// A game past its start and not marked over counts as on for this long.
const LONGEST = 5 * HOUR;
const clean = html => String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
// A local wall-clock time in a zone `offset` hours ahead of UTC, as UTC ISO.
const utc = (y, m, d, hh, mm, offset) => new Date(Date.UTC(y, m - 1, d, hh - offset, mm)).toISOString();
const num = x => (x === '' || x == null || !Number.isFinite(Number(x)) ? null : Number(x));
function stateOf({ start, over, scored, now }) {
  if (over) return 'post';
  const t = Date.parse(start);
  if (now < t) return 'pre';
  if (now - t < LONGEST) return 'in';
  return scored ? 'post' : 'pre';
}

// ---- NPB -------------------------------------------------------------------------

export function parseNpb(html, year, now = Date.now()) {
  const games = [];
  for (const part of String(html).split(/<tr id="date(\d{4})"/).slice(1).reduce((out, x, i, all) => (i % 2 === 0 ? [...out, [x, all[i + 1]]] : out), [])) {
    const [mmdd, body] = part;
    const home = /class="team1">([^<]*)</.exec(body)?.[1];
    const away = /class="team2">([^<]*)</.exec(body)?.[1];
    if (!home || !away) continue;
    const time = /class="time">\s*(\d{1,2}):(\d{2})/.exec(body);
    const [hh, mm] = time ? [Number(time[1]), Number(time[2])] : [18, 0];
    const start = utc(year, Number(mmdd.slice(0, 2)), Number(mmdd.slice(2)), hh, mm, 9);
    const homeScore = num(/class="score1">\s*(\d+)/.exec(body)?.[1]);
    const awayScore = num(/class="score2">\s*(\d+)/.exec(body)?.[1]);
    const comment = clean(/class="comment">([\s\S]*?)<\/div>/.exec(body)?.[1]);
    // Over once a winning pitcher is named (a tie names none: then by the clock).
    const over = /勝：/.test(body) || /引分/.test(comment);
    const id = /\/scores\/\d{4}\/(\d{4}\/[\w-]+)\//.exec(body)?.[1]?.replace('/', '-') || `${mmdd}-${home}-${away}`;
    const scored = homeScore != null && awayScore != null;
    games.push({
      id: `npb-${year}-${id}`,
      start,
      home: team(NPB_TEAMS, home),
      away: team(NPB_TEAMS, away),
      homeScore,
      awayScore,
      state: /中止|ノーゲーム/.test(comment) ? 'void' : stateOf({ start, over, scored, now }),
      venue: clean(/class="place">([^<]*)</.exec(body)?.[1])
    });
  }
  return games;
}

// ---- KBO -------------------------------------------------------------------------

// The list's rows: a day cell starts each day (rowspan), then per game its
// time, "AWAY score vs score HOME", the broadcast link (리뷰 once over,
// 프리뷰 before), TV, stadium and a note (우천취소, a rain-out).
export function parseKbo(data, year, now = Date.now()) {
  const games = [];
  let day = null;
  for (const { row } of data?.rows || []) {
    const cells = row || [];
    const dayCell = cells.find(c => c.Class === 'day');
    if (dayCell) day = /(\d{2})\.(\d{2})/.exec(dayCell.Text);
    const play = cells.find(c => c.Class === 'play');
    if (!day || !play) continue;
    const time = /(\d{1,2}):(\d{2})/.exec(clean(cells.find(c => c.Class === 'time')?.Text));
    const names = [...String(play.Text).matchAll(/<span>([^<]+)<\/span>/g)].map(m => m[1]).filter(x => x !== 'vs');
    if (names.length < 2) continue;
    const scores = [...String(play.Text).matchAll(/<span class="(?:win|lose|same)">(\d+)<\/span>/g)].map(m => Number(m[1]));
    const relay = clean(cells.find(c => c.Class === 'relay')?.Text);
    const rest = cells.filter(c => !c.Class).map(c => clean(c.Text));
    const start = utc(year, Number(day[1]), Number(day[2]), time ? Number(time[1]) : 18, time ? Number(time[2]) : 30, 9);
    const [away, home] = [names[0], names.at(-1)];
    const note = rest.at(-1) || '';
    const scored = scores.length === 2;
    games.push({
      id: `kbo-${start.slice(0, 10)}-${away}-${home}`,
      start,
      home: team(KBO_TEAMS, home),
      away: team(KBO_TEAMS, away),
      homeScore: scored ? scores[1] : null,
      awayScore: scored ? scores[0] : null,
      state: /취소|노게임/.test(note) || /취소/.test(relay) ? 'void' : stateOf({ start, over: relay === '리뷰', scored, now }),
      venue: rest.at(-2) || ''
    });
  }
  return games;
}

// ---- Fetching ----------------------------------------------------------------------

const UA = 'Mozilla/5.0 (compatible; Longshot/1.0)';
const TIMEOUT = 10_000;

async function fetchNpb(year, month) {
  const res = await fetch(`https://npb.jp/games/${year}/schedule_${String(month).padStart(2, '0')}_detail.html`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TIMEOUT) });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`npb ${res.status}`);
  return parseNpb(await res.text(), year);
}

async function fetchKbo(year, month) {
  const res = await fetch('https://www.koreabaseball.com/ws/Schedule.asmx/GetScheduleList', {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: 'https://www.koreabaseball.com/Schedule/Schedule.aspx'
    },
    body: `leId=1&srIdList=0%2C9%2C6&seasonId=${year}&gameMonth=${String(month).padStart(2, '0')}&teamId=`,
    signal: AbortSignal.timeout(TIMEOUT)
  });
  if (!res.ok) throw new Error(`kbo ${res.status}`);
  return parseKbo(await res.json(), year);
}

// TheSportsDB's day lists (its free key answers 3 games a request, CPBL's most in a day). Each day of the
// month up to two weeks ahead.
// The day lists and their parsing are the kit's (shared with the apps, which
// read them straight from the device when this proxy can't).
export { parseTsdbDay };
const TSDB = TSDB_DAY;

// The days of the month from `from` up to two weeks ahead, each day's list
// kept 10 minutes at Cloudflare's edge (TheSportsDB's free key is rate-limited).
// At most TSDB_DAYS of them, the nearest to now first: TheSportsDB's free
// key turns a burst away, and a batch asks for three months at once
// and two days back to two weeks ahead fit). A day over (two back) is kept
// a week at the edge, not 10 minutes.
const TSDB_DAYS = 16;
// `work` on each item, `n` at a time; the answers in the items' order.
async function inTurns(items, n, work) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await work(items[i]);
    }
  }));
  return out;
}
const TSDB_TIMEOUT = 5_000;
async function fetchCpblTsdb(year, month, { from = Date.UTC(year, month - 1, 1), now = Date.now() } = {}) {
  let days = [];
  const last = Math.min(Date.UTC(year, month, 0), now + 14 * 24 * HOUR);
  for (let t = Math.floor(from / (24 * HOUR)) * 24 * HOUR; t <= last; t += 24 * HOUR) days.push(new Date(t).toISOString().slice(0, 10));
  days = days.sort((a, b) => Math.abs(Date.parse(a) - now) - Math.abs(Date.parse(b) - now)).slice(0, TSDB_DAYS);
  const over = new Date(now - 2 * 24 * HOUR).toISOString().slice(0, 10);
  // A day that fails counts as empty, but every day failing is a failure
  // (reason kept): never an empty month served and cached as if the league
  // had no games (TheSportsDB can refuse this Worker's requests).
  const failures = [];
  // Two at a time, a refusal not asked again (the phones read it then; a
  // Worker call keeps only six connections open, and a batch needs some).
  const day = d =>
    fetch(`${TSDB}?d=${d}&l=${TSDB_CPBL}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TSDB_TIMEOUT), cf: { cacheTtl: d < over ? 7 * 86_400 : 600, cacheEverything: true } }).then(async r => {
      if (!r.ok) throw new Error(`tsdb ${r.status}`);
      return parseTsdbDay(await r.json());
    });
  const lists = await inTurns(days, 2, d => day(d).catch(error => (failures.push(String(error.message || error)), [])));
  if (days.length && failures.length === days.length) throw new Error(`${failures[0]} (every day)`);
  return lists.flat();
}
// CPBL's month from TheSportsDB's day lists: CPBL's own site turns every
// address outside Taiwan away (Cloudflare's too), and TheSportsDB's free key
// often refuses Cloudflare: then a quick 502, and the phones read TheSportsDB
// themselves (kit catalog asiaMonth). Owner's call 2026-10-18: no paid key.
async function cpbl(year, month, now = Date.now()) {
  // December to February: no CPBL games (the season opens in March, 台灣大賽
  // is over by early November), nothing to ask for.
  if (month === 12 || month <= 2) return [];
  return fetchCpblTsdb(year, month, { now });
}
const FETCHERS = { npb: fetchNpb, kbo: fetchKbo, cpbl };

// `/<league>/<YYYY-MM>.json` -> { league, month } or null.
export function asiaTarget(url) {
  const m = /^\/(npb|kbo|cpbl)\/(\d{4})-(\d{2})\.json$/.exec(url.pathname);
  if (!m) return null;
  const month = Number(m[3]);
  return month >= 1 && month <= 12 ? { league: m[1], year: Number(m[2]), month } : null;
}

// The month's games as a Response (JSON), or an error Response.
export async function asiaBaseballResponse(url) {
  const target = asiaTarget(url);
  if (!target) return new Response('{"error":"unknown"}', { status: 404, headers: { 'Content-Type': 'application/json' } });
  try {
    const games = (await FETCHERS[target.league](target.year, target.month)).sort((a, b) => a.start.localeCompare(b.start));
    return new Response(JSON.stringify({ league: target.league, month: `${target.year}-${String(target.month).padStart(2, '0')}`, games }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error.message || error) }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }
}
