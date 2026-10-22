// 戰績's numbers, apart from its screen: the wins, the longest winning run and
// the achievements, read from a practice account.
import { allVoid } from './slip.mjs';

// A slip that paid; a slip with every pick void isn't one (台灣運彩 refunds its stake).
const paid = s => s.payout > 0 && !allVoid(s);
const refund = s => s.status === 'settled' && allVoid(s);

// Every win from `since` (ms): settled slips that paid,
// lottery tickets and scratch cards that won. Newest first.
export function winsOf(account, since = 0) {
  const out = [];
  for (const s of account?.slips || []) {
    if (s.status !== 'settled' || !paid(s) || s.refunded) continue;
    const at = Date.parse(s.settledAt || s.t);
    if (at < since) continue;
    const legs = s.legs || [];
    // A void pick counts at odds 1 (台灣運彩): not a pick won.
    const counted = legs.filter(l => l.result !== 'void');
    const sports = [...new Set(legs.map(l => l.sport).filter(Boolean))];
    out.push({
      at,
      amount: s.payout,
      cost: s.cost,
      kind: 'slip',
      legs: counted.length,
      full: counted.length > 1 && counted.every(l => l.result === 'won'),
      sport: sports.length === 1 ? sports[0] : 'mixed',
      labels: legs.map(l => l.shortLabel || l.label),
      // Its first pick (by when it was played), for the row's logo.
      lead: [...legs].sort((a, b) => String(a.startUtc || '').localeCompare(String(b.startUtc || '')))[0] || null
    });
  }
  for (const x of account?.tickets || []) {
    if (x.status !== 'settled' || !(x.prize > 0)) continue;
    const at = Date.parse(x.settledAt || x.t);
    if (at < since) continue;
    out.push({ at, amount: x.prize, cost: x.cost, kind: 'lotto', card: x.card || null, game: x.game });
  }
  return out.sort((a, b) => b.at - a.at);
}

// The longest run of paying slips, in the order they settled (a refund, every
// pick void, neither adds to it nor ends it).
export function longestRun(slips = []) {
  const settled = slips.filter(s => s.status === 'settled' && !s.recovered && !refund(s)).sort((a, b) => String(a.settledAt).localeCompare(String(b.settledAt)));
  let best = 0;
  let run = 0;
  for (const s of settled) {
    run = paid(s) ? run + 1 : 0;
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
    ['run5', run >= 5, Math.min(1, run / 5)],
    ['parlay5', slips.some(w => w.full && w.legs >= 5), 0, first(slips.filter(w => w.full && w.legs >= 5))],
    ['10k', best >= 10_000, Math.min(1, best / 10_000), first(all.filter(w => w.amount >= 10_000))],
    ['100k', total >= 100_000, Math.min(1, total / 100_000)],
    ['1m', total >= 1_000_000, Math.min(1, total / 1_000_000)]
  ];
  return out.map(([key, done, progress, at]) => ({ key, done, progress: done ? 1 : progress, at: at ?? null }));
}
