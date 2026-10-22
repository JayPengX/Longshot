// Games and live scores. In the app, through the family's sports proxy with
// the Quadra Pass (useReader: the kit's proxyJson, app=slip, batched and
// kept like every Orbit app's reads): ESPN's scoreboards and the Asian
// leagues' months. CPBL from TheSportsDB straight from the phone when the
// proxy can't.
import { teamNameZh } from '../../kit/names.mjs';
import { twDay, addDays } from '../../kit/format.mjs';
import { parseTsdbDay as kitTsdbDay, asiaMonth as kitAsiaMonth, ASIA_URL as ASIA } from '../../kit/catalog.mjs';
import { ESPN, KAMBI, kambiUrl as kambiList, kambiLiveDataUrl as kambiLiveUrl, soccerGoals, voidAt, runOrder, touchdowns, teamCorners, parseKambiLiveData, decidedTeamGame, kambiSets, setOver, kambiUnresolvable } from '../../kit/settle.mjs';
import { marketOf, marketOfPickcenter, devig } from './model.mjs';
import { parseF1Season, parseF1Standings, f1Championship, f1Live, isChamp, sameDriver } from './f1.mjs';

// The leagues the lottery sells that a slip can follow (Shared-Proxy/kit/
// catalog.mjs's, those with live scores to read).
const espn = (sport, path, zh, en = zh) => ({ sport, data: 'espn', path, zh, en });
const kambi = (sport, path, zh, en, only = null) => ({ sport, data: 'kambi', kambi: path, zh, en, ...(only ? { only } : {}) });
export const LEAGUES = {
  mlb: espn('baseball', 'baseball/mlb', 'MLB'),
  cpbl: { sport: 'baseball', data: 'asia', zh: '中職', en: 'CPBL' },
  npb: { sport: 'baseball', data: 'asia', zh: '日職', en: 'NPB' },
  kbo: { sport: 'baseball', data: 'asia', zh: '韓職', en: 'KBO' },
  nba: espn('basketball', 'basketball/nba', 'NBA'),
  wnba: espn('basketball', 'basketball/wnba', 'WNBA'),
  nbl: espn('basketball', 'basketball/nbl', '澳洲職籃', 'NBL'),
  nfl: espn('football', 'football/nfl', 'NFL'),
  ncaaf: espn('football', 'football/college-football', 'NCAA 美足', 'NCAAF'),
  nhl: espn('hockey', 'hockey/nhl', 'NHL'),
  // F1's races and the season's championship (f1.mjs): ESPN's season and
  // standings, F1's own timing while a race runs.
  f1: { sport: 'racing', data: 'f1', path: 'racing/f1', zh: 'F1', en: 'F1' },
  epl: espn('soccer', 'soccer/eng.1', '英超', 'Premier League'),
  laliga: espn('soccer', 'soccer/esp.1', '西甲', 'LaLiga'),
  seriea: espn('soccer', 'soccer/ita.1', '義甲', 'Serie A'),
  bundesliga: espn('soccer', 'soccer/ger.1', '德甲', 'Bundesliga'),
  ligue1: espn('soccer', 'soccer/fra.1', '法甲', 'Ligue 1'),
  ucl: espn('soccer', 'soccer/uefa.champions', '歐冠', 'Champions League'),
  uel: espn('soccer', 'soccer/uefa.europa', '歐霸', 'Europa League'),
  uecl: espn('soccer', 'soccer/uefa.europa.conf', '歐協聯', 'Conference League'),
  championship: espn('soccer', 'soccer/eng.2', '英冠', 'Championship'),
  eredivisie: espn('soccer', 'soccer/ned.1', '荷甲', 'Eredivisie'),
  scotland: espn('soccer', 'soccer/sco.1', '蘇超', 'Scottish Prem'),
  mls: espn('soccer', 'soccer/usa.1', '美職足', 'MLS'),
  jleague: espn('soccer', 'soccer/jpn.1', '日職聯', 'J1 League'),
  ligamx: espn('soccer', 'soccer/mex.1', '墨超', 'Liga MX'),
  brasileirao: espn('soccer', 'soccer/bra.1', '巴甲', 'Brasileirão'),
  facup: espn('soccer', 'soccer/eng.fa', '英足總盃', 'FA Cup'),
  // The cups and one-off finals 台灣運彩 sells (a ticket from any of them can be added).
  leaguecup: espn('soccer', 'soccer/eng.league_cup', '英聯盃', 'League Cup'),
  communityshield: espn('soccer', 'soccer/eng.charity', '英格蘭社區盾', 'Community Shield'),
  copadelrey: espn('soccer', 'soccer/esp.copa_del_rey', '國王盃', 'Copa del Rey'),
  coppaitalia: espn('soccer', 'soccer/ita.coppa_italia', '義大利盃', 'Coppa Italia'),
  dfbpokal: espn('soccer', 'soccer/ger.dfb_pokal', '德國盃', 'DFB-Pokal'),
  coupedefrance: espn('soccer', 'soccer/fra.coupe_de_france', '法國盃', 'Coupe de France'),
  supercup: espn('soccer', 'soccer/uefa.super_cup', '歐洲超級盃', 'UEFA Super Cup'),
  nationsleague: espn('soccer', 'soccer/uefa.nations', '歐國聯', 'Nations League'),
  worldcup: espn('soccer', 'soccer/fifa.world', '世界盃', 'World Cup'),
  // From Kambi's lists (the odds feed behind Play's EuroLeague and K League):
  // its matches to come and on, each settled from its live data once over.
  // The set sports only where 運彩 sells them (the tours, not the
  // satellites: `only` the competitions' Kambi paths).
  euroleague: kambi('basketball', 'basketball/euroleague', '歐洲籃球', 'EuroLeague'),
  kleague: kambi('soccer', 'football/south_korea/k-league_1', '韓K聯', 'K League 1'),
  tennis: kambi('tennis', 'tennis', '網球', 'Tennis', /^(atp|wta|grand_slam|australian_open|french_open|wimbledon|us_open|davis_cup|billie_jean|united_cup|olympic)/),
  // (Volleyball: the leagues and cups 運彩 sells, not every country's.)
  volleyball: kambi('volleyball', 'volleyball', '排球', 'Volleyball', /^(italy\/(serie_a1|superlega)|poland\/(plusliga|tauron)|japan|turkey|brazil|south_korea|korea|champions_league(__w_)?$|world|vnl|nations_league|olympic)/),
  badminton: kambi('badminton', 'badminton', '羽球', 'Badminton'),
  tabletennis: kambi('tabletennis', 'table_tennis', '桌球', 'Table tennis', /^(wtt|ittf|world|olympic)/)
};
// The set sports (won in sets: its score the sets each side has won).
export const SET_SPORTS = new Set(['tennis', 'volleyball', 'badminton', 'tabletennis']);
export const isSetSport = league => SET_SPORTS.has(LEAGUES[league]?.sport);

export const PROXY = 'https://longshot.pengzjay.workers.dev';
const F1_LIVE = 'https://f1-live.longshot/';
const STANDINGS = 'https://site.api.espn.com/apis/v2/sports';
// Kambi's list and one match's live data: the kit's (settle.mjs kambiUrl, kambiLiveDataUrl).
export { kambiLiveUrl };

// Taiwan's calendar (the kit's format.mjs): a day as YYYY-MM-DD, and the
// day `d` days from one.
export { twDay };
export const shiftDay = addDays;
// When a game put off or stopped (or never started) is void: the kit's
// voidAt (台灣運彩 投注規範 32-33: baseball its scheduled local day, American
// football its week, the rest 48 hours), from the start it had before it
// moved (`sched`).
export const voidAtOf = g => voidAt({ sport: g.league, start: g.sched ?? g.start });
const compact = day => day.replaceAll('-', '');
// When a game starts, as ISO, or null when it can't be read (that game left
// out, never the whole list).
const isoOf = x => {
  const t = Date.parse(x ?? '');
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

// A team as the page shows it: Chinese where Taiwan has a name for it.
function team(league, sport, en, logo = '', abbr = '') {
  const zh = teamNameZh(league, en, sport);
  return { en, zh: zh?.full || en, short: zh?.short || abbr || en, abbr: abbr || '', logo };
}

// ESPN's events as games: { id, league, start, home, away, state ('pre',
// 'in', 'post', 'void'), score { home, away }, period, clock, detail,
// market (the closing lines, the margin out), off }.
// Called off for good is void at once (an abandoned game keeps its score so
// far, for the picks it already decided). Put off ('postponed', as a game to
// come) or stopped part way ('suspended', its score kept) is `off`: it waits
// for its time (voidAtOf), as 台灣運彩 and Play's settling (the kit's) rule it.
const VOID = /CANCELED|CANCELLED|ABANDONED|FORFEIT/i;
const lineOf = side => (side.linescores || []).map(l => Number(l.value) || 0);
const OFF = /POSTPONED|SUSPENDED/i;
export function parseEspn(data, league) {
  const { sport } = LEAGUES[league];
  const games = [];
  for (const e of data?.events || []) {
    const c = e.competitions?.[0];
    const home = c?.competitors?.find(x => x.homeAway === 'home');
    const away = c?.competitors?.find(x => x.homeAway === 'away');
    const start = isoOf(c?.date || e.date);
    if (!home?.team || !away?.team || !start) continue;
    const st = c.status || e.status || {};
    const type = st.type || {};
    const off = OFF.exec(type.name || '')?.[0].toLowerCase();
    const state = VOID.test(type.name || '') ? 'void' : off ? (off === 'postponed' ? 'pre' : 'in') : type.state === 'post' && type.completed ? 'post' : type.state === 'in' || (type.state === 'post' && !type.completed) ? 'in' : 'pre';
    const scored = state === 'in' || state === 'post' || (state === 'void' && /ABANDONED/i.test(type.name) && type.state !== 'pre');
    // Soccer settles on 90 minutes, hockey on 60 (台灣運彩 投注規範 2(17)): a
    // game gone past them counts its two halves or three periods.
    const regular = sport === 'soccer' ? 2 : sport === 'hockey' ? 3 : 0;
    // Soccer: ESPN's scoreboard has no halves; they and the goals' order
    // from its goals (the kit's soccerGoals, when they add up to the score),
    // once the second half is on (none before: the first isn't over).
    const goals = scored && sport === 'soccer' && (state === 'post' || Number(st.period) >= 2) ? soccerGoals(c, away, home) : null;
    const lines = s => (s.linescores?.length ? lineOf(s) : goals?.[s.homeAway] ?? []);
    const regularOf = s => lines(s).slice(0, regular).reduce((sum, n) => sum + n, 0);
    const past = regular && lines(home).length >= regular && lines(away).length >= regular && (sport === 'soccer' ? /AET|PEN|EXTRA|SHOOTOUT/i.test(type.name || '') : lines(home).length > regular || Number(st.period) > regular);
    const score = !scored ? null : { home: past ? regularOf(home) : Number(home.score) || 0, away: past ? regularOf(away) : Number(away.score) || 0 };
    games.push({
      id: `${league}:${e.id}`,
      league,
      start,
      home: team(league, sport, home.team.displayName, home.team.logo, home.team.abbreviation),
      away: team(league, sport, away.team.displayName, away.team.logo, away.team.abbreviation),
      state,
      score,
      period: Number(st.period) || 0,
      clock: st.displayClock || '',
      detail: type.shortDetail || '',
      market: marketOf(c.odds?.[0]),
      // Each side's innings, halves or quarters (半場, [1-5局], 單局…).
      ...(scored && (lines(home).length || lines(away).length) ? { periods: { away: lines(away), home: lines(home) } } : {}),
      ...(goals ? { goalOrder: goals.order } : {}),
      // Baseball's hits (安打數大小).
      ...(scored && Number.isFinite(away.hits) && Number.isFinite(home.hits) ? { hits: { away: away.hits, home: home.hits } } : {}),
      ...(off ? { off } : {})
    });
  }
  return games;
}

// ---- Kambi -------------------------------------------------------------------

// The kit's league a Kambi match is settled as (settle.mjs decidedTeamGame):
// its own, a set sport's by the sport.
const kambiKey = league => (SET_SPORTS.has(LEAGUES[league]?.sport) ? LEAGUES[league].sport : league);
// The whole match's prices, the margin out, as marketOf's: its winner (the
// draw too, soccer's), and for a team sport its handicap (the home line) and total.
const kOdds = o => (o?.odds > 1000 ? 1 / (o.odds / 1000) : null);
const PART_OFFER = /half|quarter|period|inning|\bset\b|\bmap\b|game \d|regular time|\bby\b|odd\/even|\b(1st|2nd|3rd)\b/i;
export function kambiMarket(offers, sport) {
  const whole = (o, type) => o.betOfferType?.englishName === type && !PART_OFFER.test(o.criterion?.englishLabel || '');
  const pick = (o, t) => o?.outcomes?.find(x => x.type === t);
  const out = {};
  const match = offers.find(o => whole(o, 'Match'));
  if (match) {
    const sides = sport === 'soccer' ? ['OT_ONE', 'OT_CROSS', 'OT_TWO'] : ['OT_ONE', 'OT_TWO'];
    const fair = devig(sides.map(t => kOdds(pick(match, t))));
    if (fair) out.win = sport === 'soccer' ? { home: fair[0], draw: fair[1], away: fair[2] } : { home: fair[0], away: fair[1] };
  }
  if (!SET_SPORTS.has(sport)) {
    const hc = offers.find(o => whole(o, 'Handicap'));
    const home = pick(hc, 'OT_ONE');
    const fh = hc && devig([kOdds(home), kOdds(pick(hc, 'OT_TWO'))]);
    if (fh && home?.line != null) out.spread = { line: home.line / 1000, home: fh[0] };
    const ou = offers.find(o => whole(o, 'Over/Under'));
    const over = pick(ou, 'OT_OVER');
    const fo = ou && devig([kOdds(over), kOdds(pick(ou, 'OT_UNDER'))]);
    if (fo && over?.line != null) out.total = { line: over.line / 1000, over: fo[0] };
  }
  return Object.keys(out).length ? out : null;
}
// A Kambi match as it stands from its live data (parseKambiLiveData's):
// a set sport's score its sets won (each set's games or points its
// periods), a team sport's its score; over once the kit's decidedTeamGame
// says so (`ended`: Kambi has dropped it, the last copy kept).
export function kambiState(g, live, now = Date.now(), ended = false) {
  if (!live) return g;
  const done = decidedTeamGame(live, kambiKey(g.league), g.start, new Date(now), { ended });
  if (done) return { ...g, state: 'post', score: { home: done.homeScore, away: done.awayScore }, periods: { home: done.homeInnings, away: done.awayInnings } };
  if (SET_SPORTS.has(LEAGUES[g.league].sport)) {
    const sets = kambiSets(live);
    if (!sets) return { ...g, state: 'in' };
    let home = 0;
    let away = 0;
    sets.home.forEach((h, i) => {
      const a = sets.away[i];
      if ((i < sets.home.length - 1 || setOver(LEAGUES[g.league].sport, i, sets.bestOf, h, a)) && h !== a) h > a ? home++ : away++;
    });
    return { ...g, state: 'in', score: { home, away }, periods: { home: sets.home, away: sets.away }, period: sets.home.length };
  }
  return { ...g, state: 'in', score: live.score, periods: live.periods, period: live.periods.home.length };
}
// A player (a pair) short: the surname, each partner's ("Diaz Acosta/Tirante" as Acosta/Tirante).
const surnames = name =>
  String(name)
    .split('/')
    .map(p => p.trim().split(/\s+/).at(-1))
    .join('/');
// Kambi's list as games: its matches to come and on (one over leaves it
// soon after), those of the competitions 運彩 sells (`only`).
export function parseKambi(data, league, now = Date.now()) {
  const l = LEAGUES[league];
  const set = SET_SPORTS.has(l.sport);
  return (data?.events || [])
    .flatMap(({ event: e, betOffers = [], liveData }) => {
      if (!e?.homeName || !e?.awayName || !['NOT_STARTED', 'STARTED'].includes(e.state)) return [];
      if (l.only && !l.only.test((e.path || []).slice(1).map(p => p.termKey).join('/'))) return [];
      const start = isoOf(e.start);
      if (!start) return [];
      // (A player's short name their surname; a volleyball club's, its whole name.)
      const side = name => ({ ...team(league, l.sport, name), ...(set ? { short: l.sport === 'volleyball' ? name : surnames(name) } : {}) });
      // Its event (the tour and city, the open and its draw: zh.mjs's
      // eventZh), and whether its sides are players (a woman's, for
      // reading her name) rather than clubs.
      const names = (e.path || []).slice(1).map(p => p.englishName || p.name).filter(Boolean);
      const players = set && l.sport !== 'volleyball';
      const women = /\b(wta|women|ladies)\b|\(w\)/i.test(names.join(' '));
      const g = { id: `${league}:k${e.id}`, league, kambiId: String(e.id), start, home: side(e.homeName), away: side(e.awayName), state: 'pre', score: null, period: 0, clock: '', detail: '', market: kambiMarket(betOffers, l.sport), ...(set && names.length ? { event: names } : {}), ...(players ? { players: true } : {}), ...(women ? { women: true } : {}) };
      return e.state === 'STARTED' ? kambiState(g, parseKambiLiveData({ liveData }) ?? null, now) : g;
    })
    .sort((a, b) => a.start.localeCompare(b.start));
}
// The Quadra session's token for the proxy's kept copies (the kit's /kambi watch).
let tokenOf = () => '';
export const useToken = fn => (tokenOf = fn);
// Kambi's picks read again: their league's list; a match gone from it
// (over) from its own live data, else the copy the proxy kept (the kit's
// watch, told of each match once it's on), else void once surely over.
async function refreshKambi(legs, out, now) {
  const games = new Map(legs.map(l => [l.game.id, l.game]));
  for (const league of new Set(legs.map(l => l.game.league))) {
    try {
      for (const g of parseKambi(await getJson(kambiList(LEAGUES[league].kambi), 10_000), league, now)) if (games.has(g.id)) out[g.id] = g;
    } catch {}
  }
  const gone = [...games.values()].filter(g => !out[g.id] && Date.parse(g.start) <= now && g.kambiId);
  if (!gone.length && !legs.some(l => l.game.state === 'in')) return;
  const kit = await import('../../kit/play-kambi.mjs').catch(() => null);
  kit?.useKambiToken?.(tokenOf);
  kit?.watchKambiMatches?.([...games.values()].filter(g => Date.parse(g.start) <= now && g.kambiId).map(g => ({ kambiId: g.kambiId, start: g.start })))?.catch(() => {});
  let kept = null;
  for (const g of gone) {
    const live = await getJson(kambiLiveUrl(g.kambiId), 10_000).then(parseKambiLiveData).catch(() => null);
    if (live) {
      out[g.id] = kambiState(g, live, now);
      continue;
    }
    kept ??= kit?.fetchKeptKambi ? await kit.fetchKeptKambi(gone.map(x => x.kambiId)).catch(() => null) : null;
    const entry = kept?.get?.(g.kambiId) ?? null;
    const was = entry?.live ? kambiState(g, parseKambiLiveData({ liveData: entry.live }) ?? null, now, Boolean(entry.gone)) : g;
    out[g.id] = was.state === 'post' ? was : kambiUnresolvable({ sport: kambiKey(g.league), start: g.start }, entry, new Date(now), kept != null) ? { ...was, state: 'void' } : was;
  }
}

// The proxy's Asian games ({ id, start, home: { en, zh }, away, homeScore,
// awayScore, state }) as games.
const ASIA_STATES = new Set(['pre', 'in', 'post', 'void']);
export function parseAsia(list, league) {
  const side = s => {
    const zh = teamNameZh(league, s?.en, 'baseball');
    return { en: s?.en || s?.zh || '', zh: zh?.full || s?.zh || s?.en || '', short: zh?.short || s?.zh || s?.en || '', logo: '' };
  };
  return (list || []).flatMap(g => {
    const start = isoOf(g?.start);
    if (!start) return [];
    const state = ASIA_STATES.has(g.state) ? g.state : 'pre';
    return {
      id: `${league}:${g.id}`,
      league,
      start,
      home: side(g.home),
      away: side(g.away),
      state,
      score: state === 'pre' || state === 'void' || g.homeScore == null ? null : { home: Number(g.homeScore) || 0, away: Number(g.awayScore) || 0 },
      period: 0,
      clock: '',
      detail: '',
      market: null
    };
  });
}

// CPBL from TheSportsDB: the kit's reader (catalog.mjs), each game's id as
// this app has always kept it ('tsdb-<event>': saved tickets find their game).
export const parseTsdbDay = (data, now = Date.now()) => kitTsdbDay(data, now).map(g => ({ ...g, id: g.id.replace(/^cpbl-tsdb-/, 'tsdb-') }));

// ---- Reading -----------------------------------------------------------------

// Each address read at most once in `fresh` ms (every part of the page that
// asks shares it); a failed read throws and is never kept.
const memo = new Map();
// The app's reader for ESPN's and the Asian leagues' addresses: (url, fresh)
// -> the answer (the kit's proxyJson, with the Pass).
let reader = null;
export const useReader = fn => (reader = fn);
const proxied = url => url.startsWith(ESPN) || url.startsWith(STANDINGS) || url.startsWith(ASIA) || url.startsWith(F1_LIVE) || url.startsWith(KAMBI);
async function getJson(url, fresh, init) {
  if (reader && proxied(url)) return reader(url, fresh);
  const hit = memo.get(url);
  if (hit && Date.now() - hit.at < fresh) return hit.p;
  const p = fetch(url, { cache: 'no-store', ...init }).then(r => {
    if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status });
    return r.json();
  });
  memo.set(url, { at: Date.now(), p });
  p.catch(() => memo.delete(url));
  return p;
}

// A league's games on Taiwan's day `day` (YYYY-MM-DD). ESPN files games by
// America's day, so a Taiwan day is two of ESPN's (read apart: ESPN stopped
// answering a range of days in 2026). Live boards are kept 10 s; a day
// that's all over stays as it was.
export async function gamesOn(league, day, { fresh = 10_000 } = {}) {
  const l = LEAGUES[league];
  if (!l) return [];
  const inDay = g => twDay(Date.parse(g.start)) === day;
  // A day's races; the championship first, any day of its season to its last race.
  if (l.data === 'f1') {
    const year = day.slice(0, 4);
    const races = await f1Season(year, fresh);
    const champ = await f1Champ(year, races, fresh).catch(() => null);
    // Each race's field with the season's points (for a blank odds' estimate).
    const pts = new Map((champ?.field || []).map(d => [d.name, d.points]));
    const withPoints = g => (pts.size ? { ...g, field: g.field.map(d => ({ ...d, points: pts.get(d.name) ?? [...pts].find(([n]) => sameDriver(n, d.name))?.[1] ?? 0 })) } : g);
    return [...(champ && day <= twDay(Date.parse(champ.start)) ? [champ] : []), ...races.filter(inDay).map(withPoints)];
  }
  if (l.data === 'kambi') return (await getJson(kambiList(l.kambi), Math.max(fresh, 30_000)).then(x => parseKambi(x, league))).filter(inDay);
  if (l.data === 'espn') {
    const lists = await Promise.all([boardOf(league, shiftDay(day, -1), fresh), boardOf(league, day, fresh)]);
    const seen = new Set();
    return lists.flat().filter(g => inDay(g) && !seen.has(g.id) && seen.add(g.id)).sort((a, b) => a.start.localeCompare(b.start));
  }
  return (await asiaMonth(league, day.slice(0, 7))).filter(inDay);
}

// Every game of a league from `from` to `to` (Taipei days, both kept), by
// start: the picker's days around today in a read or two (ESPN's month
// boards, as Sports reads a cup's; Kambi's list is
// everything coming; an Asian league by its months; F1 its season).
export async function gamesAround(league, from, to, { fresh = 60_000 } = {}) {
  const l = LEAGUES[league];
  if (!l) return [];
  const within = g => {
    const d = twDay(Date.parse(g.start));
    return d >= from && d <= to;
  };
  const byStart = list => list.sort((a, b) => a.start.localeCompare(b.start));
  if (l.data === 'f1') {
    const races = await f1Season(from.slice(0, 4), fresh);
    const champ = await f1Champ(from.slice(0, 4), races, fresh).catch(() => null);
    return [...(champ && from <= twDay(Date.parse(champ.start)) ? [champ] : []), ...races.filter(within)];
  }
  if (l.data === 'kambi') return byStart((await getJson(kambiList(l.kambi), Math.max(fresh, 30_000)).then(x => parseKambi(x, league))).filter(within));
  if (l.data === 'espn') {
    const months = [...new Set([shiftDay(from, -1), to].map(d => compact(d).slice(0, 6)))];
    const lists = await Promise.all(months.map(m => getJson(`${ESPN}/${l.path}/scoreboard?dates=${m}&limit=500`, fresh).then(x => parseEspn(x, league))));
    const seen = new Set();
    return byStart(lists.flat().filter(g => within(g) && !seen.has(g.id) && seen.add(g.id)));
  }
  const months = [...new Set([from.slice(0, 7), to.slice(0, 7)])];
  return byStart((await Promise.all(months.map(m => asiaMonth(league, m).catch(() => [])))).flat().filter(within));
}

// The tennis players' flags (ESPN's tours, this week's draws): by surname
// and initial, as Kambi writes them ("C. Bucsa", "Tereza Valentova", Asian
// names either way round). Read an hour at a time.
const plainName = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/ł/g, 'l');
const nameWords = s => plainName(s).split(/[\s.]+/).filter(Boolean);
let flagsKept = null;
export async function tennisFlags() {
  if (flagsKept && Date.now() - flagsKept.at < 3_600_000) return flagsKept.map;
  const map = new Map();
  const twice = new Set();
  const put = (k, v) => (map.has(k) && map.get(k) !== v ? twice.add(k) : map.set(k, v));
  const boards = await Promise.all(['atp', 'wta'].map(t => getJson(`${ESPN}/tennis/${t}/scoreboard`, 3_600_000).catch(() => null)));
  for (const b of boards)
    for (const e of b?.events || [])
      for (const gr of e.groupings || [])
        for (const c of gr.competitions || [])
          for (const p of c.competitors || [])
            for (const a of p.athlete ? [p.athlete] : p.roster?.athletes || []) {
              const href = a.flag?.href;
              const w = nameWords(a.displayName);
              if (!href || !w.length) continue;
              put(`${w.at(-1)}|${w[0][0]}`, href);
              put(`${w[0]}|${w.at(-1)[0]}`, href);
              put(`w:${[...w].sort().join(' ')}`, href);
              put(`s:${w.at(-1)}`, href);
            }
  for (const k of twice) map.delete(k);
  flagsKept = { at: Date.now(), map };
  return map;
}
// One player's flag from that list, or ''.
export function flagOf(map, name) {
  const w = nameWords(name);
  if (!map || !w.length) return '';
  return map.get(`w:${[...w].sort().join(' ')}`) || map.get(`${w.at(-1)}|${w[0][0]}`) || map.get(`s:${w.at(-1)}`) || '';
}

// An Asian league's month: the kit's (catalog.mjs asiaMonth: the proxy's
// copy, CPBL from TheSportsDB on the device when the proxy can't, a game the
// proxy left behind read again), kept a minute here.
const asiaKept = new Map();
async function asiaMonth(league, ym) {
  const key = `${league}/${ym}`;
  const hit = asiaKept.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.games;
  const list = await kitAsiaMonth(url => reader(url, 60_000), league, ym);
  const games = parseAsia(list.map(g => ({ ...g, id: String(g.id).replace(/^cpbl-tsdb-/, 'tsdb-') })), league);
  asiaKept.set(key, { at: Date.now(), games });
  return games;
}

// The games a set of picks are on, read again: { [gameId]: game }. An ESPN
// game from the one board ESPN files it on (America's eastern day: half the
// reads), the Taiwan day's two when it isn't there; a league that couldn't
// be read is left out (its picks keep their last reading).
const usDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });
// An ESPN game's summary (`id`: the game's 'league:event'), read once at
// half-time for when the half ended (the kit's halftime clock).
export function espnSummary(id) {
  const [league, event] = String(id).split(':');
  if (LEAGUES[league]?.data !== 'espn' || !event) return Promise.reject(new Error('not ESPN'));
  return getJson(`${ESPN}/${LEAGUES[league].path}/summary?event=${encodeURIComponent(event)}`, 5_000);
}
// A game over whose scoreboard has dropped its lines: the closing ones from
// its summary (an old ticket added by hand: the odds it most likely had), or null.
export async function closingMarket(g) {
  if (g.market || LEAGUES[g.league]?.data !== 'espn') return g.market ?? null;
  try {
    return marketOfPickcenter((await espnSummary(g.id))?.pickcenter?.[0]);
  } catch {
    return null;
  }
}
// F1's season (ESPN's, one read for the year's races) as games.
const f1Season = (year, fresh) => getJson(`${ESPN}/${LEAGUES.f1.path}/scoreboard?dates=${year}`, Math.max(fresh, 30_000)).then(parseF1Season);
// The season's championship, from its races and ESPN's driver standings.
const f1Champ = async (year, races, fresh) => f1Championship(races, parseF1Standings(await getJson(`${STANDINGS}/${LEAGUES.f1.path}/standings?season=${year}`, Math.max(fresh, 60_000))), year);
// F1's picks read again: their season (and standings), and a race under way from F1's own timing.
const f1Kit = () => import('../../kit/f1live.mjs').catch(() => null);
async function refreshF1(legs, out, now) {
  const years = [...new Set(legs.map(l => l.game.start.slice(0, 4)))];
  const ids = new Set(legs.map(l => l.game.id));
  for (const year of years) {
    try {
      const races = await f1Season(year, 10_000);
      for (const g of races) if (ids.has(g.id)) out[g.id] = g;
      const champ = ids.has(`f1:champ:${year}`) ? await f1Champ(year, races, 10_000) : null;
      if (champ) out[champ.id] = champ;
    } catch {}
  }
  const on = [...ids].map(id => out[id] ?? legs.find(l => l.game.id === id).game).filter(g => !isChamp(g) && g.state !== 'post' && g.state !== 'void' && Date.parse(g.start) <= now);
  if (!on.length) return;
  const kit = await f1Kit();
  for (const g of on) {
    const live = await f1Live(g, url => getJson(url, 10_000), kit, now);
    if (live) out[g.id] = live;
  }
}
const boardOf = (league, day, fresh) => getJson(`${ESPN}/${LEAGUES[league].path}/scoreboard?dates=${compact(day)}&limit=300`, fresh).then(x => parseEspn(x, league));
// A game put off, played again by the same two teams before its time is up
// (voidAtOf), still counts: that game, its first start kept (`sched`); null
// when there's none yet. As Play's settling looks for it (the kit's).
const DAY = 86_400_000;
async function makeup(g, now) {
  const due = voidAtOf(g);
  const from = Date.parse(g.sched ?? g.start);
  const days = new Set();
  for (let t = from; t <= Math.min(due, now) + DAY; t += DAY) days.add(usDay.format(t));
  for (const day of days) {
    const again = (await boardOf(g.league, day, 60_000)).find(x => !x.off && x.home.en === g.home.en && x.away.en === g.away.en && Date.parse(x.start) > from && Date.parse(x.start) <= due);
    if (again) return { ...again, sched: g.sched ?? g.start };
  }
  return null;
}
export async function refresh(legs, now = Date.now()) {
  const want = new Map();
  const out = {};
  const f1 = legs.filter(l => LEAGUES[l.game.league]?.data === 'f1');
  const reading = f1.length ? refreshF1(f1, out, now) : null;
  const kambiLegs = legs.filter(l => LEAGUES[l.game.league]?.data === 'kambi');
  const kambiReading = kambiLegs.length ? refreshKambi(kambiLegs, out, now) : null;
  for (const leg of legs) {
    if (LEAGUES[leg.game.league]?.data === 'f1' || LEAGUES[leg.game.league]?.data === 'kambi') continue;
    const { league, start, id } = leg.game;
    const espn = LEAGUES[league]?.data === 'espn';
    const day = espn ? usDay.format(Date.parse(start)) : twDay(Date.parse(start));
    const key = `${league}|${day}`;
    if (!want.has(key)) want.set(key, { league, day, espn, ids: [], tw: new Set() });
    want.get(key).ids.push(id);
    want.get(key).tw.add(twDay(Date.parse(start)));
  }
  const kept = new Map(legs.map(l => [l.game.id, l.game]));
  await Promise.all(
    [...want.values()].map(async ({ league, day, espn, ids, tw }) => {
      try {
        const games = espn ? await boardOf(league, day, 10_000) : await gamesOn(league, day);
        games.forEach(g => (out[g.id] = g));
        if (espn && !ids.every(id => out[id])) for (const d of tw) (await gamesOn(league, d)).forEach(g => (out[g.id] ??= g));
        // Put off, or gone from its days after its start: played again in time?
        if (espn)
          for (const id of new Set(ids)) {
            const was = kept.get(id);
            const g = { ...(out[id] ?? was), sched: was.sched ?? was.start };
            if (g.off !== 'postponed' && (out[id] || now < Date.parse(g.sched))) continue;
            const again = await makeup(g, now);
            if (again) out[id] = again;
          }
      } catch {
        return;
      }
      // Read, and gone from its days past its time: as it was kept, for
      // applyGames to call it void (else it would wait for ever).
      for (const id of ids) if (!out[id] && now > voidAtOf(kept.get(id))) out[id] = kept.get(id);
    })
  );
  await reading;
  await kambiReading;
  await addExtras(legs, out, kept);
  return out;
}

// The kinds settled from a game's summary (the kit's legResult reads them
// as its outcome's): soccer's corners, American football's touchdowns, who
// scored each run (第一分).
export const SUMMARY_KINDS = { corners: 'corners', tdtotal: 'touchdowns', nextrun: 'runOrder', raceto: 'runOrder' };
// A game over with picks on what its summary says: it read once, its
// numbers kept on the game (`extras`).
async function addExtras(legs, out, kept) {
  const ids = new Set(legs.filter(l => l.kind in SUMMARY_KINDS && LEAGUES[l.game.league]?.data === 'espn').map(l => l.game.id));
  await Promise.all(
    [...ids].map(async id => {
      const g = out[id];
      const was = kept.get(id)?.extras;
      if (was && g && !g.extras) g.extras = was;
      if (!g || g.state !== 'post' || g.extras) return;
      try {
        const sum = await espnSummary(id);
        const extras = {};
        const corners = teamCorners(sum);
        if (corners) extras.corners = corners;
        if (Array.isArray(sum?.scoringPlays) && LEAGUES[g.league].sport === 'football') extras.touchdowns = touchdowns(sum.scoringPlays);
        // (先得X分 too: baseball's runs, basketball's points.)
        if (Array.isArray(sum?.plays) && ['baseball', 'basketball'].includes(LEAGUES[g.league].sport)) extras.runOrder = runOrder(sum.plays);
        if (Object.keys(extras).length) g.extras = extras;
      } catch {}
    })
  );
}
