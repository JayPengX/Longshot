// 系列賽正確結果: an MLB play-off series' exact result (密爾瓦基釀酒人4比1勝出),
// sold by 台灣運彩 under 冠軍及特別項目. Every round has it (the owner,
// 2026-10-25: the wild card, division and championship series and the World
// Series), from the moment MLB lists both of its clubs (a series whose
// opponent is still "TBD" isn't sold) until it's won. Every result still
// possible is a pick; one already out of reach (the Rays 4-0 after losing
// game 1) isn't on the board.
//
// Priced from one game's chance: for an LCS and the World Series, the one
// that gives the side's chance in the round's championship market (the
// pennant, the World Series) with the games already won; for the earlier
// rounds (and when that market is missing) the next game's moneyline. Off
// sale from just before a game starts until it's final (never a price from
// before a run scored), and settled from MLB's own postseason list
// (postseason.mjs) the moment one side has won the series.
// Pure: play-sources.mjs reads the list and the markets.
import { roundKey } from './postseason.mjs';
import { fold } from './names.mjs';

// The rounds sold, and the championship market that prices the last ones.
export const SERIES_ROUNDS = ['ALWC', 'NLWC', 'ALDS', 'NLDS', 'ALCS', 'NLCS', 'WS'];
export const SERIES_BASE = { WS: 'ws', ALCS: 'al', NLCS: 'nl' };
// Off sale this long before a game's first pitch (the list is read every 5 minutes).
export const SERIES_CLOSE_MS = 10 * 60_000;
export const isSeriesKey = key => /^series-/.test(String(key || ''));
// series-2026-ws-139-158: the season, the round and the two clubs' MLB ids
// (a round can have two series a league: the wild card, the division series).
export const seriesKey = (season, round, ids) => `series-${season}-${round.toLowerCase()}-${[...ids].sort((a, b) => a - b).join('-')}`;
export const seriesSeason = key => String(key).split('-')[1];
export const seriesRound = key => String(String(key).split('-')[2] || '').toUpperCase();

// Every series on MLB's list with both clubs known: { key, round, season,
// need, sides: [name, name] (game 1's home, away, as 運彩 names a series:
// 密爾瓦基釀酒人-坦帕灣光芒), wins: [n, n], busy (a
// game on or about to start), last (its last possible game) }.
export function mlbSeriesList(schedule, now = new Date()) {
  const by = new Map();
  for (const d of schedule?.dates || [])
    for (const g of d.games || []) {
      const round = roundKey(g.description) || roundKey(`${/^(AL|NL)/.exec(g.description || '')?.[1] || ''} ${g.seriesDescription || ''}`) || (g.gameType === 'W' ? 'WS' : '');
      if (!SERIES_ROUNDS.includes(round)) continue;
      const a = g.teams?.away?.team;
      const h = g.teams?.home?.team;
      if (!a?.name || !h?.name || !(a.id > 0) || !(h.id > 0) || /\/|champion|winner|^tbd$/i.test(`${a.name}|${h.name}`)) continue;
      const st = g.status || {};
      const called = /postponed|cancel/i.test(st.detailedState || '');
      const season = String(g.season || /^\d{4}/.exec(g.gameDate || '')?.[0] || '');
      const key = seriesKey(season, round, [a.id, h.id]);
      if (!by.has(key)) by.set(key, { key, round, season, need: Math.floor((Number(g.gamesInSeries) || 7) / 2) + 1, sides: [h.name, a.name], wins: [0, 0], busy: false, last: g.gameDate });
      const s = by.get(key);
      if (Date.parse(g.gameDate) > Date.parse(s.last)) s.last = g.gameDate;
      if (called) continue;
      const final = st.abstractGameState === 'Final';
      const winner = g.teams.away.isWinner === true ? a.name : g.teams.home.isWinner === true ? h.name : null;
      if (final && winner) s.wins[s.sides.indexOf(winner)]++;
      if (!final && Date.parse(g.gameDate) - SERIES_CLOSE_MS <= now.getTime()) s.busy = true;
    }
  return [...by.values()];
}

const choose = (n, k) => {
  let c = 1;
  for (let i = 1; i <= k; i++) c = (c * (n - k + i)) / i;
  return c;
};
// The chance a side needing `a` more wins finishes with exactly `j` more
// losses (j < b, the other side's wins still needed), each game won with q.
const exact = (q, a, j) => choose(a - 1 + j, j) * q ** a * (1 - q) ** j;
// The chance that side takes the series.
export function seriesChance(q, a, b) {
  let p = 0;
  for (let j = 0; j < b; j++) p += exact(q, a, j);
  return p;
}
// One game's chance that gives a series chance `p` (from a, b wins needed).
export function gameChance(p, a, b) {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (seriesChance(mid, a, b) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
// Every result still possible: [{ side (0|1), lost (the other side's final wins), fair }].
export function seriesResults(q, need, wins) {
  const out = [];
  [0, 1].forEach(side => {
    const a = need - wins[side];
    const b = need - wins[1 - side];
    const qs = side === 0 ? q : 1 - q;
    for (let j = 0; j < b; j++) out.push({ side, lost: wins[1 - side] + j, fair: exact(qs, a, j) });
  });
  return out;
}

// A club's entry in a market, in Polymarket's spelling or MLB's: the same
// name, else the same nickname when only one club has it ("Athletics").
const nick = s => fold(s).split(' ').pop();
function clubIn(teams, name) {
  const same = teams.find(t => fold(t.name.en) === fold(name));
  if (same) return same;
  const nicks = teams.filter(t => nick(t.name.en) === nick(name));
  return nicks.length === 1 ? nicks[0] : null;
}

// A result's pick name: { en: 'Milwaukee Brewers 4-1', zh: '密爾瓦基釀酒人4比1勝出' }.
export const resultName = (en, zh, need, lost) => ({ en: `${en} ${need}-${lost}`, zh: `${zh || en}${need}比${lost}勝出` });

// One game's chance for a series' first side: from the round's championship
// market where it has both clubs, else the next game's moneyline
// (`nextGame(a, b)`: a's fair chance to beat b next, or null).
function oneGame(s, futures, nextGame) {
  const base = (futures || []).find(f => f.key === SERIES_BASE[s.round]);
  const [pa, pb] = s.sides.map(side => (base ? clubIn(base.teams, side)?.fair : null));
  if (pa > 0 && pb > 0) {
    const p = pa / (pa + pb);
    return p < 0.001 || p > 0.999 ? null : gameChance(p, s.need - s.wins[0], s.need - s.wins[1]);
  }
  const q = nextGame(s.sides[0], s.sides[1]);
  return q > 0.02 && q < 0.98 ? q : null;
}

// The series boards on sale: Play's futures market shape ({ key, kind:
// 'series', sport, season, ends, sides, teams: [{ name, fair, side }] }).
// `futures`: the championship markets; `zh(en)`: a club's Chinese name.
export function seriesMarkets(schedule, futures, now = new Date(), { zh = en => en, nextGame = () => null } = {}) {
  const out = [];
  for (const s of mlbSeriesList(schedule, now)) {
    if (s.busy || Math.max(...s.wins) >= s.need) continue;
    const q = oneGame(s, futures, nextGame);
    if (q == null) continue;
    const sides = s.sides.map(en => ({ en, zh: zh(en) }));
    out.push({
      key: s.key,
      round: s.round,
      kind: 'series',
      sport: 'mlb',
      season: s.season,
      ends: s.last,
      sides,
      wins: s.wins,
      teams: seriesResults(q, s.need, s.wins)
        .map(r => ({ name: resultName(sides[r.side].en, sides[r.side].zh, s.need, r.lost), side: sides[r.side], won: s.need, lost: r.lost, fair: r.fair }))
        .sort((a, b) => b.fair - a.fair)
    });
  }
  return out;
}

// A series pick's outcome (settle.mjs legResult's): its exact result once a
// side has won the series, as the pick names it.
export function seriesOutcome(schedule, key) {
  const s = mlbSeriesList(schedule).find(x => x.key === key);
  if (!s) return { status: 'pending' };
  const won = s.wins.findIndex(w => w >= s.need);
  if (won < 0) return { status: 'pending' };
  return { status: 'final', winner: resultName(s.sides[won], '', s.need, s.wins[1 - won]).en };
}
