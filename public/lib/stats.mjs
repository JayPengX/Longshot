// 戰績's numbers, apart from its screen: the whole record, losses as they
// are. Every decided bet and ticket counts (none picked, none left out):
// what went in, what came back, the net, how many won and lost, the runs
// both ways, the biggest swings both ways, each sport's net.
import { allVoid, slipEndedAt } from './slip.mjs';

const num = v => Number(v) || 0;
// A slip with every pick void got its stake back: no win, no loss.
const isRefund = s => Boolean(s.refunded) || allVoid(s);
const ticketAt = x => x.draw?.at ?? x.settledAt ?? x.t;

// Every decided slip and ticket from `since` (ms), newest first:
// { at, cost, back, net, kind: 'slip' | 'lotto', result: 'won' | 'lost' | 'even', ... }.
// Won: came back with more than it cost; lost: less; even: a refund or a
// prize the size of the ticket (out of the hit rate and the runs).
export function playsOf(account, since = 0) {
  const out = [];
  const result = (net, refund) => (refund || net === 0 ? 'even' : net > 0 ? 'won' : 'lost');
  for (const raw of account?.slips || []) {
    if (raw.status !== 'settled') continue;
    const s = { ...raw, legs: raw.legs || [] };
    const at = Date.parse(slipEndedAt(s));
    if (at < since) continue;
    const legs = s.legs;
    const cost = num(s.cost);
    const back = num(s.payout);
    const sports = [...new Set(legs.map(l => l.sport).filter(Boolean))];
    out.push({
      at,
      cost,
      back,
      net: back - cost,
      result: result(back - cost, isRefund(s)),
      kind: 'slip',
      // A void pick counts at odds 1 (台灣運彩): not a pick at all.
      legs: legs.filter(l => l.result !== 'void').length,
      sport: sports.length === 1 ? sports[0] : 'mixed',
      labels: legs.map(l => l.shortLabel || l.label).filter(Boolean),
      // Its first pick (by when it was played), for the row's logo.
      lead: [...legs].sort((a, b) => String(a.startUtc || '').localeCompare(String(b.startUtc || '')))[0] || null
    });
  }
  for (const x of account?.tickets || []) {
    if (x.status !== 'settled') continue;
    const at = Date.parse(ticketAt(x));
    if (at < since) continue;
    const cost = num(x.cost);
    const back = num(x.prize);
    out.push({ at, cost, back, net: back - cost, result: result(back - cost, false), kind: 'lotto', card: x.card || null, game: x.game });
  }
  return out.sort((a, b) => b.at - a.at);
}

// The longest runs of won and of lost (oldest to newest, evens skipped), and
// the run going now: { won, lost, now: { won: bool, n } }.
export function runsOf(plays) {
  const seq = plays.filter(p => p.result !== 'even').sort((a, b) => a.at - b.at);
  const best = { won: 0, lost: 0 };
  let now = { won: false, n: 0 };
  for (const p of seq) {
    const w = p.result === 'won';
    now = now.n && now.won === w ? { won: w, n: now.n + 1 } : { won: w, n: 1 };
    best[w ? 'won' : 'lost'] = Math.max(best[w ? 'won' : 'lost'], now.n);
  }
  return { ...best, now };
}

// The record over a list of plays (playsOf's).
export function recordOf(plays) {
  const spent = plays.reduce((s, p) => s + p.cost, 0);
  const back = plays.reduce((s, p) => s + p.back, 0);
  const won = plays.filter(p => p.result === 'won').length;
  const lost = plays.filter(p => p.result === 'lost').length;
  // Each sport's net (lottery and scratch cards as their own rows), losses
  // included; biggest swing first.
  const groups = new Map();
  for (const p of plays) {
    const key = p.kind === 'lotto' ? (p.card ? 'scratch' : 'lottery') : p.sport;
    const g = groups.get(key) || { key, n: 0, won: 0, net: 0 };
    g.n += 1;
    g.won += p.result === 'won' ? 1 : 0;
    g.net += p.net;
    groups.set(key, g);
  }
  return {
    n: plays.length,
    spent,
    back,
    net: back - spent,
    won,
    lost,
    hit: won + lost ? won / (won + lost) : null,
    returned: spent > 0 ? back / spent : null,
    runs: runsOf(plays),
    biggestWin: plays.filter(p => p.net > 0).sort((a, b) => b.net - a.net)[0] || null,
    biggestLoss: plays.filter(p => p.net < 0).sort((a, b) => a.net - b.net)[0] || null,
    bySport: [...groups.values()].sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
  };
}
