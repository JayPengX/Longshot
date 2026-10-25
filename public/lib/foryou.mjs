// 為你推薦: picks for this person, not just the board's best prices.
//
// What they care about, from what the app knows:
// - the teams they've bet on (their slips: the more often, the more);
// - the affinity map (what they open and bet on).
//
// Then each upcoming pick is scored: how much they care about its game's
// teams and league, how good a bet it is (its return against the board's),
// how big its league is and how
// soon it starts. Games they already hold a bet on are left out (those are
// in 你的投注): what they've backed points at the next games instead, the
// same teams' and the same leagues'. One pick a game; picks on the team they
// care about, never against it.
import { normalizeTeamName } from '../kit/logos.mjs';
import { familyOf } from './teams.mjs';
import { backOf } from './recommend.mjs';

const FOR_YOU = { n: 12, horizonH: 72, backedH: 5 * 24, perSport: 4, backed: 0.6, league: 0.35, sport: 0.12, merit: 0.6, size: 0.3, odds: [1.35, 4], kinds: new Set(['ml', 'spread', 'runline', 'dnb', 'total']) };

const teamKey = (sport, name) => `team:${sport}:${normalizeTeamName(name)}`;
// { teams: Map key -> { w, why }, leagues: Map sport -> w, sports: Map family -> w, held: Set gameId }
export function tasteOf({ aff = {}, slips = [], now = Date.now() } = {}) {
  const teams = new Map();
  const leagues = new Map();
  const sports = new Map();
  const lift = (map, k, w, why) => {
    const had = map.get(k);
    if (!had || had.w < w) map.set(k, why ? { w, why } : { w });
  };
  // The affinity, scaled to its strongest key.
  const max = Math.max(1, ...Object.values(aff));
  for (const [k, v] of Object.entries(aff)) {
    const w = Math.min(1, v / max);
    if (k.startsWith('team:')) lift(teams, k, w * 0.7, 'like');
    else if (k.startsWith('league:')) lift(leagues, k.slice(7), w);
    else if (k.startsWith('sport:')) lift(sports, k.slice(6), w);
  }
  // Slips: teams backed (recent ones more), and the games still open.
  const held = new Set();
  const backed = new Map();
  for (const s of slips) {
    const t = typeof s.t === 'number' ? s.t : Date.parse(s.t) || now;
    const fresh = 0.5 ** ((now - t) / (30 * 86_400_000));
    for (const leg of s.legs || []) {
      if (s.status === 'open' && leg.gameId) held.add(leg.gameId);
      if (!leg.sport) continue;
      lift(leagues, leg.sport, Math.min(1, (leagues.get(leg.sport)?.w || 0) + 0.15 * fresh));
      const side = ['home', 'away'].includes(leg.team) ? leg.team : ['home', 'away'].includes(leg.side) ? leg.side : null;
      const name = side ? leg[side] : leg.kind === 'future' ? leg.team : null;
      if (name) backed.set(teamKey(leg.sport, name), (backed.get(teamKey(leg.sport, name)) || 0) + fresh);
    }
  }
  for (const [k, n] of backed) lift(teams, k, Math.min(0.9, 0.35 + 0.15 * n), 'backed');
  return { teams, leagues: new Map([...leagues].map(([k, v]) => [k, v.w])), sports: new Map([...sports].map(([k, v]) => [k, v.w])), held };
}

// How much the person cares about a game: { score, why, side, team } with
// `side` the team they care about ('home' | 'away' | null).
export function gameInterest(game, taste) {
  let best = { score: 0, why: null, side: null };
  for (const side of ['home', 'away']) {
    const t = taste.teams.get(teamKey(game.sport, game[side]?.en ?? game[side]));
    if (!t) continue;
    const s = t.w * (t.why === 'backed' ? FOR_YOU.backed + 0.25 : FOR_YOU.backed);
    if (s > best.score) best = { score: s, why: t.why, side };
  }
  const league = (taste.leagues.get(game.sport) || 0) * FOR_YOU.league;
  const sport = (taste.sports.get(familyOf(game.sport) || game.sport) || 0) * FOR_YOU.sport;
  if (!best.side) return { score: league + sport, why: league > sport ? 'league' : sport > 0 ? 'sport' : null, side: null };
  return { ...best, score: best.score + league + sport };
}

// The picks: [{ bet, game, why, side, tag, merit, score }], best first, one a game.
// `bets`: the board's picks; `recs`: recommend()'s map; `games`: the board's
// games; `weightOf(sport)`: how big a league is (0-1, a major one most).
//
// Each game's pick is its best bet, judged the way recommend.mjs judges
// every pick: its average back per NT$100 against the rest of the board
// (`merit`, the share of the board it beats). No pick wins on average (the
// house takes its cut); the best ones lose least, at a chance a person can
// follow (a 1.10 sure thing or a 6.00 long shot is never the pick). On the
// person's own team when they have one, never against it.
export function forYouPicks({ games = [], bets = [], recs = new Map(), taste, now = Date.now(), n = FOR_YOU.n, exclude = new Set(), weightOf = () => 0 } = {}) {
  const byGame = new Map();
  const backs = [];
  for (const b of bets) {
    // Capped picks (a house-priced game's) only for the person's own teams below.
    if (!b.gameId || b.lock || b.cap === 'prop' || !(b.estOdds > 1) || exclude.has(b.id)) continue;
    if (!byGame.has(b.gameId)) byGame.set(b.gameId, []);
    byGame.get(b.gameId).push(b);
    if (!b.cap && b.fairChance >= 0.05 && b.fairChance <= 0.85) backs.push(backOf(b));
  }
  backs.sort((a, b) => a - b);
  const merit = b => {
    if (recs.get(b.id)?.beats != null) return recs.get(b.id).beats;
    let lo = 0;
    for (let hi = backs.length, v = backOf(b); lo < hi; ) {
      const mid = (lo + hi) >> 1;
      if (backs[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    return backs.length ? lo / backs.length : 0;
  };
  // A pick worth showing: a plain market, a chance a person can follow.
  const plain = b => FOR_YOU.kinds.has(b.kind) && b.side !== 'draw' && b.estOdds >= FOR_YOU.odds[0] && b.estOdds <= FOR_YOU.odds[1];
  // Its worth within the game: its return, the winner a little ahead (the
  // market everyone reads), a line only our model draws a little behind.
  const worth = b => merit(b) + (b.kind === 'ml' ? 0.08 : 0) - (b.posted === false ? 0.1 : 0);
  const out = [];
  for (const g of games) {
    const start = Date.parse(g.startUtc);
    if (!(start > now) || taste.held.has(g.id)) continue;
    const picks = byGame.get(g.id);
    if (!picks?.length) continue;
    const interest = gameInterest(g, taste);
    // A backed team's next game within five days.
    const horizon = interest.why === 'backed' ? FOR_YOU.backedH : FOR_YOU.horizonH;
    if (start - now > horizon * 3_600_000) continue;
    const soon = start - now < 12 * 3_600_000 ? 0.12 : start - now < 30 * 3_600_000 ? 0.06 : start - now > 72 * 3_600_000 ? -0.1 : 0;
    const onSide = b => ['ml', 'spread', 'runline', 'dnb'].includes(b.kind) && b.side === interest.side;
    const best = list => list.sort((a, b) => worth(b) - worth(a))[0];
    let choice;
    // Their team's win or handicap (a backed team's even at the house's own price).
    if (interest.side) choice = best(picks.filter(b => onSide(b) && b.fairChance >= 0.12 && b.estOdds <= FOR_YOU.odds[1] * 1.5 && (!b.cap || interest.why === 'backed')));
    // Else the game's best bet (a total, or their team's side).
    if (!choice) choice = best(picks.filter(b => !b.cap && plain(b) && (!interest.side || b.kind === 'total' || b.side === interest.side)));
    if (!choice) continue;
    const own = interest.why && interest.score >= 0.1;
    const m = merit(choice);
    const tag = recs.get(choice.id)?.tag ?? null;
    // Why it's here, in a word: their team or league, else what the price is.
    const why = own ? interest.why : tag || (m >= 0.75 ? 'value' : m >= 0.5 ? 'fair' : null);
    if (!why) continue;
    out.push({ bet: choice, game: g, why, side: interest.side, tag, merit: m, score: interest.score + FOR_YOU.merit * m + soon + FOR_YOU.size * weightOf(g.sport) });
  }
  // Best first. A league the person shows no interest in gets two cards at
  // most, a league they like three, backed teams all theirs: a night of
  // many games in one league doesn't fill the row.
  out.sort((a, b) => b.score - a.score);
  const perLeague = new Map();
  const perFamily = new Map();
  const teamsShown = new Set();
  const kept = out.filter(x => {
    const k = perLeague.get(x.game.sport) || 0;
    const fam = familyOf(x.game.sport) || x.game.sport;
    const f = perFamily.get(fam) || 0;
    const known = leagueTaste(x.game.sport, taste) >= 0.2;
    // A team once (a series' next games are the same bet again): a backed team's next game.
    const teams = x.why === 'backed' ? [x.side] : ['home', 'away'];
    const keys = teams.map(side => `${x.game.sport}:${x.game[side]?.en ?? x.game[side]}`);
    if (keys.some(t => teamsShown.has(t))) return false;
    if (x.why !== 'backed' && (k >= (known ? 3 : 2) || f >= FOR_YOU.perSport)) return false;
    keys.forEach(t => teamsShown.add(t));
    perLeague.set(x.game.sport, k + 1);
    perFamily.set(fam, f + 1);
    return true;
  }).slice(0, n);
  // The strongest stays first (it leads the row and the page); the rest take turns by sport.
  return kept.length ? [kept[0], ...interleave(kept.slice(1), x => familyOf(x.game.sport) || x.game.sport)] : [];
}

// Best first, but never two of a sport in a row while another sport waits
// (each next one: the best whose sport differs from the one before).
export function interleave(list, kindOf) {
  const left = [...list];
  const out = [];
  while (left.length) {
    const prev = out.length ? kindOf(out.at(-1)) : null;
    const i = left.findIndex(x => kindOf(x) !== prev);
    out.push(...left.splice(i < 0 ? 0 : i, 1));
  }
  return out;
}

// How much the person likes a league (0-1): the league itself, or a team in it.
export function leagueTaste(sport, taste) {
  let w = taste.leagues.get(sport) || 0;
  for (const [k, t] of taste.teams) if (t.why !== 'like' && k.startsWith(`team:${sport}:`)) w = Math.max(w, t.w);
  return w;
}

// The best of `items` (sorted best first) with at most `per` a league, or
// `liked` for a league the person likes; `sportOf` reads an item's league.
export function spreadLeagues(items, taste, { n, per = 1, liked = 2, perSport = 2, sportOf = x => x.game.sport } = {}) {
  const count = new Map();
  const fams = new Map();
  const out = [];
  for (const x of items) {
    const sport = sportOf(x);
    const fam = familyOf(sport) || sport;
    const k = count.get(sport) || 0;
    if (k >= (leagueTaste(sport, taste) >= 0.2 ? liked : per) || (fams.get(fam) || 0) >= perSport) continue;
    count.set(sport, k + 1);
    fams.set(fam, (fams.get(fam) || 0) + 1);
    out.push(x);
    if (out.length >= n) break;
  }
  return interleave(out, x => familyOf(sportOf(x)) || sportOf(x));
}
