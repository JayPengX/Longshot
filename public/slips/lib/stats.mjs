// 戰績: how the settled tickets went, from each one's own reckoning (its
// cost before the games, what it paid after tax). No DOM, so it's tested.
//
//   record(done, { since }) -> { count, won, staked, back, profit, roi, hit,
//     series: [{ at, profit }] (the running total, oldest first), best,
//     worst, streak: { won, n }, byLeague, bySport, byMode, byKind, odds,
//     byMonth: [{ key: 'YYYY-MM', profit, count }] (Taipei months, oldest first) }
//   done: [{ slip, cost, net }] (net: what it paid back, after tax)

import { taipeiDay } from '../../kit/core.mjs';
import { LEAGUES } from './feed.mjs';

const sum = (xs, f) => xs.reduce((s, x) => s + f(x), 0);
const when = x => x.slip.settledAt || x.slip.created || '';

// A ticket with every pick void got its stake back: no win, no loss (out of the hit rates and the streak).
export const refunded = x => x.slip.legs.length > 0 && x.slip.legs.every(l => x.results?.[l.id] === 'void');

function group(rows, keyOf) {
  const out = new Map();
  for (const r of rows) {
    const k = keyOf(r);
    const g = out.get(k) || { key: k, count: 0, decided: 0, won: 0, staked: 0, back: 0 };
    g.count += 1;
    g.decided += refunded(r) ? 0 : 1;
    g.won += r.net > 0 && !refunded(r) ? 1 : 0;
    g.staked += r.cost;
    g.back += r.net;
    out.set(k, g);
  }
  return [...out.values()].map(g => ({ ...g, profit: g.back - g.staked, hit: g.decided ? g.won / g.decided : 0, roi: g.staked ? g.back / g.staked : 0 })).sort((a, b) => b.count - a.count || b.profit - a.profit);
}

export function record(done, { since = 0 } = {}) {
  const rows = done.filter(x => !since || Date.parse(when(x)) >= since).sort((a, b) => when(a).localeCompare(when(b)));
  const staked = sum(rows, x => x.cost);
  const back = sum(rows, x => x.net);
  const won = rows.filter(x => x.net > 0 && !refunded(x)).length;
  const decided = rows.filter(x => !refunded(x)).length;
  let run = 0;
  const series = rows.map(x => ({ at: when(x), profit: (run += x.net - x.cost) }));
  // The streak now: the latest tickets' run of paid (or not).
  let streak = { won: false, n: 0 };
  for (let i = rows.length - 1; i >= 0; i--) {
    if (refunded(rows[i])) continue;
    const w = rows[i].net > 0;
    if (!streak.n) streak = { won: w, n: 1 };
    else if (w === streak.won) streak.n += 1;
    else break;
  }
  const by = (a, b) => b.net - b.cost - (a.net - a.cost);
  const ranked = [...rows].sort(by);
  // Each pick on its own: how each kind of bet lands (pushes apart).
  const legs = rows.flatMap(x => x.slip.legs.map(l => ({ kind: l.kind, odds: l.odds, result: x.results?.[l.id] ?? null })));
  const kinds = new Map();
  for (const l of legs) {
    const k = kinds.get(l.kind) || { key: l.kind, legs: 0, won: 0, lost: 0, void: 0 };
    k.legs += 1;
    if (l.result === 'won') k.won += 1;
    else if (l.result === 'lost') k.lost += 1;
    else if (l.result === 'void') k.void += 1;
    kinds.set(l.kind, k);
  }
  const leagueOf = x => {
    const ls = [...new Set(x.slip.legs.map(l => l.game?.league).filter(Boolean))];
    return ls.length === 1 ? ls[0] : 'mixed';
  };
  const odds = legs.filter(l => Number.isFinite(l.odds));
  return {
    count: rows.length,
    won,
    staked,
    back,
    profit: back - staked,
    roi: staked ? back / staked : 0,
    hit: decided ? won / decided : 0,
    series,
    best: ranked[0] && ranked[0].net - ranked[0].cost > 0 ? ranked[0] : null,
    worst: ranked.at(-1) && ranked.at(-1).net - ranked.at(-1).cost < 0 ? ranked.at(-1) : null,
    streak,
    byLeague: group(rows, leagueOf),
    bySport: group(rows, x => {
      const ss = [...new Set(x.slip.legs.map(l => LEAGUES[l.game?.league]?.sport).filter(Boolean))];
      return ss.length === 1 ? ss[0] : 'mixed';
    }),
    byMonth: group(rows.filter(x => Number.isFinite(Date.parse(when(x)))), x => taipeiDay(Date.parse(when(x))).slice(0, 7)).sort((a, b) => a.key.localeCompare(b.key)),
    byMode: group(rows, x => x.slip.mode || 'single'),
    byKind: [...kinds.values()].map(k => ({ ...k, hit: k.won + k.lost ? k.won / (k.won + k.lost) : 0 })).sort((a, b) => b.legs - a.legs),
    odds: odds.length ? sum(odds, l => l.odds) / odds.length : 0
  };
}

// The running total as an SVG path in a w×h box (its zero line's y too):
// a step at each ticket, from 0 before the first.
export function curve(series, w = 300, h = 120, pad = 6) {
  const ys = [0, ...series.map(p => p.profit)];
  const lo = Math.min(0, ...ys);
  const hi = Math.max(0, ...ys);
  const span = hi - lo || 1;
  const x = i => pad + ((w - 2 * pad) * i) / Math.max(1, ys.length - 1);
  const y = v => pad + (h - 2 * pad) * (1 - (v - lo) / span);
  const pts = ys.map((v, i) => [x(i), y(v)]);
  const line = pts.map(([a, b], i) => `${i ? 'L' : 'M'}${a.toFixed(1)} ${b.toFixed(1)}`).join(' ');
  const zero = y(0);
  const area = `${line} L${pts.at(-1)[0].toFixed(1)} ${zero.toFixed(1)} L${pts[0][0].toFixed(1)} ${zero.toFixed(1)} Z`;
  return { line, area, zero, last: pts.at(-1), up: ys.at(-1) >= 0 };
}

// Where a range starts (ms): 'all' from the beginning, '7' / '30' the last
// that many Taipei days, today's included, from their midnight.
export function sinceOf(range, now = Date.now()) {
  if (range === 'all') return 0;
  const days = range === '30' ? 30 : 7;
  return Date.parse(`${taipeiDay(now - (days - 1) * 86_400_000)}T00:00:00+08:00`);
}

// This Taipei month's spending: every ticket bought in it, open or settled
// (`costOf(slip)`: what it cost), by the day it was saved.
// -> { staked, count, month: 'YYYY-MM' }
export function monthSpend(slips, costOf, now = Date.now()) {
  const month = taipeiDay(now).slice(0, 7);
  const mine = slips.filter(s => Number.isFinite(Date.parse(s.created)) && taipeiDay(Date.parse(s.created)).startsWith(month));
  return { staked: sum(mine, costOf), count: mine.length, month };
}
