// ---- sports.js: /sports-proxy, the data proxy ----
// One of the Worker's routes (worker.js routes it, beside /pass, /play…): a
// host-allowlisted pass-through to the public sources Play and the tickets
// followed read (ESPN, MLB, Polymarket, Kambi, OpenF1, Google's translate,
// F1's live timing, the Asian leagues), with the shared edge cache by tier,
// trims and batches, and a copy kept in R2 of what's over for good.
//
// A Longshot Pass is required: every request carries `qt=<session token>`
// (from /pass), checked with the token secret (token.js) and counted per
// session in this isolate's memory. A localhost page without one is let in
// by the dev door (per address, the same limit).
import { readToken, sessionLimited, tokenSecret, READ_GRACE_MS } from './token.js';
import { ASIA_HOST, asiaBaseballResponse, asiaTarget } from './asia-baseball.js';
import { F1_LIVE_HOST, f1LiveResponse } from './f1-live.js';
import { json, LOCAL_ORIGIN } from './http.js';

// ==== /sports-proxy - CORS passthrough for public sports data ==============
const SPORTS_PROXY_FETCH_USER_AGENT = 'Longshot/1.0';
const SPORTS_PROXY_ALLOWED_HOSTS = [
  'site.api.espn.com',
  'statsapi.mlb.com',
  'gamma-api.polymarket.com',
  // Kambi's public odds feed: Play's Asian baseball, EuroLeague and K League
  // odds and live scores.
  'eu-offering-api.kambicdn.com',
  // OpenF1's race control messages: Play's safety car, VSC and red flag
  // picks are settled from them.
  'api.openf1.org',
  // Google's translate endpoint (the Chrome dictionary's, no key): a
  // ticket's team names in the reader's language. Only /translate_a/t; sent
  // upstream as a POST (see fetchUpstream), kept a month.
  'clients5.google.com',
  // Not a real host: Asian baseball's schedules and scores, gathered by this
  // Worker from the leagues' own sites (asia-baseball.js).
  ASIA_HOST,
  // Not a real host either: F1's own live timing, one snapshot (f1-live.js).
  F1_LIVE_HOST
];
// Per signed-in session, a minute, in memory (cache hits included).
const SESSION_RATE_LIMIT = 600;
const SPORTS_PROXY_UPSTREAM_TIMEOUT_MS = 8_000;

// ---- Shared cache lifetimes ------------------------------------------------
// Every successful upstream response is kept in this colo's cache and served
// to every viewer who asks for the same URL - one upstream fetch, shared by
// everyone. How long a copy counts as fresh depends on how fast that data
// actually changes: today's scores need to be seconds old, a fixture ten
// days out or a standings table doesn't.
//
// `fresh`: served as-is, no upstream request.
// `stale`: past `fresh` but within this extra window, the saved copy is
// STILL returned immediately and the refresh happens in the background
// (stale-while-revalidate), so the viewer never waits on the upstream API
// for slow-moving data - the next viewer gets the refreshed copy. 0 means
// an expired copy is never served (live scores).
const SECOND = 1;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
// Live scores and odds: 10 s, so a 15-second refresh never gets a copy a whole beat old.
const CACHE_LIVE = { tier: 'live', fresh: 10 * SECOND, stale: 0 };
// A game over (its box score), or a day whose every game is over: it won't
// change, so the first read after the final serves everyone for a day.
const CACHE_FINAL = { tier: 'final', fresh: DAY, stale: 0 };

// How long an answer is fresh here: a game over a day; a live one (tier
// 'live') half what the source says it may be kept (ESPN's max-age: 4 to
// 10 s), 2 to 5 s.
export function freshFor(policy, result) {
  if (result?.final) return CACHE_FINAL.fresh;
  if (policy.tier !== 'live') return policy.fresh;
  const live = result?.maxAge > 0 ? Math.min(5, Math.max(2, Math.round(result.maxAge / 2))) : policy.fresh;
  // A scoreboard with no game on: until shortly before its next game (quietFor).
  return Math.max(live, result?.quiet || 0);
}

// Polymarket's pages mix every open market for a league, today's games
// included, and a live-odds poll asks for them every 30s - so they follow
// the same strict rule as live scores (a copy served while refreshing in
// the background would always be one poll behind).
const CACHE_ODDS = { tier: 'odds', fresh: 10 * SECOND, stale: 0 };
// F1's live timing: a few seconds, shared by everyone watching.
const CACHE_F1_LIVE = { tier: 'f1-live', fresh: 4 * SECOND, stale: 0 };
// OpenF1 (a race's sessions, race control, laps, pits): read only once a
// session is over (it's closed while one runs), so minutes old is new
// enough. It turns away an address asking more than about 30 a minute, and
// the proxy's address is shared with every other Worker: a refusal answers
// the copy kept here (up to a day), never nothing.
const CACHE_OPENF1 = { tier: 'openf1', fresh: 5 * MINUTE, stale: DAY };
const CACHE_SCHEDULE = { tier: 'schedule', fresh: 10 * MINUTE, stale: DAY };
const CACHE_SEASON = { tier: 'season', fresh: 3 * MINUTE, stale: 30 * MINUTE };
const CACHE_STANDINGS = { tier: 'standings', fresh: 30 * MINUTE, stale: DAY };
const CACHE_TEAM_SCHEDULE = { tier: 'team-schedule', fresh: 3 * MINUTE, stale: DAY };
// Pre-match odds from Kambi's list views move slowly (minutes, not seconds),
// and every viewer asks for the same few leagues: one upstream fetch every 2
// minutes per colo, a slightly older copy while it refreshes.
const CACHE_PREMATCH = { tier: 'prematch', fresh: 2 * MINUTE, stale: 10 * MINUTE };
// Championship markets (Polymarket's search) change over days.
const CACHE_FUTURES = { tier: 'futures', fresh: 10 * MINUTE, stale: DAY };
const CACHE_TRANSLATE = { tier: 'translate', fresh: 30 * DAY, stale: 30 * DAY };

// Asian baseball by month: this month and next change with every score (a
// minute); a past month only with a late fix.
// This month's: read again after 2 minutes (each read is a page and a few
// day lists), the last good copy answered for 3 days if a read fails
// (TheSportsDB can refuse this Worker for weeks; the kit brings a kept
// copy's unfinished games up to date from the device).
const CACHE_ASIA_NOW = { tier: 'asia-now', fresh: 2 * MINUTE, stale: 3 * DAY };
// A month over: its results don't change.
const CACHE_ASIA_PAST = { tier: 'asia-past', fresh: 12 * HOUR, stale: 7 * DAY };
function asiaPolicy(url) {
  const target = asiaTarget(url);
  if (!target) return CACHE_LIVE;
  const now = new Date();
  const months = target.year * 12 + target.month - (now.getUTCFullYear() * 12 + now.getUTCMonth() + 1);
  // Last month too on the 1st (a game the evening before, Asian time).
  return months >= 0 || (months === -1 && now.getUTCDate() <= 2) ? CACHE_ASIA_NOW : CACHE_ASIA_PAST;
}

function utcDayNumber(yyyymmdd) {
  const ms = Date.UTC(Number(yyyymmdd.slice(0, 4)), Number(yyyymmdd.slice(4, 6)) - 1, Number(yyyymmdd.slice(6, 8)));
  return Math.floor(ms / (DAY * 1000));
}

// A scoreboard is "live" when any day it covers is within a day of today
// (UTC) - that span holds every game that can still be in progress, since a
// US-evening game's ESPN date runs up to ~1 UTC day behind. Everything
// further out is either already final or not yet started.
function scoreboardPolicy(url) {
  const dates = url.searchParams.get('dates');
  if (!dates) return CACHE_LIVE;
  // A whole year (a race series' or tour's season): a few minutes fresh.
  if (/^\d{4}$/.test(dates)) return CACHE_SEASON;
  const match = /^(\d{8})(?:-(\d{8}))?$/.exec(dates);
  if (!match) return CACHE_LIVE;
  const today = Math.floor(Date.now() / (DAY * 1000));
  const from = utcDayNumber(match[1]);
  const to = match[2] ? utcDayNumber(match[2]) : from;
  if (!Number.isFinite(from) || !Number.isFinite(to)) return CACHE_LIVE;
  return from <= today + 1 && to >= today - 1 ? CACHE_LIVE : CACHE_SCHEDULE;
}

// A month's board as Play reads it (`&trim=espn-board`: games to come and
// their lines, no scores): two minutes, as Kambi's pre-match lists. Read
// whole every 10 seconds before (the live tier), megabytes each.
const CACHE_BOARD_MONTH = { tier: 'board-month', fresh: 2 * MINUTE, stale: 0 };
const policyOf = (url, trim) => (trim === TRIM_ESPN_BOARD && /^\d{6}$/.test(url.searchParams.get('dates') || '') ? CACHE_BOARD_MONTH : cachePolicyFor(url));

function cachePolicyFor(url) {
  switch (url.hostname) {
    case 'site.api.espn.com':
      // A game's own page (box score, plays) is live while it's on.
      if (url.pathname.endsWith('/summary')) return CACHE_LIVE;
      // A team's injuries on game day: minutes.
      if (url.pathname.endsWith('/roster') && url.searchParams.get('enable') === 'injuries') return CACHE_TEAM_SCHEDULE;
      return url.pathname.endsWith('/scoreboard') ? scoreboardPolicy(url) : url.pathname.endsWith('/schedule') ? CACHE_TEAM_SCHEDULE : CACHE_STANDINGS;
    case 'statsapi.mlb.com':
      // A day's games with their linescore: live.
      if (url.pathname === '/api/v1/schedule' && /linescore/.test(url.searchParams.get('hydrate') || '')) return CACHE_LIVE;
      // The postseason still to come (kit/postseason.mjs): a time set or a
      // game dropped as soon as a game ends, so minutes.
      if (url.pathname === '/api/v1/schedule' && url.searchParams.get('gameType')) return CACHE_TEAM_SCHEDULE;
      return CACHE_STANDINGS;
    case 'api.openf1.org':
      return CACHE_OPENF1;
    case 'gamma-api.polymarket.com':
      return url.pathname === '/public-search' ? CACHE_FUTURES : CACHE_ODDS;
    case 'eu-offering-api.kambicdn.com':
      // A league's matches in play (Play's live board) move by the second.
      if (url.pathname.endsWith('/in-play.json')) return CACHE_ODDS;
      // A match's own markets: pre-match lists move like the league's (a live
      // match's are asked for in play, at the live list's pace).
      if (url.pathname.includes('/betoffer/')) return url.searchParams.get('live') ? CACHE_ODDS : CACHE_PREMATCH;
      return url.pathname.includes('/listView/') ? CACHE_PREMATCH : CACHE_LIVE;
    case 'clients5.google.com':
      return CACHE_TRANSLATE;
    case ASIA_HOST:
      return asiaPolicy(url);
    case F1_LIVE_HOST:
      // A finished session from F1's archive (f1-live.js /session.json): it doesn't change.
      if (url.pathname === '/session.json') return CACHE_STANDINGS;
      return CACHE_F1_LIVE;
    default:
      return CACHE_LIVE;
  }
}

// Background refreshes already running in this isolate, so a burst of
// viewers hitting the same stale entry triggers one upstream fetch, not one
// each.
const refreshesInFlight = new Set();

// Opt-in (`&trim=polymarket-events`) response trimming for Gamma's
// /events pages. Each page nests every market of every event with ~80
// fields apiece (descriptions, token ids, fee schedules...) - 11.5MB raw for
// one 100-event MLB page, of which Play reads only the fields kept below.
// Trimmed, the same page is ~0.45MB raw.
// Opt-in rather than automatic so the client can fall back to the plain
// passthrough if this parse-and-rebuild step ever fails here (it's the one
// place this Worker does real CPU work) - and the cached copy is the
// trimmed one, so that work happens at most once per TTL per colo.
const TRIM_POLYMARKET_EVENTS = 'polymarket-events';
// Opt-in (`&trim=polymarket-markets`) for Gamma's /markets (Play's games'
// winner markets, read apart from their events: kit/play-sources.mjs
// polymarketGames): each market's prices, liquidity and its event's id.
const TRIM_POLYMARKET_MARKETS = 'polymarket-markets';
// Opt-in (`&trim=kambi-events`) trimming for Kambi's list views and live
// feed: only the fields Play reads (kit/play-kambi.mjs), a small fraction
// of each event's full record.
const TRIM_KAMBI_EVENTS = 'kambi-events';

function trimKambi(data) {
  if (!data || typeof data !== 'object') return data;
  const event = e =>
    e && { id: e.id, name: e.name, homeName: e.homeName, awayName: e.awayName, start: e.start, state: e.state, group: e.group, sport: e.sport, path: Array.isArray(e.path) ? e.path.map(p => p.termKey) : undefined };
  const offers = list =>
    Array.isArray(list)
      ? list.map(o => ({
          criterion: { englishLabel: o.criterion?.englishLabel },
          betOfferType: { englishName: o.betOfferType?.englishName },
          outcomes: (o.outcomes || []).map(x => ({ type: x.type, odds: x.odds, line: x.line, status: x.status }))
        }))
      : list;
  const live = d => d && { score: d.score, statistics: d.statistics?.sets ? { sets: d.statistics.sets } : undefined, matchClock: d.matchClock ? { periodId: d.matchClock.periodId, minute: d.matchClock.minute, running: d.matchClock.running } : undefined };
  return {
    events: Array.isArray(data.events) ? data.events.map(item => ({ event: event(item.event), betOffers: offers(item.betOffers), liveData: live(item.liveData) })) : undefined,
    liveEvents: Array.isArray(data.liveEvents) ? data.liveEvents.map(item => ({ event: event(item.event), liveData: live(item.liveData) })) : undefined
  };
}

// Opt-in (`&trim=kambi-offers`) for one match's full list of markets
// (betoffer/event/<id>.json, Play's game page: every line, half, corner and
// player market): each offer's label, kind and outcomes (who, line, price),
// about a fifth of Kambi's record.
const TRIM_KAMBI_OFFERS = 'kambi-offers';
export function trimKambiOffers(data) {
  if (!data || typeof data !== 'object') return data;
  const offers = Array.isArray(data.betOffers)
    ? data.betOffers.map(o => ({
        id: o.id,
        eventId: o.eventId,
        criterion: { englishLabel: o.criterion?.englishLabel, shortEnglishLabel: o.criterion?.shortEnglishLabel, occurrenceType: o.criterion?.occurrenceType, lifetime: o.criterion?.lifetime },
        betOfferType: { englishName: o.betOfferType?.englishName },
        tags: Array.isArray(o.tags) ? o.tags.filter(t => t === 'MAIN_LINE' || t === 'OFFERED_LIVE') : undefined,
        suspended: o.suspended || undefined,
        outcomes: (o.outcomes || []).map(x => ({ type: x.type, odds: x.odds, line: x.line, status: x.status, label: x.englishLabel, participant: x.participant, participantId: x.participantId }))
      }))
    : undefined;
  const events = Array.isArray(data.events) ? data.events.map(e => ({ id: e.id, homeName: e.homeName, awayName: e.awayName, start: e.start, state: e.state })) : undefined;
  return { betOffers: offers, events };
}

// Opt-in (`&trim=espn-roster`) for a team's roster (Play's players): each
// player's id, name, position, headshot and injury, and (soccer) the
// season's numbers, in ESPN's own shape (grouped by position or not).
const TRIM_ESPN_ROSTER = 'espn-roster';
export function trimEspnRoster(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.athletes)) return data;
  const player = a =>
    a && {
      id: a.id,
      displayName: a.displayName,
      jersey: a.jersey,
      position: a.position ? { abbreviation: a.position.abbreviation } : undefined,
      headshot: a.headshot?.href ? { href: a.headshot.href } : undefined,
      injuries: Array.isArray(a.injuries) && a.injuries.length ? a.injuries.slice(0, 1).map(i => ({ status: i.status })) : undefined,
      statistics: a.statistics?.splits?.categories
        ? { splits: { categories: a.statistics.splits.categories.map(c => ({ name: c.name, stats: (c.stats || []).map(x => ({ name: x.name, value: x.value })) })) } }
        : undefined
    };
  const athletes = data.athletes.map(x => (Array.isArray(x?.items) ? { position: x.position, items: x.items.map(player) } : player(x)));
  return { team: data.team ? { id: data.team.id, displayName: data.team.displayName } : undefined, athletes };
}

// Opt-in (`&trim=espn-teams`) for a league's team list (Play's logos and
// clubs, kit/play-sources.mjs loadLeagueTeams): each club's name, nickname
// and first logo, in ESPN's own shape. The 11 lists Play reads on its first
// open were 2.3 MB; this is about a twentieth.
const TRIM_ESPN_TEAMS = 'espn-teams';
export function trimEspnTeams(data) {
  const teams = data?.sports?.[0]?.leagues?.[0]?.teams;
  if (!Array.isArray(teams)) return data;
  const team = t => t && { displayName: t.displayName, name: t.name, shortDisplayName: t.shortDisplayName, logos: t.logos?.[0]?.href ? [{ href: t.logos[0].href }] : [] };
  return { sports: [{ leagues: [{ teams: teams.map(x => ({ team: team(x?.team) })) }] }] };
}

// Opt-in (`&trim=espn-standings`) for a league's table (Play's house prices,
// kit/play-house.mjs parseStandings): each team's name and its record
// (wins, losses, ties, games, share), the season, and the tables' nesting,
// in ESPN's own shape; with points, ESPN's clinch mark ('e': out) and the
// table's name, which Play's 冠軍 boards read to drop who can't win
// (kit/play-alive.mjs), and a driver's name for F1's table. A table carries dozens of stats and notes per team:
// the ones Play reads on its first open were several MB.
const TRIM_ESPN_STANDINGS = 'espn-standings';
const STANDING_STATS = new Set(['wins', 'losses', 'ties', 'otLosses', 'gamesPlayed', 'winPercent', 'points', 'championshipPts', 'clincher']);
export function trimEspnStandings(data) {
  const node = n => {
    if (!n || typeof n !== 'object') return undefined;
    const out = {};
    if (n.standings) {
      out.standings = {
        season: n.standings.season,
        entries: (n.standings.entries || []).map(e => ({
          ...(e?.team ? { team: { displayName: e.team.displayName ?? e.team.name } } : {}),
          ...(e?.athlete ? { athlete: { displayName: e.athlete.displayName } } : {}),
          stats: (e?.stats || []).filter(x => STANDING_STATS.has(x?.name) || STANDING_STATS.has(x?.type)).map(x => (x.name === 'clincher' ? { name: x.name, value: x.value, displayValue: x.displayValue } : { name: x.name, type: x.type, value: x.value }))
        }))
      };
    }
    if (Array.isArray(n.children)) out.children = n.children.map(node);
    if (typeof n.name === 'string') out.name = n.name;
    return out;
  };
  if (!data || typeof data !== 'object') return data;
  const out = node(data);
  if (Array.isArray(data.seasons)) out.seasons = data.seasons.slice(0, 1).map(x => ({ year: x?.year }));
  if (data.season) out.season = { year: data.season.year };
  return out;
}

// Opt-in (`&trim=espn-athletes`) for a league's players' season numbers
// (statistics/byathlete): each player's id, name, team and the numbers, the
// category names once. A league's whole list falls from ~5 MB to ~150 KB.
const TRIM_ESPN_ATHLETES = 'espn-athletes';
export function trimEspnAthletes(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.athletes)) return data;
  return {
    pagination: data.pagination ? { count: data.pagination.count, pages: data.pagination.pages, page: data.pagination.page } : undefined,
    requestedSeason: data.requestedSeason ? { year: data.requestedSeason.year, displayName: data.requestedSeason.displayName, type: { name: data.requestedSeason.type?.name } } : undefined,
    categories: (data.categories || []).map(c => ({ name: c.name, names: c.names })),
    athletes: data.athletes.map(x => ({
      athlete: { id: x.athlete?.id, displayName: x.athlete?.displayName, teamId: x.athlete?.teamId, position: x.athlete?.position ? { abbreviation: x.athlete.position.abbreviation } : undefined },
      // (Three places are all any stat writes: 35.765625 minutes is 35.766.)
      categories: (x.categories || []).map(c => ({ name: c.name, values: Array.isArray(c.values) ? c.values.map(v => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)) : c.values }))
    }))
  };
}

// Opt-in (`&trim=espn-board`) for a league's scoreboard as Play's board
// reads it (kit/play-sources.mjs parseEspnScoreboard and mlbPostseason): each
// game's id, time, season type and state, its sides and DraftKings' closing
// lines; and what this proxy reads of it (settledData, quietFor). NHL's
// month falls from ~4.5 MB to ~0.13 MB.
const TRIM_ESPN_BOARD = 'espn-board';
export function trimEspnBoard(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.events)) return data;
  const type = t => t && { state: t.state, completed: t.completed };
  const status = x => x && { type: type(x.type) };
  const close = x => x && { close: x.close && { odds: x.close.odds, line: x.close.line } };
  const sides = (x, keys) => x && Object.fromEntries(keys.map(k => [k, close(x[k])]));
  const team = t => t && { id: t.id, displayName: t.displayName, abbreviation: t.abbreviation, logo: t.logo };
  const game = c =>
    c && {
      date: c.date,
      timeValid: c.timeValid,
      neutralSite: c.neutralSite,
      notes: Array.isArray(c.notes) ? c.notes.slice(0, 1).map(n => ({ headline: n?.headline })) : undefined,
      status: status(c.status),
      competitors: Array.isArray(c.competitors) ? c.competitors.map(x => x && { homeAway: x.homeAway, team: team(x.team) }) : c.competitors,
      odds: Array.isArray(c.odds) ? c.odds.slice(0, 1).map(o => o && { moneyline: sides(o.moneyline, ['away', 'home', 'draw']), total: sides(o.total, ['over', 'under']), pointSpread: sides(o.pointSpread, ['away', 'home']) }) : undefined
    };
  return {
    events: data.events.map(e => e && { id: e.id, date: e.date, season: e.season && { type: e.season.type }, status: status(e.status), competitions: Array.isArray(e.competitions) ? e.competitions.slice(0, 1).map(game) : e.competitions })
  };
}

export function trimPolymarketMarkets(markets) {
  if (!Array.isArray(markets)) return markets;
  return markets.map(m => ({ question: m.question, outcomes: m.outcomes, outcomePrices: m.outcomePrices, liquidity: m.liquidity, event: m.events?.[0]?.id }));
}

function trimPolymarketEvents(events) {
  if (!Array.isArray(events)) return events;
  return events.map(event => ({
    id: event.id,
    slug: event.slug,
    title: event.title,
    startDate: event.startDate,
    startTime: event.startTime,
    eventDate: event.eventDate,
    teams: event.teams,
    markets: Array.isArray(event.markets)
      ? event.markets.map(market => ({
          question: market.question,
          outcomes: market.outcomes,
          outcomePrices: market.outcomePrices,
          liquidity: market.liquidity
        }))
      : event.markets
  }));
}

// A browser's User-Agent: Google's translate answers a bot's less often.
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

// A translate answer with no text in it.
export function emptyTranslation(text) {
  try {
    const got = JSON.parse(text);
    const out = Array.isArray(got) ? (Array.isArray(got[0]) ? got[0][0] : got[0]) : null;
    return typeof out !== 'string' || !out.trim();
  } catch {
    return true;
  }
}

// The translate endpoint: the text goes in a POST body (a GET mixes in
// simplified characters for zh-TW, and long texts don't fit an address).
// Google often answers the proxy's own address with nothing (busy, or
// holding Cloudflare off): then Google's other public endpoint (client=gtx,
// translate.googleapis.com), its segments joined into the first one's shape.
async function translateUpstream(upstreamUrl) {
  const url = new URL(upstreamUrl.toString());
  const q = url.searchParams.get('q') || '';
  url.searchParams.delete('q');
  const post = (to, extra = {}) =>
    fetch(to, {
      method: 'POST',
      headers: { 'User-Agent': BROWSER_UA, 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({ q, ...extra }).toString(),
      signal: AbortSignal.timeout(SPORTS_PROXY_UPSTREAM_TIMEOUT_MS)
    });
  const first = await post(url.toString()).catch(() => null);
  if (first?.status === 200) {
    const text = await first.text();
    if (!emptyTranslation(text)) return new Response(text, { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  }
  const gtx = new URL('https://translate.googleapis.com/translate_a/single?client=gtx&dt=t');
  gtx.searchParams.set('sl', url.searchParams.get('sl') || 'auto');
  gtx.searchParams.set('tl', url.searchParams.get('tl') || 'zh-TW');
  const second = await post(gtx.toString()).catch(() => null);
  const out = second?.status === 200 ? gtxText(await second.text()) : '';
  return new Response(JSON.stringify([out]), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
// client=gtx's answer ([[["譯文", "source", …], …], …]): its text, joined.
export function gtxText(text) {
  try {
    const got = JSON.parse(text);
    return Array.isArray(got?.[0]) ? got[0].map(seg => (Array.isArray(seg) && typeof seg[0] === 'string' ? seg[0] : '')).join('') : '';
  } catch {
    return '';
  }
}

// Fetches `upstreamUrl`, applies the optional trim, and saves a 200 into the
// shared cache. Resolves to { status, contentType, body } or
// { fetchError }. Never throws.
async function fetchUpstream(upstreamUrl, trim) {
  let upstream;
  try {
    upstream =
      upstreamUrl.hostname === ASIA_HOST
        ? await asiaBaseballResponse(upstreamUrl)
        : upstreamUrl.hostname === F1_LIVE_HOST
          ? await f1LiveResponse(upstreamUrl)
          : upstreamUrl.hostname === 'clients5.google.com'
            ? await translateUpstream(upstreamUrl)
            : await fetchAllowed(upstreamUrl, { headers: { 'User-Agent': SPORTS_PROXY_FETCH_USER_AGENT }, signal: AbortSignal.timeout(SPORTS_PROXY_UPSTREAM_TIMEOUT_MS) });
  } catch (error) {
    return { fetchError: error };
  }
  try {
    const contentType = upstream.headers.get('Content-Type') || 'application/json';
    if (upstream.status !== 200) return { status: upstream.status, contentType, body: upstream.body };
    let body = await upstream.arrayBuffer();
    // Google sometimes answers a translation with nothing ([[""]], when it's
    // busy): a failure, not kept.
    if (upstreamUrl.hostname === 'clients5.google.com' && emptyTranslation(new TextDecoder().decode(body))) return { status: 502, contentType, body: '' };
    if (trim) {
      try {
        const parsed = JSON.parse(new TextDecoder().decode(body));
        body = JSON.stringify((TRIMS[trim] || (x => x))(parsed));
      } catch {
        // Not the JSON shape expected - pass it through untouched.
      }
    }
    const maxAge = Number(/max-age=(\d+)/.exec(upstream.headers.get('Cache-Control') || '')?.[1]) || 0;
    // (Read once, for both: over for good, or quiet until its next game.)
    const data = settleable(upstreamUrl) ? parsed(body) : null;
    const final = data != null && settledData(upstreamUrl, data);
    return { status: 200, contentType, body, final, quiet: data != null && !final ? quietFor(upstreamUrl, data) : 0, maxAge };
  } catch (error) {
    return { fetchError: error };
  }
}

// Whether ESPN's answer is over for good: a game's summary with its game
// completed, or one day's scoreboard (dates=YYYYMMDD; "today" moves on to the
// next day's games) with games, every one of them over.
export function settled(url, body) {
  if (!settleable(url)) return false;
  const data = parsed(body);
  return data != null && settledData(url, data);
}
function parsed(body) {
  try {
    return JSON.parse(typeof body === 'string' ? body : new TextDecoder().decode(body));
  } catch {
    return null;
  }
}
// How long a live-tier scoreboard (a day's or a month's) can't change: with
// no game on, until shortly before its next game starts (QUIET_LEAD), at
// most QUIET_MAX; 0 while any game is on or one is past its start and not
// over. A day of no games or of games all hours away was read again every
// 10 seconds: each opening of Sports waited about a second on ESPN for every
// league's yesterday and today.
const QUIET_MAX = 10 * MINUTE;
const QUIET_LEAD = 5 * MINUTE;
export function quietFor(url, data, now = Date.now()) {
  if (url.hostname !== 'site.api.espn.com' || !url.pathname.endsWith('/scoreboard') || !data || !Array.isArray(data.events)) return 0;
  let next = Infinity;
  for (const e of data.events) {
    const type = e?.status?.type ?? e?.competitions?.[0]?.status?.type;
    const state = type?.state;
    if (state === 'post' || type?.completed === true) continue;
    if (state !== 'pre') return 0;
    const start = Date.parse(e?.date ?? e?.competitions?.[0]?.date);
    if (!Number.isFinite(start)) return 0;
    next = Math.min(next, start);
  }
  return Math.max(0, Math.min(QUIET_MAX, Math.floor((next - now) / 1000) - QUIET_LEAD));
}
// The reads that can be over for good: a game's summary, a day's or a
// month's scoreboard (ESPN), a month of Asia's baseball.
export function settleable(url) {
  if (url.hostname === 'site.api.espn.com') return url.pathname.endsWith('/summary') || (url.pathname.endsWith('/scoreboard') && /^\d{6}(\d{2})?$/.test(url.searchParams.get('dates') || ''));
  return url.hostname === ASIA_HOST && /\/\d{4}-\d{2}\.json$/.test(url.pathname);
}
// …and whether this answer of one is: the game completed; every game of the
// day or month completed (a month's last day passed); every game of an Asian
// month over, called off or six hours past a start it never had.
export function settledData(url, data, now = Date.now()) {
  if (url.hostname === ASIA_HOST) {
    const [y, m] = (/(\d{4})-(\d{2})\.json$/.exec(url.pathname) || []).slice(1).map(Number);
    if (!y || Date.UTC(y, m, 1) > now) return false;
    const games = data?.games || [];
    return games.length > 0 && games.every(g => g.state === 'post' || g.state === 'void' || (g.state === 'pre' && Date.parse(g.start) < now - 6 * 3_600_000));
  }
  if (url.pathname.endsWith('/summary')) return data?.header?.competitions?.[0]?.status?.type?.completed === true;
  const dates = url.searchParams.get('dates') || '';
  if (dates.length === 6 && Date.UTC(+dates.slice(0, 4), +dates.slice(4, 6), 2) > now) return false;
  const events = data?.events || [];
  return events.length > 0 && events.every(e => (e?.status?.type ?? e?.competitions?.[0]?.status?.type)?.completed === true);
}

function cacheEntry(result, policy) {
  const p = result.final ? CACHE_FINAL : policy;
  const fresh = freshFor(policy, result);
  return new Response(result.body, {
    status: 200,
    headers: {
      'Content-Type': result.contentType,
      // The cache itself keeps the entry for the whole fresh + stale span;
      // X-Sports-Proxy-Stored-At is what decides which of the two it's in.
      'Cache-Control': `public, max-age=${fresh + p.stale}`,
      'X-Sports-Proxy-Stored-At': String(Date.now()),
      // How long it's fresh (the settings, the source's own max-age), read back on the next ask.
      'X-Sports-Proxy-Fresh': String(fresh),
      // Over for good (settled): kept a day, whatever its address's policy.
      ...(result.final ? { 'X-Sports-Proxy-Final': '1' } : {})
    }
  });
}

// Each trim by its name, and the address it's for.
const TRIMS = {
  [TRIM_POLYMARKET_EVENTS]: trimPolymarketEvents,
  [TRIM_POLYMARKET_MARKETS]: trimPolymarketMarkets,
  [TRIM_KAMBI_EVENTS]: trimKambi,
  [TRIM_KAMBI_OFFERS]: trimKambiOffers,
  [TRIM_ESPN_ROSTER]: trimEspnRoster,
  [TRIM_ESPN_TEAMS]: trimEspnTeams,
  [TRIM_ESPN_STANDINGS]: trimEspnStandings,
  [TRIM_ESPN_ATHLETES]: trimEspnAthletes,
  [TRIM_ESPN_BOARD]: trimEspnBoard
};

// Which trim (if any) applies to a URL: only the hosts each one is for.
function trimFor(trimParam, upstreamUrl) {
  const host = upstreamUrl.hostname;
  const path = upstreamUrl.pathname;
  if (trimParam === TRIM_POLYMARKET_EVENTS && host === 'gamma-api.polymarket.com' && path === '/events') return TRIM_POLYMARKET_EVENTS;
  if (trimParam === TRIM_POLYMARKET_MARKETS && host === 'gamma-api.polymarket.com' && path === '/markets') return TRIM_POLYMARKET_MARKETS;
  if (trimParam === TRIM_KAMBI_EVENTS && host === 'eu-offering-api.kambicdn.com') return TRIM_KAMBI_EVENTS;
  if (trimParam === TRIM_KAMBI_OFFERS && host === 'eu-offering-api.kambicdn.com' && path.includes('/betoffer/')) return TRIM_KAMBI_OFFERS;
  if (host !== 'site.api.espn.com') return null;
  if (trimParam === TRIM_ESPN_ROSTER && path.endsWith('/roster')) return TRIM_ESPN_ROSTER;
  if (trimParam === TRIM_ESPN_TEAMS && path.endsWith('/teams')) return TRIM_ESPN_TEAMS;
  if (trimParam === TRIM_ESPN_STANDINGS && path.endsWith('/standings')) return TRIM_ESPN_STANDINGS;
  if (trimParam === TRIM_ESPN_ATHLETES && path.endsWith('/statistics/byathlete')) return TRIM_ESPN_ATHLETES;
  if (trimParam === TRIM_ESPN_BOARD && path.endsWith('/scoreboard')) return TRIM_ESPN_BOARD;
  return null;
}

// A redirect is followed only to an address the proxy would take itself
// (parseTarget) or the same site's (its CDN), three at most: an open
// redirect on a listed site can't send the proxy, and its cache, anywhere
// else. Any other is a 502.
const siteOf = host => host.split('.').slice(/\.(com|org|gov|edu|net)\.\w\w$/.test(host) ? -3 : -2).join('.');
export async function fetchAllowed(url, init, fetchFn = fetch) {
  for (let hops = 0; ; hops++) {
    const res = await fetchFn(url.toString(), { ...init, redirect: 'manual' });
    if (res.status < 300 || res.status > 399 || !res.headers.get('Location')) return res;
    const to = new URL(res.headers.get('Location'), url);
    const next = hops >= 3 ? null : parseTarget(to.toString()) || (to.protocol === 'https:' && siteOf(to.hostname) === siteOf(url.hostname) ? to : null);
    if (!next) return new Response('', { status: 502 });
    url = next;
  }
}

function parseTarget(target) {
  try {
    const u = new URL(target);
    if (u.hostname === 'clients5.google.com' && (u.pathname !== '/translate_a/t' || (u.searchParams.get('q') || '').length > 5000)) return null;
    return u.protocol === 'https:' && SPORTS_PROXY_ALLOWED_HOSTS.includes(u.hostname) ? u : null;
  } catch {
    return null;
  }
}

// One upstream URL through the shared cache: { status, contentType, body,
// cache, age } or { fetchError }. `body` is a stream or an ArrayBuffer.
// How long an old copy's fresh read is waited for before the old copy is
// answered (a batch's item waits 3 s in all).
const FRESH_WAIT_MS = 2_000;
// Cloudflare's edge cache, or one that keeps nothing (a Durable Object's
// runs, the tests without one): every read then goes to the source.
const NO_CACHE = { match: async () => undefined, put: async () => {} };
const edgeCache = () => globalThis.caches?.default || NO_CACHE;
// Longshot's data (R2), set by each request (env.DATA).
let dataBucket = null;

// Kept on first read (R2): a read over for good (a game completed, a day or
// month of them, a past Asian month) is kept the first time anyone reads
// it, and every later read, from anywhere, once the edge's copy has gone, is
// answered from it: the source asked once, ever. What nobody opens is never
// fetched. Kept as { until, data } gzipped at its keptPath, ESPN's slimmed
// of what no app reads.
// Where a read's copy is kept: `kept/<trim or _>/<host><path>[/<query>].json`
// (the query's characters escaped with ~ for %).
export function keptPath(url, trim = '') {
  const u = new URL(url);
  const q = u.search.length > 1 ? `/${encodeURIComponent(u.search.slice(1)).replace(/%/g, '~')}` : '';
  return `kept/${trim || '_'}/${u.hostname}${u.pathname.replace(/\/+$/, '')}${q}.json`;
}
export const FOREVER = 8.64e15;
const DROP = new Set(['links', 'news', 'videos', 'article', 'articles', 'ticketsInfo', 'quicklinks', 'playerSwitcher', 'guid', 'alternateIds', 'geoBroadcasts', 'fantasy', 'headlines', '$ref', 'college', 'birthCountry', 'experience', 'lastUpdated', 'parent', 'contracts', 'draft']);
export function slimEspn(x) {
  if (Array.isArray(x)) return x.map(slimEspn);
  if (!x || typeof x !== 'object') return x;
  const out = {};
  for (const [k, v] of Object.entries(x)) if (!DROP.has(k)) out[k] = k === 'logos' && Array.isArray(v) ? v.slice(0, 1).map(l => ({ href: l?.href })) : slimEspn(v);
  return out;
}
const gz = async bytes => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
const gunzipped = async raw => (raw[0] === 0x1f && raw[1] === 0x8b ? new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()) : raw);
// A key R2 was just found not to have (a game not over yet, a day still to
// play) isn't asked of R2 again for a while: a live game's sheet missed the
// edge's 2-second copy at every beat, an R2 read (and a round trip) each time.
const NOT_KEPT_MS = 10 * MINUTE;
const notKept = new Map(); // key → until when it isn't asked again
async function readKept(key, url) {
  if (notKept.get(key) > Date.now()) return null;
  const obj = await dataBucket.get(key).catch(() => null);
  if (!obj) {
    if (notKept.size > 5000) notKept.clear();
    notKept.set(key, Date.now() + NOT_KEPT_MS);
    return null;
  }
  try {
    const copy = JSON.parse(new TextDecoder().decode(await gunzipped(new Uint8Array(await obj.arrayBuffer()))));
    return copy?.until > Date.now() || settledData(url, copy?.data) ? JSON.stringify(copy.data) : null;
  } catch {
    return null;
  }
}
async function keep(key, url, body) {
  try {
    const data = JSON.parse(typeof body === 'string' ? body : new TextDecoder().decode(body));
    const text = JSON.stringify({ until: FOREVER, data: url.hostname === 'site.api.espn.com' ? slimEspn(data) : data });
    await dataBucket.put(key, await gz(new TextEncoder().encode(text)), { httpMetadata: { contentType: 'application/gzip' } });
    notKept.delete(key);
  } catch {}
}

async function resolveOne(upstreamUrl, trim, ctx, { mirror = true, within } = {}) {
  let policy = policyOf(upstreamUrl, trim);
  const cache = edgeCache();
  // A trimmed response is cached under its own key (a marker param on the
  // cache key only - never sent upstream), so it can't be served to a
  // caller that asked for the full passthrough, or vice versa.
  const cacheKeyUrl = new URL(upstreamUrl.toString());
  if (trim) cacheKeyUrl.searchParams.set('__sports_proxy_trim', trim);
  const cacheKey = new Request(cacheKeyUrl.toString());
  const match = await cache.match(cacheKey);
  // Read at once, never held open: a Worker call keeps six connections, and
  // a cached answer left unread while its item reads upstream (CPBL's month:
  // a page and a dozen days) was closed under it ("Response closed due to
  // connection limit"), failing the item.
  let cached = match && { status: match.status, contentType: match.headers.get('Content-Type') || 'application/json', storedAt: Number(match.headers.get('X-Sports-Proxy-Stored-At')), body: await match.arrayBuffer() };
  // This Worker's own check of a live bet (price.js): only a copy this many seconds old.
  if (cached && within != null && !(Date.now() - cached.storedAt <= within * 1000)) cached = null;
  if (cached) {
    // A copy over for good is fresh a day (CACHE_FINAL), not its address's seconds.
    if (match.headers.get('X-Sports-Proxy-Final') === '1') policy = CACHE_FINAL;
    const kept = Number(match.headers.get('X-Sports-Proxy-Fresh'));
    if (kept > 0) policy = { ...policy, fresh: kept };
    const storedAt = cached.storedAt;
    const ageSeconds = Number.isFinite(storedAt) && storedAt > 0 ? (Date.now() - storedAt) / 1000 : 0;
    const isFresh = ageSeconds <= policy.fresh;
    const old = cache => ({ status: cached.status, contentType: cached.contentType, body: cached.body, cache, age: Math.round(ageSeconds), policy });
    // Served while it's read again behind it only when it's barely past its
    // time (as long again as it's fresh, a minute at least). Older, it's read
    // now and the old copy is only what's answered if that fails or is slow
    // (FRESH_WAIT_MS; the read goes on into the cache): with few viewers, the
    // first ask after a while is nearly every ask.
    const barely = ageSeconds <= policy.fresh + Math.min(policy.stale, Math.max(policy.fresh, 60));
    if (!isFresh && !barely && ageSeconds <= policy.fresh + policy.stale) {
      const reading = fetchUpstream(upstreamUrl, trim).then(result => {
        if (result.status === 200) return cache.put(cacheKey, cacheEntry(result, policy)).then(() => result, () => result);
        if (result.body?.cancel) result.body.cancel().catch(() => {});
        return result;
      });
      ctx.waitUntil(reading.catch(() => {}));
      let timer;
      const result = await Promise.race([reading, new Promise(resolve => (timer = setTimeout(() => resolve(null), FRESH_WAIT_MS)))]).finally(() => clearTimeout(timer));
      if (result?.status === 200) return { ...result, cache: 'MISS', age: 0, policy: result.final ? CACHE_FINAL : policy };
      return old('STALE');
    }
    if (isFresh || barely) {
      if (!isFresh && !refreshesInFlight.has(cacheKey.url)) {
        refreshesInFlight.add(cacheKey.url);
        ctx.waitUntil(
          fetchUpstream(upstreamUrl, trim)
            .then(result => (result.status === 200 ? cache.put(cacheKey, cacheEntry(result, policy)) : null))
            .catch(() => {})
            .finally(() => refreshesInFlight.delete(cacheKey.url))
        );
      }
      return old(isFresh ? 'HIT' : 'STALE');
    }
  }
  const keepKey = mirror && dataBucket && settleable(upstreamUrl) ? `${keptPath(upstreamUrl.toString(), trim)}.gz` : null;
  const kept = keepKey ? await readKept(keepKey, upstreamUrl) : null;
  if (kept) {
    const result = { status: 200, contentType: 'application/json', body: kept, final: true };
    ctx.waitUntil(cache.put(cacheKey, cacheEntry(result, CACHE_FINAL)));
    return { ...result, cache: 'KEPT', age: 0, policy: CACHE_FINAL };
  }
  const result = await fetchUpstream(upstreamUrl, trim);
  if (result.status === 200) {
    // (The body is read once: the edge's copy and R2's from the same bytes.)
    if (result.body && typeof result.body !== 'string' && !(result.body instanceof ArrayBuffer) && !ArrayBuffer.isView(result.body)) result.body = await new Response(result.body).arrayBuffer();
    ctx.waitUntil(cache.put(cacheKey, cacheEntry(result, policy)));
    if (keepKey && result.final) ctx.waitUntil(keep(keepKey, upstreamUrl, result.body));
  }
  return { ...result, cache: 'MISS', age: 0, policy: result.final ? CACHE_FINAL : policy };
}

// How long the browser may keep an answer itself (its own copy, by the
// address it asked for): the fresh part of the cache policy, at most 10
// minutes. Live data only a few seconds.
const browserMaxAge = policy => Math.min(policy.fresh, 600);

// The dev door: a page served from localhost (testing on the real proxy, its
// cache and its limits) may read without a pass, a session's limit at an
// address.
const tooMany = headers => json({ error: { message: 'Too many requests, please try again later.' } }, 429, headers);
async function checkSession(env, requestParams, headers, weight = 1, request = null, ip = '') {
  const dev = !requestParams.get('qt') && LOCAL_ORIGIN.test(request?.headers.get('Origin') || '');
  if (dev || ip === 'worker') {
    for (let i = 0; i < weight; i++) if (ip !== 'worker' && sessionLimited(`ip:${ip}`, SESSION_RATE_LIMIT)) return { error: tooMany(headers) };
    return { session: { s: `ip:${ip}`, dev } };
  }
  const session = await readToken(await tokenSecret(env), requestParams.get('qt') || '', 'ses', Date.now() - READ_GRACE_MS);
  if (!session) return { error: json({ error: { code: 'PASS_REQUIRED', message: 'Sign in with your Longshot Pass.' } }, 401, headers) };
  for (let i = 0; i < weight; i++) if (sessionLimited(`proxy:${session.s}`, SESSION_RATE_LIMIT)) return { error: tooMany(headers) };
  return { session };
}

// A batch: `?batch=1&u=<url>&u=<url>…` (each optionally `<trim>!<url>`),
// answered as one JSON document { r: [{ s: status, b: body } …] } in the
// same order. One Worker request instead of many - the Workers plan bills
// per request, and a page's first paint asks for a dozen lists at once.
// Every URL still goes through the shared cache on its own.
// With `&lines=1` (the kit's) each item is written the moment it's in, a
// line of its own ({ i: its place, s, b }), so the app takes each as it
// comes: answered whole, a batch waits on its slowest item.
const BATCH_MAX = 24;
// One slow upstream mustn't hold back the rest of its batch: an item not
// answered within this answers 504 (the app asks for it again on its own),
// while its fetch goes on in the background into the shared cache. Its own
// line holds back nothing: it waits as long as the app would for it alone.
const BATCH_ITEM_WAIT_MS = 3_000;
const LINE_ITEM_WAIT_MS = 10_000;
async function handleBatch(request, env, headers, ip, ctx, requestParams) {
  const items = requestParams.getAll('u').slice(0, BATCH_MAX);
  if (!items.length) return json({ error: { message: 'Missing u' } }, 400, headers);
  const gate = await checkSession(env, requestParams, headers, items.length, request, ip);
  if (gate.error) return gate.error;
  const lines = requestParams.has('lines');
  const answers = items.map(item => {
    const work = batchItem(item, ctx);
    ctx?.waitUntil?.(work.catch(() => {}));
    let timer;
    const late = new Promise(resolve => (timer = setTimeout(() => resolve('{"s":504}'), lines ? LINE_ITEM_WAIT_MS : BATCH_ITEM_WAIT_MS)));
    return Promise.race([work.finally(() => clearTimeout(timer)), late]);
  });
  // Written out as the bytes came (never decoded, never joined into one
  // string): a season's page is 6 MB, and copies of a few of them at once
  // ran a Worker out of memory, failing every batch on it together.
  const enc = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const w = writable.getWriter();
  // One item: its head (`{"s":…`, its place first on a line), then its body.
  // A line's body has its line breaks as spaces: in JSON they can only be
  // spacing between values (never inside a string), so it's the same JSON.
  const flat = chunk => (lines && chunk.includes(10) ? chunk.map(b => (b === 10 ? 32 : b)) : chunk);
  const writeItem = async (x, i) => {
    const open = lines ? `{"i":${i},` : '{';
    if (typeof x === 'string') return w.write(enc.encode(open + x.slice(1)));
    await w.write(enc.encode(open + x.head.slice(1)));
    if (typeof x.body === 'string') await w.write(enc.encode(lines ? x.body.replaceAll('\n', ' ') : x.body));
    else if (x.body instanceof ArrayBuffer) await w.write(flat(new Uint8Array(x.body)));
    else if (x.body) for await (const chunk of x.body) await w.write(flat(chunk));
    await w.write(enc.encode('}'));
  };
  const pump = (async () => {
    if (lines) {
      // Each in the order it's in; one at a time (a line is never cut by another).
      let chain = Promise.resolve();
      await Promise.all(answers.map((answer, i) => answer.then(x => (chain = chain.then(() => writeItem(x, i)).then(() => w.write(enc.encode('\n')))))));
      await chain;
    } else {
      const results = await Promise.all(answers);
      await w.write(enc.encode('{"r":['));
      for (let i = 0; i < results.length; i++) {
        if (i) await w.write(enc.encode(','));
        await writeItem(results[i], i);
      }
      await w.write(enc.encode(']}'));
    }
    await w.close();
  })().catch(error => w.abort(error).catch(() => {}));
  ctx?.waitUntil?.(pump);
  return new Response(readable, { status: 200, headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
// One item that throws is that item's failure (its error said), never the
// whole batch's: the rest of a first paint isn't lost with one month of CPBL.
const batchItem = (item, ctx) => batchItemOf(item, ctx).catch(error => `{"s":500,"e":${JSON.stringify(String(error?.message || error).slice(0, 120))}}`);
async function batchItemOf(item, ctx) {
  const bang = item.indexOf('!');
  const [trimParam, target] = bang > 0 && !item.slice(0, bang).includes(':') ? [item.slice(0, bang), item.slice(bang + 1)] : [null, item];
  const upstreamUrl = parseTarget(target);
  if (!upstreamUrl) return '{"s":400}';
  const t0 = Date.now();
  const r = await resolveOne(upstreamUrl, trimFor(trimParam, upstreamUrl), ctx).catch(error => ({ fetchError: error }));
  if (r.fetchError || r.status !== 200 || !/json|javascript/i.test(r.contentType || '')) {
    if (r.body?.cancel) r.body.cancel().catch(() => {});
    // A source turning the proxy away for a while (ESPN's 403 in a burst) is
    // its failure, not the ask's: answered as one (the app asks again).
    return `{"s":${r.fetchError || r.status === 403 || r.status === 429 ? 502 : r.status === 200 ? 415 : r.status},"ms":${Date.now() - t0}${r.fetchError ? `,"e":${JSON.stringify(String(r.fetchError?.name || r.fetchError).slice(0, 40))}` : ''}}`;
  }
  // (Its bytes as they are: handleBatch writes them out.)
  return { head: `{"s":200,"a":${r.age},"c":"${r.cache}","ms":${Date.now() - t0},"b":`, body: r.body };
}

async function handleSportsProxyRequest(request, env, headers, ip, ctx) {
  if (request.method !== 'GET') return json({ error: { message: 'GET only' } }, 405, headers);

  const requestParams = new URL(request.url).searchParams;
  if (requestParams.has('batch')) return handleBatch(request, env, headers, ip, ctx, requestParams);
  const target = requestParams.get('url') || '';
  const upstreamUrl = parseTarget(target);
  if (!upstreamUrl) return json({ error: { message: target ? 'Host not allowed' : 'Missing or invalid url' } }, 400, headers);

  // The pass's gate (see the top of this file).
  const gate = await checkSession(env, requestParams, headers, 1, request, ip);
  if (gate.error) return gate.error;
  const trim = trimFor(requestParams.get('trim'), upstreamUrl);
  headers['X-Sports-Proxy-Cache-Tier'] = policyOf(upstreamUrl, trim).tier;

  // (`within`: this Worker's own reads only, a live bet checked on a copy that young.)
  const within = ip === 'worker' && requestParams.has('within') ? Math.max(0, Number(requestParams.get('within')) || 0) : undefined;
  const result = await resolveOne(upstreamUrl, trim, ctx, { mirror: requestParams.get('mirror') !== '0', within });
  if (result.policy) headers['X-Sports-Proxy-Cache-Tier'] = result.policy.tier;
  if (result.fetchError) return json({ error: { message: result.fetchError.message || 'Upstream request failed' } }, 502, headers);
  if (result.status !== 200) return new Response(result.body, { status: result.status, headers: { ...headers, 'Content-Type': result.contentType } });
  return new Response(result.body, {
    status: 200,
    headers: {
      ...headers,
      'Content-Type': result.contentType,
      'Cache-Control': `private, max-age=${browserMaxAge(result.policy)}`,
      'X-Sports-Proxy-Cache': result.cache,
      'X-Sports-Proxy-Age': String(result.age)
    }
  });
}

// ==== The route (worker.js) ==================================================

// /sports-proxy, with the Worker's CORS headers. A crash still answers with
// them (the app sees a failure it can try again, not a blocked request) and
// says what it was. (`ip` 'worker': this Worker's own reads, price.js's and
// the board's, let through without a pass.)
export function handleSports(request, env, ctx, headers, ip) {
  dataBucket = env.DATA || null;
  return handleSportsProxyRequest(request, env, headers, ip, ctx).catch(error => json({ error: { message: String(error?.message || error).slice(0, 200) } }, 500, headers));
}
