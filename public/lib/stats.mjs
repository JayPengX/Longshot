// 戰績's numbers, apart from its screen: the wins, the longest winning run and
// the achievements, read from a practice account.
import { slipAtStake } from './history.mjs';

// Every win from `since` (ms): settled slips that paid (cashed out too),
// lottery tickets and scratch cards that won. Newest first.
export function winsOf(account, since = 0) {
  const out = [];
  for (const s of account?.slips || []) {
    if (s.status !== 'settled' || !(s.payout > 0) || s.refunded) continue;
    const at = Date.parse(s.settledAt || s.t);
    if (at < since) continue;
    const legs = s.legs || [];
    const sports = [...new Set(legs.map(l => l.sport).filter(Boolean))];
    out.push({
      at,
      amount: s.payout,
      // What was on it: a free bet's whole stake (its cost is the top-up only: 7× read for 1.17×).
      cost: slipAtStake(s),
      kind: 'slip',
      legs: legs.length,
      full: !s.cashedOut && legs.length > 1 && legs.every(l => l.result === 'won' || l.result === 'void'),
      cashed: Boolean(s.cashedOut),
      free: Boolean(s.freeBet || s.free),
      sport: sports.length === 1 ? sports[0] : 'mixed',
      labels: legs.map(l => l.shortLabel || l.label)
    });
  }
  for (const x of account?.tickets || []) {
    if (x.status !== 'settled' || !(x.prize > 0)) continue;
    const at = Date.parse(x.settledAt || x.t);
    if (at < since) continue;
    out.push({ at, amount: x.prize, cost: x.cost, kind: 'lotto', card: Boolean(x.card), game: x.game });
  }
  return out.sort((a, b) => b.at - a.at);
}

// The longest run of paying slips, in the order they settled.
export function longestRun(slips = []) {
  const settled = slips.filter(s => s.status === 'settled' && !s.recovered).sort((a, b) => String(a.settledAt).localeCompare(String(b.settledAt)));
  let best = 0;
  let run = 0;
  for (const s of settled) {
    run = s.payout > 0 ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

// Achievements over the whole history: { key, done, progress 0-1, at }.
export function achievementsOf(account) {
  const all = winsOf(account);
  const slips = all.filter(w => w.kind === 'slip');
  const total = all.reduce((s, w) => s + w.amount, 0);
  const run = longestRun(account?.slips);
  const first = list => list.length ? list[list.length - 1].at : null;
  const topMult = Math.max(0, ...slips.filter(w => w.cost > 0).map(w => w.amount / w.cost));
  const best = Math.max(0, ...all.map(w => w.amount));
  const out = [
    ['first', all.length > 0, Math.min(1, all.length), first(all)],
    ['run3', run >= 3, Math.min(1, run / 3)],
    ['parlay3', slips.some(w => w.full && w.legs >= 3), slips.some(w => w.full) ? 0.5 : 0, first(slips.filter(w => w.full && w.legs >= 3))],
    ['x10', topMult >= 10, Math.min(1, topMult / 10), first(slips.filter(w => w.cost > 0 && w.amount / w.cost >= 10))],
    ['lotto', all.some(w => w.kind === 'lotto'), 0, first(all.filter(w => w.kind === 'lotto'))],
    ['cash', slips.some(w => w.cashed && w.amount > w.cost), 0, first(slips.filter(w => w.cashed && w.amount > w.cost))],
    ['run5', run >= 5, Math.min(1, run / 5)],
    ['parlay5', slips.some(w => w.full && w.legs >= 5), 0, first(slips.filter(w => w.full && w.legs >= 5))],
    ['10k', best >= 10_000, Math.min(1, best / 10_000), first(all.filter(w => w.amount >= 10_000))],
    ['100k', total >= 100_000, Math.min(1, total / 100_000)],
    ['1m', total >= 1_000_000, Math.min(1, total / 1_000_000)]
  ];
  return out.map(([key, done, progress, at]) => ({ key, done, progress: done ? 1 : progress, at: at ?? null }));
}
