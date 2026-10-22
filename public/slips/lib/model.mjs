// The chance each pick lands, before the game and while it's on.
//
// Each game gets a small model of its final score, fitted to the closing
// lines of the market (DraftKings' through ESPN, the vig taken out), or,
// with no market line, to the ticket's own odds less the lottery's measured
// cut. While the game is on, what's left of it is the same model scaled to
// the time left, added to the score now:
// - soccer and hockey: each side's goals are Poisson (the remaining goals'
//   means scaled by the time left), so every market is exact on the grid;
// - basketball, football, baseball: the home margin and the total are
//   normal, with each league's usual spread (Play's SCORE_SPREAD; baseball's
//   from MLB's results), scaled by the square root of the time left.
import { CUT, grade } from './slip.mjs';
import { normalCdf, normalQuantile } from '../../kit/play-markets.mjs';
import { americanToProbability, devigProportional, estimateLineOdds } from '../../kit/play-odds.mjs';
import { isSoccer } from '../../kit/play-teams.mjs';

export { normalCdf, normalQuantile };

// American odds ("+140", "-170", "EVEN") as an implied chance; null for
// anything that isn't a price (under 100 either way).
export function americanChance(x) {
  const n = /^\s*even\s*$/i.test(String(x ?? '')) ? 100 : Number(x ?? NaN);
  return Math.abs(n) >= 100 ? americanToProbability(n) : null;
}
// Implied chances with the bookmaker's margin taken out (proportionally).
export const devig = list => devigProportional(list);

// ---- The leagues' score spreads ---------------------------------------------

// sd of the final margin and total; avg total when no line says; how a game
// is timed (periods of minutes, innings, a soccer match's 90).
export const SPORT = {
  nba: { kind: 'normal', margin: 12.5, total: 18, avg: 228, clock: { periods: 4, minutes: 12, ot: 5 } },
  wnba: { kind: 'normal', margin: 11, total: 14, avg: 165, clock: { periods: 4, minutes: 10, ot: 5 } },
  nbl: { kind: 'normal', margin: 11, total: 15, avg: 178, clock: { periods: 4, minutes: 10, ot: 5 } },
  nfl: { kind: 'normal', margin: 13.5, total: 10.5, avg: 45, clock: { periods: 4, minutes: 15, ot: 10 } },
  ncaaf: { kind: 'normal', margin: 16, total: 14, avg: 54, clock: { periods: 4, minutes: 15, ot: 8 } },
  mlb: { kind: 'normal', margin: 4.3, total: 4.4, avg: 8.8, innings: 9 },
  npb: { kind: 'normal', margin: 3.8, total: 3.9, avg: 7, innings: 9 },
  kbo: { kind: 'normal', margin: 4.6, total: 4.7, avg: 10, innings: 9 },
  cpbl: { kind: 'normal', margin: 4.6, total: 4.7, avg: 9.6, innings: 9 },
  nhl: { kind: 'poisson', avg: 6.1, clock: { periods: 3, minutes: 20, ot: 5 } },
  soccer: { kind: 'poisson', avg: 2.7, minutes: 90 }
};
export const sportOf = (league, sport) => SPORT[league] ?? (sport === 'soccer' ? SPORT.soccer : sport === 'hockey' ? SPORT.nhl : sport === 'baseball' ? SPORT.mlb : sport === 'football' ? SPORT.nfl : SPORT.nba);

// ---- How much of a game is left (1 before it, 0 once it's over) -------------

// From ESPN's status: { state, period, clock ("5:21", "67'"), detail
// ("Top 7th", "HT") }; Asian baseball has none of it, so its share is the
// time since the first pitch over a usual game's 3 hours 10.
export function leftOf(spec, s, now = Date.now()) {
  if (!s || s.state === 'pre') return 1;
  if (s.state === 'post') return 0;
  if (spec.innings) {
    const m = /^(Top|Bot|Bottom|Mid|Middle|End)\w*\s+(\d+)/i.exec(s.detail || '');
    if (!m) return s.start ? clamp(1 - (now - Date.parse(s.start)) / (190 * 60_000), 0.04, 1) : 0.5;
    const k = Number(m[2]);
    const done = /^top/i.test(m[1]) ? 2 * (k - 1) + 0.5 : /^mid/i.test(m[1]) ? 2 * k - 1 : /^bot/i.test(m[1]) ? 2 * k - 0.5 : 2 * k;
    return clamp((2 * spec.innings - done) / (2 * spec.innings), 0.02, 1);
  }
  if (spec.minutes) {
    if (/^HT|half/i.test(s.detail || '')) return 0.5;
    const m = /^(\d+)'?(?:\+(\d+))?/.exec(s.clock || '');
    const minute = m ? Number(m[1]) : 0;
    return clamp((spec.minutes - minute) / spec.minutes, 0.01, 1);
  }
  const c = spec.clock;
  if (!c) return 0.5;
  const onClock = clockMinutes(s.clock);
  const period = Number(s.period) || 1;
  const full = c.periods * c.minutes;
  if (period > c.periods) return clamp(onClock / full, 0.005, 1);
  // Between periods ESPN shows 0:00 of the one just over.
  return clamp(((c.periods - period) * c.minutes + onClock) / full, 0.005, 1);
}
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
// A game clock in minutes: "5:21", or under a minute ESPN's seconds ("45.2").
const clockMinutes = clock => {
  const text = String(clock || '');
  if (!text.includes(':')) return (Number(text) || 0) / 60;
  const [mm, ss] = text.split(':').map(Number);
  return (mm || 0) + (ss || 0) / 60;
};

// ---- Fitting a game's model -----------------------------------------------

// The market's lines for a game, as ESPN's odds object carries them, with
// the margin out: { home, away, draw? } chances to win, spread { home line,
// home cover chance }, total { line, over chance }.
export function marketOf(odds) {
  if (!odds) return null;
  const close = x => x?.close ?? x?.open ?? null;
  const out = {};
  const ml = odds.moneyline;
  if (ml) {
    const sides = ['home', 'away', ...(close(ml.draw)?.odds ? ['draw'] : [])];
    const fair = devig(sides.map(k => americanChance(close(ml[k])?.odds)));
    if (fair) out.win = Object.fromEntries(sides.map((k, i) => [k, fair[i]]));
  }
  const ps = odds.pointSpread;
  if (ps) {
    const line = Number(close(ps.home)?.line);
    const fair = devig([americanChance(close(ps.home)?.odds), americanChance(close(ps.away)?.odds)]);
    if (Number.isFinite(line) && fair) out.spread = { line, home: fair[0] };
  }
  const t = odds.total;
  if (t) {
    const line = Number(String(close(t.over)?.line ?? '').replace(/^[ou]/i, ''));
    const fair = devig([americanChance(close(t.over)?.odds), americanChance(close(t.under)?.odds)]);
    if (Number.isFinite(line) && line > 0 && fair) out.total = { line, over: fair[0] };
  }
  return Object.keys(out).length ? out : null;
}

// A game summary's closing lines (ESPN's pickcenter, kept after the game
// when its scoreboard has dropped them: { moneyLine, spreadOdds } a side,
// drawOdds, spread the home line, overUnder with overOdds / underOdds) as
// marketOf's.
export function marketOfPickcenter(pc) {
  if (!pc) return null;
  const ml = x => (x?.moneyLine != null ? { close: { odds: String(x.moneyLine) } } : null);
  const line = x => (x != null ? { close: { odds: String(x[0]), line: x[1] } } : null);
  const spread = Number(pc.spread);
  const total = Number(pc.overUnder);
  return marketOf({
    ...(pc.homeTeamOdds?.moneyLine != null && pc.awayTeamOdds?.moneyLine != null ? { moneyline: { home: ml(pc.homeTeamOdds), away: ml(pc.awayTeamOdds), ...(pc.drawOdds?.moneyLine != null ? { draw: ml(pc.drawOdds) } : {}) } } : {}),
    ...(Number.isFinite(spread) && pc.homeTeamOdds?.spreadOdds != null ? { pointSpread: { home: line([pc.homeTeamOdds.spreadOdds, spread]), away: line([pc.awayTeamOdds?.spreadOdds, -spread]) } } : {}),
    ...(Number.isFinite(total) && total > 0 && pc.overOdds != null ? { total: { over: line([pc.overOdds, total]), under: line([pc.underOdds, total]) } } : {})
  });
}

const poissonPmf = (lambda, max) => {
  const out = new Array(max + 1);
  out[0] = Math.exp(-lambda);
  for (let k = 1; k <= max; k++) out[k] = (out[k - 1] * lambda) / k;
  return out;
};
const GOALS = 14;
// Exact chances over the grid of the remaining goals (Poisson each side).
function poissonGrid(lh, la) {
  const ph = poissonPmf(lh, GOALS);
  const pa = poissonPmf(la, GOALS);
  return { ph, pa };
}
function poissonWin(lh, la) {
  const { ph, pa } = poissonGrid(lh, la);
  let home = 0;
  let draw = 0;
  for (let h = 0; h <= GOALS; h++) for (let a = 0; a <= GOALS; a++) h > a ? (home += ph[h] * pa[a]) : h === a && (draw += ph[h] * pa[a]);
  return { home, draw, away: 1 - home - draw };
}
const poissonOver = (mean, line) => {
  const p = poissonPmf(mean, 40);
  let under = 0;
  for (let k = 0; k <= Math.floor(line); k++) under += p[k];
  return 1 - under;
};
// A mean total whose chance of going over `line` is `over`.
function poissonMeanFor(line, over) {
  let lo = 0.1;
  let hi = 15;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (poissonOver(mid, line) < over) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
// The home share of the total whose chances (home beating away, of the two
// who can win) match `target`; `ot`: a tie goes to overtime, a coin (the
// market's hockey moneyline).
function poissonShareFor(total, target, ot) {
  let lo = 0.02;
  let hi = 0.98;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const w = poissonWin(total * mid, total * (1 - mid));
    const p = ot ? w.home + w.draw / 2 : w.home / (w.home + w.away);
    if (p < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// The fair chance of one pick at its own price, less the lottery's cut (two
// or three outcomes): what the ticket's odds alone say.
export const chanceFromOdds = (odds, threeWay = false) => Math.min(0.97, 1 / (odds * (threeWay ? CUT.threeWay : CUT.twoWay)));

// A game's model: { kind, ... } fitted to its market (or, with none, to the
// ticket's own picks on it: `legs`). `from` says which: 'market' or 'odds'.
export function fitGame(league, sport, market, legs = []) {
  const spec = sportOf(league, sport);
  const soccer = sport === 'soccer';
  const pick = kind => legs.find(l => l.kind === kind);
  let from = market ? 'market' : 'odds';
  if (spec.kind === 'poisson') {
    let total = spec.avg;
    if (market?.total) total = poissonMeanFor(market.total.line, market.total.over);
    else if (pick('total')) {
      const l = pick('total');
      const p = chanceFromOdds(l.odds);
      total = poissonMeanFor(l.line, l.side === 'over' ? p : 1 - p);
    }
    let homeWin = null;
    if (market?.win) homeWin = market.win.home / (market.win.home + market.win.away);
    else {
      const l = pick('ml');
      if (l && l.side !== 'draw') {
        // Three ways (台灣運彩's hockey 不讓分 is on 60 minutes): soccer's
        // draw about a quarter of the time; hockey's tie after 60 as the
        // goals make it (a few rounds of fitting).
        const p = chanceFromOdds(l.odds, true);
        let draw = soccer ? 0.26 : 0.2;
        for (let i = 0; i < (soccer ? 1 : 4); i++) {
          const two = p / (1 - draw);
          homeWin = clamp(l.side === 'home' ? two : 1 - two, 0.03, 0.97);
          const share = poissonShareFor(total, homeWin, false);
          draw = poissonWin(total * share, total * (1 - share)).draw;
        }
      }
    }
    if (homeWin == null && !market?.total && !pick('total')) from = 'none';
    // (The market's hockey moneyline is two-way, overtime in: a tie after 60 a coin.)
    const share = homeWin == null ? 0.53 : poissonShareFor(total, homeWin, !soccer && !!market?.win);
    return { kind: 'poisson', home: total * share, away: total * (1 - share), from };
  }
  let margin = null;
  if (market?.spread) margin = -market.spread.line + spec.margin * normalQuantile(market.spread.home);
  else if (market?.win) margin = spec.margin * normalQuantile(market.win.home / (market.win.home + market.win.away));
  else {
    const s = pick('spread');
    const m = pick('ml');
    if (s) {
      const p = chanceFromOdds(s.odds);
      // The side covers when its margin + line > 0.
      const sideMargin = -s.line + spec.margin * normalQuantile(p);
      margin = s.side === 'home' ? sideMargin : -sideMargin;
    } else if (m) {
      const p = chanceFromOdds(m.odds);
      margin = spec.margin * normalQuantile(m.side === 'home' ? p : 1 - p);
    }
  }
  let total = null;
  if (market?.total) total = market.total.line + spec.total * normalQuantile(market.total.over);
  else {
    const t = pick('total');
    if (t) {
      const p = chanceFromOdds(t.odds);
      total = t.line + spec.total * normalQuantile(t.side === 'over' ? p : 1 - p);
    }
  }
  if (margin == null && total == null) from = 'none';
  return { kind: 'normal', margin: margin ?? (sport === 'baseball' ? 0.25 : 2), marginSd: spec.margin, total: total ?? spec.avg, totalSd: spec.total, from };
}

// ---- A pick's chance ---------------------------------------------------------

// Integer outcomes of a normal: P(X >= k) and P(X = k), continuity-corrected.
const atLeast = (k, m, s) => (s <= 1e-9 ? (m >= k - 0.5 ? 1 : 0) : 1 - normalCdf((k - 0.5 - m) / s));
const exactly = (k, m, s) => atLeast(k, m, s) - atLeast(k + 1, m, s);
// Parity of a normal's integer outcome: summed over its likely values.
function oddChance(m, s) {
  if (s > 3) return 0.5;
  let odd = 0;
  for (let k = Math.floor(m - 7 * s - 1); k <= Math.ceil(m + 7 * s + 1); k++) if (Math.abs(k) % 2 === 1) odd += exactly(k, m, s);
  return odd;
}

// { win, push } for one pick on a game: `model` from fitGame, `now` the
// score now ({ home, away }) and `left` the share of the game still to play
// (leftOf). A pick decided by a final score is 1 or 0.
export function pickChance(leg, model, now = { home: 0, away: 0 }, left = 1) {
  const h0 = Number(now.home) || 0;
  const a0 = Number(now.away) || 0;
  if (model.kind === 'poisson') {
    const { ph, pa } = poissonGrid(model.home * left, model.away * left);
    let win = 0;
    let push = 0;
    for (let i = 0; i <= GOALS; i++)
      for (let j = 0; j <= GOALS; j++) {
        const p = ph[i] * pa[j];
        if (p < 1e-12) continue;
        const h = h0 + i;
        const a = a0 + j;
        const r = grade(leg, h, a);
        if (r === 'won') win += p;
        else if (r === 'void') push += p;
      }
    return { win, push };
  }
  const dm = h0 - a0 + model.margin * left;
  const ds = model.marginSd * Math.sqrt(left);
  const tm = h0 + a0 + model.total * left;
  const ts = model.totalSd * Math.sqrt(left);
  switch (leg.kind) {
    case 'ml': {
      // A tie goes to overtime (extra innings): about a coin.
      const tie = exactly(0, dm, ds);
      const homeWin = atLeast(1, dm, ds) + tie / 2;
      return { win: leg.side === 'home' ? homeWin : leg.side === 'away' ? 1 - homeWin : 0, push: 0 };
    }
    case 'spread': {
      // The side's margin + line > 0; on a whole line exactly 0 is void.
      const m = leg.side === 'home' ? dm : -dm;
      const k = -leg.line;
      const whole = Number.isInteger(k);
      return { win: atLeast(Math.floor(k) + 1, m, ds), push: whole ? exactly(k, m, ds) : 0 };
    }
    case 'total': {
      const whole = Number.isInteger(leg.line);
      const over = atLeast(Math.floor(leg.line) + 1, tm, ts);
      const push = whole ? exactly(leg.line, tm, ts) : 0;
      return { win: leg.side === 'over' ? over : 1 - over - push, push };
    }
    case 'oddeven': {
      const odd = oddChance(tm, ts);
      return { win: leg.side === 'odd' ? odd : 1 - odd, push: 0 };
    }
    default:
      return { win: 0, push: 0 };
  }
}
// The lottery's price for a fair chance, as its board would show it (its
// cut on top, never more than halfway to certain; Play's estimateLineOdds).
export const lotteryOdds = (p, threeWay = false) => estimateLineOdds(p, threeWay ? CUT.threeWay : CUT.twoWay);

// Before the game, the market's own chance where it prices this exact pick
// (its moneyline, or its spread or total at the same line): the Poisson
// grid, for one, has soccer's draws a little short. Null where it doesn't.
export function marketChance(leg, market) {
  if (!market) return null;
  // (Not a hockey moneyline: the market's has overtime, the lottery's is 60 minutes.)
  if (leg.kind === 'ml' && market.win?.[leg.side] != null && leg.game?.league !== 'nhl') return { win: market.win[leg.side], push: 0 };
  // (Not soccer's: the market's is the Asian handicap, two ways; 運彩's three.)
  if (leg.kind === 'spread' && market.spread && !isSoccer(leg.game?.league)) {
    const homeLine = leg.side === 'home' ? leg.line : -leg.line;
    if (homeLine === market.spread.line) return { win: leg.side === 'home' ? market.spread.home : 1 - market.spread.home, push: 0 };
  }
  if (leg.kind === 'total' && market.total?.line === leg.line) return { win: leg.side === 'over' ? market.total.over : 1 - market.total.over, push: 0 };
  return null;
}
