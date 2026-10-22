// The truth about the money: how the house earns, in real numbers (Play's
// own pricing and the lottery's prize tables), and this account's own
// record from the wallet. Pure functions, tested directly.
import { BASE_CUT } from './play-rules.mjs';
import { SLIP_RULES } from './play-odds.mjs';
import { CARDS, CARD_ORDER, onSale, expectedReturn } from './play-scratch.mjs';

// Every two-way market (win, totals, lines) is priced at a 1.158 overround
// for baseball and about 1.17 for basketball and soccer, as Taiwan Sports
// Lottery's boards were measured (2026-10-20); 1X2 at 1.2.
export const PLAY = {
  cut: BASE_CUT.twoWay,
  cutHigh: 1.17,
  threeWay: BASE_CUT.threeWay,
  // A slip whose whole prize is over NT$5,000 loses 20% income tax; a
  // member (online) account pays no 4‰ stamp duty.
  taxFree: SLIP_RULES.taxFree,
  tax: SLIP_RULES.taxRate,
  // Draw games (威力彩, 大樂透, 今彩539…) pay back about 56% of what's staked
  // (their prize tables with no jackpot carried over, play-lottery.mjs).
  draw: 0.56
};
// 刮刮樂's payback by price, from the cards on sale now (Taiwan Lottery's
// own prize tables, play-scratch.mjs): [price, lowest, highest], cheapest
// first.
export function scratchBacks(now = new Date()) {
  const by = new Map();
  for (const id of CARD_ORDER) {
    if (!onSale(id, now)) continue;
    const back = expectedReturn(id);
    const had = by.get(CARDS[id].price);
    by.set(CARDS[id].price, had ? [Math.min(had[0], back), Math.max(had[1], back)] : [back, back]);
  }
  return [...by].sort((a, b) => a[0] - b[0]).map(([price, [lo, hi]]) => [price, lo, hi]);
}
// What the house keeps of a parlay of `legs` two-way picks, on average.
export const houseKeep = (legs = 1, cut = PLAY.cut) => 1 - cut ** -legs;

// This account's bets (stakes less refunds, and what they paid) and its
// lottery tickets and prizes, from the wallet's entries.
const slipOfId = id => /^odds:(?:stake|payout|refund)-(.+)$/.exec(id || '')?.[1];
export function record(wallet) {
  const r = { staked: 0, won: 0, tickets: 0, prizes: 0 };
  // A lottery ticket's refund (a game no longer sold) is the ticket's, not a bet's.
  const lotto = new Set((wallet?.entries || []).filter(e => e?.kind === 'lottery' && typeof e.id === 'string').map(e => e.id.replace(/^odds:lotto-/, '')));
  for (const e of wallet?.entries || []) {
    if (e.app !== 'odds') continue;
    const a = Number(e.amount) || 0;
    if (e.kind === 'refund' && lotto.has(slipOfId(e.id))) r.tickets -= a;
    else if (e.kind === 'stake' || e.kind === 'refund') r.staked -= a;
    else if (e.kind === 'payout') r.won += a;
    else if (e.kind === 'lottery') r.tickets -= a;
    else if (e.kind === 'prize') r.prizes += a;
  }
  for (const k of Object.keys(r)) r[k] = Math.round(r[k]);
  const back = (paid, out) => (paid > 0 ? out / paid : null);
  return { ...r, betBack: back(r.staked, r.won), ticketBack: back(r.tickets, r.prizes) };
}
