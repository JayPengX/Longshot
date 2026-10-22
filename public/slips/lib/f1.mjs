// F1 on a ticket. 台灣運彩 sells one F1 bet, 冠軍: a Grand Prix's winner, and
// now and then the season's (年度車手冠軍). Each is a game a pick can be on:
// a race from ESPN's season (its field, its finishing order; while it runs,
// the order as it stands from F1's own timing, the kit's f1live.mjs, as
// Orbit Sports and Longshot read it), the championship from ESPN's
// driver standings. No DOM, so it's tested.
import * as logos from '../../kit/logos.mjs';
import { CUT } from './slip.mjs';
import { estimateLineOdds } from '../../kit/play-odds.mjs';

export const F1_KINDS = { f1: '冠軍' };
export const F1_KINDS_EN = { f1: 'Winner' };
export const isF1 = g => g?.league === 'f1';
export const isChamp = g => g?.session === 'champ';

// A driver by surname, accents and "Jr." aside: ESPN's "Andrea Kimi
// Antonelli" and F1's "Kimi Antonelli" are one driver.
const plain = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\b(jr|sr)\b\.?/g, '').trim();
export const surname = name => {
  const words = String(name || '').trim().split(/\s+/).filter(w => !/^(jr|sr)\.?$/i.test(w));
  return words.at(-1) || '';
};
export const sameDriver = (a, b) => Boolean(a && b) && plain(surname(a)) === plain(surname(b));

// What a game is in words: a race's short name (the kit's raceName: 美國站,
// United States GP), or the season's championship.
export const gpName = (g, en = false) => (isChamp(g) ? g.title : logos.raceName(g.title, en ? 'en' : 'zh'));
export const sessionName = (g, en = false) => (isChamp(g) ? (en ? "Drivers' Championship" : '年度車手冠軍') : en ? 'Race' : '正賽');
// A driver's team colour (the kit's), grey when it doesn't know them.
export const teamColor = name => logos.f1Driver(name).color || '#8a8f98';

// The field by team (the kit's order of the teams), teammates side by side;
// a driver it doesn't know at the end.
export function byTeam(field) {
  const teams = Object.values(logos.F1_TEAMS).map(t => t.name);
  const rank = d => {
    const i = teams.indexOf(logos.f1Driver(d.name).team);
    return i < 0 ? teams.length : i;
  };
  return field.map((d, i) => ({ d, i, r: rank(d) })).sort((a, b) => a.r - b.r || a.i - b.i).map(x => x.d);
}

// ---- ESPN's season -----------------------------------------------------------

const VOID = /CANCELED|CANCELLED|ABANDONED/i;
const nameOf = c => c.athlete?.displayName || c.athlete?.fullName || '';
const ranked = comp =>
  [...(comp.competitors || [])]
    .filter(c => Number(c.order) >= 1 && nameOf(c))
    .sort((a, b) => Number(a.order) - Number(b.order));

// ESPN's season scoreboard as races: { id ('f1:<event>:race'), league,
// title, session 'race', start, state ('pre', 'in', 'post', 'void'), order
// (the drivers by place, once there is one), field (the drivers: this
// race's, else the latest one run before it, each { name, flag }), off
// ('postponed') }.
export function parseF1Season(data) {
  const races = (data?.events || [])
    .flatMap(e => (e.competitions || []).filter(c => c.type?.abbreviation === 'Race').map(c => ({ e, c, at: Date.parse(c.date) })))
    .filter(x => Number.isFinite(x.at))
    .sort((a, b) => a.at - b.at);
  let field = [];
  // The season's points before each race (from the races run before it:
  // 25, 18, 15… for the top ten), never what came after.
  const tally = {};
  const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
  return races.map(({ e, c, at }) => {
    const order = ranked(c);
    // Its grid: the qualifying's order, once it's run.
    const qual = (e.competitions || []).find(x => x.type?.abbreviation === 'Qual');
    const grid = qual ? ranked(qual).map(nameOf) : [];
    const before = { ...tally };
    if (order.length) field = order.map(x => ({ name: nameOf(x), flag: x.athlete?.flag?.href || '' }));
    const type = c.status?.type || {};
    const name = type.name || '';
    const over = (type.completed || /SESSION_COMPLETE|FINAL/.test(name)) && order.length > 0;
    const off = /POSTPONED/i.test(name) ? 'postponed' : null;
    const state = VOID.test(name) ? 'void' : over ? 'post' : off ? 'pre' : type.state === 'in' || type.state === 'post' ? 'in' : 'pre';
    if (state === 'post') order.slice(0, 10).forEach((x, i) => (tally[nameOf(x)] = (tally[nameOf(x)] || 0) + POINTS[i]));
    return {
      id: `f1:${e.id}:race`,
      league: 'f1',
      title: e.name || e.shortName || '',
      session: 'race',
      start: new Date(at).toISOString(),
      state,
      ...(order.length ? { order: order.map(nameOf) } : {}),
      field,
      ...(grid.length ? { grid } : {}),
      before,
      score: null,
      ...(off ? { off } : {})
    };
  });
}

// ESPN's driver standings: [{ name, flag, races: Set of the event ids counted }] by rank.
export function parseF1Standings(data) {
  const table = (data?.children || []).find(c => /driver/i.test(c.name || c.abbreviation || '')) ?? data?.children?.[0];
  const stat = (e, n) => (e.stats || []).find(s => s.name === n)?.value;
  return (table?.standings?.entries || [])
    .filter(e => e.athlete?.displayName)
    .map(e => ({ name: e.athlete.displayName, flag: e.athlete.flag?.href || '', rank: Number(stat(e, 'rank')) || Infinity, points: Number(stat(e, 'championshipPts')) || 0, races: new Set((e.stats || []).filter(s => s.played && s.id).map(s => String(s.id))) }))
    .sort((a, b) => a.rank - b.rank);
}

// The season's championship as a game: { id ('f1:champ:<year>'), title
// (the year), session 'champ', start (its last race's), state ('pre' until
// that race is over and the standings count it, then 'post'), order (the
// standings), field, progress { now, of } (races run of those held) }, or
// null with no races. It stays 'pre' all season: the standings move only
// race by race, so it's read with the rest, never every few seconds.
export function f1Championship(races, standings, year) {
  const held = races.filter(r => r.state !== 'void');
  if (!held.length) return null;
  const finale = held.at(-1);
  const counted = standings.length > 0 && standings[0].races.has(finale.id.split(':')[1]);
  return {
    id: `f1:champ:${year}`,
    league: 'f1',
    title: String(year),
    session: 'champ',
    start: finale.start,
    state: finale.state === 'post' && counted ? 'post' : 'pre',
    ...(standings.length ? { order: standings.map(d => d.name) } : {}),
    field: standings.length ? standings.map(d => ({ name: d.name, flag: d.flag, points: d.points })) : finale.field,
    progress: { now: held.filter(r => r.state === 'post').length, of: held.length },
    score: null
  };
}

// The race as F1's timing has it now (the kit's f1Outcome: the order as it
// stands, over once the flag falls), or null when the feed isn't this
// race. `kit`: the kit's f1live.mjs; `getJson(url)` the app's reader.
export async function f1Live(g, getJson, kit, now = Date.now()) {
  if (!kit?.f1Outcome || isChamp(g) || g.state === 'post' || g.state === 'void' || !(Date.parse(g.start) <= now)) return null;
  const o = await kit.f1Outcome(getJson, 'Race', g.start, now).catch(() => null);
  if (!o?.order?.length) return null;
  return { ...g, state: o.status === 'final' ? 'post' : 'in', order: o.order, lap: o.lap || null };
}

// ---- From a photo --------------------------------------------------------------

// A read pick (the photo's: { teamsEn: [driver], event }) on an F1 game:
// { score, driver } with the field's own name, score 0 when the driver isn't
// in its field. The driver counts 3, the game named (the Grand Prix, or the
// championship) 2, a race for a race and the championship for one 1.
export const isF1Pick = pick => pick?.league === 'f1' || pick?.sport === 'racing' || pick?.kind === 'f1';
const placeKey = name => plain(logos.raceName(name, 'en')).replace(/\s*\(.*\)$/, '');
export function f1Fit(pick, g) {
  const [a] = pick.teamsEn?.length ? pick.teamsEn : pick.teams || [];
  const driver = (g.field || []).find(d => sameDriver(d.name, a))?.name;
  if (!driver) return { score: 0 };
  const champ = /champion|年度|總冠軍/i.test(pick.event || '');
  const named = champ ? isChamp(g) : Boolean(pick.event) && !isChamp(g) && placeKey(pick.event) === placeKey(g.title);
  return { score: 3 + (named ? 2 : 0) + (champ === isChamp(g) ? 1 : 0), driver };
}

// ---- A pick ------------------------------------------------------------------

// A driver's place (1 the first) in an order, Infinity when they aren't in it.
export const placeOf = (order, name) => {
  const i = (order || []).findIndex(x => sameDriver(x, name));
  return i < 0 ? Infinity : i + 1;
};
// 'won' or 'lost' once the race (or the season) is over, 'void' when it's
// called off, as Longshot's settling grades its F1 winner picks (the
// kit's legResult); null before.
export function gradeF1(leg) {
  const g = leg.game;
  if (g.state === 'void') return 'void';
  if (g.state !== 'post' || !g.order?.length) return null;
  return placeOf(g.order, leg.driver) === 1 ? 'won' : 'lost';
}

// A pick's chance before the race: its odds less the lottery's cut, an
// outright's (the F1 winner board's, as Play prices it); the championship,
// a future, at a fatter one (運彩's futures run 1.26 and up; unverified for
// F1). No market to read, so always an estimate.
const FUTURE_CUT = 1.3;
export const f1Chance = leg => ({ win: Math.min(0.97, 1 / (leg.odds * (isChamp(leg.game) ? FUTURE_CUT : CUT.threeWay))), push: 0 });

// The lottery's likely price for a driver when the ticket's odds are left
// blank (an estimate, marked so), as it stood before the start (never from
// the result: a race over is priced as it was on the grid). A race: where
// they start (its qualifying: pole wins about half), with the season's
// points before it (`before`, form) beside; the championship: how far
// behind the leader with the races left. Nothing known yet: the field even.
const GRID = 0.75;
export function f1Guess(g, driver) {
  const field = g.field || [];
  if (!field.length) return null;
  const left = Math.max(0, (g.progress?.of ?? 0) - (g.progress?.now ?? 0));
  const champ = isChamp(g);
  const ptsOf = d => (champ || !g.before ? d.points || 0 : Object.entries(g.before).find(([n]) => sameDriver(n, d.name))?.[1] || 0);
  const best = Math.max(...field.map(ptsOf));
  const slot = d => {
    const i = (g.grid || []).findIndex(n => sameDriver(n, d.name));
    return i < 0 ? (g.grid?.length ? g.grid.length + 1 : null) : i + 1;
  };
  const form = d => (!best ? 1 : ((ptsOf(d) + 10) / (best + 10)) ** (g.grid?.length ? 1 : 2.2));
  const weight = d => (champ ? (!best ? 1 : Math.exp((ptsOf(d) - best) / (12 * left + 4))) : (slot(d) ? Math.exp(-GRID * (slot(d) - 1)) : 1) * form(d));
  const total = field.reduce((sum, d) => sum + weight(d), 0);
  const me = field.find(d => sameDriver(d.name, driver));
  if (!me || !total) return null;
  const p = Math.min(0.95, Math.max(0.002, weight(me) / total));
  return Math.round(estimateLineOdds(p, isChamp(g) ? FUTURE_CUT : CUT.threeWay) * 100) / 100;
}

// One F1 pick as ticket.mjs's legView has it: before the race its odds'
// chance; while it runs (the championship, as its races are run) that chance
// moved towards whether the driver leads, the more the less is left; over,
// decided.
export function f1LegView(leg) {
  const g = leg.game;
  const pre = f1Chance(leg);
  const result = gradeF1(leg);
  const live = g.state === 'in' && !g.off;
  const run = isChamp(g) ? g.progress : live ? g.lap : null;
  let now = pre;
  let ahead = null;
  if (result) now = result === 'won' ? { win: 1, push: 0 } : result === 'void' ? { win: 0, push: 1 } : { win: 0, push: 0 };
  else if (run?.of && run.now > 0 && g.order?.length) {
    const leads = placeOf(g.order, leg.driver) === 1;
    ahead = leads ? 'won' : 'lost';
    const w = Math.min(1, run.now / run.of) ** 1.5;
    now = { win: (1 - w) * pre.win + w * (leads ? 1 : 0), push: 0 };
  }
  return { result, early: null, pre, now, live, held: !result && g.off ? g.off : null, ahead, estimated: true };
}
